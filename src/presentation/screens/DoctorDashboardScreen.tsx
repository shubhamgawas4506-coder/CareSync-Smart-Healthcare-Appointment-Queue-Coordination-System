/**
 * Screen 7: Doctor Dashboard — Clinical Schedule & Lifecycle Workstation
 *
 * Tailored split-pane physician interface (distinct from patient & coordinator layouts):
 * - Left pane: Active Consultation banner, Checked-In Waiting Queue, and Chronological Daily Roster
 * - Right pane: Selected Patient Appointment Dossier, State-Machine Transition Controls
 *   (Check In, Start Consultation, Complete, Cancel with Clinical Reason), policy rule visibility,
 *   and per-appointment immutable audit trail.
 */

import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Play,
  Stethoscope,
  UserCheck,
  XCircle,
} from 'lucide-react';
import { AppointmentStatus, UserRole } from '../../domain/models';
import { getAllowedNextStatuses } from '../../domain/stateMachine';
import {
  addClinicDays,
  formatClinicDateLabel,
  formatDateInZone,
  formatDateTimeInZone,
  formatTimeInZone,
  formatTimeRangeInZone,
} from '../../domain/timeUtils';
import { DoctorAvatar } from '../assets';
import { useCareSync } from '../CareSyncContext';
import {
  AppointmentStatusIndicator,
  formatEventLabel,
  PrototypeRoleDisclaimerBanner,
} from '../components/StatusPrimitives';

