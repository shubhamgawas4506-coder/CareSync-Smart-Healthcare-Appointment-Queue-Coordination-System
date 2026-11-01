# CareSync — High-Level Design (HLD)

## 1. Architectural Style & Layered Topology

CareSync uses a **Clean Modular Layered Architecture** with strict unidirectional dependencies:

```text
+-----------------------------------------------------------------------------------+
|                              PRESENTATION LAYER                                   |
|  WelcomeRoleScreen | PatientPortalShell (5 views) | DoctorDashboard | Coordinator |
|                    CareSyncContext (React state bridge & notifications)           |
+-----------------------------------------+-----------------------------------------+
                                          | invokes typed use-case methods
                                          v
+-----------------------------------------------------------------------------------+
|                              APPLICATION LAYER                                    |
|           CareSyncCoordinationService (src/application/coordinationService.ts)    |
|  submitBooking | retryInterrupted | transitionAppointmentStatus | reschedule      |
|  setSlotAvailability | createDoctorSlot | updateClinicPolicy | getLiveQueues      |
+--------------------+-----------------------------------------+--------------------+
                     | evaluates pure rules                    | executes unit-of-work
                     v                                         v
+----------------------------------------+   +--------------------------------------+
|             DOMAIN LAYER               |   |          REPOSITORY LAYER            |
|  models.ts          (Entities & Enums) |   |  interfaces.ts (ICareSyncRepository) |
|  stateMachine.ts    (Lifecycle Rules)  |   |  localStorageRepository.ts           |
|  schedulingRules.ts (Conflict Guards)  |   |  seedData.ts   (Deterministic Seed)  |
|  queueEngine.ts     (Wait-Time Math)   |   +------------------+-------------------+
|  timeUtils.ts       (Epoch <-> IANA)   |                      | emits telemetry
+----------------------------------------+                      v
                                             +--------------------------------------+
                                             |          DIAGNOSTICS LAYER           |
                                             |  diagnosticsLogger.ts                |
                                             |  (Operation stream & storage faults) |
                                             +--------------------------------------+
```

## 2. Components & Responsibilities

| Layer | Module Path | Responsibility |
| :--- | :--- | :--- |
| **Presentation** | `src/presentation/screens/*`, `src/presentation/CareSyncContext.tsx` | Renders role-specific workspaces (Patient, Doctor, Coordinator), manages view routing, captures form inputs, preserves client `requestId` across retries, and displays audit/diagnostic telemetry. Contains **zero** domain mutation logic. |
| **Application** | `src/application/coordinationService.ts` | Orchestrates use cases inside atomic repository transactions (`repository.transact()`). Reconciles idempotent `requestId` records, coordinates atomic slot release + lock during rescheduling, and appends `AppointmentEvent` + `DiagnosticRecord` entries. |
| **Domain** | `src/domain/models.ts`, `stateMachine.ts`, `schedulingRules.ts`, `queueEngine.ts`, `timeUtils.ts` | Pure TypeScript business logic: lifecycle transition validation, clinic policy enforcement (`allowCheckedInCancellation`), double-defense slot conflict checks, queue ordering/wait-time calculation, and UTC epoch millisecond ↔ IANA timezone conversion. |
| **Repository** | `src/repositories/interfaces.ts`, `localStorageRepository.ts`, `seedData.ts` | Abstracts persistence behind `ICareSyncRepository` and `IStorageAdapter`. Clones state into an isolated draft per transaction and commits the serialized JSON snapshot atomically—rolling back completely if any rule or storage write fails. |
| **Diagnostics** | `src/diagnostics/diagnosticsLogger.ts` | Defines structured operational telemetry (`INFO`, `WARN`, `ERROR`) for simulated network drops, idempotency cache hits, conflict rejections, startup recovery scans, and storage fault injection. |

## 3. Dependency Rules

1. `domain/*` imports **nothing** outside `src/domain/`.
2. `diagnostics/*` has **zero** external dependencies.
3. `repositories/*` depends only on `domain/*` and `diagnostics/*`.
4. `application/*` depends only on `domain/*`, `repositories/*`, and `diagnostics/*`.
5. `presentation/*` depends on `application/*`, `domain/*` (read-only types/formatters), and `repositories/*` (wiring root provider). Static `.jpg` image imports are isolated inside `src/presentation/assets.tsx` so Node `tsx --test` runs pure TypeScript modules directly.

