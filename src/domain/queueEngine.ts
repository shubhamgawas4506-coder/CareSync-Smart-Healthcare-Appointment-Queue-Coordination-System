/**
 * CareSync Domain Layer — Smart Patient Queue Engine
 *
 * Computes deterministic queue order and transparent wait-time estimates
 * for checked-in patients per doctor and clinic date.
 *
 * Documented Demo Wait-Time Formula:
 *   1. If an appointment is currently IN_CONSULTATION for the doctor:
 *        elapsedMin = max(0, floor((nowMs - consultationStartedAt) / 60_000))
 *        activeRemainingMin = max(3, avgConsultationMinutes - elapsedMin)
 *      Otherwise:
 *        activeRemainingMin = 0
 *   2. Checked-in waiting queue is ordered by:
 *        (a) checkedInAt ascending (first-checked-in priority among arrived patients),
 *        (b) scheduled startTime ascending (tie-breaker),
 *        (c) appointmentId lexical order (deterministic tie-breaker).
 *   3. For waiting patient at 1-based position `P`:
 *        estimatedWaitMinutes = activeRemainingMin + (P - 1) * avgConsultationMinutes
 *
 * NOTE: All estimates are explicitly marked as operational estimates, NOT clinical guarantees.
 */

import { Appointment, AppointmentStatus, Doctor, Patient } from './models';

export interface QueueEntry {
  appointmentId: string;
  patientId: string;
  patientName: string;
  doctorId: string;
  doctorName: string;
  specialty: string;
  room: string;
  scheduledStartTime: number;
  checkedInAt: number;
  /** 1-based queue position among waiting CHECKED_IN patients */
  position: number;
  /** Estimated minutes until consultation starts (estimate, not a guarantee) */
  estimatedWaitMinutes: number;
  formulaExplanation: string;
}

export interface DoctorQueueSnapshot {
  doctorId: string;
  doctorName: string;
  specialty: string;
  room: string;
  avgConsultationMinutes: number;
  activeConsultation: {
    appointmentId: string;
    patientId: string;
    patientName: string;
    startedAt: number;
    elapsedMinutes: number;
    estimatedRemainingMinutes: number;
  } | null;
  waitingEntries: QueueEntry[];
}

export function computeDoctorQueue(params: {
  doctor: Doctor;
  clinicDate: string;
  appointments: Appointment[];
  patientsById: Record<string, Patient>;
  nowMs: number;
}): DoctorQueueSnapshot {
  const { doctor, clinicDate, appointments, patientsById, nowMs } = params;
  const avgMin = doctor.avgConsultationMinutes;

  const doctorDayAppointments = appointments.filter(
    (apt) => apt.doctorId === doctor.doctorId && apt.date === clinicDate,
  );

  const inConsultationApt = doctorDayAppointments.find(
    (apt) => apt.status === AppointmentStatus.IN_CONSULTATION,
  );

  let activeConsultation: DoctorQueueSnapshot['activeConsultation'] = null;
  let activeRemainingMin = 0;

  if (inConsultationApt) {
    const startedAt = inConsultationApt.consultationStartedAt ?? inConsultationApt.updatedAt;
    const elapsedMinutes = Math.max(0, Math.floor((nowMs - startedAt) / 60_000));
    activeRemainingMin = Math.max(3, avgMin - elapsedMinutes);
    activeConsultation = {
      appointmentId: inConsultationApt.appointmentId,
      patientId: inConsultationApt.patientId,
      patientName: patientsById[inConsultationApt.patientId]?.name ?? 'Patient',
      startedAt,
      elapsedMinutes,
      estimatedRemainingMinutes: activeRemainingMin,
    };
  }

  const checkedInWaiting = doctorDayAppointments
    .filter((apt) => apt.status === AppointmentStatus.CHECKED_IN)
    .sort((a, b) => {
      const aCheck = a.checkedInAt ?? a.updatedAt;
      const bCheck = b.checkedInAt ?? b.updatedAt;
      if (aCheck !== bCheck) return aCheck - bCheck;
      if (a.startTime !== b.startTime) return a.startTime - b.startTime;
      return a.appointmentId.localeCompare(b.appointmentId);
    });

  const waitingEntries: QueueEntry[] = checkedInWaiting.map((apt, index) => {
    const position = index + 1;
    const priorWaitingMinutes = (position - 1) * avgMin;
    const estimatedWaitMinutes = activeRemainingMin + priorWaitingMinutes;
    const formulaParts: string[] = [];
    if (activeRemainingMin > 0) {
      formulaParts.push(`${activeRemainingMin}m active consultation remaining`);
    }
    if (position > 1) {
      formulaParts.push(`${position - 1} ahead × ${avgMin}m avg consult`);
    }
    const formulaExplanation =
      formulaParts.length > 0
        ? formulaParts.join(' + ')
        : 'Next in line — doctor currently available';

    return {
      appointmentId: apt.appointmentId,
      patientId: apt.patientId,
      patientName: patientsById[apt.patientId]?.name ?? 'Patient',
      doctorId: doctor.doctorId,
      doctorName: doctor.name,
      specialty: doctor.specialty,
      room: doctor.room,
      scheduledStartTime: apt.startTime,
      checkedInAt: apt.checkedInAt ?? apt.updatedAt,
      position,
      estimatedWaitMinutes,
      formulaExplanation,
    };
  });

  return {
    doctorId: doctor.doctorId,
    doctorName: doctor.name,
    specialty: doctor.specialty,
    room: doctor.room,
    avgConsultationMinutes: avgMin,
    activeConsultation,
    waitingEntries,
  };
}
