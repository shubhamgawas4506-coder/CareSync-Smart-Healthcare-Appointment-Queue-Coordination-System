# ADR-004: Double-Defense Slot Conflict Prevention & Immediate Pre-Commit Validation

- **Status:** Accepted
- **Date:** 2026-11-01

## Context
Preventing two active appointments from occupying the same specialist and time window—and ensuring cancelled/rescheduled slots immediately return to circulation—is the central correctness invariant of CareSync.

## Alternatives Considered
1. **Checking `TimeSlot.availabilityStatus === 'AVAILABLE'` Alone:** Fast $O(1)$ lookup, but vulnerable if a custom slot creation or bug ever creates two overlapping `TimeSlot` entities for the same doctor (e.g., `09:00–09:30` and `09:15–09:45`), or if slot flags drift.
2. **Scanning `Appointment` Intervals Alone Without `TimeSlot` Entities:** Cannot represent coordinator-managed open capacity, blocked lunch/admin windows, or unbooked future schedules cleanly.
3. **Double-Defense Validation Inside Atomic Transaction (Chosen):** Model explicit `TimeSlot` entities (`AVAILABLE | BOOKED | BLOCKED`) AND validate inside `validateSlotForBooking()` immediately before commit that:
   - zero slot-occupying appointments (`BOOKED | CHECKED_IN | IN_CONSULTATION`) reference `slot.slotId` OR overlap `[slot.startTime, slot.endTime)` for `doctorId`;
   - `slot.availabilityStatus === 'AVAILABLE'` and `slot.startTime > nowMs`;
   - the patient holds no overlapping active appointment with another doctor (`validatePatientHasNoOverlappingAppointment()`).

## Decision
Execute `validateSlotForBooking()` and `validatePatientHasNoOverlappingAppointment()` synchronously inside `repository.transact()` immediately prior to inserting or rescheduling any appointment, and atomically release `slot.availabilityStatus = 'AVAILABLE'` whenever an occupying appointment transitions to `CANCELLED` or `RESCHEDULED`.

## Consequences
- **Positive:** Eliminates double-booking across discrete slots, overlapping custom windows, and same-patient cross-doctor collisions; logs explicit `SLOT_CONFLICT_DETECTED` audit events whenever a second patient contests an occupied window.
- **Negative:** Scanning doctor appointments per booking is $O(A_{\text{doctor}})$ in memory (negligible for prototype scale).

## When to Revisit
When migrating to a concurrent multi-server PostgreSQL backend, pair this domain check with database-level pessimistic locking (`SELECT ... FOR UPDATE` on `time_slots`) and a PostgreSQL GiST exclusion constraint (`EXCLUDE USING gist (doctor_id WITH =, tstzrange(start_time, end_time) WITH &&) WHERE (status IN ('BOOKED','CHECKED_IN','IN_CONSULTATION'))`).
