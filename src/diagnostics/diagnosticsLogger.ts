/**
 * CareSync Diagnostics Layer — Operation History, Storage Faults & Telemetry Records
 *
 * Captures system-level operational diagnostics alongside domain AppointmentEvents
 * so coordinators and evaluators can inspect retries, conflict rejections,
 * recovery scans, and storage exceptions transparently.
 */

export type DiagnosticLevel = 'INFO' | 'WARN' | 'ERROR';

export interface DiagnosticRecord {
  diagnosticId: string;
  timestamp: number;
  level: DiagnosticLevel;
  operation: string;
  actorId: string;
  requestId?: string;
  appointmentId?: string;
  code: string;
  message: string;
}

export function createDiagnosticRecord(params: {
  idSuffix: string;
  timestamp: number;
  level: DiagnosticLevel;
  operation: string;
  actorId: string;
  requestId?: string;
  appointmentId?: string;
  code: string;
  message: string;
}): DiagnosticRecord {
  return {
    diagnosticId: `diag_${params.timestamp}_${params.idSuffix}`,
    timestamp: params.timestamp,
    level: params.level,
    operation: params.operation,
    actorId: params.actorId,
    requestId: params.requestId,
    appointmentId: params.appointmentId,
    code: params.code,
    message: params.message,
  };
}
