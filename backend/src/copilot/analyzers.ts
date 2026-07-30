/**
 * Deterministic analyzers — the Copilot's upload awareness and smart validation.
 *
 * Every check here is a real rule from knowledge/validation.ts and every
 * Finding cites the rule id that produced it, so "which validation rule
 * failed?" always has a truthful answer. No language model is involved: the
 * findings are reproducible and safe to show before execution.
 */
import { buildScheduleFields } from '../utils/triggerSchedule';
import { buildTaskPayload, buildTriggerPayload, ExcelRow } from '../utils/payloadMapper';
import { Finding, JobRowLike, PayloadSnapshot, Severity } from './types';
import { lookupRule } from './knowledge/validation';
import { describeTriggerFields } from './scheduleAssistant';

const SCRIPT_TASK_TYPES = new Set(['taskUnix', 'taskWindows', 'taskUcmd', 'taskIbmi', 'taskZos']);
const AGENT_TASK_TYPES = new Set([
  'taskUnix', 'taskWindows', 'taskUcmd', 'taskIbmi', 'taskZos',
  'taskSql', 'taskStoredProc', 'taskFtp', 'taskSap', 'taskPeoplesoft',
  'taskFileMonitor', 'taskSystemMonitor', 'taskVariableMonitor',
]);
const KNOWN_TASK_TYPES = new Set([...AGENT_TASK_TYPES, 'taskWorkflow', 'taskTimer', 'taskEmail', 'taskWebService', 'taskUniversal']);

/** Rejected first_run_date content, mirroring the payload builder's guard. */
const NON_DATE_MARKERS = ['scheduled', 'frequency', 'daily', 'weekly', 'monthly'];

let findingSeq = 0;
function finding(
  severity: Severity,
  subject: string,
  rule: string,
  message: string,
  fix?: string,
  extra: { row?: number; field?: string } = {},
): Finding {
  return {
    id: `f${++findingSeq}`,
    severity,
    subject,
    rule,
    message,
    fix: fix ?? lookupRule(rule)?.fix,
    ...extra,
  };
}

const str = (v: unknown): string => (v === undefined || v === null ? '' : String(v).trim());

// ── Row-level analysis ───────────────────────────────────────────────────────

