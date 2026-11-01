/**
 * CareSync Automated Verification Suite (node:test)
 *
 * Covers all 9 mandatory verification categories:
 * 1. Successful appointment booking
 * 2. Duplicate booking retry & interrupted network recovery (idempotency)
 * 3. Doctor slot conflict detection
 * 4. Invalid appointment state transitions & configurable clinic policy
 * 5. Cancellation and automatic slot release
 * 6. Atomic rescheduling (including rollback on unavailable target slot)
 * 7. Smart patient queue ordering & wait-time estimates
 * 8. Storage failure rollback & persistence recovery across restarts
 * 9. Invalid, blocked, or past time slots
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { CareSyncCoordinationService } from '../application/coordinationService';
import {
  AppointmentEventType,
  AppointmentStatus,
  BookingOperationState,
  DomainRuleError,
  SlotAvailabilityStatus,
  UserRole,
} from '../domain/models';
import { RepositoryStorageError } from '../repositories/interfaces';
import {
  InMemoryStorageAdapter,
  LocalStorageCareSyncRepository,
} from '../repositories/localStorageRepository';

const FIXED_NOW_MS = Date.UTC(2026, 10, 1, 15, 0, 0); // 2026-11-01T15:00:00Z (08:00 AM America/Los_Angeles)

function createTestHarness(nowMs: number = FIXED_NOW_MS) {
  const storage = new InMemoryStorageAdapter();
  const repo = new LocalStorageCareSyncRepository(storage, nowMs, 'caresync_test_key');
  const service = new CareSyncCoordinationService(repo);
  return { storage, repo, service };
}

function findFirstAvailableFutureSlot(
  service: CareSyncCoordinationService,
  doctorId: string,
  nowMs: number = FIXED_NOW_MS,
  patientId?: string,
) {
  const snap = service.getSnapshot();
  const patientActive = patientId
    ? Object.values(snap.appointments).filter(
        (a) =>
          a.patientId === patientId &&
          (a.status === AppointmentStatus.BOOKED ||
            a.status === AppointmentStatus.CHECKED_IN ||
            a.status === AppointmentStatus.IN_CONSULTATION),
      )
    : [];
  const candidates = Object.values(snap.timeSlots)
    .filter(
      (s) =>
        s.doctorId === doctorId &&
        s.availabilityStatus === SlotAvailabilityStatus.AVAILABLE &&
        s.startTime > nowMs &&
        !patientActive.some((apt) => apt.startTime < s.endTime && s.startTime < apt.endTime),
    )
    .sort((a, b) => a.startTime - b.startTime);
  assert.ok(candidates.length > 0, `Expected at least one future available slot for ${doctorId}`);
  return candidates[0];
}

test('1. Successful appointment booking locks slot atomically and records audit events', () => {
  const { service } = createTestHarness();
  const slot = findFirstAvailableFutureSlot(service, 'doc_marcus_thompson');

  const result = service.submitBooking({
    requestId: 'req_test_success_001',
    patientId: 'pat_maya_lin',
    doctorId: 'doc_marcus_thompson',
    slotId: slot.slotId,
    reasonForVisit: 'Preventive blood panel consultation',
    actorId: 'pat_maya_lin',
    actorRole: UserRole.PATIENT,
    nowMs: FIXED_NOW_MS,
  });

  assert.equal(result.outcome, 'CONFIRMED');
  if (result.outcome !== 'CONFIRMED') return;

  assert.equal(result.deduplicatedRetry, false);
  assert.equal(result.appointment.status, AppointmentStatus.BOOKED);
  assert.equal(result.appointment.requestId, 'req_test_success_001');
  assert.equal(result.appointment.slotId, slot.slotId);

  const after = service.getSnapshot();
  assert.equal(after.timeSlots[slot.slotId].availabilityStatus, SlotAvailabilityStatus.BOOKED);
  assert.equal(after.timeSlots[slot.slotId].activeAppointmentId, result.appointment.appointmentId);
  assert.ok(after.patients.pat_maya_lin.appointmentIds.includes(result.appointment.appointmentId));

  const reqEvents = after.events.filter((e) => e.requestId === 'req_test_success_001');
  assert.deepEqual(
    reqEvents.map((e) => e.eventType),
    [AppointmentEventType.APPOINTMENT_REQUESTED, AppointmentEventType.APPOINTMENT_CONFIRMED],
  );
});

test('2. Safe booking & retry: simulated network interruption recovers across reload and prevents duplicate appointments', () => {
  const { storage, service } = createTestHarness();
  const slot = findFirstAvailableFutureSlot(service, 'doc_marcus_thompson');
  const stableRequestId = 'req_idem_network_drop_42';

  // Attempt 1: Simulated network failure mid-flight
  const interrupted = service.submitBooking({
    requestId: stableRequestId,
    patientId: 'pat_maya_lin',
    doctorId: 'doc_marcus_thompson',
    slotId: slot.slotId,
    reasonForVisit: 'Cardiometabolic checkup',
    actorId: 'pat_maya_lin',
    actorRole: UserRole.PATIENT,
    simulateNetworkFailure: true,
    nowMs: FIXED_NOW_MS + 1000,
  });

  assert.equal(interrupted.outcome, 'UNCERTAIN_INTERRUPTED');
  assert.equal(interrupted.requestRecord.state, BookingOperationState.UNCERTAIN_INTERRUPTED);
  assert.equal(interrupted.requestRecord.attemptCount, 1);

  // Simulate browser page refresh by constructing a brand-new repository & service over the same storage
  const reloadedRepo = new LocalStorageCareSyncRepository(
    storage,
    FIXED_NOW_MS + 2000,
    'caresync_test_key',
  );
  const reloadedService = new CareSyncCoordinationService(reloadedRepo);

  const recoveredList = reloadedService.recoverInterruptedRequests('pat_maya_lin', FIXED_NOW_MS + 2500);
  assert.equal(recoveredList.length, 1);
  assert.equal(recoveredList[0].requestId, stableRequestId);

  // Attempt 2: Retry with the exact same requestId after network recovery
  const retryResult = reloadedService.submitBooking({
    requestId: stableRequestId,
    patientId: 'pat_maya_lin',
    doctorId: 'doc_marcus_thompson',
    slotId: slot.slotId,
    reasonForVisit: 'Cardiometabolic checkup',
    actorId: 'pat_maya_lin',
    actorRole: UserRole.PATIENT,
    simulateNetworkFailure: false,
    nowMs: FIXED_NOW_MS + 3000,
  });

  assert.equal(retryResult.outcome, 'CONFIRMED');
  if (retryResult.outcome !== 'CONFIRMED') return;
  assert.equal(retryResult.requestRecord.attemptCount, 2);

  // Attempt 3: Duplicate retry packet with same requestId after confirmation
  const duplicateReplay = reloadedService.submitBooking({
    requestId: stableRequestId,
    patientId: 'pat_maya_lin',
    doctorId: 'doc_marcus_thompson',
    slotId: slot.slotId,
    reasonForVisit: 'Cardiometabolic checkup',
    actorId: 'pat_maya_lin',
    actorRole: UserRole.PATIENT,
    simulateNetworkFailure: false,
    nowMs: FIXED_NOW_MS + 4000,
  });

  assert.equal(duplicateReplay.outcome, 'CONFIRMED');
  if (duplicateReplay.outcome !== 'CONFIRMED') return;
  assert.equal(duplicateReplay.deduplicatedRetry, true);
  assert.equal(duplicateReplay.appointment.appointmentId, retryResult.appointment.appointmentId);

  // Verify strictly ONE appointment exists for this requestId
  const finalSnap = reloadedService.getSnapshot();
  const matchingAppointments = Object.values(finalSnap.appointments).filter(
    (apt) => apt.requestId === stableRequestId,
  );
  assert.equal(matchingAppointments.length, 1);

  const eventTypes = finalSnap.events
    .filter((e) => e.requestId === stableRequestId)
    .map((e) => e.eventType);
  assert.deepEqual(eventTypes, [
    AppointmentEventType.APPOINTMENT_REQUESTED,
    AppointmentEventType.BOOKING_FAILED,
    AppointmentEventType.BOOKING_RETRIED,
    AppointmentEventType.APPOINTMENT_CONFIRMED,
    AppointmentEventType.BOOKING_RETRIED,
  ]);
});

test('2b. Post-commit response drop retry reconciles existing appointment without double-booking', () => {
  const { service } = createTestHarness();
  const slot = findFirstAvailableFutureSlot(
    service,
    'doc_priya_nair',
    FIXED_NOW_MS,
    'pat_claire_bennett',
  );
  const reqId = 'req_post_commit_drop_99';

  const droppedAfterCommit = service.submitBooking({
    requestId: reqId,
    patientId: 'pat_claire_bennett',
    doctorId: 'doc_priya_nair',
    slotId: slot.slotId,
    reasonForVisit: 'Knee stability review',
    actorId: 'pat_claire_bennett',
    actorRole: UserRole.PATIENT,
    simulateNetworkFailure: true,
    simulateDropAfterServerCommit: true,
    nowMs: FIXED_NOW_MS + 500,
  });
  assert.equal(droppedAfterCommit.outcome, 'UNCERTAIN_INTERRUPTED');

  const reconciled = service.submitBooking({
    requestId: reqId,
    patientId: 'pat_claire_bennett',
    doctorId: 'doc_priya_nair',
    slotId: slot.slotId,
    reasonForVisit: 'Knee stability review',
    actorId: 'pat_claire_bennett',
    actorRole: UserRole.PATIENT,
    simulateNetworkFailure: false,
    nowMs: FIXED_NOW_MS + 1500,
  });
  assert.equal(reconciled.outcome, 'CONFIRMED');
  if (reconciled.outcome !== 'CONFIRMED') return;
  assert.equal(reconciled.deduplicatedRetry, true);

  const allForReq = Object.values(service.getSnapshot().appointments).filter(
    (a) => a.requestId === reqId,
  );
  assert.equal(allForReq.length, 1);
});

test('3. Doctor slot conflict: second patient attempting to book occupied slot is rejected and logged', () => {
  const { service } = createTestHarness();
  const slot = findFirstAvailableFutureSlot(service, 'doc_kenji_tanaka');

  const firstBooking = service.submitBooking({
    requestId: 'req_first_patient',
    patientId: 'pat_maya_lin',
    doctorId: 'doc_kenji_tanaka',
    slotId: slot.slotId,
    reasonForVisit: 'Routine physical',
    actorId: 'pat_maya_lin',
    actorRole: UserRole.PATIENT,
    nowMs: FIXED_NOW_MS,
  });
  assert.equal(firstBooking.outcome, 'CONFIRMED');

  const conflictingBooking = service.submitBooking({
    requestId: 'req_second_patient_conflict',
    patientId: 'pat_rohan_patel',
    doctorId: 'doc_kenji_tanaka',
    slotId: slot.slotId,
    reasonForVisit: 'Follow-up consultation',
    actorId: 'pat_rohan_patel',
    actorRole: UserRole.PATIENT,
    nowMs: FIXED_NOW_MS + 5000,
  });

  assert.equal(conflictingBooking.outcome, 'REJECTED');
  if (conflictingBooking.outcome !== 'REJECTED') return;
  assert.equal(conflictingBooking.errorCode, 'SLOT_CONFLICT');
  assert.equal(conflictingBooking.requestRecord.state, BookingOperationState.FAILED);

  const conflictEvents = service
    .getSnapshot()
    .events.filter(
      (e) =>
        e.requestId === 'req_second_patient_conflict' &&
        e.eventType === AppointmentEventType.SLOT_CONFLICT_DETECTED,
    );
  assert.equal(conflictEvents.length, 1);
});

test('4. Appointment lifecycle state machine rejects invalid transitions and enforces clinic policy on Checked-In cancellation', () => {
  const { service } = createTestHarness();
  const slot = findFirstAvailableFutureSlot(service, 'doc_marcus_thompson');
  const booked = service.submitBooking({
    requestId: 'req_lifecycle_01',
    patientId: 'pat_rohan_patel',
    doctorId: 'doc_marcus_thompson',
    slotId: slot.slotId,
    reasonForVisit: 'Blood pressure screening',
    actorId: 'pat_rohan_patel',
    actorRole: UserRole.PATIENT,
    nowMs: FIXED_NOW_MS,
  });
  assert.equal(booked.outcome, 'CONFIRMED');
  if (booked.outcome !== 'CONFIRMED') return;
  const aptId = booked.appointment.appointmentId;

  // Reject skipping directly from BOOKED -> COMPLETED
  assert.throws(
    () =>
      service.transitionAppointmentStatus({
        appointmentId: aptId,
        targetStatus: AppointmentStatus.COMPLETED,
        actorId: 'doc_marcus_thompson',
        actorRole: UserRole.DOCTOR,
        nowMs: FIXED_NOW_MS + 1000,
      }),
    (err: unknown) => err instanceof DomainRuleError && err.code === 'INVALID_STATE_TRANSITION',
  );

  // Valid: BOOKED -> CHECKED_IN
  const checkedIn = service.transitionAppointmentStatus({
    appointmentId: aptId,
    targetStatus: AppointmentStatus.CHECKED_IN,
    actorId: 'coord_nadia_okafor',
    actorRole: UserRole.COORDINATOR,
    nowMs: FIXED_NOW_MS + 2000,
  });
  assert.equal(checkedIn.status, AppointmentStatus.CHECKED_IN);

  // Default clinic policy (allowCheckedInCancellation = false) rejects CHECKED_IN -> CANCELLED
  assert.throws(
    () =>
      service.transitionAppointmentStatus({
        appointmentId: aptId,
        targetStatus: AppointmentStatus.CANCELLED,
        actorId: 'doc_marcus_thompson',
        actorRole: UserRole.DOCTOR,
        reason: 'Patient requested late cancellation',
        nowMs: FIXED_NOW_MS + 3000,
      }),
    (err: unknown) =>
      err instanceof DomainRuleError && err.code === 'POLICY_DISALLOWS_CHECKED_IN_CANCELLATION',
  );

  // Coordinator enables allowCheckedInCancellation -> transition now succeeds and releases slot
  service.updateClinicPolicy({ allowCheckedInCancellation: true }, 'coord_nadia_okafor', FIXED_NOW_MS + 3500);
  const cancelledAfterCheckIn = service.transitionAppointmentStatus({
    appointmentId: aptId,
    targetStatus: AppointmentStatus.CANCELLED,
    actorId: 'doc_marcus_thompson',
    actorRole: UserRole.DOCTOR,
    reason: 'Patient felt unwell and rescheduled for next week',
    nowMs: FIXED_NOW_MS + 4000,
  });
  assert.equal(cancelledAfterCheckIn.status, AppointmentStatus.CANCELLED);
  assert.equal(
    service.getSnapshot().timeSlots[slot.slotId].availabilityStatus,
    SlotAvailabilityStatus.AVAILABLE,
  );
});

test('5. Cancellation releases booked slot so another patient can book it', () => {
  const { service } = createTestHarness();
  const slot = findFirstAvailableFutureSlot(service, 'doc_priya_nair');

  const first = service.submitBooking({
    requestId: 'req_cancel_release_1',
    patientId: 'pat_maya_lin',
    doctorId: 'doc_priya_nair',
    slotId: slot.slotId,
    reasonForVisit: 'Wrist mobility consult',
    actorId: 'pat_maya_lin',
    actorRole: UserRole.PATIENT,
    nowMs: FIXED_NOW_MS,
  });
  assert.equal(first.outcome, 'CONFIRMED');
  if (first.outcome !== 'CONFIRMED') return;

  service.transitionAppointmentStatus({
    appointmentId: first.appointment.appointmentId,
    targetStatus: AppointmentStatus.CANCELLED,
    actorId: 'pat_maya_lin',
    actorRole: UserRole.PATIENT,
    reason: 'Travel schedule conflict',
    nowMs: FIXED_NOW_MS + 10_000,
  });

  assert.equal(
    service.getSnapshot().timeSlots[slot.slotId].availabilityStatus,
    SlotAvailabilityStatus.AVAILABLE,
  );

  // Second patient can now book the released slot cleanly
  const rebooked = service.submitBooking({
    requestId: 'req_cancel_release_2',
    patientId: 'pat_rohan_patel',
    doctorId: 'doc_priya_nair',
    slotId: slot.slotId,
    reasonForVisit: 'Ankle sprain follow-up',
    actorId: 'pat_rohan_patel',
    actorRole: UserRole.PATIENT,
    nowMs: FIXED_NOW_MS + 20_000,
  });
  assert.equal(rebooked.outcome, 'CONFIRMED');
});

test('6. Rescheduling atomically releases original slot, books target slot, and preserves state on failure', () => {
  const { service } = createTestHarness();
  const snap0 = service.getSnapshot();
  const claireActive = Object.values(snap0.appointments).filter(
    (a) =>
      a.patientId === 'pat_claire_bennett' &&
      (a.status === AppointmentStatus.BOOKED ||
        a.status === AppointmentStatus.CHECKED_IN ||
        a.status === AppointmentStatus.IN_CONSULTATION),
  );
  const availableSlots = Object.values(snap0.timeSlots)
    .filter(
      (s) =>
        s.doctorId === 'doc_marcus_thompson' &&
        s.availabilityStatus === SlotAvailabilityStatus.AVAILABLE &&
        s.startTime > FIXED_NOW_MS &&
        !claireActive.some((apt) => apt.startTime < s.endTime && s.startTime < apt.endTime),
    )
    .sort((a, b) => a.startTime - b.startTime);

  const slotA = availableSlots[0];
  const slotB = availableSlots[1];
  const blockedOrInvalidSlotId = 'slot_nonexistent_999';

  const initial = service.submitBooking({
    requestId: 'req_resched_init',
    patientId: 'pat_claire_bennett',
    doctorId: 'doc_marcus_thompson',
    slotId: slotA.slotId,
    reasonForVisit: 'Annual wellness visit',
    actorId: 'pat_claire_bennett',
    actorRole: UserRole.PATIENT,
    nowMs: FIXED_NOW_MS,
  });
  assert.equal(initial.outcome, 'CONFIRMED');
  if (initial.outcome !== 'CONFIRMED') return;

  // Failing reschedule to nonexistent slot leaves original appointment & slotA untouched
  assert.throws(() =>
    service.rescheduleAppointment({
      appointmentId: initial.appointment.appointmentId,
      newSlotId: blockedOrInvalidSlotId,
      actorId: 'pat_claire_bennett',
      actorRole: UserRole.PATIENT,
      reason: 'Move to afternoon',
      nowMs: FIXED_NOW_MS + 5000,
    }),
  );
  assert.equal(
    service.getSnapshot().appointments[initial.appointment.appointmentId].status,
    AppointmentStatus.BOOKED,
  );
  assert.equal(
    service.getSnapshot().timeSlots[slotA.slotId].availabilityStatus,
    SlotAvailabilityStatus.BOOKED,
  );

  // Valid reschedule to slotB releases slotA and books slotB
  const { previousAppointment, newAppointment } = service.rescheduleAppointment({
    appointmentId: initial.appointment.appointmentId,
    newSlotId: slotB.slotId,
    actorId: 'pat_claire_bennett',
    actorRole: UserRole.PATIENT,
    reason: 'Morning meeting conflict',
    nowMs: FIXED_NOW_MS + 10_000,
  });

  assert.equal(previousAppointment.status, AppointmentStatus.RESCHEDULED);
  assert.equal(previousAppointment.rescheduledToAppointmentId, newAppointment.appointmentId);
  assert.equal(newAppointment.status, AppointmentStatus.BOOKED);
  assert.equal(newAppointment.rescheduledFromAppointmentId, previousAppointment.appointmentId);

  const after = service.getSnapshot();
  assert.equal(after.timeSlots[slotA.slotId].availabilityStatus, SlotAvailabilityStatus.AVAILABLE);
  assert.equal(after.timeSlots[slotB.slotId].availabilityStatus, SlotAvailabilityStatus.BOOKED);
});

test('7. Smart patient queue updates positions and wait-time estimates across check-in, consultation start, and completion', () => {
  const { service } = createTestHarness();
  // Seed snapshot has Dr. Sarah Jenkins with:
  // - David Kim IN_CONSULTATION (started FIXED_NOW_MS - 8m, avg 20m -> 12m remaining)
  // - Claire Bennett CHECKED_IN #1 (checked in -14m)
  // - Maya Lin CHECKED_IN #2 (checked in -5m)
  // - Rohan Patel BOOKED later today

  const queuesInitial = service.getLiveQueuesForDate(undefined, FIXED_NOW_MS);
  const sarahQueue0 = queuesInitial.find((q) => q.doctorId === 'doc_sarah_jenkins')!;
  assert.ok(sarahQueue0.activeConsultation);
  assert.equal(sarahQueue0.activeConsultation.patientId, 'pat_david_kim');
  assert.equal(sarahQueue0.activeConsultation.estimatedRemainingMinutes, 12);
  assert.equal(sarahQueue0.waitingEntries.length, 2);
  assert.equal(sarahQueue0.waitingEntries[0].patientId, 'pat_claire_bennett');
  assert.equal(sarahQueue0.waitingEntries[0].position, 1);
  assert.equal(sarahQueue0.waitingEntries[0].estimatedWaitMinutes, 12); // 12 + 0*20
  assert.equal(sarahQueue0.waitingEntries[1].patientId, 'pat_maya_lin');
  assert.equal(sarahQueue0.waitingEntries[1].position, 2);
  assert.equal(sarahQueue0.waitingEntries[1].estimatedWaitMinutes, 32); // 12 + 1*20

  // Complete David Kim's active consultation and start Claire Bennett's consultation
  service.transitionAppointmentStatus({
    appointmentId: sarahQueue0.activeConsultation.appointmentId,
    targetStatus: AppointmentStatus.COMPLETED,
    actorId: 'doc_sarah_jenkins',
    actorRole: UserRole.DOCTOR,
    nowMs: FIXED_NOW_MS + 60_000,
  });

  service.transitionAppointmentStatus({
    appointmentId: sarahQueue0.waitingEntries[0].appointmentId,
    targetStatus: AppointmentStatus.IN_CONSULTATION,
    actorId: 'doc_sarah_jenkins',
    actorRole: UserRole.DOCTOR,
    nowMs: FIXED_NOW_MS + 120_000,
  });

  // Maya Lin should now advance to queue position #1!
  const queuesAfterAdvance = service.getLiveQueuesForDate(undefined, FIXED_NOW_MS + 120_000);
  const sarahQueue1 = queuesAfterAdvance.find((q) => q.doctorId === 'doc_sarah_jenkins')!;
  assert.equal(sarahQueue1.activeConsultation?.patientId, 'pat_claire_bennett');
  assert.equal(sarahQueue1.waitingEntries.length, 1);
  assert.equal(sarahQueue1.waitingEntries[0].patientId, 'pat_maya_lin');
  assert.equal(sarahQueue1.waitingEntries[0].position, 1);
  assert.equal(sarahQueue1.waitingEntries[0].estimatedWaitMinutes, 20);
});

test('8. Storage failure aborts transaction atomically with zero partial state mutation and recovers cleanly', () => {
  const { repo, service } = createTestHarness();
  const slot = findFirstAvailableFutureSlot(service, 'doc_marcus_thompson');
  const countBefore = Object.keys(service.getSnapshot().appointments).length;

  // Enable simulated storage write failure
  repo.setSimulatedStorageFailure(true);

  assert.throws(
    () =>
      service.submitBooking({
        requestId: 'req_storage_fail_01',
        patientId: 'pat_maya_lin',
        doctorId: 'doc_marcus_thompson',
        slotId: slot.slotId,
        reasonForVisit: 'Should roll back cleanly',
        actorId: 'pat_maya_lin',
        actorRole: UserRole.PATIENT,
        nowMs: FIXED_NOW_MS,
      }),
    (err: unknown) => err instanceof RepositoryStorageError,
  );

  // Verify neither appointment nor slot status mutated in memory
  const snapDuringOutage = service.getSnapshot();
  assert.equal(Object.keys(snapDuringOutage.appointments).length, countBefore);
  assert.equal(
    snapDuringOutage.timeSlots[slot.slotId].availabilityStatus,
    SlotAvailabilityStatus.AVAILABLE,
  );

  // Restore storage health and confirm booking succeeds
  repo.setSimulatedStorageFailure(false);
  const recoveredBooking = service.submitBooking({
    requestId: 'req_storage_fail_01',
    patientId: 'pat_maya_lin',
    doctorId: 'doc_marcus_thompson',
    slotId: slot.slotId,
    reasonForVisit: 'Succeeded after storage recovery',
    actorId: 'pat_maya_lin',
    actorRole: UserRole.PATIENT,
    nowMs: FIXED_NOW_MS + 2000,
  });
  assert.equal(recoveredBooking.outcome, 'CONFIRMED');
});

test('9. Invalid, past, and blocked time slots are rejected before booking confirmation', () => {
  const { service } = createTestHarness();
  const snap = service.getSnapshot();

  const pastSlot = Object.values(snap.timeSlots).find((s) => s.startTime <= FIXED_NOW_MS)!;
  assert.ok(pastSlot, 'Expected seed data to include a past slot');

  const pastAttempt = service.submitBooking({
    requestId: 'req_past_slot_test',
    patientId: 'pat_maya_lin',
    doctorId: pastSlot.doctorId,
    slotId: pastSlot.slotId,
    reasonForVisit: 'Attempt on past slot',
    actorId: 'pat_maya_lin',
    actorRole: UserRole.PATIENT,
    nowMs: FIXED_NOW_MS,
  });
  assert.equal(pastAttempt.outcome, 'REJECTED');
  if (pastAttempt.outcome === 'REJECTED') {
    assert.equal(pastAttempt.errorCode, 'PAST_SLOT');
  }

  const blockedSlot = Object.values(snap.timeSlots).find(
    (s) => s.availabilityStatus === SlotAvailabilityStatus.BLOCKED && s.startTime > FIXED_NOW_MS,
  )!;
  assert.ok(blockedSlot, 'Expected seed data to include a blocked slot');

  const blockedAttempt = service.submitBooking({
    requestId: 'req_blocked_slot_test',
    patientId: 'pat_maya_lin',
    doctorId: blockedSlot.doctorId,
    slotId: blockedSlot.slotId,
    reasonForVisit: 'Attempt on blocked slot',
    actorId: 'pat_maya_lin',
    actorRole: UserRole.PATIENT,
    nowMs: FIXED_NOW_MS,
  });
  assert.equal(blockedAttempt.outcome, 'REJECTED');
  if (blockedAttempt.outcome === 'REJECTED') {
    assert.equal(blockedAttempt.errorCode, 'UNAVAILABLE_SLOT');
  }
});
