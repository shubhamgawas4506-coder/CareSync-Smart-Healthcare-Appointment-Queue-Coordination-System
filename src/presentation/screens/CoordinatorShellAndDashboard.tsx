/**
 * Coordinator Workspace Shell & Screen 8: Coordinator Dashboard
 *
 * Implements the SaaS sidebar layout (256px sidebar + contextual breadcrumb bar +
 * single-elevation operational panels), including:
 * - Interactive Section 8 Failure, Recovery & Conflict Demonstration Lab
 * - Multi-Doctor Live Queue Supervision
 * - Specialist Availability, Slot Creation & Block/Unblock Controls
 * - Configurable Clinic Rule (`allowCheckedInCancellation`)
 */

import React, { useMemo, useState } from 'react';
import {
  Activity,
  Ban,
  CalendarCog,
  CheckCircle2,
  ClipboardList,
  FileSearch,
  LayoutDashboard,
  Moon,
  Plus,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  Sun,
  Users,
  WifiOff,
} from 'lucide-react';
import {
  AppointmentStatus,
  SlotAvailabilityStatus,
  UserRole,
} from '../../domain/models';
import {
  addClinicDays,
  buildEpochFromClinicDateAndTime,
  formatClinicDateLabel,
  formatDateInZone,
  formatTimeInZone,
} from '../../domain/timeUtils';
import { ScreenId, useCareSync } from '../CareSyncContext';
import {
  BookingStateIndicator,
  PrototypeRoleDisclaimerBanner,
  SlotStatusIndicator,
} from '../components/StatusPrimitives';