/** Checks one row for missing required fields and invalid values. */
export function analyzeRow(row: JobRowLike, index: number): Finding[] {
  const out: Finding[] = [];
  const rowNo = index + 1;
  const name = str(row.task_name) || `row ${rowNo}`;
  const at = (field: string) => ({ row: rowNo, field });

  // Required fields.
  if (!str(row.task_name)) {
    out.push(finding('error', `Row ${rowNo}`, 'required.task_name',
      'This row has no job name, so neither the task nor its trigger can be created.', undefined, at('task_name')));
  }

  const taskType = str(row.task_type) || 'taskUnix';
  if (!str(row.task_type)) {
    out.push(finding('warning', name, 'required.task_type',
      'No task type given, so it will be created as taskUnix — which also forces runAsSudo on.', undefined, at('task_type')));
  } else if (!KNOWN_TASK_TYPES.has(taskType)) {
    out.push(finding('error', name, 'required.task_type',
      `"${taskType}" is not a task type this application recognises.`,
      `Use one of: ${[...AGENT_TASK_TYPES].join(', ')}.`, at('task_type')));
  }

  if (SCRIPT_TASK_TYPES.has(taskType) && !str(row.command)) {
    out.push(finding('error', name, 'required.command',
      'A script task with no command will be created and will report success while doing nothing.', undefined, at('command')));
  }

  if (AGENT_TASK_TYPES.has(taskType) && !str(row.agent)) {
    out.push(finding('error', name, 'required.agent',
      'No agent or agent cluster, so UAC has nowhere to run this task.', undefined, at('agent')));
  }

  // First run date must actually be a date.
  const frd = str(row.first_run_date);
  if (frd) {
    const lower = frd.toLowerCase();
    if (NON_DATE_MARKERS.some(m => lower.includes(m))) {
      out.push(finding('error', name, 'schedule.first-run-date-must-be-a-date',
        `First run date reads "${frd}", which is a frequency, not a date. It will be ignored so the trigger is still valid, but the intended start date is lost.`,
        undefined, at('first_run_date')));
    } else if (!/\d/.test(frd)) {
      out.push(finding('warning', name, 'schedule.first-run-date-must-be-a-date',
        `First run date "${frd}" does not look like a date and will be ignored.`, undefined, at('first_run_date')));
    }
  }

  // Max runtime sanity.
  const mrRaw = str(row.max_runtime);
  if (!mrRaw) {
    out.push(finding('warning', name, 'quality.missing-max-runtime',
      'No maximum runtime, so the Late Finish monitor stays off and nothing will report an overrun.', undefined, at('max_runtime')));
  } else {
    const mr = parseInt(mrRaw, 10);
    if (isNaN(mr) || mr <= 0) {
      out.push(finding('error', name, 'quality.missing-max-runtime',
        `Maximum runtime "${mrRaw}" is not a positive number of minutes, so it will be dropped.`,
        'Enter the expected runtime in whole minutes, for example 30.', at('max_runtime')));
    }
  }

  // Operational quality.
  if (!str(row.description)) {
    out.push(finding('info', name, 'quality.missing-description',
      'No description. Beyond readability, this also disables the schedule verifier cross-check.', undefined, at('description')));
  }
  if (!str(row.recovery1)) {
    out.push(finding('warning', name, 'quality.missing-recovery-notes',
      'No recovery instructions, so on-call has nothing to act on when this job fails.', undefined, at('recovery1')));
  }
  if (!str(row.servicenow_ticket)) {
    out.push(finding('warning', name, 'quality.missing-servicenow-ticket',
      'No ServiceNow ticket, so the job has no traceable authorisation.', undefined, at('servicenow_ticket')));
  }
  if (!str(row.business_services)) {
    out.push(finding('info', name, 'quality.missing-business-services',
      'No business services, so this job will not appear under any business service view in UAC.', undefined, at('business_services')));
  }
  if (taskType === 'taskUnix') {
    out.push(finding('info', name, 'quality.unix-sudo',
      'As a taskUnix job this will be created with runAsSudo enabled.', undefined, at('task_type')));
  }

  return out;
}

// ── Schedule analysis ────────────────────────────────────────────────────────

export interface RowSchedule {
  index: number;
  name: string;
  agent: string;
  /** Fields as the trigger builder resolves them. */
  fields: ReturnType<typeof buildScheduleFields>;
  /** Plain-English rendering. */
  summary: string;
  /** True when this row inherits its schedule from a reference job. */
  inherited: boolean;
}

/** Resolves the schedule for every row, so conflicts can be compared. */
export function resolveSchedules(rows: JobRowLike[]): RowSchedule[] {
  return rows.map((row, index) => {
    const inherited = !!str(row.ref_job);
    const fields = buildScheduleFields(
      str(row.schedule_string),
      str(row.frequency_type),
      str(row.start_time),
      str(row.timezone),
      str(row.end_time),
    );
    return {
      index,
      name: str(row.task_name) || `row ${index + 1}`,
      agent: str(row.agent),
      fields,
      summary: inherited
        ? `Inherited from reference job ${str(row.ref_job)}`
        : describeTriggerFields(fields),
      inherited,
    };
  });
}

