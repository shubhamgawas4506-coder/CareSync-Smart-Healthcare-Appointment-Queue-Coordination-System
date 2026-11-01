/**
 * CareSync Presentation Layer — Accessible Semantic Status & Metadata Primitives
 *
 * Follows strict anti-slop & zero-pill metadata discipline:
 * - Static status and metadata render as clean inline icon + text labels
 *   (never wrapped in candy pill capsules or hue-only dots).
 * - High WCAG AA contrast in both Light and Dark themes.
 */

import React from 'react';
import {
  AlertTriangle,
  ArrowRightLeft,
  Ban,
  CheckCircle2,
  Clock,
  RefreshCw,
  ShieldAlert,
  Stethoscope,
  UserCheck,
  XCircle,
} from 'lucide-react';
import {
  AppointmentEventType,
  AppointmentStatus,
  BookingOperationState,
  SlotAvailabilityStatus,
} from '../../domain/models';

export function AppointmentStatusIndicator({ status }: { status: AppointmentStatus }) {
  switch (status) {
    case AppointmentStatus.BOOKED:
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-sky-700 dark:text-sky-300 whitespace-nowrap">
          <Clock className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>Booked</span>
        </span>
      );
    case AppointmentStatus.CHECKED_IN:
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-300 whitespace-nowrap">
          <UserCheck className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>Checked In</span>
        </span>
      );
    case AppointmentStatus.IN_CONSULTATION:
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-300 whitespace-nowrap">
          <Stethoscope className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>In Consultation</span>
        </span>
      );
    case AppointmentStatus.COMPLETED:
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
          <span>Completed</span>
        </span>
      );
    case AppointmentStatus.CANCELLED:
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-rose-700 dark:text-rose-300 whitespace-nowrap">
          <XCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>Cancelled</span>
        </span>
      );
    case AppointmentStatus.RESCHEDULED:
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap">
          <ArrowRightLeft className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>Rescheduled</span>
        </span>
      );
  }
}

export function SlotStatusIndicator({
  status,
  isPast,
}: {
  status: SlotAvailabilityStatus;
  isPast?: boolean;
}) {
  if (isPast && status === SlotAvailabilityStatus.AVAILABLE) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500 whitespace-nowrap">
        <Clock className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span>Past Window</span>
      </span>
    );
  }
  switch (status) {
    case SlotAvailabilityStatus.AVAILABLE:
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400 whitespace-nowrap">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>Available</span>
        </span>
      );
    case SlotAvailabilityStatus.BOOKED:
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-sky-700 dark:text-sky-400 whitespace-nowrap">
          <UserCheck className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>Occupied</span>
        </span>
      );
    case SlotAvailabilityStatus.BLOCKED:
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap">
          <Ban className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>Blocked</span>
        </span>
      );
  }
}

export function BookingStateIndicator({ state }: { state: BookingOperationState }) {
  switch (state) {
    case BookingOperationState.PENDING:
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-sky-700 dark:text-sky-300 whitespace-nowrap">
          <Clock className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>Pending</span>
        </span>
      );
    case BookingOperationState.UNCERTAIN_INTERRUPTED:
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-300 whitespace-nowrap">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>Uncertain (Interrupted)</span>
        </span>
      );
    case BookingOperationState.RETRYING:
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-sky-700 dark:text-sky-300 whitespace-nowrap">
          <RefreshCw className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>Retrying</span>
        </span>
      );
    case BookingOperationState.CONFIRMED:
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-300 whitespace-nowrap">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>Confirmed</span>
        </span>
      );
    case BookingOperationState.FAILED:
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-rose-700 dark:text-rose-300 whitespace-nowrap">
          <XCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>Confirmed Failure</span>
        </span>
      );
  }
}

export function formatEventLabel(eventType: AppointmentEventType): {
  label: string;
  toneClass: string;
} {
  switch (eventType) {
    case AppointmentEventType.APPOINTMENT_REQUESTED:
      return { label: 'Appointment Requested', toneClass: 'text-slate-700 dark:text-slate-300' };
    case AppointmentEventType.APPOINTMENT_CONFIRMED:
      return { label: 'Appointment Confirmed', toneClass: 'text-emerald-700 dark:text-emerald-300' };
    case AppointmentEventType.APPOINTMENT_CANCELLED:
      return { label: 'Appointment Cancelled', toneClass: 'text-rose-700 dark:text-rose-300' };
    case AppointmentEventType.APPOINTMENT_RESCHEDULED:
      return { label: 'Appointment Rescheduled', toneClass: 'text-sky-700 dark:text-sky-300' };
    case AppointmentEventType.PATIENT_CHECKED_IN:
      return { label: 'Patient Checked In', toneClass: 'text-amber-700 dark:text-amber-300' };
    case AppointmentEventType.CONSULTATION_STARTED:
      return { label: 'Consultation Started', toneClass: 'text-emerald-700 dark:text-emerald-300' };
    case AppointmentEventType.CONSULTATION_COMPLETED:
      return { label: 'Consultation Completed', toneClass: 'text-slate-700 dark:text-slate-200' };
    case AppointmentEventType.BOOKING_FAILED:
      return { label: 'Booking Failed / Interrupted', toneClass: 'text-amber-700 dark:text-amber-300' };
    case AppointmentEventType.BOOKING_RETRIED:
      return { label: 'Booking Retried (Idempotent)', toneClass: 'text-sky-700 dark:text-sky-300' };
    case AppointmentEventType.SLOT_CONFLICT_DETECTED:
      return { label: 'Slot Conflict Detected', toneClass: 'text-rose-700 dark:text-rose-300' };
  }
}

export function PrototypeRoleDisclaimerBanner({
  extraNote,
}: {
  extraNote?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100/80 dark:bg-slate-900/80 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600 dark:text-slate-400">
      <div className="flex items-center gap-2">
        <ShieldAlert className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0" aria-hidden="true" />
        <span>
          <strong className="font-semibold text-slate-800 dark:text-slate-200">
            Prototype Architecture Notice:
          </strong>{' '}
          Demo role switching is for workflow and state-machine verification only — it is not real authentication or authorization. Not for clinical diagnosis or emergency care.
        </span>
      </div>
      {extraNote && (
        <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
          {extraNote}
        </span>
      )}
    </div>
  );
}
