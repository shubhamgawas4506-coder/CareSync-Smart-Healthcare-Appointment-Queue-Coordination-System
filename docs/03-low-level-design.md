# CareSync — Low-Level Design (LLD)

## 1. Core Repository & Service Interfaces

### Storage & Repository Contracts (`src/repositories/interfaces.ts`)
```ts
export interface IStorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface ICareSyncRepository {
  getSnapshot(): CareSyncStateSnapshot;
  transact<T>(mutator: (draft: CareSyncStateSnapshot) => T): T;
  resetToSeed(nowMs?: number): CareSyncStateSnapshot;
  setSimulatedStorageFailure(enabled: boolean): void;
  isSimulatedStorageFailureActive(): boolean;
  getStorageHealth(nowMs?: number): StorageHealthReport;
}
```

### Application Service API (`src/application/coordinationService.ts`)
- `submitBooking(input: SubmitBookingInput): SubmitBookingResult`
  Returns discriminated union: `'CONFIRMED' | 'UNCERTAIN_INTERRUPTED' | 'REJECTED'`.
- `recoverInterruptedRequests(patientId?: string, nowMs?: number): BookingRequestRecord[]`
- `transitionAppointmentStatus(input: TransitionStatusInput): Appointment`
- `rescheduleAppointment(input: RescheduleInput): { previousAppointment: Appointment; newAppointment: Appointment }`
- `setSlotAvailability(slotId, targetStatus, actorId, nowMs): TimeSlot`
- `createDoctorSlot(input: CreateSlotInput): TimeSlot`
- `updateClinicPolicy(patch, actorId, nowMs): ClinicPolicyConfig`
- `getLiveQueuesForDate(clinicDate?: string, nowMs?: number): DoctorQueueSnapshot[]`

---

## 2. Canonical Data Models (`src/domain/models.ts`)

All identifiers use monotonic sequence prefixes (`pat_`, `doc_`, `slot_`, `apt_`, `evt_`, `req_`) rather than fragile array indexes. All timestamps are **UTC integer epoch milliseconds (`number`)**.

- **`Patient`**: `patientId`, `name`, `contact`, `mrn`, `dateOfBirth`, `appointmentIds: string[]`
- **`Doctor`**: `doctorId`, `name`, `specialty`, `room`, `avgConsultationMinutes`, `avatarUrl`, `bio`, `availability: DoctorAvailabilityRule[]`
- **`TimeSlot`**: `slotId`, `doctorId`, `date` (`YYYY-MM-DD` in clinic zone), `startTime` (epoch ms), `endTime` (epoch ms), `availabilityStatus` (`AVAILABLE | BOOKED | BLOCKED`), `activeAppointmentId?`
- **`Appointment`**: `appointmentId`, `requestId`, `patientId`, `doctorId`, `slotId`, `date`, `startTime`, `endTime`, `status`, `reasonForVisit`, `cancelReason?`, `rescheduledFromAppointmentId?`, `rescheduledToAppointmentId?`, `checkedInAt?`, `consultationStartedAt?`, `completedAt?`, `createdAt`, `updatedAt`
- **`AppointmentEvent`**: `eventId`, `appointmentId`, `requestId?`, `eventType`, `previousStatus`, `newStatus`, `actorId`, `actorRole`, `reason`, `timestamp`
- **`BookingRequestRecord`**: `requestId`, `patientId`, `doctorId`, `slotId`, `reasonForVisit`, `state` (`PENDING | UNCERTAIN_INTERRUPTED | RETRYING | CONFIRMED | FAILED`), `outcomeAppointmentId?`, `failureCode?`, `failureMessage?`, `attemptCount`, `createdAt`, `updatedAt`

---

## 3. Appointment Lifecycle State Machine (`src/domain/stateMachine.ts`)

```text
                       +-------------------+
                       |  (Slot AVAILABLE) |
                       +---------+---------+
                                 | submitBooking()
                                 v
                       +-------------------+
         +------------ |      BOOKED       | ------------+
         | cancel      +---------+---------+  reschedule |
         v                       | check-in              v
+-----------------+              v              +-----------------+
|    CANCELLED    |    +-------------------+    |   RESCHEDULED   |
| (Slot Released) |<---|    CHECKED_IN     |    | (Slot Released  |
+-----------------+    +---------+---------+    |  + New BOOKED)  |
  ^ (Only if clinic              | start        +-----------------+
  |  policy allows)              v
  |                    +-------------------+
  |                    |  IN_CONSULTATION  |
  |                    +---------+---------+
  |                              | complete
  |                              v
  |                    +-------------------+
  +--- X (Rejected) ---|     COMPLETED     | (Terminal)
                       +-------------------+
```