/** Checks one resolved schedule for internal inconsistency. */
export function analyzeSchedule(rs: RowSchedule, row: JobRowLike): Finding[] {
  const out: Finding[] = [];
  const f = rs.fields;
  const at = (field: string) => ({ row: rs.index + 1, field });

  if (rs.inherited) {
    out.push(finding('info', rs.name, 'schedule.inherited-from-ref-job',
      `Schedule is inherited from reference job "${str(row.ref_job)}", so the frequency and start time on this row are ignored.`,
      undefined, at('ref_job')));
    return out;
  }

  if (f.timeStyle === 'Absolute' && !f.time && !str(row.start_time)) {
    out.push(finding('error', rs.name, 'schedule.absolute-needs-time',
      'This resolves to a fixed-time trigger but no time could be parsed, so timeStyle will be dropped and the trigger will need configuring by hand in UAC.',
      undefined, at('start_time')));
  }

  if (f.timeStyle === 'Interval') {
    if (!f.timeInterval) {
      out.push(finding('warning', rs.name, 'schedule.interval-needs-interval',
        'This is an interval trigger but no interval could be parsed, so it will default to every 60 minutes.',
        undefined, at('frequency_type')));
    } else {
      const minutes = f.timeIntervalUnits === 'Hours'
        ? f.timeInterval * 60
        : f.timeIntervalUnits === 'Seconds'
          ? f.timeInterval / 60
          : f.timeInterval;
      if (minutes < 5) {
        out.push(finding('warning', rs.name, 'schedule.high-frequency',
          `This fires every ${f.timeInterval} ${f.timeIntervalUnits ?? 'Minutes'}, which is under five minutes.`,
          undefined, at('frequency_type')));
      }
      const mr = parseInt(str(row.max_runtime), 10);
      if (!isNaN(mr) && mr > 0 && mr >= minutes) {
        out.push(finding('warning', rs.name, 'schedule.high-frequency',
          `Maximum runtime is ${mr} minute(s) but the trigger fires every ${minutes} minute(s), so runs will routinely overlap and be skipped by the "Active By Trigger" skip condition.`,
          'Either lengthen the interval or shorten the work.', at('max_runtime')));
      }
    }

    if (f.enabledStart && f.enabledEnd) {
      const [sh, sm] = f.enabledStart.split(':').map(Number);
      const [eh, em] = f.enabledEnd.split(':').map(Number);
      if (!isNaN(sh) && !isNaN(eh) && (eh * 60 + (em || 0)) <= (sh * 60 + (sm || 0))) {
        out.push(finding('error', rs.name, 'schedule.window-inverted',
          `The daily window runs from ${f.enabledStart} to ${f.enabledEnd}, which ends at or before it starts.`,
          undefined, at('end_time')));
      }
    }
  }

  if (!f.timeZone && !str(row.timezone)) {
    out.push(finding('warning', rs.name, 'schedule.missing-timezone',
      'No timezone, so this schedule will be evaluated in the UAC controller default rather than the timezone the business asked for.',
      undefined, at('timezone')));
  }

  return out;
}

// ── Cross-row analysis ───────────────────────────────────────────────────────

/** Duplicate job names inside a single upload. */
export function detectDuplicates(rows: JobRowLike[]): Finding[] {
  const out: Finding[] = [];
  const byName = new Map<string, number[]>();

  rows.forEach((row, i) => {
    const name = str(row.task_name);
    if (!name) return;
    const key = name.toLowerCase();
    byName.set(key, [...(byName.get(key) || []), i + 1]);
  });

  for (const [, positions] of byName) {
    if (positions.length < 2) continue;
    const name = str(rows[positions[0] - 1].task_name);
    out.push(finding('error', name, 'duplicate.task_name_in_file',
      `"${name}" appears on rows ${positions.join(', ')}. The first row will create the task and the rest will fail, because UAC rejects a duplicate name — and all of them would generate the same ${name}-TR001 trigger.`,
      undefined, { field: 'task_name' }));
  }

  // Near-duplicates: same name ignoring separators and case. Worth a nudge
  // because it is usually a typo rather than two intentional jobs.
  const flat = new Map<string, string[]>();
  rows.forEach(row => {
    const name = str(row.task_name);
    if (!name) return;
    const key = name.toLowerCase().replace(/[^a-z0-9]/g, '');
    flat.set(key, [...(flat.get(key) || []), name]);
  });
  for (const [, names] of flat) {
    const distinct = Array.from(new Set(names));
    if (distinct.length > 1) {
      out.push(finding('warning', distinct[0], 'duplicate.task_name_in_file',
        `These names differ only by punctuation or case: ${distinct.join(', ')}. UAC treats them as separate jobs, so if that was a typo you will get duplicates.`,
        'Confirm the naming is intentional.', { field: 'task_name' }));
    }
  }

  return out;
}

