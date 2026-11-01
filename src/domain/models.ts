/**
 * CareSync Domain Layer — Core Models & Value Types
 *
 * Pure TypeScript definitions with zero UI or persistence dependencies.
 * All timestamps are integer epoch milliseconds (UTC), converted explicitly
 * at presentation boundaries using the configured clinic IANA timezone.
 */

export enum UserRole {
  PATIENT = 'PATIENT',
  DOCTOR = 'DOCTOR',
  COORDINATOR = 'COORDINATOR',
}

export enum AppointmentStatus {
  BOOKED = 'BOOKED',
  CHECKED_IN = 'CHECKED_IN',
  IN_CONSULTATION = 'IN_CONSULTATION',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  RESCHEDULED = 'RESCHEDULED',
}

export enum SlotAvailabilityStatus {
  AVAILABLE = 'AVAILABLE',
  BOOKED = 'BOOKED',
  BLOCKED = 'BLOCKED',
}

export enum BookingOperationState {
  PENDING = 'PENDING',
  UNCERTAIN_INTERRUPTED = 'UNCERTAIN_INTERRUPTED',
  RETRYING = 'RETRYING',
  CONFIRMED = 'CONFIRMED',
  FAILED = 'FAILED',
}

export enum AppointmentEventType {
  APPOINTMENT_REQUESTED = 'APPOINTMENT_REQUESTED',
  APPOINTMENT_CONFIRMED = 'APPOINTMENT_CONFIRMED',
  APPOINTMENT_CANCELLED = 'APPOINTMENT_CANCELLED',
  APPOINTMENT_RESCHEDULED = 'APPOINTMENT_RESCHEDULED',
  PATIENT_CHECKED_IN = 'PATIENT_CHECKED_IN',
  CONSULTATION_STARTED = 'CONSULTATION_STARTED',
  CONSULTATION_COMPLETED = 'CONSULTATION_COMPLETED',
  BOOKING_FAILED = 'BOOKING_FAILED',
  BOOKING_RETRIED = 'BOOKING_RETRIED',
  SLOT_CONFLICT_DETECTED = 'SLOT_CONFLICT_DETECTED',
}

export interface Patient {
  patientId: string;
  name: string;
  contact: string;
  mrn: string;
  dateOfBirth: string;
  appointmentIds: string[];
}

export interface DoctorAvailabilityRule {
  dayOfWeek: number; // 0 (Sun) - 6 (Sat)
  startHour: string; // "09:00" in clinic timezone
  endHour: string;   // "17:00" in clinic timezone
  slotDurationMinutes: number;
}

export interface Doctor {
  doctorId: string;
  name: string;
  specialty: string;
  room: string;
  avgConsultationMinutes: number;
  avatarUrl: string;
  bio: string;
  availability: DoctorAvailabilityRule[];
}

export interface TimeSlot {
  slotId: string;
  doctorId: string;
  /** YYYY-MM-DD in clinic local timezone */
  date: string;
  /** Epoch milliseconds (UTC) */
  startTime: number;
  /** Epoch milliseconds (UTC) */
  endTime: number;
  availabilityStatus: SlotAvailabilityStatus;
  /** Reference to currently occupying active appointment, if any */
  activeAppointmentId?: string;
}

export interface Appointment {
  appointmentId: string;
  requestId: string;
  patientId: string;
  doctorId: string;
  slotId: string;
  /** YYYY-MM-DD in clinic local timezone */
  date: string;
  /** Epoch milliseconds (UTC) */
  startTime: number;
  /** Epoch milliseconds (UTC) */
  endTime: number;
  status: AppointmentStatus;
  reasonForVisit: string;
  cancelReason?: string;
  rescheduledFromAppointmentId?: string;
  rescheduledToAppointmentId?: string;
  checkedInAt?: number;
  consultationStartedAt?: number;
  completedAt?: number;
  createdAt: number;
  updatedAt: number;
}

export interface AppointmentEvent {
  eventId: string;
  appointmentId: string;
  requestId?: string;
  eventType: AppointmentEventType;
  previousStatus: AppointmentStatus | SlotAvailabilityStatus | null;
  newStatus: AppointmentStatus | SlotAvailabilityStatus | null;
  actorId: string;
  actorRole: UserRole | 'SYSTEM';
  reason: string;
  timestamp: number;
}

export type BookingFailureCode =
  | 'NETWORK_INTERRUPTED'
  | 'SLOT_CONFLICT'
  | 'INVALID_SLOT'
  | 'PAST_SLOT'
  | 'STORAGE_ERROR'
  | 'VALIDATION_ERROR';

export interface BookingRequestRecord {
  requestId: string;
  patientId: string;
  doctorId: string;
  slotId: string;
  reasonForVisit: string;
  state: BookingOperationState;
  outcomeAppointmentId?: string;
  failureCode?: BookingFailureCode;
  failureMessage?: string;
  attemptCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface ClinicPolicyConfig {
  /**
   * Controls whether an appointment in CHECKED_IN state can still transition
   * to CANCELLED. Enforced strictly by the domain state machine.
   */
  allowCheckedInCancellation: boolean;
  /** IANA timezone identifier for explicit timestamp rendering */
  clinicTimezone: string;
  clinicName: string;
}

export class DomainRuleError extends Error {
  public readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'DomainRuleError';
    this.code = code;
  }
}
