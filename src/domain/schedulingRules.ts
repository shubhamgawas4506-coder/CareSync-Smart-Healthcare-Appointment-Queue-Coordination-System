/**
 * CareSync Domain Layer — Intelligent Scheduling & Conflict Prevention Rules
 *
 * Enforces double-defense slot validation:
 * 1. TimeSlot record exists, belongs to target doctor, is AVAILABLE, and starts in the future.
 * 2. Zero active appointments (BOOKED, CHECKED_IN, IN_CONSULTATION) occupy either the same
 *    slotId OR any overlapping [startTime, endTime) window for the same doctorId.
 */

import {
  Appointment,
  DomainRuleError,
  SlotAvailabilityStatus,
  TimeSlot,
} from './models';
import { isSlotOccupyingStatus } from './stateMachine';

export interface SlotValidationInput {
  slot: TimeSlot | undefined;
  doctorId: string;
  existingAppointments: Appointment[];
  nowMs: number;
  ignoreAppointmentId?: string;
}

export function validateSlotForBooking(input: SlotValidationInput): TimeSlot {
  const { slot, doctorId, existingAppointments, nowMs, ignoreAppointmentId } = input;

  if (!slot) {
    throw new DomainRuleError('INVALID_SLOT', 'Selected appointment time slot does not exist.');
  }

  if (slot.doctorId !== doctorId) {
    throw new DomainRuleError(
      'DOCTOR_SLOT_MISMATCH',
      'Selected time slot does not belong to the requested doctor.',
    );
  }

  if (slot.startTime <= nowMs) {
    throw new DomainRuleError(
      'PAST_SLOT',
      'Cannot book an appointment in a past or already-started time slot.',
    );
  }

  // Check active appointment occupancy across slotId and overlapping time intervals first
  // so genuine double-booking attempts surface explicitly as SLOT_CONFLICT.
  const conflictingAppointment = existingAppointments.find((apt) => {
    if (ignoreAppointmentId && apt.appointmentId === ignoreAppointmentId) {
      return false;
    }
    if (apt.doctorId !== doctorId) {
      return false;
    }
    if (!isSlotOccupyingStatus(apt.status)) {
      return false;
    }
    const sameSlot = apt.slotId === slot.slotId;
    const intervalsOverlap = apt.startTime < slot.endTime && slot.startTime < apt.endTime;
    return sameSlot || intervalsOverlap;
  });

  if (conflictingAppointment) {
    throw new DomainRuleError(
      'SLOT_CONFLICT',
      `Time slot conflict detected: doctor already has an active appointment (${conflictingAppointment.appointmentId}) during this window.`,
    );
  }

  if (slot.availabilityStatus === SlotAvailabilityStatus.BOOKED) {
    throw new DomainRuleError(
      'SLOT_CONFLICT',
      'This time slot has already been booked by another patient.',
    );
  }

  if (slot.availabilityStatus !== SlotAvailabilityStatus.AVAILABLE) {
    throw new DomainRuleError(
      'UNAVAILABLE_SLOT',
      `This time slot is currently ${slot.availabilityStatus.toLowerCase()} and cannot be booked.`,
    );
  }

  return slot;
}

/**
 * Checks whether a patient already has another overlapping active appointment
 * with any doctor at the same time.
 */
export function validatePatientHasNoOverlappingAppointment(
  patientId: string,
  targetSlot: TimeSlot,
  existingAppointments: Appointment[],
  ignoreAppointmentId?: string,
): void {
  const overlapping = existingAppointments.find((apt) => {
    if (ignoreAppointmentId && apt.appointmentId === ignoreAppointmentId) {
      return false;
    }
    if (apt.patientId !== patientId || !isSlotOccupyingStatus(apt.status)) {
      return false;
    }
    return apt.startTime < targetSlot.endTime && targetSlot.startTime < apt.endTime;
  });

  if (overlapping) {
    throw new DomainRuleError(
      'PATIENT_TIME_CONFLICT',
      `Patient already holds an overlapping active appointment (${overlapping.appointmentId}) during this time window.`,
    );
  }
}
