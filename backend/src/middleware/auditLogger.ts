/**
 * Audit Logger — records all sensitive operations for compliance and forensics.
 * Logs: who, what action, on what resource, when, result, request ID.
 * Never logs token values.
 */
import fs from 'fs';
import path from 'path';

const AUDIT_FILE = path.join(process.cwd(), 'audit.log');

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

export function auditLog(entry: AuditEntry): void {
  const line = JSON.stringify(entry) + '\n';
  // Append to audit log file — non-blocking
  fs.appendFile(AUDIT_FILE, line, (err) => {
    if (err) console.error('[AUDIT] Failed to write audit log:', err.message);
  });
  // Also log to console for real-time visibility
  console.log(`[AUDIT] ${entry.action} | ${entry.resource} | ${entry.result} | req:${entry.requestId}`);
}
