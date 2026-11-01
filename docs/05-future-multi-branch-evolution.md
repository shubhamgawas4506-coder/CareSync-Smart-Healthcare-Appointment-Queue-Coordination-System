# CareSync — Future Change Scenario: Multi-Branch Clinics & Cross-Location Doctors

## Scenario Statement
> *How would CareSync's architecture evolve if the clinic organization expands from a single outpatient center to **multiple clinic branches** (potentially in different timezones), with specialists splitting their weekly schedules across different physical locations?*

Because CareSync isolates scheduling math, queue computation, and lifecycle transitions inside `src/domain/` behind explicit service and repository interfaces, introducing multi-branch operations is an **additive domain evolution** rather than a rewrite.

---

## 1. Data Model Changes (`src/domain/models.ts`)

1. **New `ClinicBranch` Entity:**
   ```ts
   export interface ClinicBranch {
     branchId: string;           // e.g., "branch_sf_mission", "branch_oak_uptown"
     name: string;
     address: string;
     timezone: string;           // IANA timezone per branch, e.g. "America/Los_Angeles"
     policy: ClinicPolicyConfig; // Allows branch-specific check-in cancellation policies
   }
   ```
2. **`DoctorAvailabilityRule` & `TimeSlot` Location Binding:**
   - Add `branchId: string` and `room: string` to both `DoctorAvailabilityRule` and `TimeSlot` (removing the single static `room` field from `Doctor`, since Dr. Jenkins may practice in `SF Suite 204-A` on Mondays and `Oakland Suite 110` on Thursdays).
   - Add `travelBufferMinutes: number` (e.g., `60` minutes minimum transit gap when a doctor switches branches on the same calendar day).
3. **`Appointment` & `AppointmentEvent` Context:**
   - Add `branchId: string` (denormalized from `TimeSlot.branchId` at booking confirmation) so patient receipts, coordinator dashboards, and audit queries filter by branch in $O(1)$ without joining slot records.

---

## 2. Domain Rule Changes (`src/domain/`)

| Module | Required Rule Evolution |
| :--- | :--- |
| **`schedulingRules.ts`** | 1. **Global Doctor Overlap Guard (Unchanged & Crucial):** Keep doctor overlap checking **cross-branch** (`apt.doctorId === doctorId` regardless of `branchId`) so a doctor can never be booked simultaneously in two branches.<br>2. **Cross-Branch Transit Buffer Rule (New):** When creating or booking slots for a doctor on the same day across `branchA !== branchB`, require `abs(slotB.startTime - slotA.endTime) >= travelBufferMinutes`.<br>3. **Patient Cross-Branch Buffer:** Warn or block if a patient books two back-to-back appointments at different physical branches without transit margin. |
| **`queueEngine.ts`** | Partition queues by **`(branchId, doctorId, clinicDate)`** instead of `(doctorId, clinicDate)`. A patient checking in at Branch A only enters Branch A's physical waiting room queue; check-in validation verifies the appointment's `branchId` matches the kiosk/coordinator's active branch. |
| **`stateMachine.ts`** | Resolve `ClinicPolicyConfig` from `branches[appointment.branchId].policy` rather than a single global policy object. |
| **`timeUtils.ts`** | Already stores all timestamps as **UTC integer epoch milliseconds** and accepts an explicit `timeZone: string` parameter in `formatDateInZone`, `formatTimeInZone`, and `buildEpochFromClinicDateAndTime`. Multi-timezone branches work out-of-the-box by passing `branch.timezone`! |

---

## 3. Application & Repository Interface Changes

1. **`ICareSyncRepository` (`src/repositories/interfaces.ts`):**
   - Bump `schemaVersion: 1 -> 2` with a deterministic migration function assigning existing v1 slots/appointments to a default primary `branchId`.
   - In production PostgreSQL, add `branch_id` foreign keys and composite indexes:
     - `CREATE INDEX idx_slots_branch_doc_start ON time_slots (branch_id, doctor_id, start_time);`
     - Keep conflict exclusion constraint **global per `doctor_id`** (`EXCLUDE USING gist (doctor_id WITH =, tstzrange(start_time, end_time) WITH &&) WHERE (status IN ('BOOKED','CHECKED_IN','IN_CONSULTATION'))`) so cross-branch double booking is impossible at the database storage layer.
2. **`CareSyncCoordinationService` (`src/application/coordinationService.ts`):**
   - Extend query filters (`getLiveQueuesForDate(branchId, clinicDate)`, `createDoctorSlot({ branchId, doctorId, room, ... })`).
   - Coordinator RBAC scopes coordinators either to specific `assignedBranchIds` or organization-wide regional oversight.

---

## 4. Presentation Layer Impact (`src/presentation/`)

- **Patient Booking (`PatientBookingView`):** Add a Branch filter alongside Specialty, and prominently display the **Branch Name + Address + Timezone** on every `TimeSlot` card and `PatientConfirmationView` receipt to prevent wrong-clinic arrivals.
- **Doctor Console (`DoctorDashboardScreen`):** Display a branch badge on each session block (e.g., *Morning: SF Mission · Afternoon: Oakland Uptown*).
- **Coordinator Command (`CoordinatorWorkspaceShell`):** Add a Branch switcher in the sidebar context header to filter queues, slots, and appointments per physical clinic.
