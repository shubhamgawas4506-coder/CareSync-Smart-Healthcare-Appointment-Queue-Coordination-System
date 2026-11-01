/**
 * CareSync Domain Layer — Appointment Lifecycle State Machine
 *
 * Canonical transitions:
 *   (Slot AVAILABLE) -> BOOKED -> CHECKED_IN -> IN_CONSULTATION -> COMPLETED
 *
 * Additional transitions:
 *   BOOKED -> CANCELLED
 *   BOOKED -> RESCHEDULED
 *   CHECKED_IN -> CANCELLED (ONLY when ClinicPolicyConfig.allowCheckedInCancellation === true)
 *
 * All other state transitions are strictly rejected with DomainRuleError.
 */

import {
  AppointmentEventType,
  AppointmentStatus,
  ClinicPolicyConfig,
  DomainRuleError,
} from './models';

export interface TransitionValidationInput {
  currentStatus: AppointmentStatus;
  targetStatus: AppointmentStatus;
  policy: ClinicPolicyConfig;
  reason?: string;
}

export function getAllowedNextStatuses(
  currentStatus: AppointmentStatus,
  policy: ClinicPolicyConfig,
): AppointmentStatus[] {
  switch (currentStatus) {
    case AppointmentStatus.BOOKED:
      return [
        AppointmentStatus.CHECKED_IN,
        AppointmentStatus.CANCELLED,
        AppointmentStatus.RESCHEDULED,
      ];
    case AppointmentStatus.CHECKED_IN: {
      const allowed: AppointmentStatus[] = [AppointmentStatus.IN_CONSULTATION];
      if (policy.allowCheckedInCancellation) {
        allowed.push(AppointmentStatus.CANCELLED);
      }
      return allowed;
    }
    case AppointmentStatus.IN_CONSULTATION:
      return [AppointmentStatus.COMPLETED];
    case AppointmentStatus.COMPLETED:
    case AppointmentStatus.CANCELLED:
    case AppointmentStatus.RESCHEDULED:
      return [];
    default:
      return [];
  }
}

export function validateAppointmentTransition(input: TransitionValidationInput): void {
  const { currentStatus, targetStatus, policy, reason } = input;

  if (currentStatus === targetStatus) {
    throw new DomainRuleError(
      'NO_OP_TRANSITION',
      `Appointment is already in status ${currentStatus}.`,
    );
  }

  if (
    currentStatus === AppointmentStatus.CHECKED_IN &&
    targetStatus === AppointmentStatus.CANCELLED &&
    !policy.allowCheckedInCancellation
  ) {
    throw new DomainRuleError(
      'POLICY_DISALLOWS_CHECKED_IN_CANCELLATION',
      'Current clinic policy prohibits cancelling an appointment once the patient is Checked In.',
    );
  }

  const allowedTargets = getAllowedNextStatuses(currentStatus, policy);
  if (!allowedTargets.includes(targetStatus)) {
    throw new DomainRuleError(
      'INVALID_STATE_TRANSITION',
      `Invalid appointment transition from ${currentStatus} to ${targetStatus}. Allowed targets: ${
        allowedTargets.length > 0 ? allowedTargets.join(', ') : 'none (terminal state)'
      }.`,
    );
  }

  if (targetStatus === AppointmentStatus.CANCELLED) {
    if (!reason || reason.trim().length < 3) {
      throw new DomainRuleError(
        'CANCELLATION_REASON_REQUIRED',
        'A clear cancellation reason (minimum 3 characters) is required to cancel an appointment.',
      );
    }
  }
}

export function mapStatusToAuditEventType(targetStatus: AppointmentStatus): AppointmentEventType {
  switch (targetStatus) {
    case AppointmentStatus.BOOKED:
      return AppointmentEventType.APPOINTMENT_CONFIRMED;
    case AppointmentStatus.CHECKED_IN:
      return AppointmentEventType.PATIENT_CHECKED_IN;
    case AppointmentStatus.IN_CONSULTATION:
      return AppointmentEventType.CONSULTATION_STARTED;
    case AppointmentStatus.COMPLETED:
      return AppointmentEventType.CONSULTATION_COMPLETED;
    case AppointmentStatus.CANCELLED:
      return AppointmentEventType.APPOINTMENT_CANCELLED;
    case AppointmentStatus.RESCHEDULED:
      return AppointmentEventType.APPOINTMENT_RESCHEDULED;
  }
}

/**
 * Returns true if the appointment currently occupies its doctor's time slot
 * and prevents any other active booking from claiming that slot.
 */
export function isSlotOccupyingStatus(status: AppointmentStatus): boolean {
  return (
    status === AppointmentStatus.BOOKED ||
    status === AppointmentStatus.CHECKED_IN ||
    status === AppointmentStatus.IN_CONSULTATION
  );
}
