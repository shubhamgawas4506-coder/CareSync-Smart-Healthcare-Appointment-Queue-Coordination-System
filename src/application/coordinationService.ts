/**
 * CareSync Application Layer — Coordination Use Cases & Idempotent Booking Engine
 *
 * Orchestrates scheduling, idempotent retries, network interruption recovery,
 * lifecycle transitions, cancellations, rescheduling, slot management, and
 * smart queue queries cleanly across Domain rules and Repository transactions.
 */

import { createDiagnosticRecord } from '../diagnostics/diagnosticsLogger';
import {
  Appointment,
  AppointmentEvent,
  AppointmentEventType,
  AppointmentStatus,
  BookingOperationState,
  BookingRequestRecord,
  ClinicPolicyConfig,
  DomainRuleError,
  SlotAvailabilityStatus,
  TimeSlot,
  UserRole,
} from '../domain/models';
import { computeDoctorQueue, DoctorQueueSnapshot } from '../domain/queueEngine';
import {
  validatePatientHasNoOverlappingAppointment,
  validateSlotForBooking,
} from '../domain/schedulingRules';
import {
  isSlotOccupyingStatus,
  mapStatusToAuditEventType,
  validateAppointmentTransition,
} from '../domain/stateMachine';
import { formatDateInZone } from '../domain/timeUtils';
import { CareSyncStateSnapshot, ICareSyncRepository } from '../repositories/interfaces';

export interface SubmitBookingInput {
  /** Stable unique client-generated request ID preserved across retries */
  requestId: string;
  patientId: string;
  doctorId: string;
  slotId: string;
  reasonForVisit: string;
  actorId: string;
  actorRole: UserRole;
  /** Simulates a mid-flight network drop leaving booking outcome uncertain */
  simulateNetworkFailure?: boolean;
  /** Optional simulated server-side pre-drop commit to test post-commit retry deduplication */
  simulateDropAfterServerCommit?: boolean;
  nowMs?: number;
}

export type SubmitBookingResult =
  | {
      outcome: 'CONFIRMED';
      appointment: Appointment;
      requestRecord: BookingRequestRecord;
      deduplicatedRetry: boolean;
    }
  | {
      outcome: 'UNCERTAIN_INTERRUPTED';
      requestRecord: BookingRequestRecord;
      message: string;
    }
  | {
      outcome: 'REJECTED';
      requestRecord: BookingRequestRecord;
      errorCode: string;
      message: string;
    };

export interface TransitionStatusInput {
  appointmentId: string;
  targetStatus: AppointmentStatus;
  actorId: string;
  actorRole: UserRole;
  reason?: string;
  nowMs?: number;
}

export interface RescheduleInput {
  appointmentId: string;
  newSlotId: string;
  actorId: string;
  actorRole: UserRole;
  reason: string;
  nowMs?: number;
}

export interface CreateSlotInput {
  doctorId: string;
  startTime: number;
  endTime: number;
  actorId: string;
  nowMs?: number;
}

export class CareSyncCoordinationService {
  private readonly repository: ICareSyncRepository;

  constructor(repository: ICareSyncRepository) {
    this.repository = repository;
  }

  getSnapshot(): CareSyncStateSnapshot {
    return this.repository.getSnapshot();
  }

  generateRequestId(nowMs: number = Date.now()): string {
    const rand = Math.random().toString(36).slice(2, 8);
    return `req_${nowMs}_${rand}`;
  }

  private nextId(draft: CareSyncStateSnapshot, prefix: string): string {
    draft.sequenceCounter += 1;
    return `${prefix}_${draft.sequenceCounter}`;
  }

  /**
   * Scans persisted bookingRequests on startup/reload to surface any operations
   * left in PENDING or UNCERTAIN_INTERRUPTED states after an interrupted session.
   */
  recoverInterruptedRequests(patientId?: string, nowMs: number = Date.now()): BookingRequestRecord[] {
    const snap = this.repository.getSnapshot();
    const interrupted = Object.values(snap.bookingRequests)
      .filter((req) => {
        if (patientId && req.patientId !== patientId) return false;
        return (
          req.state === BookingOperationState.PENDING ||
          req.state === BookingOperationState.UNCERTAIN_INTERRUPTED ||
          req.state === BookingOperationState.RETRYING
        );
      })
      .sort((a, b) => b.updatedAt - a.updatedAt);

    if (interrupted.length > 0) {
      try {
        this.repository.transact((draft) => {
          draft.diagnostics.push(
            createDiagnosticRecord({
              idSuffix: this.nextId(draft, 'rec'),
              timestamp: nowMs,
              level: 'WARN',
              operation: 'INTERRUPTED_REQUEST_RECOVERY_SCAN',
              actorId: patientId ?? 'SYSTEM',
              requestId: interrupted[0].requestId,
              code: 'RECOVERY_PENDING_FOUND',
              message: `Detected ${interrupted.length} interrupted booking request(s) awaiting safe idempotent retry.`,
            }),
          );
        });
      } catch {
        // Non-fatal if storage fault injection is currently active
      }
    }

    return interrupted;
  }

