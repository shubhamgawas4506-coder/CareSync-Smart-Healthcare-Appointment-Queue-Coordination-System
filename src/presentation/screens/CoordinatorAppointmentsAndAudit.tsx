/**
 * Coordinator Screens:
 * - Screen 9: Appointment Management (`CoordinatorAppointmentsView`)
 *   High-density clinic-wide appointment ledger with live search, status filter,
 *   check-in, atomic reschedule, and cancellation overrides.
 * - Screen 10: Audit Logs & Diagnostics (`DiagnosticsAndAuditView`)
 *   Immutable event history across all 10 required AppointmentEventTypes,
 *   Idempotency Request Ledger, Storage Health & Simulated Fault Injection,
 *   and Single-Device vs Production Backend architecture documentation.
 */

import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRightLeft,
  CheckCircle2,
  Database,
  HardDriveDownload,
  Search,
  UserCheck,
  XCircle,
} from 'lucide-react';
import {
  AppointmentEventType,
  AppointmentStatus,
  SlotAvailabilityStatus,
  UserRole,
} from '../../domain/models';
import { getAllowedNextStatuses } from '../../domain/stateMachine';
import {
  formatClinicDateLabel,
  formatDateTimeInZone,
  formatTimeInZone,
} from '../../domain/timeUtils';
import { useCareSync } from '../CareSyncContext';
import {
  AppointmentStatusIndicator,
  BookingStateIndicator,
  formatEventLabel,
} from '../components/StatusPrimitives';

