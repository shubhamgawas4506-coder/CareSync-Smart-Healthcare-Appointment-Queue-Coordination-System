# ADR-005: Dual-Stream Audit Event Ledger & Operational Diagnostics

- **Status:** Accepted
- **Date:** 2026-11-01

## Context
Healthcare coordination requires both a **domain-level clinical coordination audit trail** (who requested, confirmed, checked in, started, completed, cancelled, or conflicted on an appointment, and why) and **system-level operational diagnostics** (storage write faults, recovery scans, policy updates, and idempotency deduplication hits).

## Alternatives Considered
1. **Overwriting `updatedAt` and `status` on `Appointment` Without Event Records:** Loses intermediate history (e.g., cannot see how many retries occurred before confirmation, or who checked a patient in before cancellation).
2. **Browser `console.log` Only for Diagnostics:** Invisible to clinic coordinators inside the application UI and lost upon page refresh.
3. **Dual Append-Only Streams (`AppointmentEvent[]` + `DiagnosticRecord[]`) Committed Atomically (Chosen):** Maintain a structured domain `events` array covering all 10 canonical `AppointmentEventType`s alongside a `diagnostics` array for repository/infrastructure health.

## Decision
Append immutable `AppointmentEvent` records inside the same `repository.transact()` call as every domain mutation (so audit history can never diverge from entity state), and record `DiagnosticRecord` entries for infrastructure events including storage fault rollbacks and startup recovery scans. Expose both streams in Screen 10 (`DiagnosticsAndAuditView`).

## Consequences
- **Positive:** 100% traceability from initial `requestId` (`APPOINTMENT_REQUESTED`) through `BOOKING_FAILED` / `BOOKING_RETRIED` to `APPOINTMENT_CONFIRMED`, `PATIENT_CHECKED_IN`, `CONSULTATION_STARTED`, and `CONSULTATION_COMPLETED`, plus `SLOT_CONFLICT_DETECTED`.
- **Negative:** Append-only arrays grow linearly over long sessions; storage aborts (`RepositoryStorageError`) can only record diagnostics in live memory until persistent storage health is restored.

## When to Revisit
In production, route `AppointmentEvent` rows to an append-only SQL audit table (with `REVOKE UPDATE, DELETE` privileges) and ship `DiagnosticRecord` telemetry asynchronously to OpenTelemetry / Cloud Logging so storage outages still emit external alerts.
