# ADR-002: Explicit Domain State Machine for Appointment Lifecycle Management

- **Status:** Accepted
- **Date:** 2026-11-01

## Context
Appointments progress through multiple clinical coordination phases (`Booked`, `Checked In`, `In Consultation`, `Completed`, `Cancelled`, `Rescheduled`) operated by three roles (`Patient`, `Doctor`, `Coordinator`), plus a configurable clinic rule governing whether checked-in appointments may be cancelled. Ad-hoc status updates inside UI click handlers risk illegal state jumps (e.g., `Booked → Completed` or cancelling an active consultation).

## Alternatives Considered
1. **UI-Only Button Disabling:** Hiding buttons in React components without domain enforcement. Fragile—any new screen or coordinator bulk action can bypass rules.
2. **External Statechart Library (e.g., XState):** Powerful actor runtime, but adds an external dependency and boilerplate for a synchronous deterministic entity transition table.
3. **Pure Functional Domain State Machine (`src/domain/stateMachine.ts`) (Chosen):** Centralizes `getAllowedNextStatuses()` and `validateAppointmentTransition()` in pure TypeScript, parameterized by `ClinicPolicyConfig`.

## Decision
Enforce all status changes exclusively through `validateAppointmentTransition()` inside `CareSyncCoordinationService.transitionAppointmentStatus()` and `rescheduleAppointment()`. UI components also call `getAllowedNextStatuses()` so rendered controls always mirror the exact domain transition matrix.

## Consequences
- **Positive:** Zero drift between UI affordances and domain enforcement; invalid transitions deterministically throw `DomainRuleError('INVALID_STATE_TRANSITION')` or `DomainRuleError('POLICY_DISALLOWS_CHECKED_IN_CANCELLATION')`; rescheduling creates a forward/backward linked replacement appointment (`rescheduledToAppointmentId` / `rescheduledFromAppointmentId`) preserving full historical traceability.
- **Negative:** Adding a new lifecycle state (such as `NO_SHOW` or `AWAITING_VITALS`) requires updating both the `AppointmentStatus` enum and exhaustive `switch` blocks across domain and status indicators (enforced at compile time by TypeScript).

## When to Revisit
Revisit if clinics require per-specialty customizable workflow sub-steps (e.g., Radiology pre-screening before Consultation), at which point transition tables can be externalized into declarative JSON workflow definitions validated by the engine.