export function CoordinatorWorkspaceShell({ children }: { children: React.ReactNode }) {
  const {
    snapshot,
    activeScreen,
    navigateTo,
    selectRoleAndEnter,
    theme,
    toggleTheme,
    resetDemoData,
    interruptedRequests,
  } = useCareSync();

  const navLinks: { screen: ScreenId; label: string; icon: React.ReactNode }[] = [
    {
      screen: 'coordinator-dashboard',
      label: 'Operations & Lab',
      icon: <LayoutDashboard className="w-4 h-4 shrink-0" aria-hidden="true" />,
    },
    {
      screen: 'coordinator-appointments',
      label: 'All Appointments',
      icon: <ClipboardList className="w-4 h-4 shrink-0" aria-hidden="true" />,
    },
    {
      screen: 'diagnostics-audit',
      label: 'Audit & Diagnostics',
      icon: <FileSearch className="w-4 h-4 shrink-0" aria-hidden="true" />,
    },
  ];

  const breadcrumbLabel =
    activeScreen === 'coordinator-dashboard'
      ? 'Operations, Queue & Resilience Lab'
      : activeScreen === 'coordinator-appointments'
        ? 'Clinic Appointment Ledger'
        : 'Audit Trail & System Diagnostics';

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex">
      {/* Desktop Sidebar (256px) */}
      <aside className="hidden lg:flex w-64 shrink-0 flex-col justify-between bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 p-5">
        <div className="space-y-6">
          <div className="px-2">
            <button
              type="button"
              onClick={() => navigateTo('welcome')}
              className="text-lg font-display font-bold tracking-tight text-slate-900 dark:text-white cursor-pointer"
            >
              CareSync
            </button>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Coordinator Command
            </p>
          </div>

          <nav aria-label="Coordinator views" className="space-y-1">
            {navLinks.map((item) => {
              const active = activeScreen === item.screen;
              return (
                <button
                  key={item.screen}
                  type="button"
                  onClick={() => navigateTo(item.screen)}
                  className={`w-full flex items-center justify-between px-3 py-2 text-sm font-medium rounded-lg transition-colors cursor-pointer ${
                    active
                      ? 'bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <span className="flex items-center gap-2.5 whitespace-nowrap">{item.icon} {item.label}</span>
                  {item.screen === 'diagnostics-audit' && interruptedRequests.length > 0 && (
                    <span className="font-mono text-xs text-amber-600 dark:text-amber-400 tabular-nums">
                      {interruptedRequests.length}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          <div className="pt-5 border-t border-slate-200 dark:border-slate-800 space-y-1">
            <p className="px-3 text-[11px] font-medium text-slate-400 dark:text-slate-500 mb-1.5">
              Demo Role Switcher
            </p>
            <button
              type="button"
              onClick={() => selectRoleAndEnter(UserRole.PATIENT, undefined, 'patient-dashboard')}
              className="w-full text-left px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg cursor-pointer"
            >
              Patient Portal
            </button>
            <button
              type="button"
              onClick={() => selectRoleAndEnter(UserRole.DOCTOR, undefined, 'doctor-dashboard')}
              className="w-full text-left px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg cursor-pointer"
            >
              Doctor Workstation
            </button>
            <button
              type="button"
              onClick={() => navigateTo('welcome')}
              className="w-full text-left px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg cursor-pointer"
            >
              Welcome &amp; Roles
            </button>
          </div>
        </div>

        <div className="space-y-2 pt-4 border-t border-slate-200 dark:border-slate-800 text-xs">
          <div className="px-2 pb-1">
            <p className="font-semibold text-slate-800 dark:text-slate-200">Nadia Okafor</p>
            <p className="text-slate-500 dark:text-slate-400">Lead Clinic Coordinator</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
              className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              {theme === 'light' ? <Moon className="w-3.5 h-3.5" /> : <Sun className="w-3.5 h-3.5" />}
              <span>{theme === 'light' ? 'Dark' : 'Light'}</span>
            </button>
            <button
              type="button"
              onClick={resetDemoData}
              className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Column */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Contextual Breadcrumb Header (SaaS Top Bar Contract) */}
        <header className="flex items-center justify-between gap-6 px-6 lg:px-8 py-4 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2 text-sm min-w-0">
            <button
              type="button"
              onClick={() => navigateTo('welcome')}
              className="font-display font-bold text-slate-900 dark:text-white lg:font-medium lg:text-slate-500 lg:dark:text-slate-400 hover:underline whitespace-nowrap cursor-pointer"
            >
              CareSync
            </button>
            <span className="text-slate-400" aria-hidden="true">
              /
            </span>
            <span className="font-semibold text-slate-900 dark:text-white truncate">
              {breadcrumbLabel}
            </span>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => navigateTo('diagnostics-audit')}
              className="px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
            >
              Audit Events ({snapshot.events.length})
            </button>
          </div>
        </header>

        {/* Mobile Nav Strip */}
        <div className="flex lg:hidden items-center gap-1.5 px-6 py-2.5 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 overflow-x-auto">
          {navLinks.map((item) => (
            <button
              key={item.screen}
              type="button"
              onClick={() => navigateTo(item.screen)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap shrink-0 cursor-pointer ${
                activeScreen === item.screen
                  ? 'bg-sky-600 text-white dark:bg-sky-500 dark:text-slate-950'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
              }`}
            >
              {item.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => navigateTo('welcome')}
            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 whitespace-nowrap shrink-0 cursor-pointer"
          >
            Switch Role
          </button>
        </div>

        <main className="flex-1 p-6 lg:p-8 max-w-7xl w-full mx-auto space-y-6">
          <PrototypeRoleDisclaimerBanner
            extraNote={`Coordinator: Nadia Okafor · Timezone ${snapshot.policy.clinicTimezone}`}
          />
          {children}
        </main>
      </div>
    </div>
  );
}

/**
 * Screen 8: Coordinator Dashboard
 */
export function CoordinatorDashboardView() {
  const {
    snapshot,
    liveQueues,
    interruptedRequests,
    generateRequestId,
    submitBooking,
    retryInterruptedRequest,
    transitionStatus,
    setSlotAvailability,
    createDoctorSlot,
    updateClinicPolicy,
    navigateTo,
  } = useCareSync();

  const tz = snapshot.policy.clinicTimezone;
  const nowMs = Date.now();
  const todayStr = formatDateInZone(nowMs, tz);
  const doctors = Object.values(snapshot.doctors);

  // Slot Management State
  const [managedDoctorId, setManagedDoctorId] = useState<string>(doctors[0]?.doctorId ?? 'doc_sarah_jenkins');
  const managedDates = useMemo(() => {
    return Array.from(
      new Set<string>(
        Object.values(snapshot.timeSlots)
          .filter((s) => s.doctorId === managedDoctorId)
          .map((s) => s.date),
      ),
    ).sort();
  }, [managedDoctorId, snapshot.timeSlots]);

  const [managedDate, setManagedDate] = useState<string>(() => addClinicDays(todayStr, 1));
  const activeManagedDate = managedDates.includes(managedDate)
    ? managedDate
    : managedDates[0] ?? todayStr;

  const [newSlotTime, setNewSlotTime] = useState<string>('16:30');

  // Dedicated Section 8 Failure, Recovery & Conflict Demonstration Lab State
  const [labRequestId, setLabRequestId] = useState<string | null>(null);
  const [labTargetSlotId, setLabTargetSlotId] = useState<string | null>(null);
  const [labConflictResult, setLabConflictResult] = useState<string | null>(null);

  const labRecord = labRequestId ? snapshot.bookingRequests[labRequestId] : null;
  const labConfirmedApt = labRecord?.outcomeAppointmentId
    ? snapshot.appointments[labRecord.outcomeAppointmentId]
    : null;

  const nextOpenDemoSlot = useMemo(() => {
    const mayaActiveApts = Object.values(snapshot.appointments).filter(
      (a) =>
        a.patientId === 'pat_maya_lin' &&
        (a.status === AppointmentStatus.BOOKED ||
          a.status === AppointmentStatus.CHECKED_IN ||
          a.status === AppointmentStatus.IN_CONSULTATION),
    );
    return Object.values(snapshot.timeSlots)
      .filter((s) => {
        if (s.availabilityStatus !== SlotAvailabilityStatus.AVAILABLE || s.startTime <= nowMs) {
          return false;
        }
        const overlapsMaya = mayaActiveApts.some(
          (apt) => apt.startTime < s.endTime && s.startTime < apt.endTime,
        );
        return !overlapsMaya;
      })
      .sort((a, b) => a.startTime - b.startTime)[0];
  }, [nowMs, snapshot.appointments, snapshot.timeSlots]);

  const handleLabStep1InitiateInterrupted = () => {
    if (!nextOpenDemoSlot) return;
    const reqId = generateRequestId();
    setLabRequestId(reqId);
    setLabTargetSlotId(nextOpenDemoSlot.slotId);
    setLabConflictResult(null);

    submitBooking({
      requestId: reqId,
      patientId: 'pat_maya_lin',
      doctorId: nextOpenDemoSlot.doctorId,
      slotId: nextOpenDemoSlot.slotId,
      reasonForVisit: 'Walkthrough Demo: Preventive Consultation (Simulated Drop)',
      actorId: 'pat_maya_lin',
      actorRole: UserRole.PATIENT,
      simulateNetworkFailure: true,
    });
  };

  const handleLabStep2RetrySameRequestId = () => {
    if (!labRequestId) return;
    retryInterruptedRequest(labRequestId);
  };

  const handleLabStep3VerifyDuplicatePrevention = () => {
    if (!labRequestId || !labRecord) return;
    // Replay exact same requestId even after confirmation!
    submitBooking({
      requestId: labRequestId,
      patientId: labRecord.patientId,
      doctorId: labRecord.doctorId,
      slotId: labRecord.slotId,
      reasonForVisit: labRecord.reasonForVisit,
      actorId: labRecord.patientId,
      actorRole: UserRole.PATIENT,
      simulateNetworkFailure: false,
    });
  };

  const handleLabStep4SecondPatientConflict = () => {
    const slotIdToContest = labTargetSlotId ?? labConfirmedApt?.slotId;
    if (!slotIdToContest) return;
    const slot = snapshot.timeSlots[slotIdToContest];
    if (!slot) return;

    const res = submitBooking({
      requestId: generateRequestId(),
      patientId: 'pat_rohan_patel',
      doctorId: slot.doctorId,
      slotId: slot.slotId,
      reasonForVisit: 'Second patient attempting same slot',
      actorId: 'pat_rohan_patel',
      actorRole: UserRole.PATIENT,
      simulateNetworkFailure: false,
    });

    if (res.outcome === 'REJECTED') {
      setLabConflictResult(
        `Rejected (${res.errorCode}): ${res.message} — Audit event SLOT_CONFLICT_DETECTED appended.`,
      );
    }
  };

  const handleAddDoctorSlot = (e: React.FormEvent) => {
    e.preventDefault();
    const startEpoch = buildEpochFromClinicDateAndTime(activeManagedDate, newSlotTime, tz);
    const endEpoch = startEpoch + 30 * 60_000;
    createDoctorSlot({
      doctorId: managedDoctorId,
      startTime: startEpoch,
      endTime: endEpoch,
    });
  };

  // Metrics
  const allApts = Object.values(snapshot.appointments);
  const totalOpenSlots = Object.values(snapshot.timeSlots).filter(
    (s) => s.availabilityStatus === SlotAvailabilityStatus.AVAILABLE && s.startTime > nowMs,
  ).length;
  const totalWaiting = liveQueues.reduce((sum, q) => sum + q.waitingEntries.length, 0);
  const totalInConsult = liveQueues.filter((q) => q.activeConsultation !== null).length;
  const conflictEventCount = snapshot.events.filter(
    (e) => e.eventType === 'SLOT_CONFLICT_DETECTED',
  ).length;

  const managedSlots = Object.values(snapshot.timeSlots)
    .filter((s) => s.doctorId === managedDoctorId && s.date === activeManagedDate)
    .sort((a, b) => a.startTime - b.startTime);

  return (
    <div className="space-y-8">
      {/* Operational KPI Strip */}
      <section className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">Active Consultations</p>
          <p className="text-2xl font-display font-bold text-slate-900 dark:text-white tabular-nums mt-1">
            {totalInConsult}
          </p>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">Waiting in Live Queue</p>
          <p className="text-2xl font-display font-bold text-slate-900 dark:text-white tabular-nums mt-1">
            {totalWaiting}
          </p>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">Total Appointments</p>
          <p className="text-2xl font-display font-bold text-slate-900 dark:text-white tabular-nums mt-1">
            {allApts.length}
          </p>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">Open Future Slots</p>
          <p className="text-2xl font-display font-bold text-emerald-700 dark:text-emerald-400 tabular-nums mt-1">
            {totalOpenSlots}
          </p>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 col-span-2 lg:col-span-1">
          <p className="text-xs text-slate-500 dark:text-slate-400">Conflicts Prevented</p>
          <p className="text-2xl font-display font-bold text-rose-700 dark:text-rose-400 tabular-nums mt-1">
            {conflictEventCount}
          </p>
        </div>
      </section>

      {/* Section 8: Dedicated Failure, Idempotent Retry & Slot-Conflict Walkthrough Lab */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-display font-bold text-slate-900 dark:text-white">
              Failure, Idempotent Retry &amp; Slot-Conflict Demonstration Lab
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 max-w-3xl">
              Execute the architecture verification scenario step-by-step against the real
              coordination engine: initiate a booking with a simulated network drop, inspect the
              uncertain state, retry using the preserved <code className="font-mono text-xs">requestId</code>,
              verify strictly 1 appointment exists, and test a conflicting second-patient booking.
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigateTo('diagnostics-audit')}
            className="px-3.5 py-2 text-xs font-medium text-sky-700 dark:text-sky-300 bg-sky-50 hover:bg-sky-100 dark:bg-sky-950/60 rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
          >
            Inspect Audit Ledger →
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <button
            type="button"
            disabled={!nextOpenDemoSlot}
            onClick={handleLabStep1InitiateInterrupted}
            className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-amber-400 text-left space-y-1.5 transition-colors cursor-pointer bg-slate-50/70 dark:bg-slate-950"
          >
            <div className="flex items-center justify-between text-xs font-semibold text-amber-700 dark:text-amber-400">
              <span>Step 1 · Network Drop</span>
              <WifiOff className="w-3.5 h-3.5" />
            </div>
            <p className="text-xs font-semibold text-slate-900 dark:text-white">
              Submit Booking (Simulate Drop)
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Maya Lin submits booking; network fails mid-flight → state becomes Uncertain.
            </p>
          </button>

          <button
            type="button"
            disabled={!labRecord || labRecord.state !== 'UNCERTAIN_INTERRUPTED'}
            onClick={handleLabStep2RetrySameRequestId}
            className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-sky-400 disabled:opacity-45 text-left space-y-1.5 transition-colors cursor-pointer bg-slate-50/70 dark:bg-slate-950"
          >
            <div className="flex items-center justify-between text-xs font-semibold text-sky-700 dark:text-sky-400">
              <span>Step 2 · Safe Retry</span>
              <RefreshCw className="w-3.5 h-3.5" />
            </div>
            <p className="text-xs font-semibold text-slate-900 dark:text-white">
              Retry Preserved Request ID
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Reconciles existing operation and confirms single appointment atomically.
            </p>
          </button>

          <button
            type="button"
            disabled={!labConfirmedApt}
            onClick={handleLabStep3VerifyDuplicatePrevention}
            className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-emerald-400 disabled:opacity-45 text-left space-y-1.5 transition-colors cursor-pointer bg-slate-50/70 dark:bg-slate-950"
          >
            <div className="flex items-center justify-between text-xs font-semibold text-emerald-700 dark:text-emerald-400">
              <span>Step 3 · Replay Guard</span>
              <CheckCircle2 className="w-3.5 h-3.5" />
            </div>
            <p className="text-xs font-semibold text-slate-900 dark:text-white">
              Replay Same Request Again
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Proves duplicate retries return existing appointment with zero duplicates.
            </p>
          </button>

          <button
            type="button"
            disabled={!labConfirmedApt}
            onClick={handleLabStep4SecondPatientConflict}
            className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-rose-400 disabled:opacity-45 text-left space-y-1.5 transition-colors cursor-pointer bg-slate-50/70 dark:bg-slate-950"
          >
            <div className="flex items-center justify-between text-xs font-semibold text-rose-700 dark:text-rose-400">
              <span>Step 4 · Conflict Check</span>
              <ShieldAlert className="w-3.5 h-3.5" />
            </div>
            <p className="text-xs font-semibold text-slate-900 dark:text-white">
              2nd Patient Tries Same Slot
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Rohan Patel attempts to book the locked slot → rejected &amp; logged.
            </p>
          </button>
        </div>

        {/* Live Lab Telemetry Readout */}
        {labRecord && (
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2 font-mono tabular-nums">
                <span className="text-slate-500">Request ID:</span>
                <strong className="text-slate-900 dark:text-white">{labRecord.requestId}</strong>
                <span aria-hidden="true">·</span>
                <span>Attempts: {labRecord.attemptCount}</span>
                <span aria-hidden="true">·</span>
                <span>Slot: {labRecord.slotId}</span>
              </div>
              <BookingStateIndicator state={labRecord.state} />
            </div>

            {labConfirmedApt && (
              <p className="text-emerald-700 dark:text-emerald-400 font-medium tabular-nums">
                Confirmed Appointment: <span className="font-mono">{labConfirmedApt.appointmentId}</span>{' '}
                · Matching appointments in store for this requestId:{' '}
                <strong>
                  {
                    Object.values(snapshot.appointments).filter(
                      (a) => a.requestId === labRecord.requestId,
                    ).length
                  }
                </strong>{' '}
                (Strictly 1)
              </p>
            )}

            {labConflictResult && (
              <p className="text-rose-700 dark:text-rose-300 font-medium">{labConflictResult}</p>
            )}
          </div>
        )}

        {interruptedRequests.length > 0 && !labRecord && (
          <div className="p-3.5 rounded-xl bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 flex items-center justify-between gap-3 text-xs">
            <span>
              <strong>{interruptedRequests.length}</strong> interrupted request(s) currently pending
              recovery in persistent storage ({interruptedRequests[0].requestId}).
            </span>
            <button
              type="button"
              onClick={() => retryInterruptedRequest(interruptedRequests[0].requestId)}
              className="px-3 py-1.5 font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-lg whitespace-nowrap cursor-pointer"
            >
              Recover Now
            </button>
          </div>
        )}
      </section>

      {/* Two-Column Split: Live Queue Monitor & Doctor Availability / Policy Control */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Live Multi-Doctor Queue Monitor */}
        <section className="lg:col-span-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-display font-bold text-slate-900 dark:text-white">
                Live Multi-Suite Queue Monitor
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Wait times shown are operational estimates, not clinical guarantees.
              </p>
            </div>
            <Users className="w-4 h-4 text-slate-400" aria-hidden="true" />
          </div>

          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {liveQueues.map((q) => (
              <div key={q.doctorId} className="py-4 first:pt-0 last:pb-0 space-y-2.5">
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
                    {q.waitingEntries.length} in queue
                  </span>
                </div>

                {q.activeConsultation ? (
                  <div className="flex items-center justify-between gap-2 text-xs bg-emerald-50/70 dark:bg-emerald-950/30 px-3 py-2 rounded-lg">
                    <span className="text-emerald-800 dark:text-emerald-300">
                      In Consult: <strong>{q.activeConsultation.patientName}</strong> (
                      {q.activeConsultation.elapsedMinutes}m elapsed)
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        transitionStatus({
                          appointmentId: q.activeConsultation!.appointmentId,
                          targetStatus: AppointmentStatus.COMPLETED,
                          actorId: 'coord_nadia_okafor',
                          actorRole: UserRole.COORDINATOR,
                          reason: 'Coordinator marked consultation completed.',
                        })
                      }
                      className="px-2.5 py-1 font-semibold text-emerald-800 dark:text-emerald-200 bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-800 rounded-md whitespace-nowrap cursor-pointer"
                    >
                      Complete
                    </button>
                  </div>
                ) : (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    No active consultation in room.
                  </p>
                )}

                {q.waitingEntries.length > 0 && (
                  <div className="space-y-1.5">
                    {q.waitingEntries.map((entry) => (
                      <div
                        key={entry.appointmentId}
                        className="flex items-center justify-between gap-2 text-xs py-1"
                      >
                        <span className="text-slate-700 dark:text-slate-300 tabular-nums">
                          <strong>#{entry.position}</strong> {entry.patientName} · Est. wait ~
                          {entry.estimatedWaitMinutes}m
                        </span>
                        {!q.activeConsultation && entry.position === 1 && (
                          <button
                            type="button"
                            onClick={() =>
                              transitionStatus({
                                appointmentId: entry.appointmentId,
                                targetStatus: AppointmentStatus.IN_CONSULTATION,
                                actorId: q.doctorId,
                                actorRole: UserRole.DOCTOR,
                                reason: 'Called next waiting patient into consultation suite.',
                              })
                            }
                            className="px-2.5 py-1 text-xs font-medium text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-sky-950/60 rounded-md whitespace-nowrap cursor-pointer"
                          >
                            Start Consult
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Right: Doctor Availability, Slot Blocking & Clinic Rule Governance */}
        <section className="lg:col-span-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-6">
          {/* Clinic Rule Toggle */}
          <div className="pb-5 border-b border-slate-200 dark:border-slate-800 space-y-2">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-display font-bold text-slate-900 dark:text-white">
                  Clinic Lifecycle Rule Policy
                </h2>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                  Controls whether <code className="font-mono">CHECKED_IN → CANCELLED</code> is
                  permitted by the state machine.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={snapshot.policy.allowCheckedInCancellation}
                onClick={() =>
                  updateClinicPolicy({
                    allowCheckedInCancellation: !snapshot.policy.allowCheckedInCancellation,
                  })
                }
                className={`px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                  snapshot.policy.allowCheckedInCancellation
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200'
                }`}
              >
                {snapshot.policy.allowCheckedInCancellation
                  ? 'Checked-In Cancel: Allowed'
                  : 'Checked-In Cancel: Blocked'}
              </button>
            </div>
          </div>

          {/* Slot Availability & Creation */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-display font-bold text-slate-900 dark:text-white">
                Specialist Availability &amp; Slot Manager
              </h2>
              <CalendarCog className="w-4 h-4 text-slate-400" aria-hidden="true" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="coord-slot-doctor"
                  className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1"
                >
                  Specialist
                </label>
                <select
                  id="coord-slot-doctor"
                  value={managedDoctorId}
                  onChange={(e) => setManagedDoctorId(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-slate-100"
                >
                  {doctors.map((d) => (
                    <option key={d.doctorId} value={d.doctorId}>
                      {d.name} ({d.specialty})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="coord-slot-date"
                  className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1"
                >
                  Clinic Date
                </label>
                <select
                  id="coord-slot-date"
                  value={activeManagedDate}
                  onChange={(e) => setManagedDate(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-slate-100"
                >
                  {managedDates.map((d) => (
                    <option key={d} value={d}>
                      {formatClinicDateLabel(d, tz)} ({d})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Add New Slot Form */}
            <form onSubmit={handleAddDoctorSlot} className="flex items-end gap-2">
              <div className="flex-1">
                <label
                  htmlFor="coord-new-slot-time"
                  className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1"
                >
                  Add 30-min Slot (HH:MM in {tz})
                </label>
                <input
                  id="coord-new-slot-time"
                  type="time"
                  value={newSlotTime}
                  onChange={(e) => setNewSlotTime(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-1.5 text-xs font-mono text-slate-900 dark:text-slate-100"
                />
              </div>
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-700 rounded-lg whitespace-nowrap cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Add Slot</span>
              </button>
            </form>

            {/* Slot Table */}
            <div className="max-h-72 overflow-y-auto divide-y divide-slate-200 dark:divide-slate-800 border-t border-slate-200 dark:border-slate-800 pt-1">
              {managedSlots.map((s) => {
                const isPast = s.startTime <= nowMs;
                const isOccupied = s.availabilityStatus === SlotAvailabilityStatus.BOOKED;
                return (
                  <div
                    key={s.slotId}
                    className="py-2.5 flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="font-mono tabular-nums text-slate-800 dark:text-slate-200">
                      <span>{formatTimeInZone(s.startTime, tz)}</span>
                      <span className="text-slate-400 mx-1.5">·</span>
                      <span className="text-slate-500">{s.slotId}</span>
                    </div>

                    <div className="flex items-center gap-3">
                      <SlotStatusIndicator status={s.availabilityStatus} isPast={isPast} />
                      {!isOccupied && !isPast && (
                        <button
                          type="button"
                          onClick={() =>
                            setSlotAvailability(
                              s.slotId,
                              s.availabilityStatus === SlotAvailabilityStatus.BLOCKED
                                ? SlotAvailabilityStatus.AVAILABLE
                                : SlotAvailabilityStatus.BLOCKED,
                            )
                          }
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                        >
                          {s.availabilityStatus === SlotAvailabilityStatus.BLOCKED ? (
                            <>
                              <Activity className="w-3 h-3 text-emerald-600" />
                              <span>Unblock</span>
                            </>
                          ) : (
                            <>
                              <Ban className="w-3 h-3 text-slate-500" />
                              <span>Block</span>
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