  /**
   * Dismisses an uncertain/failed booking request record ONLY if no appointment was committed for it.
   */
  dismissUncertainRequest(requestId: string, actorId: string, nowMs: number = Date.now()): void {
    this.repository.transact((draft) => {
      const record = draft.bookingRequests[requestId];
      if (!record) return;

      const committedApt = Object.values(draft.appointments).find(
        (apt) => apt.requestId === requestId,
      );
      if (committedApt) {
        record.state = BookingOperationState.CONFIRMED;
        record.outcomeAppointmentId = committedApt.appointmentId;
        record.updatedAt = nowMs;
        return;
      }

      record.state = BookingOperationState.FAILED;
      record.failureCode = 'NETWORK_INTERRUPTED';
      record.failureMessage = 'Uncertain request dismissed by user prior to confirmation.';
      record.updatedAt = nowMs;

      draft.diagnostics.push(
        createDiagnosticRecord({
          idSuffix: this.nextId(draft, 'dis'),
          timestamp: nowMs,
          level: 'INFO',
          operation: 'UNCERTAIN_REQUEST_DISMISSED',
          actorId,
          requestId,
          code: 'REQUEST_ABANDONED',
          message: `User dismissed uncertain request ${requestId}; verified zero committed appointments exist.`,
        }),
      );
    });
  }