### Transition Matrix
| Current Status | Allowed Target Statuses | Domain Invariants |
| :--- | :--- | :--- |
| `BOOKED` | `CHECKED_IN`, `CANCELLED`, `RESCHEDULED` | Cancelling requires `reason.trim().length >= 3` and releases `TimeSlot` to `AVAILABLE`. Rescheduling requires atomic replacement slot lock. |
| `CHECKED_IN` | `IN_CONSULTATION`, `CANCELLED`* | *`CANCELLED` permitted **only** when `policy.allowCheckedInCancellation === true`. Starting consultation requires zero concurrent `IN_CONSULTATION` visits for that doctor. |
| `IN_CONSULTATION` | `COMPLETED` | Cannot cancel once consultation has started; completion records `completedAt`. |
| `COMPLETED` | *(None — terminal)* | All transitions rejected with `INVALID_STATE_TRANSITION`. |
| `CANCELLED` | *(None — terminal)* | All transitions rejected with `INVALID_STATE_TRANSITION`. |
| `RESCHEDULED` | *(None — terminal)* | Linked forward via `rescheduledToAppointmentId` to replacement `BOOKED` appointment. |

---

## 4. Idempotent Booking & Retry Workflow

1. **Client Envelope Creation:** Before submission, `PatientBookingView` (or the Coordinator Lab) obtains a stable `requestId` (`req_<epoch>_<rand>`). This `requestId` stays bound to the form state until confirmed or explicitly dismissed.
2. **Pre-Execution Audit:** `submitBooking()` records `APPOINTMENT_REQUESTED` on attempt `#1` or `BOOKING_RETRIED` on attempt `#2+`.
3. **Idempotency Lookup:** Scans `draft.appointments` for `apt.requestId === input.requestId`.
   - If found (e.g., previous commit succeeded just before a network drop, or duplicate retry click): updates `bookingRequests[requestId]` to `CONFIRMED`, backfills any pending event IDs, logs `IDEMPOTENT_BOOKING_RECONCILED`, and returns `{ outcome: 'CONFIRMED', deduplicatedRetry: true }`.
4. **Immediate Pre-Commit Validation:** Invokes `validateSlotForBooking()` and `validatePatientHasNoOverlappingAppointment()`.
   - If another patient claimed the slot in the interim, records `SLOT_CONFLICT_DETECTED` + `BOOKING_FAILED`, marks `bookingRequests[requestId].state = FAILED` (Confirmed Failure), and returns `{ outcome: 'REJECTED', errorCode: 'SLOT_CONFLICT' }`.
5. **Atomic Commit:** Inserts `Appointment`, updates `TimeSlot` to `BOOKED`, appends `appointmentId` to `Patient.appointmentIds`, marks `bookingRequests[requestId]` as `CONFIRMED`, and commits the snapshot.

---

## 5. Smart Patient Queue Calculation (`src/domain/queueEngine.ts`)

For each `(doctor, clinicDate)`:
1. **Active Consultation Remaining Estimate:**
   - Find appointment in `IN_CONSULTATION` for `doctorId` on `clinicDate`.
   - If present:
     $$\text{elapsedMin} = \max\left(0, \left\lfloor\frac{\text{nowMs} - \text{consultationStartedAt}}{60000}\right\rfloor\right)$$
     $$\text{activeRemainingMin} = \max(3, \text{doctor.avgConsultationMinutes} - \text{elapsedMin})$$
   - Else: $\text{activeRemainingMin} = 0$.
2. **Waiting Queue Ordering:**
   - Filter `status === 'CHECKED_IN'` for `(doctorId, clinicDate)`.
   - Sort deterministically by:
     1. `checkedInAt` ascending
     2. `startTime` ascending
     3. `appointmentId` lexical order
3. **Per-Patient Position & Wait Estimate:**
   - 1-based queue position $P \in \{1, 2, \dots, n\}$.
   - Estimated wait minutes:
     $$\text{estimatedWaitMinutes}(P) = \text{activeRemainingMin} + (P - 1) \times \text{doctor.avgConsultationMinutes}$$

---

## 6. Failure & Storage Recovery Mechanisms

1. **Interrupted Network Request Recovery:**
   - `BookingRequestRecord` in `UNCERTAIN_INTERRUPTED` state is persisted in `localStorage`.
   - On page reload, `CareSyncProvider` runs `service.recoverInterruptedRequests()`, logging `INTERRUPTED_REQUEST_RECOVERY_SCAN` and surfacing the amber recovery banner in `PatientPortalShell` and `CoordinatorDashboardView`.
2. **Storage Write Fault Isolation:**
   - `LocalStorageCareSyncRepository.transact()` mutates a deep-cloned `draft` (`structuredClone`).
   - Only if both the mutator and `storage.setItem()` succeed does `this.snapshot = draft` execute. Any storage exception aborts commit and logs `REPOSITORY_TRANSACTION_ABORTED`.
3. **Corrupt Payload Self-Healing:**
   - On boot, `isValidSnapshotShape()` verifies schema version and collection invariants. Malformed JSON or tampered storage payloads automatically recover to a clean baseline seed and log `STORAGE_CORRUPTION_RECOVERY`.
