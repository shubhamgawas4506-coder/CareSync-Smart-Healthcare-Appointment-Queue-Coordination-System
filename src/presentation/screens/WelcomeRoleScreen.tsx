/**
 * Screen 1: Welcome & Role Selection
 *
 * Adheres strictly to the 3-zone Top Bar Contract, 2-column stretched Hero split,
 * 4-column operational metrics row below the hero, and a distinct 3-role entry matrix
 * with explicit prototype authentication and non-clinical scope disclosures.
 */

import React, { useState } from 'react';
import {
  Activity,
  ArrowRight,
  CalendarCheck,
  ClipboardList,
  Moon,
  RefreshCw,
  ShieldCheck,
  Stethoscope,
  Sun,
  User,
} from 'lucide-react';
import { AppointmentStatus, SlotAvailabilityStatus, UserRole } from '../../domain/models';
import { ClinicHeroVisual, DoctorAvatar } from '../assets';
import { useCareSync } from '../CareSyncContext';
import { PrototypeRoleDisclaimerBanner } from '../components/StatusPrimitives';

export function WelcomeRoleScreen() {
  const {
    snapshot,
    liveQueues,
    theme,
    toggleTheme,
    selectRoleAndEnter,
    navigateTo,
    activePatientId,
    activeDoctorId,
  } = useCareSync();

  const [selectedPatient, setSelectedPatient] = useState(activePatientId);
  const [selectedDoctor, setSelectedDoctor] = useState(activeDoctorId);

  const patients = Object.values(snapshot.patients);
  const doctors = Object.values(snapshot.doctors);

  const availableSlotCount = Object.values(snapshot.timeSlots).filter(
    (s) => s.availabilityStatus === SlotAvailabilityStatus.AVAILABLE && s.startTime > Date.now(),
  ).length;

  const activeQueueCount = liveQueues.reduce((sum, q) => sum + q.waitingEntries.length, 0);
  const inConsultationCount = liveQueues.filter((q) => q.activeConsultation !== null).length;
  const activeBookedCount = Object.values(snapshot.appointments).filter(
    (a) =>
      a.status === AppointmentStatus.BOOKED ||
      a.status === AppointmentStatus.CHECKED_IN ||
      a.status === AppointmentStatus.IN_CONSULTATION,
  ).length;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col">
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="flex items-center justify-between gap-8 px-6 lg:px-10 py-4 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
          }}
          className="text-lg font-display font-bold tracking-tight text-slate-900 dark:text-white whitespace-nowrap shrink-0"
        >
          CareSync
        </a>

        <nav
          aria-label="Primary sections"
          className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-600 dark:text-slate-300"
        >
          <a
            href="#roles"
            className="hover:text-sky-600 dark:hover:text-sky-400 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
          >
            Role Workspaces
          </a>
          <a
            href="#guarantees"
            className="hover:text-sky-600 dark:hover:text-sky-400 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
          >
            Architecture Guarantees
          </a>
          <button
            type="button"
            onClick={() => selectRoleAndEnter(UserRole.COORDINATOR, undefined, 'diagnostics-audit')}
            className="hover:text-sky-600 dark:hover:text-sky-400 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Audit Ledger
          </button>
          <button
            type="button"
            onClick={toggleTheme}
            className="hover:text-sky-600 dark:hover:text-sky-400 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {theme === 'light' ? 'Dark Theme' : 'Light Theme'}
          </button>
        </nav>

        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={() => selectRoleAndEnter(UserRole.PATIENT, selectedPatient, 'patient-booking')}
            className="px-4 py-2 text-sm font-medium text-white bg-sky-600 hover:bg-sky-700 dark:bg-sky-500 dark:hover:bg-sky-400 dark:text-slate-950 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Book Appointment
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-6 lg:px-10 py-8 lg:py-12 space-y-12">
        <PrototypeRoleDisclaimerBanner
          extraNote={`Timezone: ${snapshot.policy.clinicTimezone} · Local Persistence Active`}
        />

        {/* 2-Column Hero Split (items-stretch) */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
          <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-7 lg:p-10 flex flex-col justify-between">
            <div className="space-y-5">
              <p className="text-xs font-medium text-sky-700 dark:text-sky-400">
                Outpatient Coordination Prototype · Non-Diagnostic Scheduling Platform
              </p>
              <h1
                className="text-3xl sm:text-4xl lg:text-[2.6rem] font-display font-bold tracking-tight text-slate-900 dark:text-white leading-[1.15]"
                style={{ textWrap: 'balance' }}
              >
                Reliable healthcare scheduling, live check-in queues, and safe network recovery.
              </h1>
              <p className="text-base text-slate-600 dark:text-slate-300 leading-relaxed max-w-2xl">
                CareSync coordinates appointment lifecycles across patients, physicians, and clinic
                coordinators. Every booking request carries a stable idempotency identifier to
                prevent duplicate appointments during network drops, enforce strict slot conflict
                rules, and record an immutable transition history.
              </p>
            </div>

            <div className="pt-8 mt-8 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => selectRoleAndEnter(UserRole.PATIENT, selectedPatient, 'patient-dashboard')}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-sky-600 hover:bg-sky-700 dark:bg-sky-500 dark:hover:bg-sky-400 dark:text-slate-950 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <span>Enter as Patient</span>
                <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() =>
                  selectRoleAndEnter(UserRole.COORDINATOR, undefined, 'coordinator-dashboard')
                }
                className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-200 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <span>Open Failure &amp; Conflict Lab</span>
              </button>
              <button
                type="button"
                onClick={toggleTheme}
                aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
                className="md:hidden inline-flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded-lg cursor-pointer"
              >
                {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="lg:col-span-5 flex">
            <ClinicHeroVisual />
          </div>
        </section>

        {/* Full-Width 4-Column Operational Summary Strip */}
        <section
          aria-label="Live clinic snapshot"
          className="grid grid-cols-2 lg:grid-cols-4 gap-4"
        >
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
            <p className="text-xs text-slate-500 dark:text-slate-400">Open Future Slots</p>
            <p className="text-2xl font-display font-bold text-slate-900 dark:text-white mt-1 tabular-nums">
              {availableSlotCount}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Across {doctors.length} specialists
            </p>
          </div>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
            <p className="text-xs text-slate-500 dark:text-slate-400">Active Appointments</p>
            <p className="text-2xl font-display font-bold text-slate-900 dark:text-white mt-1 tabular-nums">
              {activeBookedCount}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Booked, Checked In, or In Consult
            </p>
          </div>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
            <p className="text-xs text-slate-500 dark:text-slate-400">Patients Waiting in Queue</p>
            <p className="text-2xl font-display font-bold text-slate-900 dark:text-white mt-1 tabular-nums">
              {activeQueueCount}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {inConsultationCount} active consultation in progress
            </p>
          </div>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
            <p className="text-xs text-slate-500 dark:text-slate-400">Audit Events Recorded</p>
            <p className="text-2xl font-display font-bold text-slate-900 dark:text-white mt-1 tabular-nums">
              {snapshot.events.length}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Timestamped domain transitions
            </p>
          </div>
        </section>

        {/* 3-Role Workspace Selector */}
        <section id="roles" className="space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
            <div>
              <h2 className="text-2xl font-display font-bold text-slate-900 dark:text-white">
                Select a Role Workspace
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                Each role presents a dedicated interface tailored to its clinical coordination responsibilities.
              </p>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Switch roles at any time from the workspace bar without losing persisted state.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
            {/* Role 1: Patient */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 flex flex-col justify-between">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="w-10 h-10 rounded-lg bg-sky-50 dark:bg-sky-950/70 text-sky-600 dark:text-sky-400 flex items-center justify-center">
                    <User className="w-5 h-5" aria-hidden="true" />
                  </div>
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    Self-Service Portal
                  </span>
                </div>

                <div>
                  <h3 className="text-lg font-display font-semibold text-slate-900 dark:text-white">
                    Patient Portal
                  </h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                    Browse specialist availability, book or reschedule appointments, recover safely
                    from interrupted bookings, and monitor live waiting-room queue position.
                  </p>
                </div>

                <div className="pt-2">
                  <label
                    htmlFor="welcome-patient-select"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                  >
                    Active Demo Patient Persona
                  </label>
                  <select
                    id="welcome-patient-select"
                    value={selectedPatient}
                    onChange={(e) => setSelectedPatient(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
                  >
                    {patients.map((p) => (
                      <option key={p.patientId} value={p.patientId}>
                        {p.name} ({p.mrn})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="pt-6 mt-6 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() =>
                    selectRoleAndEnter(UserRole.PATIENT, selectedPatient, 'patient-dashboard')
                  }
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-sky-600 hover:bg-sky-700 dark:bg-sky-500 dark:hover:bg-sky-400 dark:text-slate-950 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                >
                  <span>Open Patient Dashboard</span>
                  <ArrowRight className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>
            </div>

            {/* Role 2: Doctor */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 flex flex-col justify-between">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="w-10 h-10 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                    <Stethoscope className="w-5 h-5" aria-hidden="true" />
                  </div>
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    Clinical Workstation
                  </span>
                </div>

                <div>
                  <h3 className="text-lg font-display font-semibold text-slate-900 dark:text-white">
                    Doctor Console
                  </h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                    Inspect daily rosters and patient visit context, advance appointments through
                    Check-In, Consultation, and Completion, or record clinical cancellations.
                  </p>
                </div>

                <div className="pt-2">
                  <label
                    htmlFor="welcome-doctor-select"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                  >
                    Active Demo Physician
                  </label>
                  <select
                    id="welcome-doctor-select"
                    value={selectedDoctor}
                    onChange={(e) => setSelectedDoctor(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
                  >
                    {doctors.map((d) => (
                      <option key={d.doctorId} value={d.doctorId}>
                        {d.name} · {d.specialty}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="pt-6 mt-6 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() =>
                    selectRoleAndEnter(UserRole.DOCTOR, selectedDoctor, 'doctor-dashboard')
                  }
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-slate-900 dark:text-white bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                >
                  <span>Open Doctor Workstation</span>
                  <ArrowRight className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>
            </div>

            {/* Role 3: Clinic Coordinator */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 flex flex-col justify-between">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="w-10 h-10 rounded-lg bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                    <ClipboardList className="w-5 h-5" aria-hidden="true" />
                  </div>
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    Operations &amp; Audit
                  </span>
                </div>

                <div>
                  <h3 className="text-lg font-display font-semibold text-slate-900 dark:text-white">
                    Clinic Coordinator
                  </h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                    Manage specialist time slots, configure clinic cancellation rules, supervise
                    multi-suite queues, run failure-recovery drills, and audit system diagnostics.
                  </p>
                </div>

                <div className="pt-2 text-xs text-slate-600 dark:text-slate-400 space-y-1">
                  <p className="font-medium text-slate-800 dark:text-slate-200">
                    Coordinator: Nadia Okafor
                  </p>
                  <p>Includes interactive Network Drop, Retry &amp; Slot-Conflict Lab</p>
                </div>
              </div>

              <div className="pt-6 mt-6 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() =>
                    selectRoleAndEnter(UserRole.COORDINATOR, undefined, 'coordinator-dashboard')
                  }
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-slate-900 dark:text-white bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                >
                  <span>Open Coordinator Command</span>
                  <ArrowRight className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Specialist Preview & Core Architectural Guarantees */}
        <section id="guarantees" className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 lg:p-8 space-y-6">
            <div>
              <h2 className="text-xl font-display font-bold text-slate-900 dark:text-white">
                Architectural Invariants Enforced
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                Business rules live in pure TypeScript domain modules decoupled from UI components.
              </p>
            </div>

            <div className="divide-y divide-slate-200 dark:divide-slate-800">
              <div className="py-4 first:pt-0 flex items-start gap-4">
                <CalendarCheck className="w-5 h-5 text-sky-600 dark:text-sky-400 shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                    01. Double-Defense Slot Conflict Prevention
                  </h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                    Validates both slot availability status and zero overlapping active appointments
                    for the target doctor and patient immediately prior to atomic snapshot commit.
                  </p>
                </div>
              </div>

              <div className="py-4 flex items-start gap-4">
                <RefreshCw className="w-5 h-5 text-sky-600 dark:text-sky-400 shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                    02. Idempotent Request Ledger &amp; Interrupted Recovery
                  </h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                    Every booking attempt carries a persistent client-generated{' '}
                    <code className="font-mono text-xs">requestId</code>. Retrying an interrupted
                    booking reconciles existing state and guarantees strictly one confirmed record.
                  </p>
                </div>
              </div>

              <div className="py-4 flex items-start gap-4">
                <Activity className="w-5 h-5 text-sky-600 dark:text-sky-400 shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                    03. Deterministic Lifecycle State Machine &amp; Live Queue Math
                  </h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                    Enforces <code className="font-mono text-xs">Available → Booked → Checked In → In Consultation → Completed</code>,
                    configurable post-check-in cancellation policy, and transparent wait-time estimation.
                  </p>
                </div>
              </div>

              <div className="pt-4 flex items-start gap-4">
                <ShieldCheck className="w-5 h-5 text-sky-600 dark:text-sky-400 shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                    04. Single-Device Persistence Honesty
                  </h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                    Persists transactions atomically via browser <code className="font-mono text-xs">localStorage</code>{' '}
                    behind repository interfaces. Suitable for single-device evaluation; production
                    multi-user systems require server-side ACID transactions and RBAC tokens.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 lg:p-8 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-display font-bold text-slate-900 dark:text-white">
                Outpatient Specialists
              </h2>
              <button
                type="button"
                onClick={() => navigateTo('patient-booking')}
                className="text-xs font-medium text-sky-600 dark:text-sky-400 hover:underline cursor-pointer"
              >
                View all slots
              </button>
            </div>

            <div className="divide-y divide-slate-200 dark:divide-slate-800">
              {doctors.map((doc) => (
                <div key={doc.doctorId} className="py-3.5 first:pt-0 last:pb-0 flex items-center gap-3.5">
                  <DoctorAvatar avatarKey={doc.avatarUrl} name={doc.name} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                      {doc.name}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                      {doc.specialty} <span aria-hidden="true">·</span> {doc.room}{' '}
                      <span aria-hidden="true">·</span>{' '}
                      <span className="tabular-nums">~{doc.avgConsultationMinutes}m consult</span>
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-6 lg:px-10 py-5 text-xs text-slate-500 dark:text-slate-400 flex flex-wrap items-center justify-between gap-4">
        <span>CareSync Outpatient Appointment &amp; Queue Coordination Prototype (MAL 4)</span>
        <span>Single-device browser persistence · Non-diagnostic coordination software</span>
      </footer>
    </div>
  );
}