  /**
   * Executes an idempotent appointment booking or retry using a stable `requestId`.
   *
   * Guarantees:
   * 1. Retrying with the same `requestId` NEVER creates duplicate appointments.
   * 2. Simulated network failure persists the `requestId` in `UNCERTAIN_INTERRUPTED` state
   *    so page refresh preserves recovery context and clearly distinguishes uncertain
   *    outcomes from confirmed rejections (like `SLOT_CONFLICT`).
   * 3. Validates slot availability immediately prior to atomic confirmation.
   */
  submitBooking(input: SubmitBookingInput): SubmitBookingResult {
    const nowMs = input.nowMs ?? Date.now();
    const trimmedReason = input.reasonForVisit.trim();

    if (!input.requestId || input.requestId.trim().length < 4) {
      throw new DomainRuleError('INVALID_REQUEST_ID', 'A valid stable requestId is required.');
    }
    if (!trimmedReason) {
      throw new DomainRuleError(
        'VISIT_REASON_REQUIRED',
        'Please enter a brief reason for your appointment.',
      );
    }

    return this.repository.transact((draft): SubmitBookingResult => {
      const patient = draft.patients[input.patientId];
      if (!patient) {
        throw new DomainRuleError('UNKNOWN_PATIENT', `Patient ${input.patientId} was not found.`);
      }
      const doctor = draft.doctors[input.doctorId];
      if (!doctor) {
        throw new DomainRuleError('UNKNOWN_DOCTOR', `Doctor ${input.doctorId} was not found.`);
      }

      const existingRecord = draft.bookingRequests[input.requestId];
      const isRetry = Boolean(existingRecord);
      const attemptNumber = existingRecord ? existingRecord.attemptCount + 1 : 1;

      // Record initial APPOINTMENT_REQUESTED or retry BOOKING_RETRIED event
      if (!isRetry) {
        draft.events.push({
          eventId: this.nextId(draft, 'evt'),
          appointmentId: ' pending ',
          requestId: input.requestId,
          eventType: AppointmentEventType.APPOINTMENT_REQUESTED,
          previousStatus: SlotAvailabilityStatus.AVAILABLE,
          newStatus: null,
          actorId: input.actorId,
          actorRole: input.actorRole,
          reason: `Booking requested for ${doctor.name} (${trimmedReason}).`,
          timestamp: nowMs,
        });
      } else {
        draft.events.push({
          eventId: this.nextId(draft, 'evt'),
          appointmentId: existingRecord.outcomeAppointmentId ?? 'pending_reconciliation',
          requestId: input.requestId,
          eventType: AppointmentEventType.BOOKING_RETRIED,
          previousStatus: null,
          newStatus: null,
          actorId: input.actorId,
          actorRole: input.actorRole,
          reason: `Retrying booking operation with preserved requestId ${input.requestId} (attempt #${attemptNumber}).`,
          timestamp: nowMs,
        });
      }

      // IDEMPOTENCY CHECK: Has an appointment already been committed for this exact requestId?
      const alreadyCommittedApt = Object.values(draft.appointments).find(
        (apt) => apt.requestId === input.requestId,
      );

      if (alreadyCommittedApt) {
        const confirmedRecord: BookingRequestRecord = {
          requestId: input.requestId,
          patientId: alreadyCommittedApt.patientId,
          doctorId: alreadyCommittedApt.doctorId,
          slotId: alreadyCommittedApt.slotId,
          reasonForVisit: alreadyCommittedApt.reasonForVisit,
          state: BookingOperationState.CONFIRMED,
          outcomeAppointmentId: alreadyCommittedApt.appointmentId,
          attemptCount: attemptNumber,
          createdAt: existingRecord?.createdAt ?? alreadyCommittedApt.createdAt,
          updatedAt: nowMs,
        };
        draft.bookingRequests[input.requestId] = confirmedRecord;

        // Backfill appointmentId on any pending audit events for this requestId
        for (const evt of draft.events) {
          if (evt.requestId === input.requestId && evt.appointmentId.includes('pending')) {
            evt.appointmentId = alreadyCommittedApt.appointmentId;
          }
        }

        draft.diagnostics.push(
          createDiagnosticRecord({
            idSuffix: this.nextId(draft, 'idem'),
            timestamp: nowMs,
            level: 'INFO',
            operation: 'IDEMPOTENT_BOOKING_RECONCILED',
            actorId: input.actorId,
            requestId: input.requestId,
            appointmentId: alreadyCommittedApt.appointmentId,
            code: 'DUPLICATE_PREVENTED',
            message: `Idempotency check matched existing appointment ${alreadyCommittedApt.appointmentId} for ${input.requestId}; prevented duplicate creation.`,
          }),
        );

        return {
          outcome: 'CONFIRMED',
          appointment: alreadyCommittedApt,
          requestRecord: confirmedRecord,
          deduplicatedRetry: true,
        };
      }

      // SIMULATED NETWORK INTERRUPTION PATH
      if (input.simulateNetworkFailure) {
        // Optional sub-mode: commit appointment on "server" before dropping response to prove
        // post-commit retry reconciliation ALSO produces strictly 1 appointment.
        if (input.simulateDropAfterServerCommit) {
          const slot = validateSlotForBooking({
            slot: draft.timeSlots[input.slotId],
            doctorId: input.doctorId,
            existingAppointments: Object.values(draft.appointments),
            nowMs,
          });
          validatePatientHasNoOverlappingAppointment(
            input.patientId,
            slot,
            Object.values(draft.appointments),
          );
          const aptId = this.nextId(draft, 'apt');
          const committedApt: Appointment = {
            appointmentId: aptId,
            requestId: input.requestId,
            patientId: input.patientId,
            doctorId: input.doctorId,
            slotId: slot.slotId,
            date: slot.date,
            startTime: slot.startTime,
            endTime: slot.endTime,
            status: AppointmentStatus.BOOKED,
            reasonForVisit: trimmedReason,
            createdAt: nowMs,
            updatedAt: nowMs,
          };
          draft.appointments[aptId] = committedApt;
          slot.availabilityStatus = SlotAvailabilityStatus.BOOKED;
          slot.activeAppointmentId = aptId;
          if (!patient.appointmentIds.includes(aptId)) {
            patient.appointmentIds.push(aptId);
          }
          draft.events.push({
            eventId: this.nextId(draft, 'evt'),
            appointmentId: aptId,
            requestId: input.requestId,
            eventType: AppointmentEventType.APPOINTMENT_CONFIRMED,
            previousStatus: SlotAvailabilityStatus.AVAILABLE,
            newStatus: AppointmentStatus.BOOKED,
            actorId: 'SYSTEM',
            actorRole: 'SYSTEM',
            reason: 'Slot committed prior to simulated response drop; client awaiting reconciliation.',
            timestamp: nowMs,
          });
        }

        const uncertainMessage =
          'Network connection interrupted while awaiting booking confirmation. Outcome is uncertain — retry safely using the same Request ID.';
        const uncertainRecord: BookingRequestRecord = {
          requestId: input.requestId,
          patientId: input.patientId,
          doctorId: input.doctorId,
          slotId: input.slotId,
          reasonForVisit: trimmedReason,
          state: BookingOperationState.UNCERTAIN_INTERRUPTED,
          failureCode: 'NETWORK_INTERRUPTED',
          failureMessage: uncertainMessage,
          attemptCount: attemptNumber,
          createdAt: existingRecord?.createdAt ?? nowMs,
          updatedAt: nowMs,
        };
        draft.bookingRequests[input.requestId] = uncertainRecord;

        draft.events.push({
          eventId: this.nextId(draft, 'evt'),
          appointmentId: 'uncertain_outcome',
          requestId: input.requestId,
          eventType: AppointmentEventType.BOOKING_FAILED,
          previousStatus: null,
          newStatus: null,
          actorId: input.actorId,
          actorRole: input.actorRole,
          reason: `Simulated network timeout on attempt #${attemptNumber}; outcome marked UNCERTAIN_INTERRUPTED for safe retry.`,
          timestamp: nowMs,
        });

        draft.diagnostics.push(
          createDiagnosticRecord({
            idSuffix: this.nextId(draft, 'net'),
            timestamp: nowMs,
            level: 'WARN',
            operation: 'BOOKING_NETWORK_INTERRUPTED',
            actorId: input.actorId,
            requestId: input.requestId,
            code: 'UNCERTAIN_OUTCOME',
            message: uncertainMessage,
          }),
        );

        return {
          outcome: 'UNCERTAIN_INTERRUPTED',
          requestRecord: uncertainRecord,
          message: uncertainMessage,
        };
      }

      // IMMEDIATE PRE-CONFIRMATION SLOT & CONFLICT VALIDATION
      try {
        const validatedSlot = validateSlotForBooking({
          slot: draft.timeSlots[input.slotId],
          doctorId: input.doctorId,
          existingAppointments: Object.values(draft.appointments),
          nowMs,
        });

        validatePatientHasNoOverlappingAppointment(
          input.patientId,
          validatedSlot,
          Object.values(draft.appointments),
        );

        const appointmentId = this.nextId(draft, 'apt');
        const newAppointment: Appointment = {
          appointmentId,
          requestId: input.requestId,
          patientId: input.patientId,
          doctorId: input.doctorId,
          slotId: validatedSlot.slotId,
          date: validatedSlot.date,
          startTime: validatedSlot.startTime,
          endTime: validatedSlot.endTime,
          status: AppointmentStatus.BOOKED,
          reasonForVisit: trimmedReason,
          createdAt: nowMs,
          updatedAt: nowMs,
        };

        draft.appointments[appointmentId] = newAppointment;
        validatedSlot.availabilityStatus = SlotAvailabilityStatus.BOOKED;
        validatedSlot.activeAppointmentId = appointmentId;
        if (!patient.appointmentIds.includes(appointmentId)) {
          patient.appointmentIds.push(appointmentId);
        }

        const confirmedRecord: BookingRequestRecord = {
          requestId: input.requestId,
          patientId: input.patientId,
          doctorId: input.doctorId,
          slotId: validatedSlot.slotId,
          reasonForVisit: trimmedReason,
          state: BookingOperationState.CONFIRMED,
          outcomeAppointmentId: appointmentId,
          attemptCount: attemptNumber,
          createdAt: existingRecord?.createdAt ?? nowMs,
          updatedAt: nowMs,
        };
        draft.bookingRequests[input.requestId] = confirmedRecord;

        // Backfill appointmentId on initial APPOINTMENT_REQUESTED / retry events for clean traceability
        for (const evt of draft.events) {
          if (
            evt.requestId === input.requestId &&
            (evt.appointmentId.includes('pending') || evt.appointmentId === 'uncertain_outcome')
          ) {
            evt.appointmentId = appointmentId;
          }
        }

        draft.events.push({
          eventId: this.nextId(draft, 'evt'),
          appointmentId,
          requestId: input.requestId,
          eventType: AppointmentEventType.APPOINTMENT_CONFIRMED,
          previousStatus: SlotAvailabilityStatus.AVAILABLE,
          newStatus: AppointmentStatus.BOOKED,
          actorId: input.actorId,
          actorRole: input.actorRole,
          reason: isRetry
            ? `Booking confirmed after safe retry (attempt #${attemptNumber}).`
            : `Appointment booked and slot ${validatedSlot.slotId} locked atomically.`,
          timestamp: nowMs,
        });

        draft.diagnostics.push(
          createDiagnosticRecord({
            idSuffix: this.nextId(draft, 'ok'),
            timestamp: nowMs,
            level: 'INFO',
            operation: isRetry ? 'BOOKING_CONFIRMED_AFTER_RETRY' : 'BOOKING_CONFIRMED',
            actorId: input.actorId,
            requestId: input.requestId,
            appointmentId,
            code: 'BOOKING_SUCCESS',
            message: `Confirmed appointment ${appointmentId} for ${patient.name} with ${doctor.name} (attempts: ${attemptNumber}).`,
          }),
        );

        return {
          outcome: 'CONFIRMED',
          appointment: newAppointment,
          requestRecord: confirmedRecord,
          deduplicatedRetry: false,
        };
      } catch (err) {
        if (err instanceof DomainRuleError) {
          const isSlotConflict =
            err.code === 'SLOT_CONFLICT' || err.code === 'PATIENT_TIME_CONFLICT';

          if (isSlotConflict) {
            draft.events.push({
              eventId: this.nextId(draft, 'evt'),
              appointmentId: 'conflict_rejected',
              requestId: input.requestId,
              eventType: AppointmentEventType.SLOT_CONFLICT_DETECTED,
              previousStatus: SlotAvailabilityStatus.BOOKED,
              newStatus: SlotAvailabilityStatus.BOOKED,
              actorId: input.actorId,
              actorRole: input.actorRole,
              reason: err.message,
              timestamp: nowMs,
            });
          }

          draft.events.push({
            eventId: this.nextId(draft, 'evt'),
            appointmentId: 'rejected',
            requestId: input.requestId,
            eventType: AppointmentEventType.BOOKING_FAILED,
            previousStatus: null,
            newStatus: null,
            actorId: input.actorId,
            actorRole: input.actorRole,
            reason: `Confirmed booking rejection [${err.code}]: ${err.message}`,
            timestamp: nowMs,
          });

          const failedRecord: BookingRequestRecord = {
            requestId: input.requestId,
            patientId: input.patientId,
            doctorId: input.doctorId,
            slotId: input.slotId,
            reasonForVisit: trimmedReason,
            state: BookingOperationState.FAILED,
            failureCode: isSlotConflict
              ? 'SLOT_CONFLICT'
              : err.code === 'PAST_SLOT'
                ? 'PAST_SLOT'
                : 'INVALID_SLOT',
            failureMessage: err.message,
            attemptCount: attemptNumber,
            createdAt: existingRecord?.createdAt ?? nowMs,
            updatedAt: nowMs,
          };
          draft.bookingRequests[input.requestId] = failedRecord;

          draft.diagnostics.push(
            createDiagnosticRecord({
              idSuffix: this.nextId(draft, 'rej'),
              timestamp: nowMs,
              level: 'WARN',
              operation: 'BOOKING_REJECTED_BY_DOMAIN_RULE',
              actorId: input.actorId,
              requestId: input.requestId,
              code: err.code,
              message: err.message,
            }),
          );

          return {
            outcome: 'REJECTED',
            requestRecord: failedRecord,
            errorCode: err.code,
            message: err.message,
          };
        }
        throw err;
      }
    });
  }

