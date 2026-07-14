/**
 * Audit trail for security-relevant operations (connect/disconnect, task and
 * trigger creation, deletions, agent suspend/resume, monitoring changes).
 *
 * Entries are written one-JSON-object-per-line to a dedicated, rotated
 * `audit.log` so they can be shipped to a SIEM or read back by the monitoring
 * UI. The same event is mirrored to the application log for real-time
 * visibility. Session identifiers are truncated before writing — enough to
 * correlate activity within a session without persisting a usable handle.
 */
import fs from 'fs';
import DailyRotateFile from 'winston-daily-rotate-file';
import winston from 'winston';
import { LOG_DIR, AUDIT_LOG_FILE, LOG_ROTATION, LOG_FILE_LOGGING_AVAILABLE, createModuleLogger } from '../config/logger';

const log = createModuleLogger('audit');

export interface AuditEntry {
  timestamp:  string;
  requestId:  string;
  action:     string;
  resource:   string;
  details?:   string;
  result:     'success' | 'failure' | 'pending';
  sessionId?: string;
  baseUrl?:   string;
}

// Dedicated audit logger: a single rotated file whose lines are the raw audit
// JSON objects (no Winston envelope) so downstream readers stay simple.
const auditFileLogger = LOG_FILE_LOGGING_AVAILABLE
  ? winston.createLogger({
      level: 'info',
      transports: [
        new DailyRotateFile({
          dirname: LOG_DIR,
          filename: 'audit-%DATE%.log',
          datePattern: LOG_ROTATION.datePattern,
          maxSize: LOG_ROTATION.maxSize,
          maxFiles: LOG_ROTATION.maxFiles,
          zippedArchive: true,
          auditFile: `${LOG_DIR}/.audit-rotate.json`,
          createSymlink: true,
          symlinkName: 'audit.log',
          format: winston.format.printf(info => String(info.message)),
        }),
      ],
    })
  : null;

// Session IDs are opaque handles; keep only a short prefix for correlation.
function maskSessionId(sessionId?: string): string | undefined {
  if (!sessionId) return sessionId;
  return sessionId.length <= 8 ? sessionId : `${sessionId.slice(0, 8)}…`;
}

export function auditLog(entry: AuditEntry): void {
  const safeEntry: AuditEntry = { ...entry, sessionId: maskSessionId(entry.sessionId) };

  if (auditFileLogger) {
    auditFileLogger.info(JSON.stringify(safeEntry));
  }

  // Mirror to the application log for real-time operational visibility.
  log.info(`${safeEntry.action} ${safeEntry.resource} → ${safeEntry.result}`, {
    requestId: safeEntry.requestId,
    endpoint: safeEntry.action,
    resource: safeEntry.resource,
    result: safeEntry.result,
    details: safeEntry.details,
    sessionId: safeEntry.sessionId,
  });
}

/** Absolute path of the current audit log file (consumed by the monitoring UI). */
export function auditLogPath(): string {
  return AUDIT_LOG_FILE;
}

/** Whether audit entries are being persisted to disk. */
export function auditFileExists(): boolean {
  try {
    return fs.existsSync(AUDIT_LOG_FILE);
  } catch {
    return false;
  }
}
