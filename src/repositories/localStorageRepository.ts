/**
 * CareSync Repository Layer — Atomic LocalStorage & In-Memory Repository Implementation
 *
 * Ensures consistent updates across appointments, timeSlots, patients, bookingRequests,
 * and audit events by serializing the complete CareSyncStateSnapshot atomically.
 *
 * Single-device prototype disclaimer:
 * Browser localStorage persists state reliably across refreshes and restarts on one
 * browser profile, without claiming multi-device or concurrent server synchronization.
 */

import { createDiagnosticRecord } from '../diagnostics/diagnosticsLogger';
import {
  CareSyncStateSnapshot,
  ICareSyncRepository,
  IStorageAdapter,
  RepositoryStorageError,
  StorageHealthReport,
} from './interfaces';
import { createInitialSeedSnapshot } from './seedData';

export const CARESYNC_STORAGE_KEY = 'caresync_mal4_snapshot_v1';

export class BrowserLocalStorageAdapter implements IStorageAdapter {
  getItem(key: string): string | null {
    if (typeof window === 'undefined' || !window.localStorage) {
      return null;
    }
    return window.localStorage.getItem(key);
  }

  setItem(key: string, value: string): void {
    if (typeof window === 'undefined' || !window.localStorage) {
      throw new RepositoryStorageError('Browser localStorage is unavailable in this environment.');
    }
    window.localStorage.setItem(key, value);
  }

  removeItem(key: string): void {
    if (typeof window === 'undefined' || !window.localStorage) {
      return;
    }
    window.localStorage.removeItem(key);
  }
}

export class InMemoryStorageAdapter implements IStorageAdapter {
  private store = new Map<string, string>();
  public failWrites = false;

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    if (this.failWrites) {
      throw new Error('Simulated storage write failure (disk/quota fault).');
    }
    this.store.set(key, value);
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }
}

function cloneSnapshot(snapshot: CareSyncStateSnapshot): CareSyncStateSnapshot {
  if (typeof structuredClone === 'function') {
    return structuredClone(snapshot);
  }
  return JSON.parse(JSON.stringify(snapshot)) as CareSyncStateSnapshot;
}

function isValidSnapshotShape(candidate: unknown): candidate is CareSyncStateSnapshot {
  if (!candidate || typeof candidate !== 'object') return false;
  const obj = candidate as Record<string, unknown>;
  return (
    obj.schemaVersion === 1 &&
    typeof obj.sequenceCounter === 'number' &&
    typeof obj.policy === 'object' &&
    obj.policy !== null &&
    typeof obj.patients === 'object' &&
    typeof obj.doctors === 'object' &&
    typeof obj.timeSlots === 'object' &&
    typeof obj.appointments === 'object' &&
    Array.isArray(obj.events) &&
    typeof obj.bookingRequests === 'object' &&
    Array.isArray(obj.diagnostics)
  );
}

export class LocalStorageCareSyncRepository implements ICareSyncRepository {
  private readonly storage: IStorageAdapter;
  private readonly storageKey: string;
  private snapshot: CareSyncStateSnapshot;
  private simulatedStorageFailure = false;

  constructor(
    storage: IStorageAdapter = new BrowserLocalStorageAdapter(),
    nowMs: number = Date.now(),
    storageKey: string = CARESYNC_STORAGE_KEY,
  ) {
    this.storage = storage;
    this.storageKey = storageKey;
    this.snapshot = this.initializeOrRecover(nowMs);
  }

  private initializeOrRecover(nowMs: number): CareSyncStateSnapshot {
    try {
      const raw = this.storage.getItem(this.storageKey);
      if (!raw) {
        const initial = createInitialSeedSnapshot(nowMs);
        this.persistRaw(initial);
        return initial;
      }

      const parsed: unknown = JSON.parse(raw);
      if (!isValidSnapshotShape(parsed)) {
        const recovered = createInitialSeedSnapshot(nowMs);
        recovered.diagnostics.push(
          createDiagnosticRecord({
            idSuffix: 'corrupt_recovery',
            timestamp: nowMs,
            level: 'WARN',
            operation: 'STORAGE_CORRUPTION_RECOVERY',
            actorId: 'SYSTEM',
            code: 'SCHEMA_RECOVERY',
            message: 'Stored snapshot failed schema verification; safely re-initialized clean seed snapshot.',
          }),
        );
        this.persistRaw(recovered);
        return recovered;
      }

      return parsed;
    } catch (err) {
      const fallback = createInitialSeedSnapshot(nowMs);
      fallback.diagnostics.push(
        createDiagnosticRecord({
          idSuffix: 'boot_fallback',
          timestamp: nowMs,
          level: 'ERROR',
          operation: 'STORAGE_BOOT_FALLBACK',
          actorId: 'SYSTEM',
          code: 'STORAGE_READ_ERROR',
          message: `Storage read/parse failed (${err instanceof Error ? err.message : 'unknown error'}). Operating from recovered in-memory snapshot.`,
        }),
      );
      try {
        this.persistRaw(fallback);
      } catch {
        // Keep operating safely from in-memory fallback if storage is inaccessible
      }
      return fallback;
    }
  }

