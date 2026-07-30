/**
 * Copilot session memory.
 *
 * Keyed by the same session id the rest of the API uses, so the Copilot's
 * memory lives and dies with the UAC session. Held in memory only — nothing is
 * written to disk, and the UAC token is never copied in here.
 *
 * This is what makes the assistant stop asking for things you already gave it:
 * the upload, the generated payloads, the findings, the execution results and
 * the conversation are all on the session, so a later question about
 * scheduling can reach back to the file that was uploaded ten minutes ago.
 */
import {
  CopilotSession,
  CopilotContext,
  CopilotTurn,
  UploadSnapshot,
  PayloadSnapshot,
  ExecutionSnapshot,
  Finding,
  WizardState,
  WizardMemoryHints,
  JobRowLike,
} from './types';
import { createModuleLogger } from '../config/logger';

const log = createModuleLogger('copilot:memory');

/** Idle expiry, matched to the backend session absolute lifetime. */
const MEMORY_TTL_MS = 2 * 60 * 60 * 1000;
/** Conversation turns retained per session. Older turns are dropped. */
const MAX_TURNS = 40;
/** Rows retained from an upload. Enough for the 100-job execution cap. */
const MAX_ROWS = 200;
/** Payload snapshots retained. */
const MAX_PAYLOADS = 120;

const sessions = new Map<string, CopilotSession>();

function emptyWizard(): WizardState {
  return { active: false, cursor: 0, answers: {}, skipped: [], startedAt: '' };
}

function create(id: string): CopilotSession {
  return {
    id,
    createdAt: Date.now(),
    lastUsed: Date.now(),
    context: { page: 'home' },
    upload: null,
    payloads: [],
    findings: [],
    executions: [],
    turns: [],
    wizard: emptyWizard(),
    facts: {},
  };
}

/** Gets or creates the memory for a session. */
export function getMemory(sessionId: string): CopilotSession {
  const existing = sessions.get(sessionId);
  if (existing) {
    existing.lastUsed = Date.now();
    return existing;
  }
  const fresh = create(sessionId);
  sessions.set(sessionId, fresh);
  return fresh;
}

export function forgetMemory(sessionId: string): void {
  sessions.delete(sessionId);
}

export function memoryCount(): number {
  return sessions.size;
}

// Reap idle memories on the same cadence as the session store.
setInterval(() => {
  const now = Date.now();
  let removed = 0;
  for (const [id, s] of sessions.entries()) {
    if (now - s.lastUsed > MEMORY_TTL_MS) {
      sessions.delete(id);
      removed++;
    }
  }
  if (removed > 0) log.debug('Reaped idle copilot memories', { removed, remaining: sessions.size });
}, 5 * 60 * 1000).unref();

// ── Writers ──────────────────────────────────────────────────────────────────

export function setContext(sessionId: string, context: CopilotContext): CopilotSession {
  const mem = getMemory(sessionId);
  // Merge rather than replace so a page that only reports its step does not
  // wipe the focus recorded a moment earlier.
  mem.context = {
    ...mem.context,
    ...context,
    detail: { ...(mem.context.detail || {}), ...(context.detail || {}) },
  };
  return mem;
}

export function setUpload(
  sessionId: string,
  filename: string,
  rows: JobRowLike[],
): UploadSnapshot {
  const mem = getMemory(sessionId);
  const trimmed = rows.slice(0, MAX_ROWS);
  const columns = Array.from(
    trimmed.reduce<Set<string>>((set, row) => {
      Object.keys(row || {}).forEach(k => set.add(k));
      return set;
    }, new Set<string>()),
  );
  const snapshot: UploadSnapshot = {
    filename,
    uploadedAt: new Date().toISOString(),
    rowCount: rows.length,
    rows: trimmed,
    columns,
  };
  mem.upload = snapshot;
  // A new file invalidates everything derived from the previous one.
  mem.payloads = [];
  mem.findings = [];
  mem.executions = [];
  log.info('Copilot gained upload context', {
    filename, rowCount: rows.length, columns: columns.length,
  });
  return snapshot;
}