  /**
   * Transitions an appointment through the lifecycle state machine:
   * BOOKED -> CHECKED_IN -> IN_CONSULTATION -> COMPLETED
   * or BOOKED / (policy-permitted CHECKED_IN) -> CANCELLED (releasing slot back to AVAILABLE).
   */
  transitionAppointmentStatus(input: TransitionStatusInput): Appointment {
    const nowMs = input.nowMs ?? Date.now();

    return this.repository.transact((draft) => {
      const appointment = draft.appointments[input.appointmentId];
      if (!appointment) {
        throw new DomainRuleError(
          'APPOINTMENT_NOT_FOUND',
          `Appointment ${input.appointmentId} does not exist.`,
        );
      }

      if (input.targetStatus === AppointmentStatus.RESCHEDULED) {
        throw new DomainRuleError(
          'USE_RESCHEDULE_WORKFLOW',
          'Use rescheduleAppointment() to atomically assign a replacement slot.',
        );
      }

      validateAppointmentTransition({
        currentStatus: appointment.status,
        targetStatus: input.targetStatus,
        policy: draft.policy,
        reason: input.reason,
      });

      // Enforce single active consultation per doctor at any moment
      if (input.targetStatus === AppointmentStatus.IN_CONSULTATION) {
        const concurrentConsult = Object.values(draft.appointments).find(
          (other) =>
            other.appointmentId !== appointment.appointmentId &&
            other.doctorId === appointment.doctorId &&
            other.status === AppointmentStatus.IN_CONSULTATION,
        );
        if (concurrentConsult) {
          throw new DomainRuleError(
            'DOCTOR_ALREADY_IN_CONSULTATION',
            `Doctor already has an active consultation (${concurrentConsult.appointmentId}). Complete the current consultation before starting the next.`,
          );
        }
      }

      const previousStatus = appointment.status;
      appointment.status = input.targetStatus;
      appointment.updatedAt = nowMs;

      if (input.targetStatus === AppointmentStatus.CHECKED_IN) {
        appointment.checkedInAt = nowMs;
      } else if (input.targetStatus === AppointmentStatus.IN_CONSULTATION) {
        appointment.consultationStartedAt = nowMs;
      } else if (input.targetStatus === AppointmentStatus.COMPLETED) {
        appointment.completedAt = nowMs;
      } else if (input.targetStatus === AppointmentStatus.CANCELLED) {
        appointment.cancelReason = input.reason?.trim();
        const slot = draft.timeSlots[appointment.slotId];
        if (slot && slot.activeAppointmentId === appointment.appointmentId) {
          slot.activeAppointmentId = undefined;
          if (slot.availabilityStatus === SlotAvailabilityStatus.BOOKED) {
            slot.availabilityStatus = SlotAvailabilityStatus.AVAILABLE;
          }
        }
      }

      const eventType = mapStatusToAuditEventType(input.targetStatus);
      const defaultReasonMap: Record<AppointmentStatus, string> = {
        [AppointmentStatus.BOOKED]: 'Appointment confirmed.',
        [AppointmentStatus.CHECKED_IN]: 'Patient checked in and entered live waiting queue.',
        [AppointmentStatus.IN_CONSULTATION]: 'Doctor started patient consultation.',
        [AppointmentStatus.COMPLETED]: 'Consultation completed.',
        [AppointmentStatus.CANCELLED]: input.reason?.trim() ?? 'Appointment cancelled.',
        [AppointmentStatus.RESCHEDULED]: 'Appointment rescheduled.',
      };

      const auditEvent: AppointmentEvent = {
        eventId: this.nextId(draft, 'evt'),
        appointmentId: appointment.appointmentId,
        requestId: appointment.requestId,
        eventType,
        previousStatus,
        newStatus: input.targetStatus,
        actorId: input.actorId,
        actorRole: input.actorRole,
        reason: input.reason?.trim() || defaultReasonMap[input.targetStatus],
        timestamp: nowMs,
      };
      draft.events.push(auditEvent);

      draft.diagnostics.push(
        createDiagnosticRecord({
          idSuffix: this.nextId(draft, 'tr'),
          timestamp: nowMs,
          level: 'INFO',
          operation: 'APPOINTMENT_STATE_TRANSITION',
          actorId: input.actorId,
          appointmentId: appointment.appointmentId,
          code: eventType,
          message: `${appointment.appointmentId}: ${previousStatus} → ${input.targetStatus}`,
        }),
      );

      return appointment;
    });
  }