export function DoctorDashboardScreen() {
  const {
    snapshot,
    activeDoctorId,
    setActiveDoctorId,
    liveQueues,
    transitionStatus,
    navigateTo,
    selectRoleAndEnter,
    theme,
    toggleTheme,
  } = useCareSync();

  const tz = snapshot.policy.clinicTimezone;
  const todayStr = formatDateInZone(Date.now(), tz);
  const dateOptions = useMemo(
    () => [addClinicDays(todayStr, -1), todayStr, addClinicDays(todayStr, 1), addClinicDays(todayStr, 2)],
    [todayStr],
  );

  const [selectedDate, setSelectedDate] = useState<string>(todayStr);
  const [selectedAppointmentId, setSelectedAppointmentId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState<string>('');
  const [showCancelForm, setShowCancelForm] = useState<boolean>(false);
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'COMPLETED'>('ALL');

  const doctor = snapshot.doctors[activeDoctorId] ?? Object.values(snapshot.doctors)[0];
  const doctors = Object.values(snapshot.doctors);

  const doctorQueue = liveQueues.find((q) => q.doctorId === doctor.doctorId);

  const dayAppointments = useMemo(() => {
    return Object.values(snapshot.appointments)
      .filter((apt) => {
        if (apt.doctorId !== doctor.doctorId || apt.date !== selectedDate) return false;
        if (statusFilter === 'ACTIVE') {
          return (
            apt.status === AppointmentStatus.BOOKED ||
            apt.status === AppointmentStatus.CHECKED_IN ||
            apt.status === AppointmentStatus.IN_CONSULTATION
          );
        }
        if (statusFilter === 'COMPLETED') {
          return (
            apt.status === AppointmentStatus.COMPLETED ||
            apt.status === AppointmentStatus.CANCELLED ||
            apt.status === AppointmentStatus.RESCHEDULED
          );
        }
        return true;
      })
      .sort((a, b) => a.startTime - b.startTime);
  }, [doctor.doctorId, selectedDate, snapshot.appointments, statusFilter]);

  const activeAppointment = useMemo(() => {
    if (selectedAppointmentId && snapshot.appointments[selectedAppointmentId]) {
      const candidate = snapshot.appointments[selectedAppointmentId];
      if (candidate.doctorId === doctor.doctorId) {
        return candidate;
      }
    }
    // Prefer IN_CONSULTATION, then first CHECKED_IN, then first in list
    const inConsult = dayAppointments.find((a) => a.status === AppointmentStatus.IN_CONSULTATION);
    if (inConsult) return inConsult;
    const checkedIn = dayAppointments.find((a) => a.status === AppointmentStatus.CHECKED_IN);
    if (checkedIn) return checkedIn;
    return dayAppointments[0] ?? null;
  }, [dayAppointments, doctor.doctorId, selectedAppointmentId, snapshot.appointments]);

  const allowedTransitions = useMemo(() => {
    if (!activeAppointment) return [];
    return getAllowedNextStatuses(activeAppointment.status, snapshot.policy);
  }, [activeAppointment, snapshot.policy]);

  const appointmentEvents = useMemo(() => {
    if (!activeAppointment) return [];
    return snapshot.events
      .filter((e) => e.appointmentId === activeAppointment.appointmentId)
      .sort((a, b) => b.timestamp - a.timestamp);
  }, [activeAppointment, snapshot.events]);

  const handleTransition = (targetStatus: AppointmentStatus, customReason?: string) => {
    if (!activeAppointment) return;
    const res = transitionStatus({
      appointmentId: activeAppointment.appointmentId,
      targetStatus,
      actorId: doctor.doctorId,
      actorRole: UserRole.DOCTOR,
      reason: customReason,
    });
    if (res && targetStatus === AppointmentStatus.CANCELLED) {
      setCancelReason('');
      setShowCancelForm(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col">
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="flex items-center justify-between gap-8 px-6 lg:px-10 py-4 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
        <button
          type="button"
          onClick={() => navigateTo('welcome')}
          className="text-lg font-display font-bold tracking-tight text-slate-900 dark:text-white whitespace-nowrap shrink-0 cursor-pointer"
        >
          CareSync
        </button>

        <nav
          aria-label="Physician navigation"
          className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-600 dark:text-slate-300"
        >
          <button
            type="button"
            onClick={() => navigateTo('doctor-dashboard')}
            className="text-sky-600 dark:text-sky-400 underline underline-offset-4 whitespace-nowrap shrink-0 cursor-pointer"
          >
            Clinical Schedule
          </button>
          <button
            type="button"
            onClick={() => selectRoleAndEnter(UserRole.PATIENT, undefined, 'patient-dashboard')}
            className="hover:text-slate-900 dark:hover:text-white hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Patient View
          </button>
          <button
            type="button"
            onClick={() =>
              selectRoleAndEnter(UserRole.COORDINATOR, undefined, 'coordinator-dashboard')
            }
            className="hover:text-slate-900 dark:hover:text-white hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Coordinator Ops
          </button>
          <button
            type="button"
            onClick={() => selectRoleAndEnter(UserRole.COORDINATOR, undefined, 'diagnostics-audit')}
            className="hover:text-slate-900 dark:hover:text-white hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Audit Logs
          </button>
          <button
            type="button"
            onClick={toggleTheme}
            className="hover:text-slate-900 dark:hover:text-white hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {theme === 'light' ? 'Dark Theme' : 'Light Theme'}
          </button>
        </nav>

        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={() => navigateTo('welcome')}
            className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Switch Role
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-6 lg:px-10 py-6 lg:py-8 space-y-6">
        <PrototypeRoleDisclaimerBanner extraNote={`Physician Console · ${doctor.room}`} />

        {/* Physician Context & Date Toolbar */}
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div className="flex items-center gap-4">
            <DoctorAvatar avatarKey={doctor.avatarUrl} name={doctor.name} size="md" />
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <label htmlFor="doctor-console-selector" className="sr-only">
                  Select Active Physician
                </label>
                <select
                  id="doctor-console-selector"
                  value={doctor.doctorId}
                  onChange={(e) => {
                    setActiveDoctorId(e.target.value);
                    setSelectedAppointmentId(null);
                  }}
                  className="text-lg font-display font-bold bg-transparent text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1 focus:outline-none focus:ring-2 focus:ring-sky-500"
                >
                  {doctors.map((d) => (
                    <option key={d.doctorId} value={d.doctorId} className="bg-white dark:bg-slate-900">
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                {doctor.specialty} <span aria-hidden="true">·</span> {doctor.room}{' '}
                <span aria-hidden="true">·</span>{' '}
                <span className="tabular-nums">Avg consult {doctor.avgConsultationMinutes} min</span>
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {dateOptions.map((dStr) => {
              const isSelected = dStr === selectedDate;
              const isToday = dStr === todayStr;
              return (
                <button
                  key={dStr}
                  type="button"
                  onClick={() => {
                    setSelectedDate(dStr);
                    setSelectedAppointmentId(null);
                  }}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    isSelected
                      ? 'bg-sky-600 text-white dark:bg-sky-500 dark:text-slate-950'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  {isToday ? `Today (${dStr.slice(5)})` : formatClinicDateLabel(dStr, tz)}
                </button>
              );
            })}
          </div>
        </section>

        {/* Split-Pane Clinical Workstation */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column: Live Queue Summary + Daily Roster */}
          <section className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h1 className="text-base font-display font-bold text-slate-900 dark:text-white">
                  Daily Patient Roster
                </h1>
                <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                  {formatClinicDateLabel(selectedDate, tz)} · {dayAppointments.length} appointment(s)
                </p>
              </div>

              <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
                {(['ALL', 'ACTIVE', 'COMPLETED'] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setStatusFilter(f)}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                      statusFilter === f
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    {f === 'ALL' ? 'All' : f === 'ACTIVE' ? 'Active' : 'Closed'}
                  </button>
                ))}
              </div>
            </div>

            {/* Live Waiting Queue Snapshot for Today */}
            {selectedDate === todayStr && doctorQueue && (
              <div className="rounded-xl bg-slate-50 dark:bg-slate-950/80 p-4 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    Live Waiting Queue ({doctor.room})
                  </span>
                  <span className="font-mono tabular-nums text-slate-600 dark:text-slate-400">
                    {doctorQueue.waitingEntries.length} Checked In
                  </span>
                </div>
                {doctorQueue.activeConsultation ? (
                  <p className="text-xs text-emerald-700 dark:text-emerald-300">
                    In Consultation: <strong>{doctorQueue.activeConsultation.patientName}</strong>{' '}
                    <span className="tabular-nums">
                      ({doctorQueue.activeConsultation.elapsedMinutes}m elapsed)
                    </span>
                  </p>
                ) : (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    No active consultation currently in room.
                  </p>
                )}
              </div>
            )}

            {dayAppointments.length === 0 ? (
              <div className="py-10 text-center space-y-2">
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  No appointments match this filter on {selectedDate}.
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Switch clinic dates above or reset the status filter to view scheduled visits.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-200 dark:divide-slate-800">
                {dayAppointments.map((apt) => {
                  const pat = snapshot.patients[apt.patientId];
                  const isSelected = activeAppointment?.appointmentId === apt.appointmentId;
                  const queueEntry = doctorQueue?.waitingEntries.find(
                    (q) => q.appointmentId === apt.appointmentId,
                  );

                  return (
                    <button
                      key={apt.appointmentId}
                      type="button"
                      onClick={() => {
                        setSelectedAppointmentId(apt.appointmentId);
                        setShowCancelForm(false);
                      }}
                      className={`w-full text-left py-3.5 px-3 -mx-3 rounded-xl transition-colors flex items-start justify-between gap-3 cursor-pointer ${
                        isSelected
                          ? 'bg-sky-50/90 dark:bg-sky-950/40'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                      }`}
                    >
                      <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-2 text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                          <span>{formatTimeInZone(apt.startTime, tz)}</span>
                          <span aria-hidden="true">·</span>
                          <span>{apt.appointmentId}</span>
                          {queueEntry && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="font-sans font-semibold text-amber-700 dark:text-amber-300">
                                Queue #{queueEntry.position}
                              </span>
                            </>
                          )}
                        </div>
                        <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                          {pat?.name ?? apt.patientId}
                        </p>
                        <p className="text-xs text-slate-600 dark:text-slate-400 truncate">
                          {apt.reasonForVisit}
                        </p>
                      </div>
                      <div className="shrink-0 pt-0.5">
                        <AppointmentStatusIndicator status={apt.status} />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          {/* Right Column: Selected Patient Dossier & State Machine Transitions */}
          <section className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 lg:p-7 space-y-6">
            {!activeAppointment ? (
              <div className="py-16 text-center space-y-2">
                <Stethoscope className="w-8 h-8 text-slate-400 mx-auto" />
                <h2 className="text-base font-display font-semibold text-slate-800 dark:text-slate-200">
                  Select an Appointment from the Roster
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                  Choose any scheduled visit on the left to inspect patient details, execute
                  lifecycle transitions, or review its audit history.
                </p>
              </div>
            ) : (
              <>
                {(() => {
                  const pat = snapshot.patients[activeAppointment.patientId];
                  const canCheckIn = allowedTransitions.includes(AppointmentStatus.CHECKED_IN);
                  const canStartConsult = allowedTransitions.includes(
                    AppointmentStatus.IN_CONSULTATION,
                  );
                  const canComplete = allowedTransitions.includes(AppointmentStatus.COMPLETED);
                  const canCancel = allowedTransitions.includes(AppointmentStatus.CANCELLED);

                  return (
                    <>
                      {/* Patient & Appointment Header */}
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-5 border-b border-slate-200 dark:border-slate-800">
                        <div className="space-y-1.5">
                          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                            <span>{activeAppointment.appointmentId}</span>
                            <span aria-hidden="true">·</span>
                            <span>Req: {activeAppointment.requestId}</span>
                            {pat && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span>{pat.mrn}</span>
                              </>
                            )}
                          </div>
                          <h2 className="text-2xl font-display font-bold text-slate-900 dark:text-white">
                            {pat?.name ?? activeAppointment.patientId}
                          </h2>
                          <p className="text-xs text-slate-600 dark:text-slate-400">
                            {pat?.contact} {pat?.dateOfBirth ? `· DOB ${pat.dateOfBirth}` : ''}
                          </p>
                        </div>

                        <div className="flex flex-col sm:items-end gap-1">
                          <AppointmentStatusIndicator status={activeAppointment.status} />
                          <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                            {formatTimeRangeInZone(
                              activeAppointment.startTime,
                              activeAppointment.endTime,
                              tz,
                            )}
                          </span>
                        </div>
                      </div>

                      {/* Visit Reason & Clinical Coordination Context */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                        <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950/80">
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            Stated Reason for Visit
                          </p>
                          <p className="font-medium text-slate-900 dark:text-slate-100 mt-1">
                            {activeAppointment.reasonForVisit}
                          </p>
                        </div>
                        <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950/80">
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            Slot &amp; Policy Rule Status
                          </p>
                          <p className="font-mono text-xs text-slate-800 dark:text-slate-200 mt-1 tabular-nums">
                            Slot: {activeAppointment.slotId}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                            Checked-In Cancel Rule:{' '}
                            <strong className="text-slate-700 dark:text-slate-300">
                              {snapshot.policy.allowCheckedInCancellation
                                ? 'Allowed by Coordinator'
                                : 'Blocked after Check-In'}
                            </strong>
                          </p>
                        </div>
                      </div>

                      {activeAppointment.cancelReason && (
                        <div className="p-4 rounded-xl bg-rose-50/70 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/60 text-xs text-rose-800 dark:text-rose-200">
                          <strong>Cancellation Reason:</strong> {activeAppointment.cancelReason}
                        </div>
                      )}

                      {/* State Machine Action Controls */}
                      <div className="space-y-3 pt-1">
                        <div className="flex items-center justify-between">
                          <h3 className="text-sm font-display font-semibold text-slate-900 dark:text-white">
                            Lifecycle State Transitions
                          </h3>
                          <span className="text-xs text-slate-500 dark:text-slate-400">
                            Booked → Checked In → In Consultation → Completed
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-3">
                          <button
                            type="button"
                            disabled={!canCheckIn}
                            onClick={() => handleTransition(AppointmentStatus.CHECKED_IN)}
                            className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                              canCheckIn
                                ? 'bg-amber-600 hover:bg-amber-700 text-white'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-600 cursor-not-allowed'
                            }`}
                          >
                            <UserCheck className="w-4 h-4" aria-hidden="true" />
                            <span>Mark Checked In</span>
                          </button>

                          <button
                            type="button"
                            disabled={!canStartConsult}
                            onClick={() => handleTransition(AppointmentStatus.IN_CONSULTATION)}
                            className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                              canStartConsult
                                ? 'bg-sky-600 hover:bg-sky-700 dark:bg-sky-500 dark:hover:bg-sky-400 text-white dark:text-slate-950'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-600 cursor-not-allowed'
                            }`}
                          >
                            <Play className="w-4 h-4" aria-hidden="true" />
                            <span>Start Consultation</span>
                          </button>

                          <button
                            type="button"
                            disabled={!canComplete}
                            onClick={() => handleTransition(AppointmentStatus.COMPLETED)}
                            className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                              canComplete
                                ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-600 cursor-not-allowed'
                            }`}
                          >
                            <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                            <span>Mark Completed</span>
                          </button>

                          <button
                            type="button"
                            disabled={!canCancel}
                            onClick={() => setShowCancelForm((prev) => !prev)}
                            className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                              canCancel
                                ? 'border border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/40'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-600 cursor-not-allowed'
                            }`}
                          >
                            <XCircle className="w-4 h-4" aria-hidden="true" />
                            <span>Cancel Appointment</span>
                          </button>
                        </div>

                        {activeAppointment.status === AppointmentStatus.CHECKED_IN &&
                          !snapshot.policy.allowCheckedInCancellation && (
                            <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                              <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                              <span>
                                Cancellation is disabled for Checked-In patients under current clinic
                                policy. Coordinators can toggle this rule in Coordinator Command.
                              </span>
                            </p>
                          )}

                        {showCancelForm && canCancel && (
                          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-3">
                            <label
                              htmlFor="doctor-cancel-reason"
                              className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                            >
                              Clinical / Operational Cancellation Reason (Required — releases slot to Available)
                            </label>
                            <input
                              id="doctor-cancel-reason"
                              type="text"
                              value={cancelReason}
                              onChange={(e) => setCancelReason(e.target.value)}
                              placeholder="e.g., Physician called to urgent inpatient consult; reschedule patient"
                              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
                            />
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() =>
                                  handleTransition(AppointmentStatus.CANCELLED, cancelReason)
                                }
                                className="px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg cursor-pointer"
                              >
                                Confirm Cancellation &amp; Release Slot
                              </button>
                              <button
                                type="button"
                                onClick={() => setShowCancelForm(false)}
                                className="px-3 py-2 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                              >
                                Keep Appointment
                              </button>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Appointment Transition Audit History */}
                      <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
                        <h3 className="text-sm font-display font-semibold text-slate-900 dark:text-white">
                          Appointment Transition History
                        </h3>
                        {appointmentEvents.length === 0 ? (
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            No recorded events for this appointment yet.
                          </p>
                        ) : (
                          <div className="divide-y divide-slate-200 dark:divide-slate-800">
                            {appointmentEvents.map((evt) => {
                              const meta = formatEventLabel(evt.eventType);
                              return (
                                <div
                                  key={evt.eventId}
                                  className="py-2.5 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs"
                                >
                                  <div>
                                    <span className={`font-semibold ${meta.toneClass}`}>
                                      {meta.label}
                                    </span>{' '}
                                    <span className="text-slate-500 dark:text-slate-400">
                                      by <span className="font-mono">{evt.actorId}</span> ({evt.actorRole})
                                    </span>
                                    <p className="text-slate-600 dark:text-slate-400 mt-0.5">
                                      {evt.reason}
                                    </p>
                                  </div>
                                  <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400 tabular-nums shrink-0">
                                    {formatDateTimeInZone(evt.timestamp, tz)}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </>
                  );
                })()}
              </>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