export function setPayloads(sessionId: string, payloads: PayloadSnapshot[]): void {
  const mem = getMemory(sessionId);
  mem.payloads = payloads.slice(0, MAX_PAYLOADS);
}

export function setFindings(sessionId: string, findings: Finding[]): void {
  getMemory(sessionId).findings = findings;
}

export function setExecutions(sessionId: string, executions: ExecutionSnapshot[]): void {
  getMemory(sessionId).executions = executions.slice(-MAX_PAYLOADS);
}

export function addTurn(sessionId: string, turn: Omit<CopilotTurn, 'at'>): void {
  const mem = getMemory(sessionId);
  mem.turns.push({ ...turn, at: new Date().toISOString() });
  if (mem.turns.length > MAX_TURNS) mem.turns = mem.turns.slice(-MAX_TURNS);
}

export function rememberFact(sessionId: string, key: string, value: string): void {
  getMemory(sessionId).facts[key] = value;
}

export function setWizard(sessionId: string, wizard: WizardState): void {
  getMemory(sessionId).wizard = wizard;
}

export function resetWizard(sessionId: string): void {
  getMemory(sessionId).wizard = emptyWizard();
}

/** Clears everything the Copilot remembers except the current page. */
export function clearWorkContext(sessionId: string): void {
  const mem = getMemory(sessionId);
  mem.upload = null;
  mem.payloads = [];
  mem.findings = [];
  mem.executions = [];
  mem.turns = [];
  mem.facts = {};
  mem.wizard = emptyWizard();
}

// ── Readers / derived views ──────────────────────────────────────────────────

/** The rows the Copilot should reason about: the upload, or the wizard's row. */
export function knownRows(sessionId: string): JobRowLike[] {
  const mem = getMemory(sessionId);
  return mem.upload?.rows ?? [];
}

/**
 * Distinct values the user has already supplied in this session. Powers the
 * "auto-fill from previous entries" quick action and the wizard's suggestions.
 */
export function memoryHints(sessionId: string): WizardMemoryHints {
  const mem = getMemory(sessionId);
  const rows = [...knownRows(sessionId)];

  // Wizard answers count as prior entries too.
  if (Object.keys(mem.wizard.answers).length > 0) rows.push(mem.wizard.answers);

  const collect = (key: string): string[] => {
    const seen = new Set<string>();
    for (const row of rows) {
      const raw = row?.[key];
      if (raw === undefined || raw === null) continue;
      String(raw)
        .split(/[;,]/)
        .map(s => s.trim())
        .filter(Boolean)
        .forEach(v => seen.add(v));
    }
    return Array.from(seen).slice(0, 12);
  };

  const fromFacts = (key: string) => (mem.facts[key] ? [mem.facts[key]] : []);

  return {
    agents: collect('agent'),
    timezones: Array.from(new Set([...fromFacts('timezone'), ...collect('timezone')])).slice(0, 12),
    credentials: collect('credential'),
    businessServices: collect('business_services'),
    serviceNowGroups: collect('servicenow_group'),
    existingNames: [
      ...rows.map(r => String(r?.task_name || '').trim()).filter(Boolean),
      ...mem.payloads.map(p => p.name),
    ],
  };
}

/**
 * A compact, human-readable digest of what the Copilot already knows. This is
 * injected into the model prompt (and used by the deterministic composer) so
 * the assistant never asks for information the session already holds.
 */
