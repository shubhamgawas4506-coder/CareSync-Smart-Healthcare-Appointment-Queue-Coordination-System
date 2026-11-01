/**
 * Patient Screens:
 * - Screen 3: Doctor Directory & Intelligent Appointment Booking (`PatientBookingView`)
 *   Includes pre-assigned idempotent requestId, Simulate Network Interruption toggle,
 *   and Second-Patient Conflict Verification action.
 * - Screen 5: Patient Appointment History (`PatientHistoryView`)
 *   Includes atomic Reschedule workflow, Cancellation with slot release, and per-visit audit log.
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRightLeft,
  Calendar,
  CheckCircle2,
  RefreshCw,
  Search,
  ShieldAlert,
  WifiOff,
  XCircle,
} from 'lucide-react';
import {
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
import { DoctorAvatar } from '../assets';
import { useCareSync } from '../CareSyncContext';
import {
  AppointmentStatusIndicator,
  BookingStateIndicator,
  formatEventLabel,
} from '../components/StatusPrimitives';

export function PatientBookingView() {
  const {
    snapshot,
    activePatientId,
    preselectedDoctorIdForBooking,
    setPreselectedDoctorIdForBooking,
    generateRequestId,
    submitBooking,
    retryInterruptedRequest,
    navigateTo,
  } = useCareSync();

  const tz = snapshot.policy.clinicTimezone;
  const nowMs = Date.now();
  const doctors = useMemo(() => Object.values(snapshot.doctors), [snapshot.doctors]);
  const specialties = useMemo(
    () => ['ALL', ...Array.from(new Set(doctors.map((d) => d.specialty)))],
    [doctors],
  );

  const [specialtyFilter, setSpecialtyFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedDoctorId, setSelectedDoctorId] = useState<string>(
    preselectedDoctorIdForBooking ?? doctors[0]?.doctorId ?? 'doc_sarah_jenkins',
  );

  useEffect(() => {
    if (preselectedDoctorIdForBooking) {
      setSelectedDoctorId(preselectedDoctorIdForBooking);
      setPreselectedDoctorIdForBooking(null);
    }
  }, [preselectedDoctorIdForBooking, setPreselectedDoctorIdForBooking]);

  const filteredDoctors = useMemo(() => {
    return doctors.filter((doc) => {
      if (specialtyFilter !== 'ALL' && doc.specialty !== specialtyFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          doc.name.toLowerCase().includes(q) ||
          doc.specialty.toLowerCase().includes(q) ||
          doc.room.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [doctors, searchQuery, specialtyFilter]);

  const doctorDates = useMemo(() => {
    const dates = Array.from(
      new Set<string>(
        Object.values(snapshot.timeSlots)
          .filter((s) => s.doctorId === selectedDoctorId)
          .map((s) => s.date),
      ),
    ).sort();
    return dates;
  }, [selectedDoctorId, snapshot.timeSlots]);

  const [selectedDate, setSelectedDate] = useState<string>(() => doctorDates[0] ?? '');

  useEffect(() => {
    if (doctorDates.length > 0 && !doctorDates.includes(selectedDate)) {
      // Prefer first date that has at least one future available slot
      const firstWithOpen = doctorDates.find((d) =>
        Object.values(snapshot.timeSlots).some(
          (s) =>
            s.doctorId === selectedDoctorId &&
            s.date === d &&
            s.availabilityStatus === SlotAvailabilityStatus.AVAILABLE &&
            s.startTime > Date.now(),
        ),
      );
      setSelectedDate(firstWithOpen ?? doctorDates[0]);
    }
  }, [doctorDates, selectedDate, selectedDoctorId, snapshot.timeSlots]);

  const slotsForSelectedDate = useMemo(() => {
    return Object.values(snapshot.timeSlots)
      .filter((s) => s.doctorId === selectedDoctorId && s.date === selectedDate)
      .sort((a, b) => a.startTime - b.startTime);
  }, [selectedDate, selectedDoctorId, snapshot.timeSlots]);

  const [selectedSlotId, setSelectedSlotId] = useState<string>('');
  const [reasonForVisit, setReasonForVisit] = useState<string>(
    'Follow-up blood pressure & cardiovascular consultation',
  );
  const [simulateNetworkDrop, setSimulateNetworkDrop] = useState<boolean>(false);

  // Check if active patient already has a persisted UNCERTAIN_INTERRUPTED request (e.g. after page reload)
  const recoveredInterruptedForPatient = useMemo(() => {
    return Object.values(snapshot.bookingRequests)
      .filter(
        (r) => r.patientId === activePatientId && r.state === 'UNCERTAIN_INTERRUPTED',
      )
      .sort((a, b) => b.updatedAt - a.updatedAt)[0];
  }, [activePatientId, snapshot.bookingRequests]);

  const [currentRequestId, setCurrentRequestId] = useState<string>(
    () => recoveredInterruptedForPatient?.requestId ?? generateRequestId(),
  );
  const [formFeedback, setFormFeedback] = useState<{
    type: 'uncertain' | 'rejected' | 'conflict_demo';
    title: string;
    detail: string;
    requestId: string;
  } | null>(null);

  // Keep form synchronized if a persisted uncertain request exists after reload or persona switch
  useEffect(() => {
    if (recoveredInterruptedForPatient) {
      setCurrentRequestId(recoveredInterruptedForPatient.requestId);
      setSelectedDoctorId(recoveredInterruptedForPatient.doctorId);
      const recSlot = snapshot.timeSlots[recoveredInterruptedForPatient.slotId];
      if (recSlot) {
        setSelectedDate(recSlot.date);
      }
      setSelectedSlotId(recoveredInterruptedForPatient.slotId);
      setReasonForVisit(recoveredInterruptedForPatient.reasonForVisit);
    }
  }, [recoveredInterruptedForPatient, snapshot.timeSlots]);

  // Auto-select first available future slot when doctor or date changes ONLY if no uncertain operation is active
  const activeReqRecord = snapshot.bookingRequests[currentRequestId];
  const isCurrentReqUncertain = activeReqRecord?.state === 'UNCERTAIN_INTERRUPTED';

  useEffect(() => {
    if (isCurrentReqUncertain) return;
    const nowCheck = Date.now();
    const myActiveApts = Object.values(snapshot.appointments).filter(
      (a) =>
        a.patientId === activePatientId &&
        (a.status === AppointmentStatus.BOOKED ||
          a.status === AppointmentStatus.CHECKED_IN ||
          a.status === AppointmentStatus.IN_CONSULTATION),
    );
    const conflictFreeValid = slotsForSelectedDate.find(
      (s) =>
        s.availabilityStatus === SlotAvailabilityStatus.AVAILABLE &&
        s.startTime > nowCheck &&
        !myActiveApts.some((apt) => apt.startTime < s.endTime && s.startTime < apt.endTime),
    );
    const anyValid = slotsForSelectedDate.find(
      (s) => s.availabilityStatus === SlotAvailabilityStatus.AVAILABLE && s.startTime > nowCheck,
    );
    setSelectedSlotId((conflictFreeValid ?? anyValid)?.slotId ?? '');
  }, [activePatientId, isCurrentReqUncertain, slotsForSelectedDate, snapshot.appointments]);

  const selectedDoctor = snapshot.doctors[selectedDoctorId];
  const selectedSlot = snapshot.timeSlots[selectedSlotId];

  const handleSubmitBooking = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSlotId) {
      setFormFeedback({
        type: 'rejected',
        title: 'Select an Available Time Slot',
        detail: 'Please pick an open future appointment window before submitting.',
        requestId: currentRequestId,
      });
      return;
    }

    const res = submitBooking({
      requestId: currentRequestId,
      patientId: activePatientId,
      doctorId: selectedDoctorId,
      slotId: selectedSlotId,
      reasonForVisit,
      actorId: activePatientId,
      actorRole: UserRole.PATIENT,
      simulateNetworkFailure: simulateNetworkDrop,
    });

    if (res.outcome === 'CONFIRMED') {
      setFormFeedback(null);
      setCurrentRequestId(generateRequestId());
      navigateTo('patient-confirmation');
    } else if (res.outcome === 'UNCERTAIN_INTERRUPTED') {
      setFormFeedback({
        type: 'uncertain',
        title: 'Network Interrupted After Request Dispatch (Outcome Uncertain)',
        detail: res.message,
        requestId: res.requestRecord.requestId,
      });
      // Automatically turn off simulateNetworkDrop so clicking "Retry with Same Request ID" succeeds cleanly!
      setSimulateNetworkDrop(false);
    } else {
      setFormFeedback({
        type: 'rejected',
        title: `Confirmed Failure: ${res.errorCode}`,
        detail: res.message,
        requestId: res.requestRecord.requestId,
      });
      // Assign a fresh requestId for a new slot selection since this attempt reached a terminal rejection
      setCurrentRequestId(generateRequestId());
    }
  };

  const handleRetrySameRequest = () => {
    const res = retryInterruptedRequest(currentRequestId);
    if (res?.outcome === 'CONFIRMED') {
      setFormFeedback(null);
      setCurrentRequestId(generateRequestId());
    } else if (res?.outcome === 'REJECTED') {
      setFormFeedback({
        type: 'rejected',
        title: `Retry Rejected (${res.errorCode})`,
        detail: res.message,
        requestId: res.requestRecord.requestId,
      });
      setCurrentRequestId(generateRequestId());
    }
  };

  // Allows immediate testing of a second patient attempting to double-book an occupied slot on this date
  const occupiedSlotOnDate = slotsForSelectedDate.find(
    (s) => s.availabilityStatus === SlotAvailabilityStatus.BOOKED && s.startTime > nowMs,
  );

  const handleTriggerSecondPatientConflictDemo = () => {
    if (!occupiedSlotOnDate) return;
    const secondPatientId =
      activePatientId === 'pat_rohan_patel' ? 'pat_claire_bennett' : 'pat_rohan_patel';
    const conflictReqId = generateRequestId();
    const res = submitBooking({
      requestId: conflictReqId,
      patientId: secondPatientId,
      doctorId: selectedDoctorId,
      slotId: occupiedSlotOnDate.slotId,
      reasonForVisit: 'Attempted concurrent double-booking on occupied slot',
      actorId: secondPatientId,
      actorRole: UserRole.PATIENT,
      simulateNetworkFailure: false,
    });
    if (res.outcome === 'REJECTED') {
      setFormFeedback({
        type: 'conflict_demo',
        title: `Double-Booking Blocked (${res.errorCode})`,
        detail: `Second patient (${snapshot.patients[secondPatientId]?.name}) attempted to book occupied slot ${occupiedSlotOnDate.slotId}. System rejected conflict and logged SLOT_CONFLICT_DETECTED.`,
        requestId: conflictReqId,
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-slate-900 dark:text-white">
            Doctor Directory &amp; Appointment Booking
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Select a specialist and open time slot. Past and occupied windows are strictly validated
            immediately before atomic confirmation.
          </p>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
          {specialties.map((spec) => (
            <button
              key={spec}
              type="button"
              onClick={() => setSpecialtyFilter(spec)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                specialtyFilter === spec
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {spec === 'ALL' ? 'All Specialties' : spec}
            </button>
          ))}
        </div>

        <div className="relative w-full lg:w-72">
          <Search
            className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"
            aria-hidden="true"
          />
          <label htmlFor="doctor-directory-search" className="sr-only">
            Search doctors by name, specialty, or suite
          </label>
          <input
            id="doctor-directory-search"
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search specialist or suite..."
            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
          />
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Specialist Directory */}
        <section className="lg:col-span-5 space-y-3" aria-label="Specialist directory">
          {filteredDoctors.map((doc) => {
            const isSelected = doc.doctorId === selectedDoctorId;
            const openSlotsCount = Object.values(snapshot.timeSlots).filter(
              (s) =>
                s.doctorId === doc.doctorId &&
                s.availabilityStatus === SlotAvailabilityStatus.AVAILABLE &&
                s.startTime > nowMs,
            ).length;

            return (
              <button
                key={doc.doctorId}
                type="button"
                disabled={isCurrentReqUncertain}
                onClick={() => setSelectedDoctorId(doc.doctorId)}
                className={`w-full text-left rounded-2xl border p-5 transition-colors flex items-start gap-4 cursor-pointer ${
                  isSelected
                    ? 'bg-white dark:bg-slate-900 border-sky-500 dark:border-sky-400 ring-1 ring-sky-500/30'
                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                } ${isCurrentReqUncertain ? 'opacity-70 cursor-not-allowed' : ''}`}
              >
                <DoctorAvatar avatarKey={doc.avatarUrl} name={doc.name} size="md" />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-base font-display font-bold text-slate-900 dark:text-white truncate">
                      {doc.name}
                    </h2>
                    <span className="text-xs font-mono tabular-nums text-emerald-700 dark:text-emerald-400 shrink-0">
                      {openSlotsCount} open
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {doc.specialty} <span aria-hidden="true">·</span> {doc.room}{' '}
                    <span aria-hidden="true">·</span>{' '}
                    <span className="tabular-nums">~{doc.avgConsultationMinutes}m consult</span>
                  </p>
                  <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-2">
                    {doc.bio}
                  </p>
                </div>
              </button>
            );
          })}
        </section>

        {/* Right Column: Date Picker, TimeSlot Matrix & Idempotent Booking Form */}
        <section className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 lg:p-7 space-y-6">
          {selectedDoctor && (
            <div className="flex items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
              <div>
                <p className="text-xs text-sky-600 dark:text-sky-400 font-medium">
                  Selected Specialist
                </p>
                <h2 className="text-xl font-display font-bold text-slate-900 dark:text-white mt-0.5">
                  {selectedDoctor.name} · {selectedDoctor.specialty}
                </h2>
              </div>
              <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                {selectedDoctor.room}
              </span>
            </div>
          )}

          {/* Clinic Date Selector */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              1. Choose Clinic Date ({tz})
            </label>
            <div className="flex flex-wrap gap-2">
              {doctorDates.map((dStr) => {
                const active = dStr === selectedDate;
                return (
                  <button
                    key={dStr}
                    type="button"
                    disabled={isCurrentReqUncertain}
                    onClick={() => setSelectedDate(dStr)}
                    className={`px-3.5 py-2 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap cursor-pointer ${
                      active
                        ? 'bg-sky-600 text-white border-sky-600 dark:bg-sky-500 dark:text-slate-950 dark:border-sky-500'
                        : 'bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:border-slate-300'
                    }`}
                  >
                    <Calendar className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5" aria-hidden="true" />
                    {formatClinicDateLabel(dStr, tz)}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Time Slot Grid */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                2. Select Time Slot
              </label>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                Occupied, blocked, and past windows are protected against booking
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {slotsForSelectedDate.map((slot) => {
                const isPast = slot.startTime <= nowMs;
                const isBookable =
                  slot.availabilityStatus === SlotAvailabilityStatus.AVAILABLE && !isPast;
                const isPicked = slot.slotId === selectedSlotId;

                const stateSubtext =
                  slot.availabilityStatus === SlotAvailabilityStatus.BOOKED
                    ? 'Occupied'
                    : slot.availabilityStatus === SlotAvailabilityStatus.BLOCKED
                      ? 'Blocked'
                      : isPast
                        ? 'Past slot'
                        : 'Available';

                return (
                  <button
                    key={slot.slotId}
                    type="button"
                    disabled={!isBookable || isCurrentReqUncertain}
                    onClick={() => setSelectedSlotId(slot.slotId)}
                    className={`p-3 rounded-xl border text-left transition-colors ${
                      isPicked
                        ? 'bg-sky-600 text-white border-sky-600 dark:bg-sky-500 dark:text-slate-950 dark:border-sky-500 cursor-pointer'
                        : isBookable
                          ? 'bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 hover:border-sky-400 text-slate-900 dark:text-slate-100 cursor-pointer'
                          : 'bg-slate-100/80 dark:bg-slate-900/50 border-slate-200/70 dark:border-slate-800/70 text-slate-400 dark:text-slate-600 cursor-not-allowed'
                    }`}
                  >
                    <p className="font-mono text-xs font-semibold tabular-nums">
                      {formatTimeInZone(slot.startTime, tz)}
                    </p>
                    <p
                      className={`text-[11px] mt-0.5 ${
                        isPicked
                          ? 'text-sky-100 dark:text-slate-900'
                          : isBookable
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : 'text-slate-400 dark:text-slate-500'
                      }`}
                    >
                      {stateSubtext}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Booking Form & Network Interruption Resilience Controls */}
          <form onSubmit={handleSubmitBooking} className="space-y-4 pt-2 border-t border-slate-200 dark:border-slate-800">
            <div>
              <label
                htmlFor="booking-visit-reason"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
              >
                3. Reason for Visit (Required)
              </label>
              <input
                id="booking-visit-reason"
                type="text"
                required
                disabled={isCurrentReqUncertain}
                value={reasonForVisit}
                onChange={(e) => setReasonForVisit(e.target.value)}
                placeholder="Describe symptoms or follow-up goal..."
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3.5 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>

            {/* Architecture Feature D: Safe Booking, Request ID & Network Simulation Panel */}
            <div className="rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  Idempotent Request Envelope
                </span>
                <span className="font-mono text-slate-600 dark:text-slate-400 tabular-nums">
                  requestId: <strong className="text-slate-900 dark:text-white">{currentRequestId}</strong>
                </span>
              </div>

              <div className="flex items-start gap-2.5">
                <input
                  id="simulate-network-drop-checkbox"
                  type="checkbox"
                  checked={simulateNetworkDrop}
                  onChange={(e) => setSimulateNetworkDrop(e.target.checked)}
                  className="mt-0.5 rounded border-slate-300 text-sky-600 focus:ring-sky-500 cursor-pointer"
                />
                <label
                  htmlFor="simulate-network-drop-checkbox"
                  className="text-xs text-slate-700 dark:text-slate-300 cursor-pointer leading-relaxed"
                >
                  <WifiOff className="w-3.5 h-3.5 inline mr-1 -mt-0.5 text-amber-600" />
                  <strong>Simulate network interruption during booking:</strong> Drops connection
                  after request initiation so you can verify <code className="font-mono">UNCERTAIN_INTERRUPTED</code>{' '}
                  state, test browser page reload persistence, and retry safely with the same{' '}
                  <code className="font-mono">requestId</code> without creating duplicates.
                </label>
              </div>

              {activeReqRecord && (
                <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
                  <BookingStateIndicator state={activeReqRecord.state} />
                  <span className="font-mono tabular-nums text-slate-500">
                    Attempts recorded: {activeReqRecord.attemptCount}
                  </span>
                </div>
              )}
            </div>

            {/* Inline Outcome Distinction Callout */}
            {formFeedback && (
              <div
                role="status"
                className={`rounded-xl border p-4 text-xs space-y-2 ${
                  formFeedback.type === 'uncertain'
                    ? 'bg-amber-50/90 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800 text-amber-950 dark:text-amber-100'
                    : 'bg-rose-50/90 dark:bg-rose-950/40 border-rose-300 dark:border-rose-800 text-rose-950 dark:text-rose-100'
                }`}
              >
                <div className="flex items-center gap-2 font-semibold">
                  {formFeedback.type === 'uncertain' ? (
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                  ) : (
                    <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />
                  )}
                  <span>{formFeedback.title}</span>
                </div>
                <p>{formFeedback.detail}</p>
                <p className="font-mono text-[11px] opacity-80 tabular-nums">
                  Traced Request ID: {formFeedback.requestId}
                </p>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              {isCurrentReqUncertain ? (
                <button
                  type="button"
                  onClick={handleRetrySameRequest}
                  className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                >
                  <RefreshCw className="w-4 h-4" aria-hidden="true" />
                  <span>Retry Booking with Same Request ID</span>
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!selectedSlot}
                  className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-sky-600 hover:bg-sky-700 dark:bg-sky-500 dark:hover:bg-sky-400 dark:text-slate-950 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                  <span>
                    {selectedSlot
                      ? `Confirm Slot (${formatTimeInZone(selectedSlot.startTime, tz)})`
                      : 'Select an Open Slot'}
                  </span>
                </button>
              )}

              {occupiedSlotOnDate && (
                <button
                  type="button"
                  onClick={handleTriggerSecondPatientConflictDemo}
                  className="px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                >
                  Demo: 2nd Patient Tries Occupied {formatTimeInZone(occupiedSlotOnDate.startTime, tz)} Slot
                </button>
              )}
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}

/**
 * Screen 5: Patient Appointment History, Cancellation & Rescheduling
 */
export function PatientHistoryView() {
  const {
    snapshot,
    activePatientId,
    transitionStatus,
    rescheduleAppointment,
    navigateTo,
  } = useCareSync();

  const tz = snapshot.policy.clinicTimezone;
  const nowMs = Date.now();
  const patient = snapshot.patients[activePatientId] ?? Object.values(snapshot.patients)[0];

  const [tab, setTab] = useState<'UPCOMING' | 'PAST' | 'ALL'>('ALL');
  const [cancellingAptId, setCancellingAptId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState<string>('Schedule conflict — releasing slot');
  const [reschedulingAptId, setReschedulingAptId] = useState<string | null>(null);
  const [targetRescheduleSlotId, setTargetRescheduleSlotId] = useState<string>('');
  const [rescheduleReason, setRescheduleReason] = useState<string>(
    'Requested updated appointment window',
  );
  const [expandedHistoryAptId, setExpandedHistoryAptId] = useState<string | null>(null);

  const appointments = useMemo(() => {
    return Object.values(snapshot.appointments)
      .filter((a) => {
        if (a.patientId !== patient.patientId) return false;
        const isActive =
          a.status === AppointmentStatus.BOOKED ||
          a.status === AppointmentStatus.CHECKED_IN ||
          a.status === AppointmentStatus.IN_CONSULTATION;
        if (tab === 'UPCOMING') return isActive;
        if (tab === 'PAST') return !isActive;
        return true;
      })
      .sort((a, b) => b.startTime - a.startTime);
  }, [patient.patientId, snapshot.appointments, tab]);

  const handleConfirmCancel = (appointmentId: string) => {
    const res = transitionStatus({
      appointmentId,
      targetStatus: AppointmentStatus.CANCELLED,
      actorId: patient.patientId,
      actorRole: UserRole.PATIENT,
      reason: cancelReason,
    });
    if (res) {
      setCancellingAptId(null);
    }
  };

  const handleConfirmReschedule = (appointmentId: string) => {
    if (!targetRescheduleSlotId) return;
    const out = rescheduleAppointment({
      appointmentId,
      newSlotId: targetRescheduleSlotId,
      actorId: patient.patientId,
      actorRole: UserRole.PATIENT,
      reason: rescheduleReason,
    });
    if (out) {
      setReschedulingAptId(null);
      setTargetRescheduleSlotId('');
      navigateTo('patient-confirmation');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-slate-900 dark:text-white">
            Appointment History &amp; Lifecycle Management
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Cancel or reschedule upcoming visits. Cancelled and rescheduled appointments immediately
            release their original time slot back to Available.
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-200/70 dark:bg-slate-800 rounded-lg self-start">
          {(['ALL', 'UPCOMING', 'PAST'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                tab === t
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {t === 'ALL' ? 'All Records' : t === 'UPCOMING' ? 'Active / Upcoming' : 'Completed & Closed'}
            </button>
          ))}
        </div>
      </div>

      {appointments.length === 0 ? (
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-10 text-center space-y-3">
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
            No appointment records found for {patient.name} in this view.
          </p>
          <button
            type="button"
            onClick={() => navigateTo('patient-booking')}
            className="px-4 py-2 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-700 rounded-lg cursor-pointer"
          >
            Book an Appointment
          </button>
        </section>
      ) : (
        <div className="space-y-4">
          {appointments.map((apt) => {
            const doc = snapshot.doctors[apt.doctorId];
            const allowed = getAllowedNextStatuses(apt.status, snapshot.policy);
            const canCancel = allowed.includes(AppointmentStatus.CANCELLED);
            const canReschedule = allowed.includes(AppointmentStatus.RESCHEDULED);

            const openAlternativeSlots = reschedulingAptId === apt.appointmentId
              ? Object.values(snapshot.timeSlots)
                  .filter(
                    (s) =>
                      s.doctorId === apt.doctorId &&
                      s.slotId !== apt.slotId &&
                      s.availabilityStatus === SlotAvailabilityStatus.AVAILABLE &&
                      s.startTime > nowMs,
                  )
                  .sort((a, b) => a.startTime - b.startTime)
                  .slice(0, 9)
              : [];

            const aptEvents = snapshot.events
              .filter((e) => e.appointmentId === apt.appointmentId)
              .sort((a, b) => a.timestamp - b.timestamp);

            return (
              <section
                key={apt.appointmentId}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4"
              >
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div className="flex items-start gap-4">
                    {doc && <DoctorAvatar avatarKey={doc.avatarUrl} name={doc.name} size="sm" />}
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-slate-500 dark:text-slate-400 tabular-nums">
                        <span>{formatClinicDateLabel(apt.date, tz)}</span>
                        <span aria-hidden="true">·</span>
                        <span>
                          {formatTimeInZone(apt.startTime, tz)} – {formatTimeInZone(apt.endTime, tz)}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{apt.appointmentId}</span>
                        <span aria-hidden="true">·</span>
                        <span>Req: {apt.requestId}</span>
                      </div>
                      <h2 className="text-base font-display font-bold text-slate-900 dark:text-white">
                        {doc?.name ?? apt.doctorId}{' '}
                        <span className="font-normal text-sm text-slate-500 dark:text-slate-400">
                          · {doc?.specialty} ({doc?.room})
                        </span>
                      </h2>
                      <p className="text-xs text-slate-600 dark:text-slate-400">
                        Visit reason: {apt.reasonForVisit}
                      </p>
                      {apt.cancelReason && (
                        <p className="text-xs text-rose-700 dark:text-rose-300">
                          Cancellation note: {apt.cancelReason}
                        </p>
                      )}
                      {apt.rescheduledToAppointmentId && (
                        <p className="text-xs text-sky-700 dark:text-sky-300 font-mono">
                          Rescheduled → {apt.rescheduledToAppointmentId}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                    <AppointmentStatusIndicator status={apt.status} />

                    {canReschedule && (
                      <button
                        type="button"
                        onClick={() => {
                          setReschedulingAptId((prev) =>
                            prev === apt.appointmentId ? null : apt.appointmentId,
                          );
                          setCancellingAptId(null);
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-sky-700 dark:text-sky-300 bg-sky-50 hover:bg-sky-100 dark:bg-sky-950/60 dark:hover:bg-sky-900/50 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                      >
                        <ArrowRightLeft className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Reschedule</span>
                      </button>
                    )}

                    {canCancel && (
                      <button
                        type="button"
                        onClick={() => {
                          setCancellingAptId((prev) =>
                            prev === apt.appointmentId ? null : apt.appointmentId,
                          );
                          setReschedulingAptId(null);
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800/80 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                      >
                        <XCircle className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Cancel</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() =>
                        setExpandedHistoryAptId((prev) =>
                          prev === apt.appointmentId ? null : apt.appointmentId,
                        )
                      }
                      className="px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                    >
                      {expandedHistoryAptId === apt.appointmentId
                        ? 'Hide Audit Trail'
                        : `Events (${aptEvents.length})`}
                    </button>
                  </div>
                </div>

                {apt.status === AppointmentStatus.CHECKED_IN &&
                  !snapshot.policy.allowCheckedInCancellation && (
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Note: Because you are already Checked In, self-cancellation is locked per
                      clinic policy (please speak with the Clinic Coordinator if you need to leave).
                    </p>
                  )}

                {/* Inline Reschedule Panel */}
                {reschedulingAptId === apt.appointmentId && (
                  <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-3">
                    <p className="text-xs font-semibold text-slate-900 dark:text-white">
                      Select Replacement Slot with {doc?.name} (Releases {apt.slotId} Atomically)
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      {openAlternativeSlots.map((s) => (
                        <button
                          key={s.slotId}
                          type="button"
                          onClick={() => setTargetRescheduleSlotId(s.slotId)}
                          className={`p-2.5 rounded-lg border text-left text-xs transition-colors cursor-pointer ${
                            targetRescheduleSlotId === s.slotId
                              ? 'bg-sky-600 text-white border-sky-600 dark:bg-sky-500 dark:text-slate-950'
                              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 hover:border-sky-400'
                          }`}
                        >
                          <p className="font-semibold">{formatClinicDateLabel(s.date, tz)}</p>
                          <p className="font-mono tabular-nums mt-0.5">
                            {formatTimeInZone(s.startTime, tz)}
                          </p>
                        </button>
                      ))}
                    </div>
                    <div>
                      <label
                        htmlFor={`resched-reason-${apt.appointmentId}`}
                        className="block text-xs text-slate-600 dark:text-slate-400 mb-1"
                      >
                        Reschedule Reason
                      </label>
                      <input
                        id={`resched-reason-${apt.appointmentId}`}
                        type="text"
                        value={rescheduleReason}
                        onChange={(e) => setRescheduleReason(e.target.value)}
                        className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs text-slate-900 dark:text-slate-100"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={!targetRescheduleSlotId}
                        onClick={() => handleConfirmReschedule(apt.appointmentId)}
                        className="px-4 py-2 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-700 disabled:opacity-50 rounded-lg cursor-pointer"
                      >
                        Confirm Atomic Reschedule
                      </button>
                      <button
                        type="button"
                        onClick={() => setReschedulingAptId(null)}
                        className="px-3 py-2 text-xs text-slate-600 dark:text-slate-400 cursor-pointer"
                      >
                        Close
                      </button>
                    </div>
                  </div>
                )}

                {/* Inline Cancel Panel */}
                {cancellingAptId === apt.appointmentId && (
                  <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-3">
                    <label
                      htmlFor={`cancel-reason-${apt.appointmentId}`}
                      className="block text-xs font-semibold text-slate-900 dark:text-white"
                    >
                      Reason for Cancellation (Slot {apt.slotId} will become Available again)
                    </label>
                    <input
                      id={`cancel-reason-${apt.appointmentId}`}
                      type="text"
                      value={cancelReason}
                      onChange={(e) => setCancelReason(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs text-slate-900 dark:text-slate-100"
                    />
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleConfirmCancel(apt.appointmentId)}
                        className="px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg cursor-pointer"
                      >
                        Confirm Cancellation
                      </button>
                      <button
                        type="button"
                        onClick={() => setCancellingAptId(null)}
                        className="px-3 py-2 text-xs text-slate-600 dark:text-slate-400 cursor-pointer"
                      >
                        Keep Visit
                      </button>
                    </div>
                  </div>
                )}

                {/* Expandable Per-Appointment Audit Trail */}
                {expandedHistoryAptId === apt.appointmentId && (
                  <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
                    <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                      Timestamped Lifecycle Transitions
                    </p>
                    {aptEvents.map((evt) => {
                      const meta = formatEventLabel(evt.eventType);
                      return (
                        <div
                          key={evt.eventId}
                          className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs py-1.5 border-b last:border-b-0 border-slate-100 dark:border-slate-800/60"
                        >
                          <div>
                            <span className={`font-semibold ${meta.toneClass}`}>{meta.label}</span>{' '}
                            <span className="text-slate-500">
                              · Actor <span className="font-mono">{evt.actorId}</span>
                            </span>
                            <p className="text-slate-600 dark:text-slate-400">{evt.reason}</p>
                          </div>
                          <span className="font-mono text-[11px] text-slate-500 tabular-nums shrink-0">
                            {formatDateTimeInZone(evt.timestamp, tz)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
