/**
 * Patient Screens:
 * - Screen 2: Patient Dashboard (`PatientDashboardView`)
 * - Screen 4: Appointment Confirmation (`PatientConfirmationView`)
 * - Screen 6: Patient Queue Tracking (`PatientQueueTrackingView`)
 */

import React, { useMemo } from 'react';
import {
  ArrowRight,
  CalendarPlus,
  CheckCircle2,
  Clock,
  History,
  Info,
  Stethoscope,
  Users,
} from 'lucide-react';
import { AppointmentStatus } from '../../domain/models';
import {
  formatClinicDateLabel,
  formatDateTimeInZone,
  formatTimeInZone,
} from '../../domain/timeUtils';
import { DoctorAvatar } from '../assets';
import { useCareSync } from '../CareSyncContext';
import { AppointmentStatusIndicator } from '../components/StatusPrimitives';

export function PatientDashboardView() {
  const {
    snapshot,
    activePatientId,
    liveQueues,
    navigateTo,
    setPreselectedDoctorIdForBooking,
  } = useCareSync();

  const tz = snapshot.policy.clinicTimezone;
  const patient = snapshot.patients[activePatientId] ?? Object.values(snapshot.patients)[0];

  const patientAppointments = useMemo(() => {
    return Object.values(snapshot.appointments)
      .filter((a) => a.patientId === patient.patientId)
      .sort((a, b) => a.startTime - b.startTime);
  }, [patient.patientId, snapshot.appointments]);

  const activeAppointments = patientAppointments.filter(
    (a) =>
      a.status === AppointmentStatus.BOOKED ||
      a.status === AppointmentStatus.CHECKED_IN ||
      a.status === AppointmentStatus.IN_CONSULTATION,
  );

  const pastAppointments = patientAppointments.filter(
    (a) =>
      a.status === AppointmentStatus.COMPLETED ||
      a.status === AppointmentStatus.CANCELLED ||
      a.status === AppointmentStatus.RESCHEDULED,
  );

  // Check if active patient is currently in any live queue or active consultation
  const patientQueueMatch = useMemo(() => {
    for (const q of liveQueues) {
      if (q.activeConsultation?.patientId === patient.patientId) {
        return { queue: q, mode: 'IN_CONSULTATION' as const, entry: null };
      }
      const waiting = q.waitingEntries.find((w) => w.patientId === patient.patientId);
      if (waiting) {
        return { queue: q, mode: 'WAITING' as const, entry: waiting };
      }
    }
    return null;
  }, [liveQueues, patient.patientId]);

  const doctors = Object.values(snapshot.doctors);

  return (
    <div className="space-y-8">
      {/* Patient Welcome & Primary Action */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 lg:p-8 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div className="space-y-2">
          <p className="text-xs font-medium text-sky-600 dark:text-sky-400">
            Outpatient Coordination Summary · {patient.mrn}
          </p>
          <h1 className="text-2xl sm:text-3xl font-display font-bold text-slate-900 dark:text-white">
            Welcome back, {patient.name}
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 max-w-2xl">
            Manage your upcoming specialist appointments, monitor your real-time waiting-room
            position once checked in, or book a new consultation slot.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => navigateTo('patient-booking')}
            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-sky-600 hover:bg-sky-700 dark:bg-sky-500 dark:hover:bg-sky-400 dark:text-slate-950 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
          >
            <CalendarPlus className="w-4 h-4" aria-hidden="true" />
            <span>Book Appointment</span>
          </button>
          <button
            type="button"
            onClick={() => navigateTo('patient-history')}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-200 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
          >
            <History className="w-4 h-4" aria-hidden="true" />
            <span>History &amp; Reschedule</span>
          </button>
        </div>
      </section>

      {/* Live Queue Status Callout (if checked in or in consultation) */}
      {patientQueueMatch && (
        <section className="bg-white dark:bg-slate-900 border border-sky-200 dark:border-sky-800/80 rounded-2xl p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2">
            <p className="text-xs font-semibold text-sky-700 dark:text-sky-400">
              Active Today · {patientQueueMatch.queue.room}
            </p>
            {patientQueueMatch.mode === 'IN_CONSULTATION' ? (
              <>
                <h2 className="text-xl font-display font-bold text-slate-900 dark:text-white">
                  You are currently in consultation with {patientQueueMatch.queue.doctorName}
                </h2>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Started {patientQueueMatch.queue.activeConsultation?.elapsedMinutes} minutes ago in{' '}
                  {patientQueueMatch.queue.room}.
                </p>
              </>
            ) : (
              <>
                <h2 className="text-xl font-display font-bold text-slate-900 dark:text-white">
                  Checked In — Queue Position #{patientQueueMatch.entry?.position} for{' '}
                  {patientQueueMatch.queue.doctorName}
                </h2>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Estimated wait:{' '}
                  <strong className="font-mono tabular-nums text-slate-900 dark:text-white">
                    ~{patientQueueMatch.entry?.estimatedWaitMinutes} min
                  </strong>{' '}
                  ({patientQueueMatch.entry?.formulaExplanation}). Estimate only, not a guarantee.
                </p>
              </>
            )}
          </div>

          <button
            type="button"
            onClick={() => navigateTo('patient-queue')}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-sky-700 dark:text-sky-300 bg-sky-50 hover:bg-sky-100 dark:bg-sky-950/60 dark:hover:bg-sky-900/60 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <span>Open Live Queue Tracker</span>
            <ArrowRight className="w-4 h-4" aria-hidden="true" />
          </button>
        </section>
      )}

      {/* Two-Column Grid: Active Upcoming Visits & Quick Specialist Access */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <section className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-display font-bold text-slate-900 dark:text-white">
                Upcoming &amp; Active Appointments
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums mt-0.5">
                {activeAppointments.length} active · {pastAppointments.length} completed/historical
              </p>
            </div>
            <button
              type="button"
              onClick={() => navigateTo('patient-history')}
              className="text-xs font-medium text-sky-600 dark:text-sky-400 hover:underline cursor-pointer"
            >
              Manage all
            </button>
          </div>

          {activeAppointments.length === 0 ? (
            <div className="py-10 text-center space-y-3">
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                You have no upcoming scheduled appointments.
              </p>
              <button
                type="button"
                onClick={() => navigateTo('patient-booking')}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-700 rounded-lg cursor-pointer"
              >
                <span>Browse Available Doctors</span>
              </button>
            </div>
          ) : (
            <div className="divide-y divide-slate-200 dark:divide-slate-800">
              {activeAppointments.map((apt) => {
                const doc = snapshot.doctors[apt.doctorId];
                return (
                  <div
                    key={apt.appointmentId}
                    className="py-4 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                  >
                    <div className="flex items-start gap-3.5">
                      {doc && (
                        <DoctorAvatar avatarKey={doc.avatarUrl} name={doc.name} size="sm" />
                      )}
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                          <span>{formatClinicDateLabel(apt.date, tz)}</span>
                          <span aria-hidden="true">·</span>
                          <span>{formatTimeInZone(apt.startTime, tz)}</span>
                          <span aria-hidden="true">·</span>
                          <span>{apt.appointmentId}</span>
                        </div>
                        <p className="text-sm font-semibold text-slate-900 dark:text-white">
                          {doc?.name ?? apt.doctorId}{' '}
                          <span className="font-normal text-slate-500 dark:text-slate-400">
                            · {doc?.specialty} ({doc?.room})
                          </span>
                        </p>
                        <p className="text-xs text-slate-600 dark:text-slate-400">
                          {apt.reasonForVisit}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <AppointmentStatusIndicator status={apt.status} />
                      <button
                        type="button"
                        onClick={() => navigateTo('patient-history')}
                        className="px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                      >
                        Manage
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-5">
          <div>
            <h2 className="text-lg font-display font-bold text-slate-900 dark:text-white">
              Available Clinic Specialists
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Select a specialist to view open appointment windows.
            </p>
          </div>

          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {doctors.map((doc) => (
              <div
                key={doc.doctorId}
                className="py-3.5 first:pt-0 last:pb-0 flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <DoctorAvatar avatarKey={doc.avatarUrl} name={doc.name} size="sm" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                      {doc.name}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                      {doc.specialty} · {doc.room}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setPreselectedDoctorIdForBooking(doc.doctorId);
                    navigateTo('patient-booking');
                  }}
                  className="px-3 py-1.5 text-xs font-medium text-sky-700 dark:text-sky-300 bg-sky-50 hover:bg-sky-100 dark:bg-sky-950/60 dark:hover:bg-sky-900/50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Select
                </button>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

/**
 * Screen 4: Appointment Confirmation Receipt
 */
export function PatientConfirmationView() {
  const {
    snapshot,
    lastConfirmedAppointment,
    lastBookingDeduplicated,
    navigateTo,
  } = useCareSync();

  const tz = snapshot.policy.clinicTimezone;

  if (!lastConfirmedAppointment) {
    return (
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 text-center space-y-4">
        <h1 className="text-xl font-display font-bold text-slate-900 dark:text-white">
          No Recent Booking Receipt Selected
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400 max-w-md mx-auto">
          Book a new appointment or inspect all confirmed appointments in your Patient History.
        </p>
        <div className="flex justify-center gap-3">
          <button
            type="button"
            onClick={() => navigateTo('patient-booking')}
            className="px-4 py-2 text-sm font-semibold text-white bg-sky-600 hover:bg-sky-700 rounded-lg cursor-pointer"
          >
            Book Appointment
          </button>
          <button
            type="button"
            onClick={() => navigateTo('patient-history')}
            className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 rounded-lg cursor-pointer"
          >
            View History
          </button>
        </div>
      </section>
    );
  }

  const apt = lastConfirmedAppointment;
  const doc = snapshot.doctors[apt.doctorId];
  const patient = snapshot.patients[apt.patientId];
  const reqRecord = snapshot.bookingRequests[apt.requestId];

  return (
    <section className="max-w-3xl mx-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 lg:p-10 space-y-8">
      <div className="flex items-start justify-between gap-4 pb-6 border-b border-slate-200 dark:border-slate-800">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 text-emerald-700 dark:text-emerald-400 text-xs font-semibold">
            <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
            <span>
              {lastBookingDeduplicated
                ? 'Idempotent Retry Reconciled · Zero Duplicate Records Created'
                : 'Appointment Confirmed & Slot Atomically Locked'}
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-display font-bold text-slate-900 dark:text-white">
            Booking Confirmation Receipt
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Your appointment slot has been validated and reserved. Present your confirmation ID upon
            clinic check-in.
          </p>
        </div>
        <AppointmentStatusIndicator status={apt.status} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 text-sm">
        <div className="space-y-1">
          <p className="text-xs text-slate-500 dark:text-slate-400">Appointment ID</p>
          <p className="font-mono font-semibold text-slate-900 dark:text-white tabular-nums">
            {apt.appointmentId}
          </p>
        </div>
        <div className="space-y-1">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Idempotency Request ID {reqRecord ? `(Attempts: ${reqRecord.attemptCount})` : ''}
          </p>
          <p className="font-mono text-xs font-medium text-slate-800 dark:text-slate-200 tabular-nums">
            {apt.requestId}
          </p>
        </div>
        <div className="space-y-1">
          <p className="text-xs text-slate-500 dark:text-slate-400">Specialist &amp; Suite</p>
          <p className="font-semibold text-slate-900 dark:text-white">
            {doc?.name ?? apt.doctorId}
          </p>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            {doc?.specialty} · {doc?.room}
          </p>
        </div>
        <div className="space-y-1">
          <p className="text-xs text-slate-500 dark:text-slate-400">Scheduled Date &amp; Time</p>
          <p className="font-semibold text-slate-900 dark:text-white tabular-nums">
            {formatClinicDateLabel(apt.date, tz)}
          </p>
          <p className="text-xs font-mono text-slate-600 dark:text-slate-400 tabular-nums">
            {formatTimeInZone(apt.startTime, tz)} – {formatTimeInZone(apt.endTime, tz)} ({tz})
          </p>
        </div>
        <div className="space-y-1">
          <p className="text-xs text-slate-500 dark:text-slate-400">Patient</p>
          <p className="font-medium text-slate-900 dark:text-slate-100">
            {patient?.name ?? apt.patientId} ({patient?.mrn})
          </p>
        </div>
        <div className="space-y-1">
          <p className="text-xs text-slate-500 dark:text-slate-400">Visit Reason</p>
          <p className="font-medium text-slate-900 dark:text-slate-100">{apt.reasonForVisit}</p>
        </div>
      </div>

      {/* Lifecycle Roadmap */}
      <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2">
        <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
          Next Steps in Appointment Lifecycle
        </p>
        <p className="text-xs text-slate-600 dark:text-slate-400">
          <strong>1. Booked</strong> (Current) → <strong>2. Checked In</strong> (Enters live queue
          upon clinic arrival) → <strong>3. In Consultation</strong> → <strong>4. Completed</strong>.
          Confirmed at{' '}
          <span className="font-mono tabular-nums">{formatDateTimeInZone(apt.createdAt, tz)}</span>.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
        <button
          type="button"
          onClick={() => navigateTo('patient-history')}
          className="px-4 py-2.5 text-sm font-semibold text-white bg-sky-600 hover:bg-sky-700 dark:bg-sky-500 dark:hover:bg-sky-400 dark:text-slate-950 rounded-lg transition-colors cursor-pointer"
        >
          View Appointment History
        </button>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigateTo('patient-queue')}
            className="px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-200 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-lg transition-colors cursor-pointer"
          >
            Track Live Queue
          </button>
          <button
            type="button"
            onClick={() => navigateTo('patient-dashboard')}
            className="px-4 py-2.5 text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer"
          >
            Back to Overview
          </button>
        </div>
      </div>
    </section>
  );
}

/**
 * Screen 6: Smart Patient Queue Tracking
 */
export function PatientQueueTrackingView() {
  const { snapshot, activePatientId, liveQueues, navigateTo } = useCareSync();
  const tz = snapshot.policy.clinicTimezone;
  const patient = snapshot.patients[activePatientId] ?? Object.values(snapshot.patients)[0];

  const myWaitingEntries = liveQueues.flatMap((q) =>
    q.waitingEntries
      .filter((w) => w.patientId === patient.patientId)
      .map((entry) => ({ queue: q, entry })),
  );

  const myActiveConsults = liveQueues.filter(
    (q) => q.activeConsultation?.patientId === patient.patientId,
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-slate-900 dark:text-white">
            Live Patient Queue Tracker
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Real-time check-in order and transparent wait-time estimation across outpatient suites.
          </p>
        </div>
      </div>

      {/* Mandatory Non-Guarantee Estimation Notice */}
      <div className="rounded-xl border border-sky-200 dark:border-sky-900/70 bg-sky-50/70 dark:bg-sky-950/30 p-4 flex items-start gap-3 text-xs text-slate-700 dark:text-slate-300">
        <Info className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0 mt-0.5" aria-hidden="true" />
        <div className="space-y-1">
          <p className="font-semibold text-slate-900 dark:text-white">
            Wait-Time Estimate Calculation &amp; Disclaimer
          </p>
          <p>
            <strong>Estimated waiting times are operational estimates, NOT guarantees.</strong>{' '}
            Actual consultation start times vary with clinical complexity. Formula:{' '}
            <code className="font-mono">
              estimatedWait = activeConsultationRemaining + (queuePosition - 1) × doctorAvgConsultMinutes
            </code>
            .
          </p>
        </div>
      </div>

      {/* Active Patient Personal Queue Status */}
      {myActiveConsults.length === 0 && myWaitingEntries.length === 0 ? (
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-base font-display font-semibold text-slate-900 dark:text-white">
              {patient.name} is not currently Checked In to a waiting room queue
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Patients enter the live queue once their BOOKED appointment is marked Checked In by a
              Doctor or Clinic Coordinator (note: Maya Lin and Claire Bennett are pre-checked-in in
              the demo seed).
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigateTo('patient-history')}
            className="px-4 py-2 text-xs font-semibold text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-sky-950/60 rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
          >
            View My Booked Visits
          </button>
        </section>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {myActiveConsults.map((q) => (
            <section
              key={q.doctorId}
              className="bg-white dark:bg-slate-900 border border-emerald-300 dark:border-emerald-800 rounded-2xl p-6 space-y-3"
            >
              <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400 text-xs font-semibold">
                <Stethoscope className="w-4 h-4" />
                <span>Currently In Consultation · {q.room}</span>
              </div>
              <h2 className="text-xl font-display font-bold text-slate-900 dark:text-white">
                {q.doctorName} ({q.specialty})
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-400 tabular-nums">
                Elapsed time: {q.activeConsultation?.elapsedMinutes} min · Estimated remaining: ~
                {q.activeConsultation?.estimatedRemainingMinutes} min
              </p>
            </section>
          ))}

          {myWaitingEntries.map(({ queue, entry }) => (
            <section
              key={entry.appointmentId}
              className="bg-white dark:bg-slate-900 border border-sky-300 dark:border-sky-800 rounded-2xl p-6 space-y-4"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-sky-700 dark:text-sky-400">
                  Your Active Queue Ticket · {entry.room}
                </span>
                <span className="font-mono text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                  {entry.appointmentId}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-4 py-2 border-y border-slate-200 dark:border-slate-800">
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Queue Position</p>
                  <p className="text-3xl font-display font-bold text-slate-900 dark:text-white tabular-nums mt-0.5">
                    #{entry.position}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Estimated Wait (Not Guaranteed)
                  </p>
                  <p className="text-3xl font-display font-bold text-sky-600 dark:text-sky-400 tabular-nums mt-0.5">
                    ~{entry.estimatedWaitMinutes} min
                  </p>
                </div>
              </div>

              <div className="space-y-1 text-xs text-slate-600 dark:text-slate-400">
                <p>
                  <strong className="text-slate-800 dark:text-slate-200">{entry.doctorName}</strong>{' '}
                  · {entry.specialty} · Checked in at{' '}
                  <span className="font-mono tabular-nums">
                    {formatTimeInZone(entry.checkedInAt, tz)}
                  </span>
                </p>
                <p>Calculation breakdown: {entry.formulaExplanation}</p>
              </div>
            </section>
          ))}
        </div>
      )}

      {/* Clinic-Wide Suite Queue Transparency Board (Privacy-Aware Initials for Other Patients) */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-display font-bold text-slate-900 dark:text-white">
              Live Suite Queue Board (Today)
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Updates immediately when patients check in, enter consultation, or complete visits.
            </p>
          </div>
          <Users className="w-5 h-5 text-slate-400" aria-hidden="true" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {liveQueues.map((q) => (
            <div
              key={q.doctorId}
              className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-3"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">
                    {q.doctorName}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {q.specialty} · {q.room} ·{' '}
                    <span className="tabular-nums">{q.avgConsultationMinutes}m avg</span>
                  </p>
                </div>
                <span className="font-mono text-xs text-slate-600 dark:text-slate-400 tabular-nums">
                  {q.waitingEntries.length} waiting
                </span>
              </div>

              <div className="text-xs pt-2 border-t border-slate-200 dark:border-slate-800 space-y-2">
                {q.activeConsultation ? (
                  <p className="text-emerald-700 dark:text-emerald-400 font-medium">
                    In Room:{' '}
                    {q.activeConsultation.patientId === patient.patientId
                      ? `${q.activeConsultation.patientName} (You)`
                      : `Ticket ${q.activeConsultation.appointmentId}`}{' '}
                    · ~{q.activeConsultation.estimatedRemainingMinutes}m est. remaining
                  </p>
                ) : (
                  <p className="text-slate-500 dark:text-slate-400">
                    Room available for next checked-in patient
                  </p>
                )}

                {q.waitingEntries.length > 0 && (
                  <div className="space-y-1.5 pt-1">
                    {q.waitingEntries.map((entry) => {
                      const isMe = entry.patientId === patient.patientId;
                      return (
                        <div
                          key={entry.appointmentId}
                          className={`flex items-center justify-between py-1 px-2 rounded-md ${
                            isMe
                              ? 'bg-sky-50 dark:bg-sky-950/60 font-semibold text-sky-900 dark:text-sky-200'
                              : 'text-slate-600 dark:text-slate-400'
                          }`}
                        >
                          <span className="tabular-nums">
                            #{entry.position} ·{' '}
                            {isMe ? `${entry.patientName} (You)` : `Ticket ${entry.appointmentId}`}
                          </span>
                          <span className="font-mono tabular-nums">
                            <Clock className="w-3 h-3 inline mr-1 -mt-0.5" />~
                            {entry.estimatedWaitMinutes}m est.
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
