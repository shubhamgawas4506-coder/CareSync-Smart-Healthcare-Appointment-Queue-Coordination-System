/**
 * CareSync Repository Layer — Persistence Contracts & Snapshot Schema
 *
 * Centralizes state access behind explicit repository and storage adapter
 * interfaces so domain/application logic never touches window.localStorage directly.
 */

import { DiagnosticRecord } from '../diagnostics/diagnosticsLogger';
import {
  Appointment,
  AppointmentEvent,
  BookingRequestRecord,
  ClinicPolicyConfig,
  Doctor,
  Patient,
  TimeSlot,
} from '../domain/models';

export interface CareSyncStateSnapshot {
  schemaVersion: number;
  seededAt: number;
  sequenceCounter: number;
  policy: ClinicPolicyConfig;
  patients: Record<string, Patient>;
  doctors: Record<string, Doctor>;
  timeSlots: Record<string, TimeSlot>;
  appointments: Record<string, Appointment>;
  events: AppointmentEvent[];
  bookingRequests: Record<string, BookingRequestRecord>;
  diagnostics: DiagnosticRecord[];
}

export interface IStorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export class RepositoryStorageError extends Error {
  public readonly causeError?: unknown;

  constructor(message: string, causeError?: unknown) {
    super(message);
    this.name = 'RepositoryStorageError';
    this.causeError = causeError;
  }
}

export interface StorageHealthReport {
  storageAvailable: boolean;
  simulatedFailureActive: boolean;
  schemaVersion: number;
  serializedSizeBytes: number;
  appointmentCount: number;
  slotCount: number;
  eventCount: number;
  interruptedRequestCount: number;
  lastVerifiedAt: number;
}

export interface ICareSyncRepository {
  getSnapshot(): CareSyncStateSnapshot;
  /**
   * Executes a synchronous unit-of-work against an isolated draft copy of the snapshot.
   * Commits atomically to persistent storage only if the mutator completes without throwing.
   * Rolls back completely if either domain rules or storage persistence fail.
   */
  transact<T>(mutator: (draft: CareSyncStateSnapshot) => T): T;
  resetToSeed(nowMs?: number): CareSyncStateSnapshot;
  setSimulatedStorageFailure(enabled: boolean): void;
  isSimulatedStorageFailureActive(): boolean;
  getStorageHealth(nowMs?: number): StorageHealthReport;
}