export function describeMemory(sessionId: string): string {
  const mem = getMemory(sessionId);
  const lines: string[] = [];

  lines.push(`Current page: ${mem.context.page}${mem.context.step ? ` (step: ${mem.context.step})` : ''}`);
  if (mem.context.focus) lines.push(`In focus: ${mem.context.focus}`);
  if (mem.context.detail && Object.keys(mem.context.detail).length > 0) {
    const detail = Object.entries(mem.context.detail)
      .slice(0, 12)
      .map(([k, v]) => `${k}=${summarizeValue(v)}`)
      .join(', ');
    if (detail) lines.push(`Page state: ${detail}`);
  }

  if (mem.upload) {
    const u = mem.upload;
    lines.push(`Uploaded file: "${u.filename}" with ${u.rowCount} row(s), uploaded ${u.uploadedAt}.`);
    lines.push(`Columns present: ${u.columns.join(', ')}`);
    const preview = u.rows.slice(0, 8).map((r, i) => {
      const bits = [
        `#${i + 1} ${r.task_name || '(unnamed)'}`,
        r.task_type ? `type=${r.task_type}` : '',
        r.agent ? `agent=${r.agent}` : '',
        r.frequency_type ? `freq=${r.frequency_type}` : '',
        r.schedule_string ? `sched=${r.schedule_string}` : (r.start_time ? `start=${r.start_time}` : ''),
        r.timezone ? `tz=${r.timezone}` : '',
        r.ref_job ? `ref_job=${r.ref_job}` : '',
      ].filter(Boolean);
      return `  ${bits.join(' | ')}`;
    });
    if (preview.length) {
      lines.push(`Parsed jobs${u.rowCount > preview.length ? ` (first ${preview.length} of ${u.rowCount})` : ''}:`);
      lines.push(...preview);
    }
  } else {
    lines.push('No file uploaded in this session.');
  }

  if (mem.payloads.length) {
    lines.push(`Generated payloads for ${mem.payloads.length} job(s): ${mem.payloads.slice(0, 10).map(p => p.name).join(', ')}${mem.payloads.length > 10 ? ', …' : ''}`);
    const withSummary = mem.payloads.filter(p => p.summary).slice(0, 8);
    if (withSummary.length) {
      lines.push('Schedule summaries:');
      withSummary.forEach(p => lines.push(`  ${p.name}: ${p.summary}`));
    }
  }

  if (mem.findings.length) {
    const errors = mem.findings.filter(f => f.severity === 'error').length;
    const warnings = mem.findings.filter(f => f.severity === 'warning').length;
    lines.push(`Validation findings: ${errors} error(s), ${warnings} warning(s), ${mem.findings.length} total.`);
    mem.findings.slice(0, 10).forEach(f =>
      lines.push(`  [${f.severity}] ${f.subject}: ${f.message} (rule ${f.rule})`));
  }

  if (mem.executions.length) {
    const ok = mem.executions.filter(e => e.status === 'success').length;
    const bad = mem.executions.filter(e => e.status === 'failed').length;
    lines.push(`Execution results so far: ${ok} succeeded, ${bad} failed, ${mem.executions.length} total.`);
    mem.executions.filter(e => e.status === 'failed').slice(0, 6).forEach(e =>
      lines.push(`  FAILED ${e.type} ${e.name}: ${e.message || 'no message'}`));
  }

  if (mem.wizard.active) {
    const answered = Object.entries(mem.wizard.answers)
      .filter(([, v]) => v !== '')
      .map(([k, v]) => `${k}=${v}`)
      .join(', ');
    lines.push(`Inline Assistant is running. Collected so far: ${answered || 'nothing yet'}.`);
    if (mem.wizard.skipped.length) lines.push(`Skipped optional fields: ${mem.wizard.skipped.join(', ')}`);
  }

  const factEntries = Object.entries(mem.facts);
  if (factEntries.length) {
    lines.push(`Things the user told the assistant: ${factEntries.map(([k, v]) => `${k}=${v}`).join(', ')}`);
  }

  return lines.join('\n');
}

/** Recent conversation, oldest first, for model context. */
export function recentTurns(sessionId: string, count = 8): CopilotTurn[] {
  return getMemory(sessionId).turns.slice(-count);
}

function summarizeValue(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (Array.isArray(v)) return `[${v.length} item(s)]`;
  if (typeof v === 'object') return '{…}';
  const s = String(v);
  return s.length > 60 ? `${s.slice(0, 57)}…` : s;
}
