# CareSync — Verification & Demonstration Guide

## 1. Core User Journey Walkthrough

1. **Welcome & Role Selection (`/`):**
   - Inspect live clinic metrics, review the non-diagnostic prototype notice, select **Maya Lin (`MRN-408921`)** under **Patient Portal**, and click **Open Patient Dashboard**.
2. **Patient Queue & Booking (`Patient Portal`):**
   - Observe Maya Lin's live queue card (#2 in Suite 204-A for Dr. Sarah Jenkins, with transparent wait-time formula breakdown).
   - Click **Book Visit**, filter by specialty (e.g., *Preventive Medicine* — Dr. Marcus Thompson), choose a future open slot, enter a visit reason, and confirm.
   - Review the **Booking Confirmation Receipt** showing `appointmentId`, `requestId`, and clinic timezone (`America/Los_Angeles`).
3. **Physician Consultation Lifecycle (`Doctor Console`):**
   - Switch to **Doctor** (`Dr. Sarah Jenkins, MD`).
   - Complete David Kim's active consultation (`IN_CONSULTATION → COMPLETED`), select Claire Bennett (#1 in queue) and click **Start Consultation** (`CHECKED_IN → IN_CONSULTATION`).
   - Switch back to **Patient Portal → Live Queue**: verify Maya Lin automatically advanced from **Position #2 to Position #1** and her estimated wait updated immediately.
4. **Coordinator Schedule & Audit (`Clinic Coordinator`):**
   - Switch to **Coordinator** (`Nadia Okafor`). Block/unblock an unoccupied slot, add a new 30-minute slot, toggle **Checked-In Cancel** clinic policy, and inspect **Audit & Diagnostics**.

---

## 2. Business Rule Walkthrough

- **Past & Blocked Slot Protection:** In `Book Visit`, past windows and Coordinator-blocked windows appear disabled with explicit labels (`Past slot`, `Blocked`). Direct calls to `submitBooking()` against past or blocked slots return `REJECTED` (`PAST_SLOT` or `UNAVAILABLE_SLOT`).
- **Cancellation & Automatic Slot Release:** In `My Appointments`, cancel Maya Lin's upcoming Orthopedic appointment with Dr. Priya Nair (`BOOKED → CANCELLED`). Return to `Book Visit` for Dr. Priya Nair and verify that exact time slot is immediately `Available` again.
- **Atomic Rescheduling:** Click **Reschedule** on any `BOOKED` appointment and pick a new slot. The original appointment becomes `RESCHEDULED`, the old slot returns to `AVAILABLE`, and a linked `BOOKED` appointment locks the new slot in one transaction.
- **Policy-Gated Post-Check-In Cancellation:** Attempt to cancel a `CHECKED_IN` appointment while `Checked-In Cancel: Blocked` is set—the state machine blocks it (`POLICY_DISALLOWS_CHECKED_IN_CANCELLATION`). Toggle the policy to `Allowed` in Coordinator Command and verify cancellation is now permitted.

---

## 3. Dedicated Failure, Recovery & Conflict Walkthrough (Section 8)

You can execute this either manually in **Patient Portal → Book Visit** (using the *Simulate network interruption* checkbox + browser reload) or via the 4-button guided harness in **Coordinator Command → Operations & Lab**:

1. **Step 1 (Submit with Network Failure):** Maya Lin initiates a booking with `simulateNetworkFailure: true`.
   - *Visible Result:* Toast warns outcome is uncertain; `BookingRequestRecord` is saved in `UNCERTAIN_INTERRUPTED` state with a stable `requestId` (`req_...`).
2. **Optional Page Refresh Recovery Test:** Reload the browser page (`Ctrl+R` / `Cmd+R`).
   - *Visible Result:* `recoverInterruptedRequests()` detects the persisted `UNCERTAIN_INTERRUPTED` record and renders the amber recovery banner with the preserved `requestId`.
3. **Step 2 (Retry Same Request ID):** Click **Retry Same Request**.
   - *Visible Result:* `submitBooking()` increments `attemptCount` to `2`, appends `BOOKING_RETRIED`, validates the slot, confirms **1** appointment, and logs `APPOINTMENT_CONFIRMED`.
4. **Step 3 (Replay Deduplication Check):** Click **Replay Same Request Again** (Coordinator Lab).
   - *Visible Result:* Idempotency check matches the existing `appointmentId` for `requestId` and returns `deduplicatedRetry: true`—count of appointments for `requestId` remains **strictly 1**.
