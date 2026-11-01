/**
 * Patient Portal Shell & Persistent Interrupted-Request Recovery Banner
 *
 * Wraps Screens 2, 3, 4, 5, and 6 in a reassuring, patient-tailored layout.
 * Automatically surfaces any UNCERTAIN_INTERRUPTED booking requests recovered
 * from persistent storage (including after a full page reload).
 */

import React from 'react';
import {
  AlertTriangle,
  RefreshCw,
  X,
} from 'lucide-react';
import { UserRole } from '../../domain/models';
import { formatDateTimeInZone, formatTimeInZone } from '../../domain/timeUtils';
import { ScreenId, useCareSync } from '../CareSyncContext';
import {
  BookingStateIndicator,
  PrototypeRoleDisclaimerBanner,
} from '../components/StatusPrimitives';

export function PatientPortalShell({ children }: { children: React.ReactNode }) {
  const {
    snapshot,
    activeScreen,
    activePatientId,
    setActivePatientId,
    interruptedRequests,
    retryInterruptedRequest,
    dismissUncertainRequest,
    navigateTo,
    selectRoleAndEnter,
    theme,
    toggleTheme,
  } = useCareSync();

  const tz = snapshot.policy.clinicTimezone;
  const patients = Object.values(snapshot.patients);
  const currentPatient = snapshot.patients[activePatientId] ?? patients[0];

  const patientInterrupted = interruptedRequests.filter(
    (req) => req.patientId === currentPatient.patientId,
  );

  const navItems: { screen: ScreenId; label: string }[] = [
    { screen: 'patient-dashboard', label: 'Overview' },
    { screen: 'patient-booking', label: 'Book Visit' },
    { screen: 'patient-queue', label: 'Live Queue' },
    { screen: 'patient-history', label: 'My Appointments' },
  ];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col">
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="flex items-center justify-between gap-8 px-6 lg:px-10 py-4 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
        <button
          type="button"
          onClick={() => navigateTo('welcome')}
          className="text-lg font-display font-bold tracking-tight text-slate-900 dark:text-white whitespace-nowrap shrink-0 cursor-pointer"
        >
          Jiva
        </button>

        <nav
          aria-label="Patient portal navigation"
          className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-600 dark:text-slate-300"
        >
          {navItems.map((item) => {
            const isActive =
              activeScreen === item.screen ||
              (item.screen === 'patient-booking' && activeScreen === 'patient-confirmation');
            return (
              <button
                key={item.screen}
                type="button"
                onClick={() => navigateTo(item.screen)}
                className={`transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  isActive
                    ? 'text-sky-600 dark:text-sky-400 underline underline-offset-4 font-semibold'
                    : 'hover:text-slate-900 dark:hover:text-white hover:underline underline-offset-4'
                }`}
              >
                {item.label}
              </button>
            );
          })}
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
            onClick={() => navigateTo('patient-booking')}
            className="px-4 py-2 text-sm font-medium text-white bg-sky-600 hover:bg-sky-700 dark:bg-sky-500 dark:hover:bg-sky-400 dark:text-slate-950 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            New Appointment
          </button>
        </div>
      </header>

      {/* Mobile Secondary Tab Bar + Persona Switcher Toolbar */}
      <div className="bg-white/80 dark:bg-slate-900/80 border-b border-slate-200 dark:border-slate-800 px-6 lg:px-10 py-3">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <label
              htmlFor="patient-active-persona"
              className="text-xs font-medium text-slate-600 dark:text-slate-400"
            >
              Patient Persona:
            </label>
            <select
              id="patient-active-persona"
              value={currentPatient.patientId}
              onChange={(e) => setActivePatientId(e.target.value)}
              className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 text-xs font-medium text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
            >
              {patients.map((p) => (
                <option key={p.patientId} value={p.patientId}>
                  {p.name} ({p.mrn})
                </option>
              ))}
            </select>
            <span className="hidden sm:inline text-xs text-slate-500 dark:text-slate-400">
              {currentPatient.contact}
            </span>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <button
              type="button"
              onClick={() => selectRoleAndEnter(UserRole.DOCTOR, undefined, 'doctor-dashboard')}
              className="px-2.5 py-1 rounded-md text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap cursor-pointer"
            >
              Switch to Doctor
            </button>
            <button
              type="button"
              onClick={() =>
                selectRoleAndEnter(UserRole.COORDINATOR, undefined, 'coordinator-dashboard')
              }
              className="px-2.5 py-1 rounded-md text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap cursor-pointer"
            >
              Switch to Coordinator
            </button>
            <button
              type="button"
              onClick={() => navigateTo('welcome')}
              className="px-2.5 py-1 rounded-md text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap cursor-pointer"
            >
              All Roles
            </button>
          </div>
        </div>

        {/* Mobile navigation row */}
        <div className="flex md:hidden items-center gap-1 mt-3 overflow-x-auto pb-1">
          {navItems.map((item) => (
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
        </div>
      </div>

      <main className="flex-1 max-w-7xl w-full mx-auto px-6 lg:px-10 py-6 lg:py-8 space-y-6">
        <PrototypeRoleDisclaimerBanner
          extraNote={`Patient Session: ${currentPatient.name} (${currentPatient.mrn})`}
        />

        {/* Persistent Interrupted Booking Recovery Banner */}
        {patientInterrupted.length > 0 && (
          <section
            aria-label="Interrupted booking recovery"
            className="rounded-2xl border border-amber-300 dark:border-amber-800/80 bg-amber-50/90 dark:bg-amber-950/35 p-5 space-y-4"
          >
            {patientInterrupted.map((req) => {
              const doc = snapshot.doctors[req.doctorId];
              const slot = snapshot.timeSlots[req.slotId];
              return (
                <div
                  key={req.requestId}
                  className="flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                >
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <BookingStateIndicator state={req.state} />
                      <span aria-hidden="true" className="text-amber-700 dark:text-amber-400">
                        ·
                      </span>
                      <span className="font-mono text-xs text-amber-900 dark:text-amber-200 tabular-nums">
                        Preserved ID: {req.requestId}
                      </span>
                      <span aria-hidden="true" className="text-amber-700 dark:text-amber-400">
                        ·
                      </span>
                      <span className="text-xs text-amber-800 dark:text-amber-300 tabular-nums">
                        Attempts: {req.attemptCount}
                      </span>
                    </div>
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">
                      Uncertain Booking Outcome Detected — Safe to Retry Without Duplicate Creation
                    </p>
                    <p className="text-xs text-slate-700 dark:text-slate-300">
                      {doc ? doc.name : req.doctorId}
                      {slot
                        ? ` · ${slot.date} at ${formatTimeInZone(slot.startTime, tz)}`
                        : ` · Slot ${req.slotId}`}{' '}
                      · Visit reason: &ldquo;{req.reasonForVisit}&rdquo; · Last updated{' '}
                      <span className="font-mono tabular-nums">
                        {formatDateTimeInZone(req.updatedAt, tz)}
                      </span>
                    </p>
                    <p className="text-xs text-amber-900/90 dark:text-amber-200/90">
                      <AlertTriangle className="w-3.5 h-3.5 inline mr-1 -mt-0.5" />
                      This operation is <strong>uncertain</strong> (network interrupted mid-request),{' '}
                      <strong>not</strong> a confirmed rejection. Retrying reuses{' '}
                      <code className="font-mono">{req.requestId}</code> so at most one appointment
                      can ever be confirmed.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => retryInterruptedRequest(req.requestId)}
                      className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                    >
                      <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Retry Same Request ({req.requestId.slice(0, 14)}…)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => dismissUncertainRequest(req.requestId)}
                      aria-label={`Dismiss uncertain request ${req.requestId}`}
                      className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Dismiss</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </section>
        )}

        {children}
      </main>
    </div>
  );
}