export function CoordinatorAppointmentsView() {
  const {
    snapshot,
    transitionStatus,
    rescheduleAppointment,
  } = useCareSync();

  const tz = snapshot.policy.clinicTimezone;
  const nowMs = Date.now();

  const [search, setSearch] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | AppointmentStatus>('ALL');
  const [doctorFilter, setDoctorFilter] = useState<string>('ALL');
  const [rescheduleTargetAptId, setRescheduleTargetAptId] = useState<string | null>(null);
  const [selectedNewSlotId, setSelectedNewSlotId] = useState<string>('');

  const appointments = useMemo(() => {
    return Object.values(snapshot.appointments)
      .filter((apt) => {
        if (statusFilter !== 'ALL' && apt.status !== statusFilter) return false;
        if (doctorFilter !== 'ALL' && apt.doctorId !== doctorFilter) return false;
        if (search.trim()) {
          const q = search.toLowerCase();
          const patName = snapshot.patients[apt.patientId]?.name.toLowerCase() ?? '';
          const docName = snapshot.doctors[apt.doctorId]?.name.toLowerCase() ?? '';
          return (
            apt.appointmentId.toLowerCase().includes(q) ||
            apt.requestId.toLowerCase().includes(q) ||
            patName.includes(q) ||
            docName.includes(q) ||
            apt.reasonForVisit.toLowerCase().includes(q)
          );
        }
        return true;
      })
      .sort((a, b) => b.startTime - a.startTime);
  }, [doctorFilter, search, snapshot.appointments, snapshot.doctors, snapshot.patients, statusFilter]);

  const doctors = Object.values(snapshot.doctors);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-slate-900 dark:text-white">
            Clinic Appointment Ledger
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Inspect all scheduled, checked-in, completed, and rescheduled visits across specialists.
          </p>
        </div>
        <span className="text-xs font-mono text-slate-500 dark:text-slate-400 tabular-nums">
          Showing {appointments.length} of {Object.keys(snapshot.appointments).length} record(s)
        </span>
      </div>

      {/* Filters */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="coord-apt-status-filter" className="sr-only">
            Filter by status
          </label>
          <select
            id="coord-apt-status-filter"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'ALL' | AppointmentStatus)}
            className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs font-medium text-slate-900 dark:text-slate-100"
          >
            <option value="ALL">All Lifecycle States</option>
            {Object.values(AppointmentStatus).map((st) => (
              <option key={st} value={st}>
                {st}
              </option>
            ))}
          </select>

          <label htmlFor="coord-apt-doctor-filter" className="sr-only">
            Filter by specialist
          </label>
          <select
            id="coord-apt-doctor-filter"
            value={doctorFilter}
            onChange={(e) => setDoctorFilter(e.target.value)}
            className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs font-medium text-slate-900 dark:text-slate-100"
          >
            <option value="ALL">All Specialists</option>
            {doctors.map((d) => (
              <option key={d.doctorId} value={d.doctorId}>
                {d.name}
              </option>
            ))}
          </select>
        </div>

        <div className="relative w-full lg:w-80">
          <Search
            className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"
            aria-hidden="true"
          />
          <label htmlFor="coord-apt-search" className="sr-only">
            Search appointments
          </label>
          <input
            id="coord-apt-search"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search ID, requestId, patient, reason..."
            className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
          />
        </div>
      </section>

      {/* High-Density Data Table */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-500 dark:text-slate-400 bg-slate-50/70 dark:bg-slate-950/60">
                <th className="py-3 px-4">Appointment / Req ID</th>
                <th className="py-3 px-4">Patient</th>
                <th className="py-3 px-4">Specialist &amp; Suite</th>
                <th className="py-3 px-4">Date &amp; Window</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Coordinator Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
              {appointments.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-slate-500 dark:text-slate-400">
                    No appointments match the current filter criteria.
                  </td>
                </tr>
              ) : (
                appointments.map((apt) => {
                  const pat = snapshot.patients[apt.patientId];
                  const doc = snapshot.doctors[apt.doctorId];
                  const allowed = getAllowedNextStatuses(apt.status, snapshot.policy);
                  const canCheckIn = allowed.includes(AppointmentStatus.CHECKED_IN);
                  const canResched = allowed.includes(AppointmentStatus.RESCHEDULED);
                  const canCancel = allowed.includes(AppointmentStatus.CANCELLED);

                  return (
                    <React.Fragment key={apt.appointmentId}>
                      <tr className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                        <td className="py-3 px-4 font-mono tabular-nums">
                          <div className="font-semibold text-slate-900 dark:text-white">
                            {apt.appointmentId}
                          </div>
                          <div className="text-[11px] text-slate-500 truncate max-w-[160px]">
                            {apt.requestId}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-semibold text-slate-900 dark:text-white">
                            {pat?.name ?? apt.patientId}
                          </div>
                          <div className="text-slate-500 truncate max-w-[180px]">
                            {apt.reasonForVisit}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-medium text-slate-800 dark:text-slate-200">
                            {doc?.name ?? apt.doctorId}
                          </div>
                          <div className="text-slate-500">
                            {doc?.specialty} · {doc?.room}
                          </div>
                        </td>
                        <td className="py-3 px-4 font-mono tabular-nums text-slate-700 dark:text-slate-300 whitespace-nowrap">
                          <div>{apt.date}</div>
                          <div className="text-slate-500">{formatTimeInZone(apt.startTime, tz)}</div>
                        </td>
                        <td className="py-3 px-4">
                          <AppointmentStatusIndicator status={apt.status} />
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5">
                            {canCheckIn && (
                              <button
                                type="button"
                                onClick={() =>
                                  transitionStatus({
                                    appointmentId: apt.appointmentId,
                                    targetStatus: AppointmentStatus.CHECKED_IN,
                                    actorId: 'coord_nadia_okafor',
                                    actorRole: UserRole.COORDINATOR,
                                    reason: 'Checked in at coordinator desk.',
                                  })
                                }
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 font-medium hover:bg-amber-100 cursor-pointer"
                              >
                                <UserCheck className="w-3 h-3" />
                                <span>Check In</span>
                              </button>
                            )}
                            {canResched && (
                              <button
                                type="button"
                                onClick={() => {
                                  setRescheduleTargetAptId((prev) =>
                                    prev === apt.appointmentId ? null : apt.appointmentId,
                                  );
                                  setSelectedNewSlotId('');
                                }}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-sky-50 dark:bg-sky-950/50 text-sky-700 dark:text-sky-300 font-medium hover:bg-sky-100 cursor-pointer"
                              >
                                <ArrowRightLeft className="w-3 h-3" />
                                <span>Move Slot</span>
                              </button>
                            )}
                            {canCancel && (
                              <button
                                type="button"
                                onClick={() =>
                                  transitionStatus({
                                    appointmentId: apt.appointmentId,
                                    targetStatus: AppointmentStatus.CANCELLED,
                                    actorId: 'coord_nadia_okafor',
                                    actorRole: UserRole.COORDINATOR,
                                    reason: 'Cancelled by Clinic Coordinator; slot released.',
                                  })
                                }
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                              >
                                <XCircle className="w-3 h-3" />
                                <span>Cancel</span>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>

                      {rescheduleTargetAptId === apt.appointmentId && (
                        <tr className="bg-slate-50 dark:bg-slate-950">
                          <td colSpan={6} className="p-4 space-y-3">
                            <p className="font-semibold text-slate-900 dark:text-white">
                              Coordinator Conflict-Safe Reschedule for {apt.appointmentId}
                            </p>
                            <div className="flex flex-wrap items-center gap-2">
                              {Object.values(snapshot.timeSlots)
                                .filter(
                                  (s) =>
                                    s.doctorId === apt.doctorId &&
                                    s.slotId !== apt.slotId &&
                                    s.availabilityStatus === SlotAvailabilityStatus.AVAILABLE &&
                                    s.startTime > nowMs,
                                )
                                .sort((a, b) => a.startTime - b.startTime)
                                .slice(0, 6)
                                .map((s) => (
                                  <button
                                    key={s.slotId}
                                    type="button"
                                    onClick={() => setSelectedNewSlotId(s.slotId)}
                                    className={`px-3 py-1.5 rounded-lg border font-mono tabular-nums cursor-pointer ${
                                      selectedNewSlotId === s.slotId
                                        ? 'bg-sky-600 text-white border-sky-600'
                                        : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
                                    }`}
                                  >
                                    {formatClinicDateLabel(s.date, tz)} ·{' '}
                                    {formatTimeInZone(s.startTime, tz)}
                                  </button>
                                ))}
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                disabled={!selectedNewSlotId}
                                onClick={() => {
                                  const out = rescheduleAppointment({
                                    appointmentId: apt.appointmentId,
                                    newSlotId: selectedNewSlotId,
                                    actorId: 'coord_nadia_okafor',
                                    actorRole: UserRole.COORDINATOR,
                                    reason: 'Coordinator schedule optimization',
                                  });
                                  if (out) {
                                    setRescheduleTargetAptId(null);
                                  }
                                }}
                                className="px-3.5 py-1.5 font-semibold text-white bg-sky-600 hover:bg-sky-700 disabled:opacity-50 rounded-lg cursor-pointer"
                              >
                                Confirm Slot Reassignment
                              </button>
                              <button
                                type="button"
                                onClick={() => setRescheduleTargetAptId(null)}
                                className="px-3 py-1.5 text-slate-600 dark:text-slate-400 cursor-pointer"
                              >
                                Cancel
                              </button>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

/**
 * Screen 10: Audit Logs, Idempotency Request Ledger & System Diagnostics
 */
export function DiagnosticsAndAuditView() {
  const {
    snapshot,
    storageHealth,
    setSimulatedStorageFailure,
    retryInterruptedRequest,
  } = useCareSync();

  const tz = snapshot.policy.clinicTimezone;
  const [activeTab, setActiveTab] = useState<'EVENTS' | 'REQUESTS' | 'DIAGNOSTICS'>('EVENTS');
  const [eventTypeFilter, setEventTypeFilter] = useState<'ALL' | AppointmentEventType>('ALL');

  const filteredEvents = useMemo(() => {
    return [...snapshot.events]
      .filter((e) => (eventTypeFilter === 'ALL' ? true : e.eventType === eventTypeFilter))
      .sort((a, b) => b.timestamp - a.timestamp);
  }, [eventTypeFilter, snapshot.events]);

  const requestRecords = useMemo(() => {
    return Object.values(snapshot.bookingRequests).sort((a, b) => b.updatedAt - a.updatedAt);
  }, [snapshot.bookingRequests]);

  const sortedDiagnostics = useMemo(() => {
    return [...snapshot.diagnostics].sort((a, b) => b.timestamp - a.timestamp);
  }, [snapshot.diagnostics]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-slate-900 dark:text-white">
            Audit Logs &amp; System Diagnostics
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Inspect domain transition events, idempotency request envelopes, and persistence
            reliability telemetry.
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-200/70 dark:bg-slate-800 rounded-lg self-start">
          <button
            type="button"
            onClick={() => setActiveTab('EVENTS')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'EVENTS'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            Audit Events ({snapshot.events.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('REQUESTS')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'REQUESTS'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            Idempotency Ledger ({requestRecords.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('DIAGNOSTICS')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'DIAGNOSTICS'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            Storage &amp; Diagnostics ({sortedDiagnostics.length})
          </button>
        </div>
      </div>

      {/* TAB 1: Immutable Domain Audit Event History */}
      {activeTab === 'EVENTS' && (
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
          <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <label
                htmlFor="audit-event-type-filter"
                className="text-xs font-medium text-slate-600 dark:text-slate-400"
              >
                Filter Event Type:
              </label>
              <select
                id="audit-event-type-filter"
                value={eventTypeFilter}
                onChange={(e) =>
                  setEventTypeFilter(e.target.value as 'ALL' | AppointmentEventType)
                }
                className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-1.5 text-xs font-mono text-slate-900 dark:text-slate-100"
              >
                <option value="ALL">All 10 Domain Event Types</option>
                {Object.values(AppointmentEventType).map((et) => (
                  <option key={et} value={et}>
                    {et}
                  </option>
                ))}
              </select>
            </div>
            <span className="text-xs font-mono text-slate-500 tabular-nums">
              {filteredEvents.length} event(s)
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-500 dark:text-slate-400 bg-slate-50/70 dark:bg-slate-950/60">
                  <th className="py-3 px-4">Timestamp ({tz})</th>
                  <th className="py-3 px-4">Event Type</th>
                  <th className="py-3 px-4">Appointment / Request ID</th>
                  <th className="py-3 px-4">Actor</th>
                  <th className="py-3 px-4">Transition &amp; Outcome</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                {filteredEvents.map((evt) => {
                  const meta = formatEventLabel(evt.eventType);
                  return (
                    <tr
                      key={evt.eventId}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40"
                    >
                      <td className="py-3 px-4 font-mono tabular-nums whitespace-nowrap text-slate-600 dark:text-slate-400">
                        <div>{formatDateTimeInZone(evt.timestamp, tz)}</div>
                        <div className="text-[10px] text-slate-400">epoch: {evt.timestamp}</div>
                      </td>
                      <td className="py-3 px-4">
                        <div className={`font-semibold ${meta.toneClass}`}>{meta.label}</div>
                        <div className="font-mono text-[11px] text-slate-500">{evt.eventType}</div>
                      </td>
                      <td className="py-3 px-4 font-mono tabular-nums">
                        <div className="text-slate-900 dark:text-white">{evt.appointmentId}</div>
                        {evt.requestId && (
                          <div className="text-[11px] text-slate-500">{evt.requestId}</div>
                        )}
                      </td>
                      <td className="py-3 px-4 font-mono">
                        <div className="text-slate-800 dark:text-slate-200">{evt.actorId}</div>
                        <div className="text-[11px] text-slate-500">{evt.actorRole}</div>
                      </td>
                      <td className="py-3 px-4 max-w-md">
                        {(evt.previousStatus || evt.newStatus) && (
                          <p className="font-mono text-[11px] text-slate-500 mb-0.5">
                            {evt.previousStatus ?? '—'} → {evt.newStatus ?? '—'}
                          </p>
                        )}
                        <p className="text-slate-700 dark:text-slate-300">{evt.reason}</p>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* TAB 2: Idempotency Request Ledger */}
      {activeTab === 'REQUESTS' && (
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
          <div className="p-4 border-b border-slate-200 dark:border-slate-800">
            <h2 className="text-sm font-display font-semibold text-slate-900 dark:text-white">
              Request Idempotency &amp; Recovery Ledger (<code className="font-mono text-xs">bookingRequests</code>)
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Maps client-generated <code className="font-mono">requestId</code> keys to their operation state,
              attempt counter, and canonical <code className="font-mono">outcomeAppointmentId</code>.
            </p>
          </div>

          {requestRecords.length === 0 ? (
            <div className="p-10 text-center text-xs text-slate-500 dark:text-slate-400">
              No client booking requests initiated yet in this session. Submit a booking or run Step
              1 in the Operations Lab to populate the idempotency ledger.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-500 dark:text-slate-400 bg-slate-50/70 dark:bg-slate-950/60">
                    <th className="py-3 px-4">Request ID</th>
                    <th className="py-3 px-4">Patient &amp; Slot</th>
                    <th className="py-3 px-4">State</th>
                    <th className="py-3 px-4 text-right">Attempts</th>
                    <th className="py-3 px-4">Outcome / Recovery</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                  {requestRecords.map((rec) => (
                    <tr key={rec.requestId}>
                      <td className="py-3 px-4 font-mono font-semibold text-slate-900 dark:text-white tabular-nums">
                        {rec.requestId}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-800 dark:text-slate-200">
                          {snapshot.patients[rec.patientId]?.name ?? rec.patientId}
                        </div>
                        <div className="font-mono text-[11px] text-slate-500">{rec.slotId}</div>
                      </td>
                      <td className="py-3 px-4">
                        <BookingStateIndicator state={rec.state} />
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold">
                        {rec.attemptCount}
                      </td>
                      <td className="py-3 px-4">
                        {rec.outcomeAppointmentId ? (
                          <span className="font-mono text-emerald-700 dark:text-emerald-400">
                            Confirmed → {rec.outcomeAppointmentId}
                          </span>
                        ) : rec.state === 'UNCERTAIN_INTERRUPTED' ? (
                          <div className="flex items-center gap-2">
                            <span className="text-amber-700 dark:text-amber-300">
                              Awaiting idempotent retry
                            </span>
                            <button
                              type="button"
                              onClick={() => retryInterruptedRequest(rec.requestId)}
                              className="px-2.5 py-1 rounded bg-amber-600 text-white font-semibold cursor-pointer"
                            >
                              Retry Now
                            </button>
                          </div>
                        ) : (
                          <span className="text-rose-700 dark:text-rose-300">
                            {rec.failureCode}: {rec.failureMessage}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* TAB 3: Storage Health, Fault Injection & Production Architecture Honesty */}
      {activeTab === 'DIAGNOSTICS' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Storage Health & Fault Injection */}
            <section className="lg:col-span-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <Database className="w-5 h-5 text-sky-600 dark:text-sky-400" />
                  <h2 className="text-base font-display font-bold text-slate-900 dark:text-white">
                    Repository Persistence &amp; Fault Injection
                  </h2>
                </div>
                {storageHealth.simulatedFailureActive ? (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-rose-600">
                    <AlertTriangle className="w-3.5 h-3.5" /> Fault Active
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Healthy
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                  <p className="text-slate-500">Snapshot Size</p>
                  <p className="font-mono font-semibold text-sm text-slate-900 dark:text-white tabular-nums mt-0.5">
                    {(storageHealth.serializedSizeBytes / 1024).toFixed(1)} KB
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                  <p className="text-slate-500">Schema Version</p>
                  <p className="font-mono font-semibold text-sm text-slate-900 dark:text-white tabular-nums mt-0.5">
                    v{storageHealth.schemaVersion} (Atomic JSON)
                  </p>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-3">
                <p className="text-xs font-semibold text-slate-900 dark:text-white">
                  Simulate Persistent Storage Write Failure
                </p>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  When enabled, <code className="font-mono">repository.transact()</code> throws a{' '}
                  <code className="font-mono">RepositoryStorageError</code> during commit and
                  discards the isolated draft copy — guaranteeing zero partial updates between
                  appointments, slots, and queues.
                </p>
                <button
                  type="button"
                  onClick={() =>
                    setSimulatedStorageFailure(!storageHealth.simulatedFailureActive)
                  }
                  className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                    storageHealth.simulatedFailureActive
                      ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                      : 'bg-rose-600 hover:bg-rose-700 text-white'
                  }`}
                >
                  <HardDriveDownload className="w-3.5 h-3.5" />
                  <span>
                    {storageHealth.simulatedFailureActive
                      ? 'Restore Normal Storage Commits'
                      : 'Inject Storage Write Failure'}
                  </span>
                </button>
              </div>
            </section>

            {/* Prototype vs Production Architecture Disclosure */}
            <section className="lg:col-span-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4">
              <h2 className="text-base font-display font-bold text-slate-900 dark:text-white">
                Source of Truth &amp; Production Evolution Notes
              </h2>
              <div className="space-y-3 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                <p>
                  <strong className="text-slate-900 dark:text-white">
                    Single-Device Prototype Scope:
                  </strong>{' '}
                  Jiva currently persists its canonical snapshot in browser{' '}
                  <code className="font-mono">localStorage</code> via{' '}
                  <code className="font-mono">ICareSyncRepository</code>. This preserves state
                  across refreshes and restarts on one browser profile without claiming multi-user
                  network synchronization.
                </p>
                <p>
                  <strong className="text-slate-900 dark:text-white">
                    Production Multi-User Healthcare Architecture:
                  </strong>{' '}
                  Replacing <code className="font-mono">LocalStorageCareSyncRepository</code> with a
                  PostgreSQL-backed API implementation enforces:
                </p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>
                    <strong>Atomic Booking &amp; Concurrency:</strong>{' '}
                    <code className="font-mono">SELECT ... FOR UPDATE</code> row locking plus a
                    partial unique index{' '}
                    <code className="font-mono">
                      UNIQUE(doctor_id, slot_id) WHERE status IN (&apos;BOOKED&apos;,&apos;CHECKED_IN&apos;,&apos;IN_CONSULTATION&apos;)
                    </code>
                    .
                  </li>
                  <li>
                    <strong>Server-Side Idempotency:</strong> Unique{' '}
                    <code className="font-mono">(actor_id, request_id)</code> ledger table
                    committed in the same ACID transaction as the appointment insert.
                  </li>
                  <li>
                    <strong>AuthN / AuthZ:</strong> OIDC/OAuth2 JWT tokens with server-enforced
                    RBAC policies scoping patients strictly to their own MRN records.
                  </li>
                </ul>
              </div>
            </section>
          </div>

          {/* Diagnostic Operation Log */}
          <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800">
              <h2 className="text-sm font-display font-semibold text-slate-900 dark:text-white">
                Diagnostics Operation Stream
              </h2>
            </div>
            <div className="divide-y divide-slate-200 dark:divide-slate-800 max-h-96 overflow-y-auto">
              {sortedDiagnostics.map((d) => (
                <div
                  key={d.diagnosticId}
                  className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2 font-mono">
                      <span
                        className={`font-semibold ${
                          d.level === 'ERROR'
                            ? 'text-rose-600 dark:text-rose-400'
                            : d.level === 'WARN'
                              ? 'text-amber-600 dark:text-amber-400'
                              : 'text-sky-600 dark:text-sky-400'
                        }`}
                      >
                        [{d.level}]
                      </span>
                      <span className="font-semibold text-slate-900 dark:text-white">
                        {d.operation}
                      </span>
                      <span className="text-slate-500">({d.code})</span>
                    </div>
                    <p className="text-slate-600 dark:text-slate-300">{d.message}</p>
                  </div>
                  <span className="font-mono text-[11px] text-slate-500 tabular-nums shrink-0">
                    {formatDateTimeInZone(d.timestamp, tz)}
                  </span>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