  private persistRaw(target: CareSyncStateSnapshot): void {
    if (this.simulatedStorageFailure) {
      throw new RepositoryStorageError(
        'Simulated persistent storage failure is active. Transaction aborted prior to commit to preserve state consistency.',
      );
    }
    try {
      const serialized = JSON.stringify(target);
      this.storage.setItem(this.storageKey, serialized);
    } catch (err) {
      if (err instanceof RepositoryStorageError) {
        throw err;
      }
      throw new RepositoryStorageError(
        `Failed to commit snapshot to persistent storage: ${err instanceof Error ? err.message : String(err)}`,
        err,
      );
    }
  }

  getSnapshot(): CareSyncStateSnapshot {
    return cloneSnapshot(this.snapshot);
  }

  transact<T>(mutator: (draft: CareSyncStateSnapshot) => T): T {
    const draft = cloneSnapshot(this.snapshot);
    try {
      const result = mutator(draft);
      this.persistRaw(draft);
      this.snapshot = draft;
      return result;
    } catch (err) {
      if (err instanceof RepositoryStorageError) {
        // Record diagnostic in live memory without corrupting domain entities
        this.snapshot.sequenceCounter += 1;
        this.snapshot.diagnostics.push(
          createDiagnosticRecord({
            idSuffix: String(this.snapshot.sequenceCounter),
            timestamp: Date.now(),
            level: 'ERROR',
            operation: 'REPOSITORY_TRANSACTION_ABORTED',
            actorId: 'SYSTEM',
            code: 'STORAGE_COMMIT_FAILED',
            message: err.message,
          }),
        );
      }
      throw err;
    }
  }

  resetToSeed(nowMs: number = Date.now()): CareSyncStateSnapshot {
    this.simulatedStorageFailure = false;
    const fresh = createInitialSeedSnapshot(nowMs);
    this.persistRaw(fresh);
    this.snapshot = fresh;
    return cloneSnapshot(this.snapshot);
  }

  setSimulatedStorageFailure(enabled: boolean): void {
    this.simulatedStorageFailure = enabled;
    this.snapshot.sequenceCounter += 1;
    this.snapshot.diagnostics.push(
      createDiagnosticRecord({
        idSuffix: String(this.snapshot.sequenceCounter),
        timestamp: Date.now(),
        level: enabled ? 'WARN' : 'INFO',
        operation: 'STORAGE_FAULT_INJECTION_TOGGLED',
        actorId: 'COORDINATOR',
        code: enabled ? 'FAULT_INJECTION_ENABLED' : 'FAULT_INJECTION_CLEARED',
        message: enabled
          ? 'Simulated persistent storage write fault enabled for resilience testing.'
          : 'Simulated persistent storage write fault cleared; normal commits restored.',
      }),
    );
    if (!enabled) {
      try {
        this.persistRaw(this.snapshot);
      } catch {
        // Ignore if underlying adapter itself is failing
      }
    }
  }

  isSimulatedStorageFailureActive(): boolean {
    return this.simulatedStorageFailure;
  }

  getStorageHealth(nowMs: number = Date.now()): StorageHealthReport {
    let serializedSizeBytes = 0;
    let storageAvailable = true;
    try {
      const raw = this.storage.getItem(this.storageKey);
      serializedSizeBytes = raw ? new TextEncoder().encode(raw).length : 0;
    } catch {
      storageAvailable = false;
    }

    const interruptedRequestCount = Object.values(this.snapshot.bookingRequests).filter(
      (req) => req.state === 'PENDING' || req.state === 'UNCERTAIN_INTERRUPTED' || req.state === 'RETRYING',
    ).length;

    return {
      storageAvailable,
      simulatedFailureActive: this.simulatedStorageFailure,
      schemaVersion: this.snapshot.schemaVersion,
      serializedSizeBytes,
      appointmentCount: Object.keys(this.snapshot.appointments).length,
      slotCount: Object.keys(this.snapshot.timeSlots).length,
      eventCount: this.snapshot.events.length,
      interruptedRequestCount,
      lastVerifiedAt: nowMs,
    };
  }
}