  /**
   * Atomically reschedules a BOOKED appointment to a new available slot:
   * - Validates BOOKED -> RESCHEDULED transition on original appointment
   * - Validates target slot is AVAILABLE, future, and conflict-free
   * - Releases original slot back to AVAILABLE
   * - Creates linked replacement BOOKED appointment and locks target slot
   */
  rescheduleAppointment(input: RescheduleInput): {
    previousAppointment: Appointment;
    newAppointment: Appointment;
  } {
    const nowMs = input.nowMs ?? Date.now();
    const trimmedReason = input.reason.trim() || 'Patient requested schedule adjustment';

    return this.repository.transact((draft) => {
      const original = draft.appointments[input.appointmentId];
      if (!original) {
        throw new DomainRuleError(
          'APPOINTMENT_NOT_FOUND',
          `Appointment ${input.appointmentId} does not exist.`,
        );
      }

      validateAppointmentTransition({
        currentStatus: original.status,
        targetStatus: AppointmentStatus.RESCHEDULED,
        policy: draft.policy,
        reason: trimmedReason,
      });

      if (original.slotId === input.newSlotId) {
        throw new DomainRuleError(
          'SAME_SLOT_RESCHEDULE',
          'Please choose a different time slot when rescheduling.',
        );
      }

      const targetSlot = draft.timeSlots[input.newSlotId];
      if (!targetSlot) {
        throw new DomainRuleError('INVALID_SLOT', 'Target reschedule time slot does not exist.');
      }

      validateSlotForBooking({
        slot: targetSlot,
        doctorId: targetSlot.doctorId,
        existingAppointments: Object.values(draft.appointments),
        nowMs,
        ignoreAppointmentId: original.appointmentId,
      });

      validatePatientHasNoOverlappingAppointment(
        original.patientId,
        targetSlot,
        Object.values(draft.appointments),
        original.appointmentId,
      );

      // 1. Release original slot
      const oldSlot = draft.timeSlots[original.slotId];
      if (oldSlot && oldSlot.activeAppointmentId === original.appointmentId) {
        oldSlot.activeAppointmentId = undefined;
        if (oldSlot.availabilityStatus === SlotAvailabilityStatus.BOOKED) {
          oldSlot.availabilityStatus = SlotAvailabilityStatus.AVAILABLE;
        }
      }

      // 2. Create replacement appointment
      const newAppointmentId = this.nextId(draft, 'apt');
      const newRequestId = this.nextId(draft, 'req_resched');
      const replacement: Appointment = {
        appointmentId: newAppointmentId,
        requestId: newRequestId,
        patientId: original.patientId,
        doctorId: targetSlot.doctorId,
        slotId: targetSlot.slotId,
        date: targetSlot.date,
        startTime: targetSlot.startTime,
        endTime: targetSlot.endTime,
        status: AppointmentStatus.BOOKED,
        reasonForVisit: original.reasonForVisit,
        rescheduledFromAppointmentId: original.appointmentId,
        createdAt: nowMs,
        updatedAt: nowMs,
      };

      // 3. Update original appointment
      const prevStatus = original.status;
      original.status = AppointmentStatus.RESCHEDULED;
      original.rescheduledToAppointmentId = newAppointmentId;
      original.updatedAt = nowMs;

      // 4. Lock target slot & update patient references
      draft.appointments[newAppointmentId] = replacement;
      targetSlot.availabilityStatus = SlotAvailabilityStatus.BOOKED;
      targetSlot.activeAppointmentId = newAppointmentId;

      const patient = draft.patients[original.patientId];
      if (patient && !patient.appointmentIds.includes(newAppointmentId)) {
        patient.appointmentIds.push(newAppointmentId);
      }

      // 5. Append audit events for both original and replacement records
      draft.events.push({
        eventId: this.nextId(draft, 'evt'),
        appointmentId: original.appointmentId,
        requestId: original.requestId,
        eventType: AppointmentEventType.APPOINTMENT_RESCHEDULED,
        previousStatus: prevStatus,
        newStatus: AppointmentStatus.RESCHEDULED,
        actorId: input.actorId,
        actorRole: input.actorRole,
        reason: `${trimmedReason} → moved to ${newAppointmentId} (slot ${targetSlot.slotId}). Original slot ${original.slotId} released.`,
        timestamp: nowMs,
      });

      draft.events.push({
        eventId: this.nextId(draft, 'evt'),
        appointmentId: newAppointmentId,
        requestId: newRequestId,
        eventType: AppointmentEventType.APPOINTMENT_CONFIRMED,
        previousStatus: SlotAvailabilityStatus.AVAILABLE,
        newStatus: AppointmentStatus.BOOKED,
        actorId: input.actorId,
        actorRole: input.actorRole,
        reason: `Created via reschedule from ${original.appointmentId}.`,
        timestamp: nowMs,
      });

      draft.diagnostics.push(
        createDiagnosticRecord({
          idSuffix: this.nextId(draft, 'rs'),
          timestamp: nowMs,
          level: 'INFO',
          operation: 'APPOINTMENT_RESCHEDULED_ATOMICALLY',
          actorId: input.actorId,
          appointmentId: newAppointmentId,
          code: 'RESCHEDULE_SUCCESS',
          message: `Rescheduled ${original.appointmentId} → ${newAppointmentId}; slot ${original.slotId} released to AVAILABLE.`,
        }),
      );

      return {
        previousAppointment: original,
        newAppointment: replacement,
      };
    });
  }