5. **Step 4 (Second Patient Slot Conflict):** Click **2nd Patient Tries Same Slot** (`Rohan Patel`).
   - *Visible Result:* Immediate rejection (`SLOT_CONFLICT`) and `SLOT_CONFLICT_DETECTED` + `BOOKING_FAILED` appended to the audit trail.

---

## 4. Automated Test Scenarios & Actual Execution Results

Command executed:
```bash
npx --yes tsx --test src/tests/coordination.test.ts
```

| # | Test Scenario | Example Input | Expected Output | Actual Result |
| :- | :--- | :--- | :--- | :--- |
| 1 | Successful appointment booking | `submitBooking({ requestId: 'req_test_success_001', doctorId: 'doc_marcus_thompson', slotId })` | `outcome: 'CONFIRMED'`, slot `BOOKED`, events `[APPOINTMENT_REQUESTED, APPOINTMENT_CONFIRMED]` | **PASS** (118.5 ms) |
| 2 | Network drop, page-reload recovery & duplicate retry | `simulateNetworkFailure: true` → new repo instance → retry `req_idem_network_drop_42` ×2 | Recoverable `UNCERTAIN_INTERRUPTED`, then strictly `1` appointment across retries | **PASS** (69.5 ms) |
| 2b | Post-commit response drop retry deduplication | `simulateDropAfterServerCommit: true` → retry same `req_post_commit_drop_99` | Reconciles committed appointment (`deduplicatedRetry: true`), strictly `1` record | **PASS** (74.2 ms) |
| 3 | Second-patient doctor slot conflict | Maya books `slotId`, then Rohan submits same `slotId` | `outcome: 'REJECTED'`, `errorCode: 'SLOT_CONFLICT'`, logs `SLOT_CONFLICT_DETECTED` | **PASS** (41.5 ms) |
| 4 | Invalid state transition & clinic policy toggle | `BOOKED → COMPLETED` (invalid); `CHECKED_IN → CANCELLED` (policy false vs true) | Throws `INVALID_STATE_TRANSITION` & `POLICY_DISALLOWS_CHECKED_IN_CANCELLATION`; succeeds once policy enabled | **PASS** (62.7 ms) |
| 5 | Cancellation & slot release | Cancel `BOOKED` slot for Maya, then book same slot for Rohan | Slot returns to `AVAILABLE`; Rohan's subsequent booking returns `CONFIRMED` | **PASS** (52.4 ms) |
| 6 | Atomic rescheduling & failure rollback | Reschedule `slotA` to nonexistent slot (fails), then to `slotB` (succeeds) | Failed reschedule leaves `slotA` `BOOKED`; valid reschedule marks old `RESCHEDULED`, releases `slotA`, locks `slotB` | **PASS** (43.2 ms) |
| 7 | Smart queue ordering & wait-time updates | Complete David Kim (`IN_CONSULTATION`), start Claire (#1) | Maya Lin advances from `#2` (`32m` est.) to `#1` (`20m` est.) | **PASS** (61.8 ms) |
| 8 | Storage failure rollback & recovery | `repo.setSimulatedStorageFailure(true)` during `submitBooking()` | Throws `RepositoryStorageError`; appointment count & slot state unchanged; succeeds once cleared | **PASS** (42.0 ms) |
| 9 | Past & blocked time slot rejection | `submitBooking()` on past slot (`startTime <= nowMs`) and `BLOCKED` slot | Returns `REJECTED` with `PAST_SLOT` and `UNAVAILABLE_SLOT` | **PASS** (42.5 ms) |

**Summary:** `10 tests, 10 passed, 0 failed` (`duration_ms: 1139.43`).

---

## 5. Diagnostics Area Explanation

Accessible under **Clinic Coordinator → Audit & Diagnostics** (`diagnostics-audit` screen), divided into three live views:
1. **Audit Events:** Chronological domain history filterable across all 10 required `AppointmentEventType`s, showing formatted clinic timestamps alongside raw integer epoch milliseconds, `appointmentId`, `requestId`, `actorId`, and transition delta.
2. **Idempotency Ledger:** Displays every `BookingRequestRecord` (`PENDING`, `UNCERTAIN_INTERRUPTED`, `CONFIRMED`, `FAILED`), retry attempt count, and one-click recovery trigger.
3. **Storage & Diagnostics:** Shows live snapshot byte size, schema version, **Inject Storage Write Failure** toggle to test atomic transaction aborts interactively, and the chronological `DiagnosticRecord` operation stream.
