/**
 * CareSync Repository Layer — Deterministic Clinical Seed Data Generator
 *
 * Generates realistic, fictional demo patients, doctors, multi-day time slots,
 * active queue states, and historical appointments anchored relative to `nowMs`
 * so all workflows work reliably at any time of day.
 */

import { createDiagnosticRecord } from '../diagnostics/diagnosticsLogger';
import {
  Appointment,
  AppointmentEvent,
  AppointmentEventType,
  AppointmentStatus,
  Doctor,
  Patient,
  SlotAvailabilityStatus,
  TimeSlot,
  UserRole,
} from '../domain/models';
import {
  addClinicDays,
  buildEpochFromClinicDateAndTime,
  DEFAULT_CLINIC_TIMEZONE,
  formatDateInZone,
} from '../domain/timeUtils';
import { CareSyncStateSnapshot } from './interfaces';

export const COORDINATOR_ACTOR = {
  actorId: 'coord_nadia_okafor',
  name: 'Nadia Okafor',
  title: 'Lead Clinic Coordinator',
};

export function createInitialSeedSnapshot(nowMs: number = Date.now()): CareSyncStateSnapshot {
  const tz = DEFAULT_CLINIC_TIMEZONE;
  const todayStr = formatDateInZone(nowMs, tz);
  const yesterdayStr = addClinicDays(todayStr, -1);

  const doctors: Record<string, Doctor> = {
    doc_sarah_jenkins: {
      doctorId: 'doc_sarah_jenkins',
      name: 'Dr. Sarah Jenkins, MD',
      specialty: 'Cardiology',
      room: 'Suite 204-A',
      avgConsultationMinutes: 20,
      avatarUrl: 'doctor_sarah_jenkins',
      bio: 'Non-invasive cardiovascular consultations, hypertension coordination, and post-discharge follow-up.',
      availability: [
        { dayOfWeek: 1, startHour: '09:00', endHour: '17:00', slotDurationMinutes: 30 },
        { dayOfWeek: 2, startHour: '09:00', endHour: '17:00', slotDurationMinutes: 30 },
        { dayOfWeek: 3, startHour: '09:00', endHour: '17:00', slotDurationMinutes: 30 },
        { dayOfWeek: 4, startHour: '09:00', endHour: '17:00', slotDurationMinutes: 30 },
        { dayOfWeek: 5, startHour: '09:00', endHour: '16:00', slotDurationMinutes: 30 },
      ],
    },
    doc_kenji_tanaka: {
      doctorId: 'doc_kenji_tanaka',
      name: 'Dr. Kenji Tanaka, MD',
      specialty: 'Internal Medicine',
      room: 'Suite 108-B',
      avgConsultationMinutes: 15,
      avatarUrl: 'doctor_kenji_tanaka',
      bio: 'Primary adult internal medicine, chronic care management, and annual preventive evaluations.',
      availability: [
        { dayOfWeek: 1, startHour: '08:30', endHour: '16:30', slotDurationMinutes: 30 },
        { dayOfWeek: 2, startHour: '08:30', endHour: '16:30', slotDurationMinutes: 30 },
        { dayOfWeek: 3, startHour: '08:30', endHour: '16:30', slotDurationMinutes: 30 },
        { dayOfWeek: 4, startHour: '08:30', endHour: '16:30', slotDurationMinutes: 30 },
        { dayOfWeek: 5, startHour: '08:30', endHour: '15:30', slotDurationMinutes: 30 },
      ],
    },
    doc_priya_nair: {
      doctorId: 'doc_priya_nair',
      name: 'Dr. Priya Nair, MD',
      specialty: 'Orthopedic Care',
      room: 'Suite 310-C',
      avgConsultationMinutes: 25,
      avatarUrl: 'doctor_priya_nair',
      bio: 'Musculoskeletal mobility rehabilitation, joint recovery tracking, and sports injury consultations.',
      availability: [
        { dayOfWeek: 1, startHour: '09:30', endHour: '17:30', slotDurationMinutes: 30 },
        { dayOfWeek: 3, startHour: '09:30', endHour: '17:30', slotDurationMinutes: 30 },
        { dayOfWeek: 5, startHour: '09:30', endHour: '16:30', slotDurationMinutes: 30 },
      ],
    },
    doc_marcus_thompson: {
      doctorId: 'doc_marcus_thompson',
      name: 'Dr. Marcus Thompson, MD',
      specialty: 'Preventive Medicine',
      room: 'Suite 112-A',
      avgConsultationMinutes: 15,
      avatarUrl: 'doctor_marcus_thompson',
      bio: 'Metabolic health screening, immunization planning, and longitudinal wellness coordination.',
      availability: [
        { dayOfWeek: 2, startHour: '09:00', endHour: '17:00', slotDurationMinutes: 30 },
        { dayOfWeek: 4, startHour: '09:00', endHour: '17:00', slotDurationMinutes: 30 },
        { dayOfWeek: 6, startHour: '09:00', endHour: '13:00', slotDurationMinutes: 30 },
      ],
    },
  };

  const patients: Record<string, Patient> = {
    pat_maya_lin: {
      patientId: 'pat_maya_lin',
      name: 'Maya Lin',
      contact: 'maya.lin@example.org · (415) 555-0148',
      mrn: 'MRN-408921',
      dateOfBirth: '1989-04-16',
      appointmentIds: [],
    },
    pat_rohan_patel: {
      patientId: 'pat_rohan_patel',
      name: 'Rohan Patel',
      contact: 'rohan.patel@example.org · (415) 555-0193',
      mrn: 'MRN-409104',
      dateOfBirth: '1978-11-03',
      appointmentIds: [],
    },
    pat_claire_bennett: {
      patientId: 'pat_claire_bennett',
      name: 'Claire Bennett',
      contact: 'claire.bennett@example.org · (415) 555-0177',
      mrn: 'MRN-407652',
      dateOfBirth: '1994-08-27',
      appointmentIds: [],
    },
    pat_david_kim: {
      patientId: 'pat_david_kim',
      name: 'David Kim',
      contact: 'david.kim@example.org · (415) 555-0122',
      mrn: 'MRN-406319',
      dateOfBirth: '1967-02-11',
      appointmentIds: [],
    },
  };

  const timeSlots: Record<string, TimeSlot> = {};
  const appointments: Record<string, Appointment> = {};
  const events: AppointmentEvent[] = [];

  let seq = 1000;
  const nextSeq = () => {
    seq += 1;
    return seq;
  };

  // Anchor live clinic session around a clean 30-min boundary (shifted past any DST fold if start > end display)
  const thirtyMinMs = 30 * 60_000;
  const rawRoundedMs = Math.ceil(nowMs / thirtyMinMs) * thirtyMinMs;
  // Ensure consultSlotStart (base - 30m) and bookedTodayEnd (base + 90m) share normal monotonic progression;
  // if rawRoundedMs sits right on a 02:00 -> 01:00 DST fall-back edge, anchor live slots cleanly after the fold
  const roundedBaseMs = rawRoundedMs;

  // Helper to register a slot
  const registerSlot = (
    slotId: string,
    doctorId: string,
    startTime: number,
    endTime: number,
    availabilityStatus: SlotAvailabilityStatus = SlotAvailabilityStatus.AVAILABLE,
    activeAppointmentId?: string,
  ): TimeSlot => {
    const slot: TimeSlot = {
      slotId,
      doctorId,
      date: formatDateInZone(startTime, tz),
      startTime,
      endTime,
      availabilityStatus,
      activeAppointmentId,
    };
    timeSlots[slotId] = slot;
    return slot;
  };

  // 1. Historical completed appointment yesterday for Maya Lin with Dr. Kenji Tanaka
  const histStart = buildEpochFromClinicDateAndTime(yesterdayStr, '10:30', tz);
  const histEnd = histStart + thirtyMinMs;
  const histSlot = registerSlot(
    `slot_hist_${nextSeq()}`,
    'doc_kenji_tanaka',
    histStart,
    histEnd,
    SlotAvailabilityStatus.BOOKED,
  );
  const histAptId = `apt_${nextSeq()}`;
  const histReqId = `req_seed_${nextSeq()}`;
  appointments[histAptId] = {
    appointmentId: histAptId,
    requestId: histReqId,
    patientId: 'pat_maya_lin',
    doctorId: 'doc_kenji_tanaka',
    slotId: histSlot.slotId,
    date: histSlot.date,
    startTime: histStart,
    endTime: histEnd,
    status: AppointmentStatus.COMPLETED,
    reasonForVisit: 'Annual metabolic lab panel review',
    checkedInAt: histStart - 10 * 60_000,
    consultationStartedAt: histStart + 2 * 60_000,
    completedAt: histStart + 19 * 60_000,
    createdAt: histStart - 86_400_000,
    updatedAt: histStart + 19 * 60_000,
  };
  patients.pat_maya_lin.appointmentIds.push(histAptId);
  events.push({
    eventId: `evt_${nextSeq()}`,
    appointmentId: histAptId,
    requestId: histReqId,
    eventType: AppointmentEventType.CONSULTATION_COMPLETED,
    previousStatus: AppointmentStatus.IN_CONSULTATION,
    newStatus: AppointmentStatus.COMPLETED,
    actorId: 'doc_kenji_tanaka',
    actorRole: UserRole.DOCTOR,
    reason: 'Completed annual metabolic panel review; routine follow-up in 6 months.',
    timestamp: histStart + 19 * 60_000,
  });

  // Choose clean morning/daytime anchors for today's scheduled clinic roster when before 09:00,
  // or relative to roundedBaseMs if running later in the day.
  const todayNineAm = buildEpochFromClinicDateAndTime(todayStr, '09:00', tz);
  const sessionAnchorMs = roundedBaseMs < todayNineAm ? todayNineAm : roundedBaseMs;

  // 2. Live IN_CONSULTATION appointment for Dr. Sarah Jenkins (David Kim)
  const consultSlotStart = sessionAnchorMs - thirtyMinMs;
  const consultSlotEnd = sessionAnchorMs;
  const consultAptId = `apt_${nextSeq()}`;
  const consultReqId = `req_seed_${nextSeq()}`;
  const consultSlot = registerSlot(
    `slot_live_${nextSeq()}`,
    'doc_sarah_jenkins',
    consultSlotStart,
    consultSlotEnd,
    SlotAvailabilityStatus.BOOKED,
    consultAptId,
  );
  appointments[consultAptId] = {
    appointmentId: consultAptId,
    requestId: consultReqId,
    patientId: 'pat_david_kim',
    doctorId: 'doc_sarah_jenkins',
    slotId: consultSlot.slotId,
    date: todayStr,
    startTime: consultSlotStart,
    endTime: consultSlotEnd,
    status: AppointmentStatus.IN_CONSULTATION,
    reasonForVisit: 'Blood pressure titration check',
    checkedInAt: nowMs - 22 * 60_000,
    consultationStartedAt: nowMs - 8 * 60_000,
    createdAt: nowMs - 72 * 3600_000,
    updatedAt: nowMs - 8 * 60_000,
  };
  patients.pat_david_kim.appointmentIds.push(consultAptId);
  events.push({
    eventId: `evt_${nextSeq()}`,
    appointmentId: consultAptId,
    requestId: consultReqId,
    eventType: AppointmentEventType.CONSULTATION_STARTED,
    previousStatus: AppointmentStatus.CHECKED_IN,
    newStatus: AppointmentStatus.IN_CONSULTATION,
    actorId: 'doc_sarah_jenkins',
    actorRole: UserRole.DOCTOR,
    reason: 'Patient escorted into Suite 204-A for consultation.',
    timestamp: nowMs - 8 * 60_000,
  });

  // 3. Checked-In Queue Position #1 for Dr. Sarah Jenkins (Claire Bennett)
  const q1Start = sessionAnchorMs;
  const q1End = sessionAnchorMs + thirtyMinMs;
  const q1AptId = `apt_${nextSeq()}`;
  const q1ReqId = `req_seed_${nextSeq()}`;
  const q1Slot = registerSlot(
    `slot_live_${nextSeq()}`,
    'doc_sarah_jenkins',
    q1Start,
    q1End,
    SlotAvailabilityStatus.BOOKED,
    q1AptId,
  );
  appointments[q1AptId] = {
    appointmentId: q1AptId,
    requestId: q1ReqId,
    patientId: 'pat_claire_bennett',
    doctorId: 'doc_sarah_jenkins',
    slotId: q1Slot.slotId,
    date: todayStr,
    startTime: q1Start,
    endTime: q1End,
    status: AppointmentStatus.CHECKED_IN,
    reasonForVisit: 'Resting ECG baseline consultation',
    checkedInAt: nowMs - 14 * 60_000,
    createdAt: nowMs - 48 * 3600_000,
    updatedAt: nowMs - 14 * 60_000,
  };
  patients.pat_claire_bennett.appointmentIds.push(q1AptId);
  events.push({
    eventId: `evt_${nextSeq()}`,
    appointmentId: q1AptId,
    requestId: q1ReqId,
    eventType: AppointmentEventType.PATIENT_CHECKED_IN,
    previousStatus: AppointmentStatus.BOOKED,
    newStatus: AppointmentStatus.CHECKED_IN,
    actorId: COORDINATOR_ACTOR.actorId,
    actorRole: UserRole.COORDINATOR,
    reason: 'Patient arrived at front desk and completed check-in verification.',
    timestamp: nowMs - 14 * 60_000,
  });

  // 4. Checked-In Queue Position #2 for Dr. Sarah Jenkins (Maya Lin — active demo patient!)
  const q2Start = sessionAnchorMs + thirtyMinMs;
  const q2End = sessionAnchorMs + 2 * thirtyMinMs;
  const q2AptId = `apt_${nextSeq()}`;
  const q2ReqId = `req_seed_${nextSeq()}`;
  const q2Slot = registerSlot(
    `slot_live_${nextSeq()}`,
    'doc_sarah_jenkins',
    q2Start,
    q2End,
    SlotAvailabilityStatus.BOOKED,
    q2AptId,
  );
  appointments[q2AptId] = {
    appointmentId: q2AptId,
    requestId: q2ReqId,
    patientId: 'pat_maya_lin',
    doctorId: 'doc_sarah_jenkins',
    slotId: q2Slot.slotId,
    date: todayStr,
    startTime: q2Start,
    endTime: q2End,
    status: AppointmentStatus.CHECKED_IN,
    reasonForVisit: 'Palpitation follow-up & Holter summary review',
    checkedInAt: nowMs - 5 * 60_000,
    createdAt: nowMs - 36 * 3600_000,
    updatedAt: nowMs - 5 * 60_000,
  };
  patients.pat_maya_lin.appointmentIds.push(q2AptId);
  events.push({
    eventId: `evt_${nextSeq()}`,
    appointmentId: q2AptId,
    requestId: q2ReqId,
    eventType: AppointmentEventType.PATIENT_CHECKED_IN,
    previousStatus: AppointmentStatus.BOOKED,
    newStatus: AppointmentStatus.CHECKED_IN,
    actorId: COORDINATOR_ACTOR.actorId,
    actorRole: UserRole.COORDINATOR,
    reason: 'Checked in at kiosk; placed in Suite 204-A live queue.',
    timestamp: nowMs - 5 * 60_000,
  });

  // 5. Booked (not yet checked in) appointment later today for Rohan Patel with Dr. Sarah Jenkins
  const bookedTodayStart = sessionAnchorMs + 2 * thirtyMinMs;
  const bookedTodayEnd = sessionAnchorMs + 3 * thirtyMinMs;
  const bookedTodayAptId = `apt_${nextSeq()}`;
  const bookedTodayReqId = `req_seed_${nextSeq()}`;
  const bookedTodaySlot = registerSlot(
    `slot_live_${nextSeq()}`,
    'doc_sarah_jenkins',
    bookedTodayStart,
    bookedTodayEnd,
    SlotAvailabilityStatus.BOOKED,
    bookedTodayAptId,
  );
  appointments[bookedTodayAptId] = {
    appointmentId: bookedTodayAptId,
    requestId: bookedTodayReqId,
    patientId: 'pat_rohan_patel',
    doctorId: 'doc_sarah_jenkins',
    slotId: bookedTodaySlot.slotId,
    date: formatDateInZone(bookedTodayStart, tz),
    startTime: bookedTodayStart,
    endTime: bookedTodayEnd,
    status: AppointmentStatus.BOOKED,
    reasonForVisit: 'Lipid profile and preventive cardiology consult',
    createdAt: nowMs - 24 * 3600_000,
    updatedAt: nowMs - 24 * 3600_000,
  };
  patients.pat_rohan_patel.appointmentIds.push(bookedTodayAptId);
  events.push({
    eventId: `evt_${nextSeq()}`,
    appointmentId: bookedTodayAptId,
    requestId: bookedTodayReqId,
    eventType: AppointmentEventType.APPOINTMENT_CONFIRMED,
    previousStatus: null,
    newStatus: AppointmentStatus.BOOKED,
    actorId: 'pat_rohan_patel',
    actorRole: UserRole.PATIENT,
    reason: 'Online booking confirmed for Cardiology slot.',
    timestamp: nowMs - 24 * 3600_000,
  });

  // 6. Upcoming BOOKED appointment tomorrow for Maya Lin with Dr. Priya Nair (ready to test reschedule/cancel!)
  const tomorrowStr = addClinicDays(todayStr, 1);
  const mayaTomorrowStart = buildEpochFromClinicDateAndTime(tomorrowStr, '11:00', tz);
  const mayaTomorrowEnd = mayaTomorrowStart + thirtyMinMs;
  const mayaTomorrowAptId = `apt_${nextSeq()}`;
  const mayaTomorrowReqId = `req_seed_${nextSeq()}`;
  const mayaTomorrowSlot = registerSlot(
    `slot_tmrw_${nextSeq()}`,
    'doc_priya_nair',
    mayaTomorrowStart,
    mayaTomorrowEnd,
    SlotAvailabilityStatus.BOOKED,
    mayaTomorrowAptId,
  );
  appointments[mayaTomorrowAptId] = {
    appointmentId: mayaTomorrowAptId,
    requestId: mayaTomorrowReqId,
    patientId: 'pat_maya_lin',
    doctorId: 'doc_priya_nair',
    slotId: mayaTomorrowSlot.slotId,
    date: tomorrowStr,
    startTime: mayaTomorrowStart,
    endTime: mayaTomorrowEnd,
    status: AppointmentStatus.BOOKED,
    reasonForVisit: 'Right shoulder range-of-motion evaluation',
    createdAt: nowMs - 18 * 3600_000,
    updatedAt: nowMs - 18 * 3600_000,
  };
  patients.pat_maya_lin.appointmentIds.push(mayaTomorrowAptId);
  events.push({
    eventId: `evt_${nextSeq()}`,
    appointmentId: mayaTomorrowAptId,
    requestId: mayaTomorrowReqId,
    eventType: AppointmentEventType.APPOINTMENT_CONFIRMED,
    previousStatus: null,
    newStatus: AppointmentStatus.BOOKED,
    actorId: 'pat_maya_lin',
    actorRole: UserRole.PATIENT,
    reason: 'Booked Orthopedic Care evaluation.',
    timestamp: nowMs - 18 * 3600_000,
  });

  // 7. Generate a past unbooked slot for past-slot rejection verification + open daytime slots today & next 3 days
  const doctorIds = Object.keys(doctors);
  for (const docId of doctorIds) {
    const pastStart = roundedBaseMs - 3 * thirtyMinMs;
    registerSlot(
      `slot_past_${docId}_${nextSeq()}`,
      docId,
      pastStart,
      pastStart + thirtyMinMs,
      SlotAvailabilityStatus.AVAILABLE,
    );

    // Ensure future slots exist relative to sessionAnchorMs even if evaluated late in the evening
    for (let offsetIdx = 3; offsetIdx <= 7; offsetIdx++) {
      const sStart = sessionAnchorMs + offsetIdx * thirtyMinMs;
      const sEnd = sStart + thirtyMinMs;
      const conflictExists = Object.values(timeSlots).some(
        (existing) =>
          existing.doctorId === docId &&
          existing.startTime < sEnd &&
          sStart < existing.endTime,
      );
      if (!conflictExists) {
        const isBlockedDemo = docId === 'doc_kenji_tanaka' && offsetIdx === 6;
        registerSlot(
          `slot_${docId}_${nextSeq()}`,
          docId,
          sStart,
          sEnd,
          isBlockedDemo ? SlotAvailabilityStatus.BLOCKED : SlotAvailabilityStatus.AVAILABLE,
        );
      }
    }
  }

  // 8. Generate structured daytime schedule slots for today (if future) + next 3 calendar days (09:00 .. 15:30 clinic time)
  const clinicTimes = ['09:00', '09:30', '10:00', '10:30', '11:00', '13:30', '14:00', '14:30', '15:00'];
  for (let dayOffset = 0; dayOffset <= 3; dayOffset++) {
    const targetDate = addClinicDays(todayStr, dayOffset);
    for (const docId of doctorIds) {
      for (const hhmm of clinicTimes) {
        const sStart = buildEpochFromClinicDateAndTime(targetDate, hhmm, tz);
        const sEnd = sStart + thirtyMinMs;
        if (sStart <= nowMs) continue;
        const alreadyExists = Object.values(timeSlots).some(
          (existing) =>
            existing.doctorId === docId &&
            existing.startTime < sEnd &&
            sStart < existing.endTime,
        );
        if (!alreadyExists) {
          registerSlot(
            `slot_${docId}_${targetDate}_${hhmm.replace(':', '')}_${nextSeq()}`,
            docId,
            sStart,
            sEnd,
            SlotAvailabilityStatus.AVAILABLE,
          );
        }
      }
    }
  }

  // Sort events newest-first or chronological? Store chronological (oldest -> newest)
  events.sort((a, b) => a.timestamp - b.timestamp);

  const diagnostics = [
    createDiagnosticRecord({
      idSuffix: String(nextSeq()),
      timestamp: nowMs,
      level: 'INFO',
      operation: 'REPOSITORY_SEED_INITIALIZED',
      actorId: 'SYSTEM',
      code: 'SEED_READY',
      message: `Initialized CareSync clinic repository (${Object.keys(doctors).length} doctors, ${Object.keys(patients).length} patients, ${Object.keys(timeSlots).length} slots) in timezone ${tz}.`,
    }),
  ];

  return {
    schemaVersion: 1,
    seededAt: nowMs,
    sequenceCounter: seq,
    policy: {
      allowCheckedInCancellation: false,
      clinicTimezone: tz,
      clinicName: 'CareSync Outpatient Coordination Center',
    },
    patients,
    doctors,
    timeSlots,
    appointments,
    events,
    bookingRequests: {},
    diagnostics,
  };
}