  /**
   * Coordinator action: Block or unblock an unoccupied time slot.
   */
  setSlotAvailability(
    slotId: string,
    targetStatus: SlotAvailabilityStatus.AVAILABLE | SlotAvailabilityStatus.BLOCKED,
    actorId: string,
    nowMs: number = Date.now(),
  ): TimeSlot {
    return this.repository.transact((draft) => {
      const slot = draft.timeSlots[slotId];
      if (!slot) {
        throw new DomainRuleError('INVALID_SLOT', `Time slot ${slotId} does not exist.`);
      }

      const activeOccupyingApt = Object.values(draft.appointments).find(
        (apt) => apt.slotId === slotId && isSlotOccupyingStatus(apt.status),
      );
      if (activeOccupyingApt) {
        throw new DomainRuleError(
          'SLOT_HAS_ACTIVE_APPOINTMENT',
          `Cannot modify slot ${slotId} while active appointment ${activeOccupyingApt.appointmentId} occupies it. Reschedule or cancel the appointment first.`,
        );
      }

      slot.availabilityStatus = targetStatus;
      slot.activeAppointmentId = undefined;

      draft.diagnostics.push(
        createDiagnosticRecord({
          idSuffix: this.nextId(draft, 'slot'),
          timestamp: nowMs,
          level: 'INFO',
          operation: 'COORDINATOR_SLOT_UPDATED',
          actorId,
          code: `SLOT_${targetStatus}`,
          message: `Slot ${slotId} (${slot.date}) marked ${targetStatus} by coordinator.`,
        }),
      );

      return slot;
    });
  }