## 4. Data Flow (Booking & Idempotent Retry)

```text
[Patient UI]
   | 1. Generates stable requestId ("req_179352_a8f2c1")
   | 2. Calls service.submitBooking({ requestId, patientId, doctorId, slotId, ... })
   v
[CareSyncCoordinationService]
   | 3. Opens repository.transact(draft => { ... })
   | 4. Appends APPOINTMENT_REQUESTED (attempt #1) or BOOKING_RETRIED (attempt #2+)
   | 5. Checks draft.appointments for existing record with matching requestId
   |      |-- Match found? -> Marks request CONFIRMED, returns existing Appointment (Deduplicated!)
   |      |-- Network Failure Simulated? -> Persists request as UNCERTAIN_INTERRUPTED + BOOKING_FAILED
   |      |-- Normal Path:
   |            a) schedulingRules.validateSlotForBooking() (checks slot status, future time, & active apt overlaps)
   |            b) Creates Appointment (BOOKED), updates TimeSlot (BOOKED), links Patient
   |            c) Updates bookingRequests[requestId] -> CONFIRMED
   |            d) Appends APPOINTMENT_CONFIRMED + DiagnosticRecord
   v
[LocalStorageCareSyncRepository]
   | 6. Serializes complete CareSyncStateSnapshot in one atomic setItem() call
   |    (If setItem throws, draft is discarded and in-memory state remains untouched)
   v
[React CareSyncContext]
   | 7. Refreshes snapshot & derives liveQueues / storageHealth for active role screen
```

## 5. Authoritative Source of Truth

Within the prototype, `CareSyncStateSnapshot` persisted under `localStorage["caresync_mal4_snapshot_v1"]` is the single source of truth:

- **Appointments (`snapshot.appointments`):** Canonical record of lifecycle status (`BOOKED`, `CHECKED_IN`, `IN_CONSULTATION`, `COMPLETED`, `CANCELLED`, `RESCHEDULED`) and timestamps.
- **Slot Occupancy (`snapshot.timeSlots` + active `snapshot.appointments`):** `TimeSlot.availabilityStatus` stores explicit slot state (`AVAILABLE`, `BOOKED`, `BLOCKED`), while `validateSlotForBooking()` cross-verifies against all slot-occupying appointments (`BOOKED | CHECKED_IN | IN_CONSULTATION`) to guarantee consistency even if inspected independently.
- **Live Queues (`computeDoctorQueue`):** Derived **purely on read** from `snapshot.appointments` (`IN_CONSULTATION` and `CHECKED_IN` records for `(doctorId, clinicDate)` ordered by `checkedInAt`). Never stored as a separate mutable array, eliminating queue desynchronization bugs.

## 6. Prototype Persistence vs. Production Multi-User Backend

| Concern | Single-Device Prototype (Implemented) | Production Multi-User Healthcare System |
| :--- | :--- | :--- |
| **Persistence Engine** | Browser `localStorage` atomic JSON snapshot behind `ICareSyncRepository` | PostgreSQL 16+ relational database accessed via stateless API servers |
| **Atomic Booking & Concurrency** | Synchronous single-thread `transact(draft)` isolation | `BEGIN ... SELECT ... FOR UPDATE` on `time_slots` + PostgreSQL partial unique index `UNIQUE(doctor_id, slot_id) WHERE status IN ('BOOKED','CHECKED_IN','IN_CONSULTATION')` + `EXCLUDE USING gist` range constraint |
| **Server-Side Idempotency** | `bookingRequests[requestId]` map committed inside snapshot | `idempotency_keys (actor_id, request_id PRIMARY KEY, request_hash, response_json, status)` committed in the same DB transaction |
| **Authentication & Authorization** | Explicit Demo Role Selector (clearly labeled non-authenticated) | OAuth2 / OIDC (SMART on FHIR / JWT) with server-enforced RBAC & row-level tenant/patient scoping |
| **Multi-Client Live Queue Sync** | Instant in-tab state propagation across switched roles | Server-Sent Events (SSE) or WebSockets broadcasting committed queue position deltas |