/** Same agent, same firing time, overlapping days. */
export function detectScheduleConflicts(schedules: RowSchedule[]): Finding[] {
  const out: Finding[] = [];

  const daysOf = (f: RowSchedule['fields']): Set<string> => {
    const flags = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
    const named = flags.filter(d => (f as any)[d]);
    if (named.length) return new Set<string>(named);
    if (f.businessDays || f.simpleDateType === 'Business Days') return new Set(['mon', 'tue', 'wed', 'thu', 'fri']);
    if (f.simpleDateType === 'Daily' || f.dayStyle === 'Simple') return new Set(flags);
    // Complex or interval-day patterns: unknown overlap, treat as every day so
    // a genuine clash is not missed.
    return new Set(flags);
  };

  const overlaps = (a: Set<string>, b: Set<string>) => {
    for (const d of a) if (b.has(d)) return true;
    return false;
  };

  for (let i = 0; i < schedules.length; i++) {
    for (let j = i + 1; j < schedules.length; j++) {
      const a = schedules[i];
      const b = schedules[j];
      if (a.inherited || b.inherited) continue;
      if (!a.agent || !b.agent) continue;
      if (a.agent.toLowerCase() !== b.agent.toLowerCase()) continue;
      if (!overlaps(daysOf(a.fields), daysOf(b.fields))) continue;

      const sameZone = (a.fields.timeZone || '') === (b.fields.timeZone || '');

      // Two absolute triggers at the same minute.
      if (a.fields.timeStyle !== 'Interval' && b.fields.timeStyle !== 'Interval'
        && a.fields.time && a.fields.time === b.fields.time && sameZone) {
        out.push(finding('warning', `${a.name} + ${b.name}`, 'schedule.overlap',
          `${a.name} and ${b.name} both fire at ${a.fields.time}${a.fields.timeZone ? ` ${a.fields.timeZone}` : ''} on the same agent (${a.agent}), on overlapping days.`,
          'Stagger the start times, or confirm the two jobs are safe to run at the same moment on the same agent.'));
        continue;
      }

      // An interval job and anything else on the same agent: the interval will
      // land on the other job's slot sooner or later.
      if (a.fields.timeStyle === 'Interval' && b.fields.timeStyle === 'Interval' && sameZone) {
        out.push(finding('info', `${a.name} + ${b.name}`, 'schedule.overlap',
          `${a.name} and ${b.name} are both interval jobs on agent ${a.agent}, so their runs will regularly coincide.`,
          'Confirm the agent can carry both concurrently.'));
      }
    }
  }

  return out;
}

// ── Full upload analysis ─────────────────────────────────────────────────────

export interface UploadAnalysis {
  rowCount: number;
  findings: Finding[];
  counts: { error: number; warning: number; info: number };
  /** True when nothing blocks execution. */
  readyToExecute: boolean;
  schedules: { name: string; summary: string }[];
  /** Rows that would fail outright, by job name. */
  blockedJobs: string[];
}