  /**
   * Coordinator action: Add a new time slot for a doctor after checking for overlaps.
   */
  createDoctorSlot(input: CreateSlotInput): TimeSlot {
    const nowMs = input.nowMs ?? Date.now();
    if (input.endTime <= input.startTime) {
      throw new DomainRuleError('INVALID_SLOT_WINDOW', 'Slot end time must be after start time.');
    }
    if (input.startTime <= nowMs) {
      throw new DomainRuleError(
        'PAST_SLOT',
        'New availability slots must be scheduled in the future.',
      );
    }

    return this.repository.transact((draft) => {
      const doctor = draft.doctors[input.doctorId];
      if (!doctor) {
        throw new DomainRuleError('UNKNOWN_DOCTOR', `Doctor ${input.doctorId} does not exist.`);
      }

      const overlappingSlot = Object.values(draft.timeSlots).find(
        (existing) =>
          existing.doctorId === input.doctorId &&
          existing.startTime < input.endTime &&
          input.startTime < existing.endTime,
      );
      if (overlappingSlot) {
        throw new DomainRuleError(
          'OVERLAPPING_DOCTOR_SLOT',
          `New slot overlaps with existing slot ${overlappingSlot.slotId} for ${doctor.name}.`,
        );
      }

      const slotId = this.nextId(draft, `slot_${input.doctorId}`);
      const dateStr = formatDateInZone(input.startTime, draft.policy.clinicTimezone);
      const newSlot: TimeSlot = {
        slotId,
        doctorId: input.doctorId,
        date: dateStr,
        startTime: input.startTime,
        endTime: input.endTime,
        availabilityStatus: SlotAvailabilityStatus.AVAILABLE,
      };
      draft.timeSlots[slotId] = newSlot;

      draft.diagnostics.push(
        createDiagnosticRecord({
          idSuffix: this.nextId(draft, 'cslot'),
          timestamp: nowMs,
          level: 'INFO',
          operation: 'COORDINATOR_SLOT_CREATED',
          actorId: input.actorId,
          code: 'SLOT_CREATED',
          message: `Created available slot ${slotId} on ${dateStr} for ${doctor.name}.`,
        }),
      );

      return newSlot;
    });
  }

