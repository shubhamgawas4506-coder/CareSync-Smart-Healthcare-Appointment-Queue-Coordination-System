# CareSync — One-Page Solution Brief (MAL 4)

## 1. Problem
Outpatient clinics routinely suffer from fragmented scheduling, double-booked physician slots, opaque waiting-room queues, and duplicate appointment creation when mobile or clinic Wi-Fi connections drop mid-booking. **CareSync** solves outpatient appointment and queue coordination by enforcing deterministic lifecycle transitions, immediate pre-commit conflict checks, idempotent request recovery across network interruptions, and an immutable operational audit trail.

*Scope Boundary:* CareSync is strictly an **outpatient appointment and queue coordination system**—it is **not** a clinical diagnosis, electronic medical record (EMR) prescribing tool, or emergency triage platform.

## 2. Users & Demo Roles
1. **Patient (`pat_maya_lin`, `pat_rohan_patel`, `pat_claire_bennett`)**
   - Browses specialists and open time slots, books visits with idempotent retry protection, cancels or reschedules visits, and monitors live queue position and estimated wait time.
2. **Doctor (`doc_sarah_jenkins`, `doc_kenji_tanaka`, `doc_priya_nair`, `doc_marcus_thompson`)**
   - Reviews chronological daily rosters and visit context, transitions appointments through `Checked In → In Consultation → Completed`, or records clinical cancellations with required reasons.
3. **Clinic Coordinator (`coord_nadia_okafor`)**
   - Manages specialist time slots (`Available` / `Blocked` / new slot creation), supervises live multi-suite queues, configures clinic cancellation policy (`allowCheckedInCancellation`), resolves scheduling conflicts, and audits event/diagnostic logs.

## 3. Core End-to-End Journey
1. **Discovery & Booking:** Patient selects a specialist and future `AVAILABLE` slot. Client assigns a stable `requestId` (`req_<timestamp>_<nonce>`) before submission.
2. **Resilient Confirmation:** If a network drop interrupts confirmation, CareSync records `UNCERTAIN_INTERRUPTED` against the `requestId` (surviving page refresh). Retrying with the same `requestId` reconciles existing state and confirms **at most one** `BOOKED` appointment while locking the `TimeSlot`.
3. **Arrival & Smart Queue:** Upon clinic arrival, Coordinator or Doctor marks the appointment `CHECKED_IN`, placing the patient in the doctor's ordered queue with an explicit, formula-backed wait-time estimate.
4. **Consultation & Completion:** Doctor transitions `CHECKED_IN → IN_CONSULTATION → COMPLETED`, advancing subsequent waiting patients automatically and recording timestamped `AppointmentEvent` entries at every step.

## 4. Scope
- **In Scope:** Specialist directory, double-booking prevention, past/blocked slot protection, atomic cancellation & slot release, atomic rescheduling, configurable lifecycle state machine, live check-in queue & wait-time estimation, simulated network drop + idempotent retry recovery, storage fault rollback verification, and full audit/diagnostic logging.
- **Out of Scope:** Clinical diagnosis/triage, real multi-device cloud synchronization, payment processing, and production OAuth/OIDC identity management.

## 5. Explicit Assumptions
- Appointment durations are discrete windows (default 30 minutes) stored as UTC integer epoch milliseconds (`number`) and formatted explicitly in the clinic's IANA timezone (`America/Los_Angeles`).
- Average consultation duration (`avgConsultationMinutes` per specialist) provides a reasonable baseline for operational waiting-room estimates when clearly labeled as non-guaranteed estimates.
- Role switching in the UI is an intentional evaluation mechanism for single-browser architecture testing, not real authentication or authorization.

## 6. Constraints
- **Single-Device Prototype Persistence:** Uses browser `localStorage` behind `ICareSyncRepository` and `IStorageAdapter` interfaces so records survive refreshes and browser restarts without external database setup.
- **Strict Layer Boundaries:** Pure business rules (`src/domain/`) have zero React, DOM, or `localStorage` imports and execute deterministically in under 1.2 seconds under `node:test`.

## 7. Success Conditions
1. **Zero Double Bookings:** Concurrent or sequential attempts by a second patient to claim an occupied doctor slot always fail with `SLOT_CONFLICT` and emit `SLOT_CONFLICT_DETECTED`.
2. **Idempotent Retry Safety:** Retrying an interrupted or already-confirmed booking with the same `requestId` (even after reloading the page) produces **strictly one** appointment record.
3. **State Machine Integrity:** Invalid transitions (e.g., `BOOKED → COMPLETED` or policy-prohibited `CHECKED_IN → CANCELLED`) throw `DomainRuleError` with zero partial state mutation.
4. **Atomic Persistence:** Simulated storage write failures abort the unit-of-work draft cleanly, leaving appointments, slots, and queues completely consistent.
