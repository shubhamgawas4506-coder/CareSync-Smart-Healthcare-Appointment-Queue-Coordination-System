# ADR-003: Client-Generated Idempotency Keys & Persistent Request Ledger for Safe Retry

- **Status:** Accepted
- **Date:** 2026-11-01

## Context
Mobile and clinic Wi-Fi connections frequently drop after a booking HTTP request leaves the device. Naive clients either treat every timeout as a failure and submit a brand-new booking request (risking duplicate appointments or false self-conflicts) or lose track of pending requests if the user refreshes the browser.

## Alternatives Considered
1. **Stateless Retry Without Request ID:** Retries submit fresh payloads. If the initial request actually committed before the response dropped, retrying either fails with a confusing slot-conflict error or double-books the patient on another slot.
2. **Deduplicating by `(patientId, doctorId, slotId)` Hash Only:** Prevents identical-slot duplicates, but cannot distinguish an intentional re-booking of a slot after a legitimate cancellation from an accidental network retry, nor track attempt counts per user operation.
3. **Explicit Client-Generated `requestId` + Persisted `BookingRequestRecord` Ledger (Chosen):** Assigns a stable `requestId` (`req_<epoch>_<nonce>`) before submission, persists `UNCERTAIN_INTERRUPTED` state on network drops, and reconciles against `appointments` by `requestId` across retries and page reloads.

## Decision
Require `requestId` on `SubmitBookingInput` and maintain `snapshot.bookingRequests[requestId]`. Distinguish `UNCERTAIN_INTERRUPTED` (network drop—outcome unknown, safe to retry with preserved `requestId`) from `FAILED` (confirmed domain rejection such as `SLOT_CONFLICT` or `PAST_SLOT`). On retry, check `draft.appointments` for `apt.requestId === input.requestId` before executing slot allocation.

## Consequences
- **Positive:** Guarantees **at-most-once** appointment creation per `requestId` regardless of whether the network dropped pre-commit or post-commit, and regardless of how many times a retry packet is replayed. Survives full browser reloads via `recoverInterruptedRequests()`.
- **Negative:** Requires storing `BookingRequestRecord` metadata alongside appointments and managing `requestId` lifecycle in the booking form (rotating `requestId` only after confirmation or confirmed terminal rejection).

## When to Revisit
In a multi-user backend deployment, enforce `(actor_id, request_id)` uniqueness via a PostgreSQL `idempotency_keys` table with a 24–72 hour TTL cleanup policy and payload-hash mismatch detection (`422 Unprocessable Entity` if a client reuses an old `requestId` with mutated parameters).