  /**
   * Coordinator action: Update clinic policy rules (e.g., allowCheckedInCancellation).
   */
  updateClinicPolicy(
    patch: Partial<Pick<ClinicPolicyConfig, 'allowCheckedInCancellation'>>,
    actorId: string,
    nowMs: number = Date.now(),
  ): ClinicPolicyConfig {
    return this.repository.transact((draft) => {
      if (typeof patch.allowCheckedInCancellation === 'boolean') {
        draft.policy.allowCheckedInCancellation = patch.allowCheckedInCancellation;
      }
      draft.diagnostics.push(
        createDiagnosticRecord({
          idSuffix: this.nextId(draft, 'pol'),
          timestamp: nowMs,
          level: 'INFO',
          operation: 'CLINIC_POLICY_UPDATED',
          actorId,
          code: 'POLICY_CHANGED',
          message: `Updated clinic policy: allowCheckedInCancellation=${draft.policy.allowCheckedInCancellation}.`,
        }),
      );
      return draft.policy;
    });
  }

  /**
   * Computes live queues across all clinic doctors for a target clinic date.
   */
  getLiveQueuesForDate(clinicDate?: string, nowMs: number = Date.now()): DoctorQueueSnapshot[] {
    const snap = this.repository.getSnapshot();
    const targetDate = clinicDate ?? formatDateInZone(nowMs, snap.policy.clinicTimezone);
    const allAppointments = Object.values(snap.appointments);

    return Object.values(snap.doctors).map((doctor) =>
      computeDoctorQueue({
        doctor,
        clinicDate: targetDate,
        appointments: allAppointments,
        patientsById: snap.patients,
        nowMs,
      }),
    );
  }

  resetDemoEnvironment(nowMs: number = Date.now()): CareSyncStateSnapshot {
    return this.repository.resetToSeed(nowMs);
  }
}
