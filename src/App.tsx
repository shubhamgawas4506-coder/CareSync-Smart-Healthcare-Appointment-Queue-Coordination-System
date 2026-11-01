/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect } from 'react';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { CareSyncProvider, useCareSync } from './presentation/CareSyncContext';
import {
  CoordinatorAppointmentsView,
  DiagnosticsAndAuditView,
} from './presentation/screens/CoordinatorAppointmentsAndAudit';
import {
  CoordinatorDashboardView,
  CoordinatorWorkspaceShell,
} from './presentation/screens/CoordinatorShellAndDashboard';
import { DoctorDashboardScreen } from './presentation/screens/DoctorDashboardScreen';
import {
  PatientBookingView,
  PatientHistoryView,
} from './presentation/screens/PatientBookingAndHistory';
import {
  PatientConfirmationView,
  PatientDashboardView,
  PatientQueueTrackingView,
} from './presentation/screens/PatientDashboardAndQueue';
import { PatientPortalShell } from './presentation/screens/PatientPortalShell';
import { WelcomeRoleScreen } from './presentation/screens/WelcomeRoleScreen';

function CareSyncRouter() {
  const { activeScreen, toast, dismissToast } = useCareSync();

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => {
      dismissToast();
    }, 5500);
    return () => window.clearTimeout(timer);
  }, [toast, dismissToast]);

  const renderScreen = () => {
    switch (activeScreen) {
      case 'welcome':
        return <WelcomeRoleScreen />;
      case 'patient-dashboard':
        return (
          <PatientPortalShell>
            <PatientDashboardView />
          </PatientPortalShell>
        );
      case 'patient-booking':
        return (
          <PatientPortalShell>
            <PatientBookingView />
          </PatientPortalShell>
        );
      case 'patient-confirmation':
        return (
          <PatientPortalShell>
            <PatientConfirmationView />
          </PatientPortalShell>
        );
      case 'patient-history':
        return (
          <PatientPortalShell>
            <PatientHistoryView />
          </PatientPortalShell>
        );
      case 'patient-queue':
        return (
          <PatientPortalShell>
            <PatientQueueTrackingView />
          </PatientPortalShell>
        );
      case 'doctor-dashboard':
        return <DoctorDashboardScreen />;
      case 'coordinator-dashboard':
        return (
          <CoordinatorWorkspaceShell>
            <CoordinatorDashboardView />
          </CoordinatorWorkspaceShell>
        );
      case 'coordinator-appointments':
        return (
          <CoordinatorWorkspaceShell>
            <CoordinatorAppointmentsView />
          </CoordinatorWorkspaceShell>
        );
      case 'diagnostics-audit':
        return (
          <CoordinatorWorkspaceShell>
            <DiagnosticsAndAuditView />
          </CoordinatorWorkspaceShell>
        );
    }
  };

  return (
    <>
      {renderScreen()}

      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-5 right-5 z-50 max-w-md w-[calc(100vw-2.5rem)] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg p-4 flex items-start justify-between gap-3"
        >
          <div className="flex items-start gap-2.5 min-w-0">
            {toast.tone === 'success' && (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
            )}
            {toast.tone === 'warning' && (
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            )}
            {toast.tone === 'error' && (
              <XCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
            )}
            {toast.tone === 'info' && (
              <Info className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0 mt-0.5" />
            )}
            <div className="text-xs space-y-0.5 min-w-0">
              <p className="font-semibold text-slate-900 dark:text-white">{toast.title}</p>
              {toast.detail && (
                <p className="text-slate-600 dark:text-slate-300 break-words">{toast.detail}</p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={dismissToast}
            aria-label="Dismiss notification"
            className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 p-0.5 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </>
  );
}

export default function App() {
  return (
    <CareSyncProvider>
      <CareSyncRouter />
    </CareSyncProvider>
  );
}