export function analyzeUpload(rows: JobRowLike[]): UploadAnalysis {
  findingSeq = 0;
  const findings: Finding[] = [];

  const schedules = resolveSchedules(rows);

  rows.forEach((row, i) => {
    findings.push(...analyzeRow(row, i));
    findings.push(...analyzeSchedule(schedules[i], row));
  });

  findings.push(...detectDuplicates(rows));
  findings.push(...detectScheduleConflicts(schedules));

  const counts = {
    error: findings.filter(f => f.severity === 'error').length,
    warning: findings.filter(f => f.severity === 'warning').length,
    info: findings.filter(f => f.severity === 'info').length,
  };

  const blockedJobs = Array.from(new Set(
    findings.filter(f => f.severity === 'error').map(f => f.subject),
  ));

  return {
    rowCount: rows.length,
    findings,
    counts,
    readyToExecute: counts.error === 0,
    schedules: schedules.map(s => ({ name: s.name, summary: s.summary })),
    blockedJobs,
  };
}

// ── Payload generation for the Copilot's own preview ─────────────────────────

/**
 * Builds the same payloads execution would send, so the Copilot can explain
 * them without the frontend having to call the preview endpoint first.
 */
export function buildPayloadSnapshots(rows: JobRowLike[]): PayloadSnapshot[] {
  const schedules = resolveSchedules(rows);
  return rows.map((row, i) => {
    const excelRow = row as ExcelRow;
    const task = buildTaskPayload(excelRow);
    const trigger = buildTriggerPayload(excelRow);
    return {
      name: str(row.task_name) || `row ${i + 1}`,
      task,
      trigger,
      summary: schedules[i].summary,
    };
  });
}

// ── Impact analysis ──────────────────────────────────────────────────────────

export interface ImpactAnalysis {
  subject: string;
  lines: string[];
}

/** What creating this set of jobs will actually do. */
export function analyzeCreationImpact(rows: JobRowLike[]): ImpactAnalysis {
  const names = rows.map(r => str(r.task_name)).filter(Boolean);
  const agents = Array.from(new Set(rows.map(r => str(r.agent)).filter(Boolean)));
  const services = Array.from(new Set(
    rows.flatMap(r => str(r.business_services).split(/[;,]/).map(s => s.trim()).filter(Boolean)),
  ));
  const withRef = rows.filter(r => str(r.ref_job)).length;
  const intervals = resolveSchedules(rows).filter(s => s.fields.timeStyle === 'Interval').length;

  const lines = [
    `${rows.length} task(s) and ${rows.length} time trigger(s) will be created — ${rows.length * 2} objects in total.`,
    `Trigger names will be ${names.slice(0, 3).map(n => `${n}-TR001`).join(', ')}${names.length > 3 ? `, … (one per task)` : ''}.`,
    `Every trigger is created disabled, so nothing starts running until you enable them after verification.`,
    agents.length ? `Agents or clusters targeted: ${agents.join(', ')}.` : 'No agent targets found in the rows.',
    services.length ? `Business services affected: ${services.join(', ')}.` : 'No business services set, so these jobs will not appear under any business service view.',
    withRef ? `${withRef} row(s) inherit their schedule from a reference job, so those reference jobs must resolve before execution.` : '',
    intervals ? `${intervals} job(s) are interval triggers, which repeat through the day rather than firing once.` : '',
    `Execution runs at most 2 concurrent UAC calls with a 300 ms gap, and caps a run at 100 jobs.`,
    `Nothing existing is modified. UAC rejects a duplicate name rather than overwriting, so a name clash fails that row and leaves the current job untouched.`,
  ].filter(Boolean);

  return { subject: `${rows.length} job(s) pending creation`, lines };
}

/** What deleting a job will affect. */
export function analyzeDeletionImpact(taskName: string): ImpactAnalysis {
  return {
    subject: taskName,
    lines: [
      `Deleting ${taskName} removes the task and every trigger that references it, including ${taskName}-TR001.`,
      `Anything downstream that waited on this job stops being triggered. Workflows containing it are left with a missing member.`,
      `Active instances block the delete. Inspect first, and only force-finish an instance you have confirmed is stuck.`,
      `Take the backup snapshot before deleting. Job Recovery can only restore what was snapshotted, and the server store keeps entries for 7 days.`,
      `The deletion is written to the audit log with the session that performed it.`,
    ],
  };
}
