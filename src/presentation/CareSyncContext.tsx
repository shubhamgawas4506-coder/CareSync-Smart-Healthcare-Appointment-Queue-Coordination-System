/**
 * CareSync Presentation Layer — Application State & Use-Case Provider
 *
 * Bridges the pure Application/Repository layers into React components cleanly.
 * UI components invoke typed service methods and never mutate domain records directly.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  CareSyncCoordinationService,
  CreateSlotInput,
  RescheduleInput,
  SubmitBookingInput,
  SubmitBookingResult,
  TransitionStatusInput,
} from '../application/coordinationService';
import {
  Appointment,
  BookingRequestRecord,
  ClinicPolicyConfig,
  DomainRuleError,
  SlotAvailabilityStatus,
  UserRole,
} from '../domain/models';
import { DoctorQueueSnapshot } from '../domain/queueEngine';
import {
  CareSyncStateSnapshot,
  RepositoryStorageError,
  StorageHealthReport,
} from '../repositories/interfaces';
import { LocalStorageCareSyncRepository } from '../repositories/localStorageRepository';

export type ScreenId =
  | 'welcome'
  | 'patient-dashboard'
  | 'patient-booking'
  | 'patient-confirmation'
  | 'patient-history'
  | 'patient-queue'
  | 'doctor-dashboard'
  | 'coordinator-dashboard'
  | 'coordinator-appointments'
  | 'diagnostics-audit';

export interface ToastMessage {
  id: string;
  tone: 'success' | 'warning' | 'error' | 'info';
  title: string;
  detail?: string;
}

interface PersistedUiSession {
  activeRole: UserRole | null;
  activeScreen: ScreenId;
  activePatientId: string;
  activeDoctorId: string;
  lastConfirmedAppointmentId: string | null;
  lastBookingDeduplicated: boolean;
}

const UI_SESSION_STORAGE_KEY = 'caresync_ui_session_v1';
const THEME_STORAGE_KEY = 'caresync_theme_v1';

function loadInitialUiSession(): PersistedUiSession {
  const defaultState: PersistedUiSession = {
    activeRole: null,
    activeScreen: 'welcome',
    activePatientId: 'pat_maya_lin',
    activeDoctorId: 'doc_sarah_jenkins',
    lastConfirmedAppointmentId: null,
    lastBookingDeduplicated: false,
  };

  if (typeof window === 'undefined') {
    return defaultState;
  }

  const params = new URLSearchParams(window.location.search);
  const roleParam = params.get('role')?.toLowerCase();
  const autostart = params.get('autostart') === '1';

  if (roleParam === 'patient') {
    return { ...defaultState, activeRole: UserRole.PATIENT, activeScreen: 'patient-dashboard' };
  }
  if (roleParam === 'doctor') {
    return { ...defaultState, activeRole: UserRole.DOCTOR, activeScreen: 'doctor-dashboard' };
  }
  if (roleParam === 'coordinator') {
    return {
      ...defaultState,
      activeRole: UserRole.COORDINATOR,
      activeScreen: 'coordinator-dashboard',
    };
  }

  try {
    const raw = window.sessionStorage.getItem(UI_SESSION_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<PersistedUiSession>;
      if (parsed && typeof parsed.activeScreen === 'string') {
        return {
          ...defaultState,
          ...parsed,
        };
      }
    }
  } catch {
    // Ignore sessionStorage parse errors
  }

  if (autostart) {
    return {
      ...defaultState,
      activeRole: UserRole.PATIENT,
      activeScreen: 'patient-dashboard',
    };
  }

  return defaultState;
}

interface CareSyncContextValue {
  snapshot: CareSyncStateSnapshot;
  activeRole: UserRole | null;
  activeScreen: ScreenId;
  activePatientId: string;
  activeDoctorId: string;
  theme: 'light' | 'dark';
  lastConfirmedAppointment: Appointment | null;
  lastBookingDeduplicated: boolean;
  interruptedRequests: BookingRequestRecord[];
  liveQueues: DoctorQueueSnapshot[];
  storageHealth: StorageHealthReport;
  toast: ToastMessage | null;
  dismissToast: () => void;
  notify: (tone: ToastMessage['tone'], title: string, detail?: string) => void;
  toggleTheme: () => void;
  selectRoleAndEnter: (role: UserRole, personaId?: string, targetScreen?: ScreenId) => void;
  navigateTo: (screen: ScreenId) => void;
  setActivePatientId: (patientId: string) => void;
  setActiveDoctorId: (doctorId: string) => void;
  generateRequestId: () => string;
  submitBooking: (input: SubmitBookingInput) => SubmitBookingResult;
  retryInterruptedRequest: (requestId: string) => SubmitBookingResult | null;
  dismissUncertainRequest: (requestId: string) => void;
  transitionStatus: (input: TransitionStatusInput) => Appointment | null;
  rescheduleAppointment: (
    input: RescheduleInput,
  ) => { previousAppointment: Appointment; newAppointment: Appointment } | null;
  setSlotAvailability: (
    slotId: string,
    targetStatus: SlotAvailabilityStatus.AVAILABLE | SlotAvailabilityStatus.BLOCKED,
  ) => boolean;
  createDoctorSlot: (input: Omit<CreateSlotInput, 'actorId'>) => boolean;
  updateClinicPolicy: (patch: Partial<Pick<ClinicPolicyConfig, 'allowCheckedInCancellation'>>) => void;
  setSimulatedStorageFailure: (enabled: boolean) => void;
  resetDemoData: () => void;
  preselectedDoctorIdForBooking: string | null;
  setPreselectedDoctorIdForBooking: (doctorId: string | null) => void;
}

const CareSyncContext = createContext<CareSyncContextValue | null>(null);

export function CareSyncProvider({ children }: { children: React.ReactNode }) {
  const [{ repo, service }] = useState(() => {
    const repository = new LocalStorageCareSyncRepository();
    const coordService = new CareSyncCoordinationService(repository);
    return { repo: repository, service: coordService };
  });

  const [snapshot, setSnapshot] = useState<CareSyncStateSnapshot>(() => service.getSnapshot());
  const [uiSession, setUiSession] = useState<PersistedUiSession>(() => loadInitialUiSession());
  const [preselectedDoctorIdForBooking, setPreselectedDoctorIdForBooking] = useState<string | null>(
    null,
  );
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window === 'undefined') return 'light';
    try {
      const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
      if (saved === 'dark' || saved === 'light') return saved;
    } catch {
      // ignore
    }
    return 'light';
  });

  // Sync dark mode class on <html>
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.classList.toggle('dark', theme === 'dark');
    }
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // ignore
    }
  }, [theme]);

  // Persist UI session to sessionStorage so refreshing mid-flow preserves recovery context
  useEffect(() => {
    try {
      window.sessionStorage.setItem(UI_SESSION_STORAGE_KEY, JSON.stringify(uiSession));
    } catch {
      // ignore
    }
  }, [uiSession]);

  // Run interrupted booking recovery scan on mount
  useEffect(() => {
    const found = service.recoverInterruptedRequests();
    if (found.length > 0) {
      setSnapshot(service.getSnapshot());
    }
  }, [service]);

  const notify = useCallback(
    (tone: ToastMessage['tone'], title: string, detail?: string) => {
      setToast({
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        tone,
        title,
        detail,
      });
    },
    [],
  );

  const dismissToast = useCallback(() => setToast(null), []);

  const refreshSnapshot = useCallback(() => {
    setSnapshot(service.getSnapshot());
  }, [service]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  }, []);

  const selectRoleAndEnter = useCallback(
    (role: UserRole, personaId?: string, targetScreen?: ScreenId) => {
      setUiSession((prev) => {
        const defaultScreen: ScreenId =
          role === UserRole.PATIENT
            ? 'patient-dashboard'
            : role === UserRole.DOCTOR
              ? 'doctor-dashboard'
              : 'coordinator-dashboard';

        return {
          ...prev,
          activeRole: role,
          activeScreen: targetScreen ?? defaultScreen,
          activePatientId:
            role === UserRole.PATIENT && personaId ? personaId : prev.activePatientId,
          activeDoctorId:
            role === UserRole.DOCTOR && personaId ? personaId : prev.activeDoctorId,
        };
      });
    },
    [],
  );

  const navigateTo = useCallback((screen: ScreenId) => {
    setUiSession((prev) => {
      let inferredRole = prev.activeRole;
      if (screen === 'welcome') {
        inferredRole = null;
      } else if (screen.startsWith('patient-')) {
        inferredRole = UserRole.PATIENT;
      } else if (screen.startsWith('doctor-')) {
        inferredRole = UserRole.DOCTOR;
      } else if (screen.startsWith('coordinator-')) {
        inferredRole = UserRole.COORDINATOR;
      } else if (screen === 'diagnostics-audit' && !inferredRole) {
        inferredRole = UserRole.COORDINATOR;
      }
      return {
        ...prev,
        activeRole: inferredRole,
        activeScreen: screen,
      };
    });
  }, []);

  const setActivePatientId = useCallback((patientId: string) => {
    setUiSession((prev) => ({ ...prev, activePatientId: patientId }));
  }, []);

  const setActiveDoctorId = useCallback((doctorId: string) => {
    setUiSession((prev) => ({ ...prev, activeDoctorId: doctorId }));
  }, []);

  const generateRequestId = useCallback(() => service.generateRequestId(), [service]);

  const submitBooking = useCallback(
    (input: SubmitBookingInput): SubmitBookingResult => {
      try {
        const res = service.submitBooking(input);
        refreshSnapshot();
        if (res.outcome === 'CONFIRMED') {
          setUiSession((prev) => ({
            ...prev,
            lastConfirmedAppointmentId: res.appointment.appointmentId,
            lastBookingDeduplicated: res.deduplicatedRetry,
          }));
          notify(
            'success',
            res.deduplicatedRetry
              ? 'Idempotent Retry Reconciled — 1 Appointment Confirmed'
              : 'Appointment Confirmed',
            `Appointment ${res.appointment.appointmentId} locked for request ${res.requestRecord.requestId}.`,
          );
        } else if (res.outcome === 'UNCERTAIN_INTERRUPTED') {
          notify(
            'warning',
            'Network Interrupted — Booking Outcome Uncertain',
            `Request ${res.requestRecord.requestId} saved for safe idempotent retry. Refreshing will preserve this operation.`,
          );
        } else {
          notify('error', `Booking Rejected (${res.errorCode})`, res.message);
        }
        return res;
      } catch (err) {
        refreshSnapshot();
        const msg = err instanceof Error ? err.message : 'Unexpected booking failure.';
        notify('error', 'Operation Aborted', msg);
        throw err;
      }
    },
    [notify, refreshSnapshot, service],
  );

  const retryInterruptedRequest = useCallback(
    (requestId: string): SubmitBookingResult | null => {
      const snap = service.getSnapshot();
      const record = snap.bookingRequests[requestId];
      if (!record) return null;

      try {
        const res = service.submitBooking({
          requestId: record.requestId,
          patientId: record.patientId,
          doctorId: record.doctorId,
          slotId: record.slotId,
          reasonForVisit: record.reasonForVisit,
          actorId: record.patientId,
          actorRole: UserRole.PATIENT,
          simulateNetworkFailure: false,
        });
        refreshSnapshot();
        if (res.outcome === 'CONFIRMED') {
          setUiSession((prev) => ({
            ...prev,
            lastConfirmedAppointmentId: res.appointment.appointmentId,
            lastBookingDeduplicated: res.deduplicatedRetry,
            activeScreen:
              prev.activeRole === UserRole.PATIENT ? 'patient-confirmation' : prev.activeScreen,
          }));
          notify(
            'success',
            'Interrupted Request Recovered',
            `Confirmed single appointment ${res.appointment.appointmentId} using preserved requestId ${requestId}.`,
          );
        } else if (res.outcome === 'REJECTED') {
          notify('error', `Retry Rejected (${res.errorCode})`, res.message);
        }
        return res;
      } catch (err) {
        refreshSnapshot();
        notify(
          'error',
          'Retry Aborted by Storage/System Fault',
          err instanceof Error ? err.message : 'Unable to complete retry.',
        );
        return null;
      }
    },
    [notify, refreshSnapshot, service],
  );

  const dismissUncertainRequest = useCallback(
    (requestId: string) => {
      try {
        service.dismissUncertainRequest(requestId, uiSession.activePatientId);
        refreshSnapshot();
        notify('info', 'Uncertain Request Dismissed', `Cleared pending status for ${requestId}.`);
      } catch (err) {
        refreshSnapshot();
        notify('error', 'Cannot Dismiss Request', err instanceof Error ? err.message : undefined);
      }
    },
    [notify, refreshSnapshot, service, uiSession.activePatientId],
  );

  const transitionStatus = useCallback(
    (input: TransitionStatusInput): Appointment | null => {
      try {
        const updated = service.transitionAppointmentStatus(input);
        refreshSnapshot();
        notify(
          'success',
          `Status Updated → ${updated.status.replace('_', ' ')}`,
          `Appointment ${updated.appointmentId} transitioned cleanly.`,
        );
        return updated;
      } catch (err) {
        refreshSnapshot();
        if (err instanceof DomainRuleError || err instanceof RepositoryStorageError) {
          notify('error', 'Transition Blocked', err.message);
          return null;
        }
        notify('error', 'Unexpected Error', err instanceof Error ? err.message : undefined);
        return null;
      }
    },
    [notify, refreshSnapshot, service],
  );

  const rescheduleAppointment = useCallback(
    (input: RescheduleInput) => {
      try {
        const out = service.rescheduleAppointment(input);
        refreshSnapshot();
        setUiSession((prev) => ({
          ...prev,
          lastConfirmedAppointmentId: out.newAppointment.appointmentId,
          lastBookingDeduplicated: false,
        }));
        notify(
          'success',
          'Appointment Rescheduled Atomically',
          `Previous slot released to Available; confirmed ${out.newAppointment.appointmentId}.`,
        );
        return out;
      } catch (err) {
        refreshSnapshot();
        notify(
          'error',
          'Reschedule Rejected',
          err instanceof Error ? err.message : 'Unable to reschedule appointment.',
        );
        return null;
      }
    },
    [notify, refreshSnapshot, service],
  );

  const setSlotAvailability = useCallback(
    (
      slotId: string,
      targetStatus: SlotAvailabilityStatus.AVAILABLE | SlotAvailabilityStatus.BLOCKED,
    ): boolean => {
      try {
        service.setSlotAvailability(slotId, targetStatus, 'coord_nadia_okafor');
        refreshSnapshot();
        notify('success', `Slot Marked ${targetStatus}`, `Updated slot ${slotId}.`);
        return true;
      } catch (err) {
        refreshSnapshot();
        notify(
          'error',
          'Slot Update Blocked',
          err instanceof Error ? err.message : 'Could not update slot.',
        );
        return false;
      }
    },
    [notify, refreshSnapshot, service],
  );

  const createDoctorSlot = useCallback(
    (input: Omit<CreateSlotInput, 'actorId'>): boolean => {
      try {
        const created = service.createDoctorSlot({
          ...input,
          actorId: 'coord_nadia_okafor',
        });
        refreshSnapshot();
        notify('success', 'New Availability Slot Added', `Created ${created.slotId}.`);
        return true;
      } catch (err) {
        refreshSnapshot();
        notify(
          'error',
          'Cannot Create Slot',
          err instanceof Error ? err.message : 'Invalid or overlapping slot window.',
        );
        return false;
      }
    },
    [notify, refreshSnapshot, service],
  );

  const updateClinicPolicy = useCallback(
    (patch: Partial<Pick<ClinicPolicyConfig, 'allowCheckedInCancellation'>>) => {
      try {
        const nextPolicy = service.updateClinicPolicy(patch, 'coord_nadia_okafor');
        refreshSnapshot();
        notify(
          'info',
          'Clinic Rule Updated',
          `Cancel after Check-In is now ${nextPolicy.allowCheckedInCancellation ? 'Permitted' : 'Disallowed'}.`,
        );
      } catch (err) {
        refreshSnapshot();
        notify('error', 'Policy Update Failed', err instanceof Error ? err.message : undefined);
      }
    },
    [notify, refreshSnapshot, service],
  );

  const setSimulatedStorageFailure = useCallback(
    (enabled: boolean) => {
      repo.setSimulatedStorageFailure(enabled);
      refreshSnapshot();
      notify(
        enabled ? 'warning' : 'success',
        enabled ? 'Simulated Storage Failure Enabled' : 'Storage Normalcy Restored',
        enabled
          ? 'All write transactions will now throw and roll back cleanly to verify atomic consistency.'
          : 'Persistent localStorage writes restored.',
      );
    },
    [notify, refreshSnapshot, repo],
  );

  const resetDemoData = useCallback(() => {
    service.resetDemoEnvironment();
    refreshSnapshot();
    notify(
      'info',
      'Demo Dataset Reset',
      'Restored clean baseline appointments, queues, slots, and audit logs.',
    );
  }, [notify, refreshSnapshot, service]);

  const interruptedRequests = useMemo(() => {
    return Object.values(snapshot.bookingRequests)
      .filter(
        (r) =>
          r.state === 'PENDING' ||
          r.state === 'UNCERTAIN_INTERRUPTED' ||
          r.state === 'RETRYING',
      )
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }, [snapshot]);

  const liveQueues = useMemo(() => {
    return service.getLiveQueuesForDate();
  }, [service, snapshot]);

  const storageHealth = useMemo(() => {
    return repo.getStorageHealth();
  }, [repo, snapshot]);

  const lastConfirmedAppointment = useMemo(() => {
    if (!uiSession.lastConfirmedAppointmentId) return null;
    return snapshot.appointments[uiSession.lastConfirmedAppointmentId] ?? null;
  }, [snapshot, uiSession.lastConfirmedAppointmentId]);

  const value: CareSyncContextValue = {
    snapshot,
    activeRole: uiSession.activeRole,
    activeScreen: uiSession.activeScreen,
    activePatientId: uiSession.activePatientId,
    activeDoctorId: uiSession.activeDoctorId,
    theme,
    lastConfirmedAppointment,
    lastBookingDeduplicated: uiSession.lastBookingDeduplicated,
    interruptedRequests,
    liveQueues,
    storageHealth,
    toast,
    dismissToast,
    notify,
    toggleTheme,
    selectRoleAndEnter,
    navigateTo,
    setActivePatientId,
    setActiveDoctorId,
    generateRequestId,
    submitBooking,
    retryInterruptedRequest,
    dismissUncertainRequest,
    transitionStatus,
    rescheduleAppointment,
    setSlotAvailability,
    createDoctorSlot,
    updateClinicPolicy,
    setSimulatedStorageFailure,
    resetDemoData,
    preselectedDoctorIdForBooking,
    setPreselectedDoctorIdForBooking,
  };

  return <CareSyncContext.Provider value={value}>{children}</CareSyncContext.Provider>;
}

export function useCareSync(): CareSyncContextValue {
  const ctx = useContext(CareSyncContext);
  if (!ctx) {
    throw new Error('useCareSync must be used inside <CareSyncProvider>');
  }
  return ctx;
}
