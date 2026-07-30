/**
 * Inline Assistant Mode — the conversational job builder.
 *
 * Instead of a large form, the assistant asks one question at a time, in a
 * sensible order, skipping questions that do not apply to the answers already
 * given. Optional fields are labelled and can be skipped outright. Nothing is
 * ever asked twice: answers live on the session memory, and suggestions are
 * drawn from what the user already entered earlier in the session.
 *
 * The wizard produces an ExcelRow, which is then fed through the same
 * buildTaskPayload / buildTriggerPayload used by bulk creation — so a job built
 * conversationally is identical to one built from a spreadsheet.
 */
import { buildTaskPayload, buildTriggerPayload, ExcelRow } from '../utils/payloadMapper';
import {
  WizardFieldSpec,
  WizardState,
  WizardStep,
  WizardMemoryHints,
  JobRowLike,
  Finding,
} from './types';
import { analyzeRow, analyzeSchedule, resolveSchedules } from './analyzers';
import { interpretSchedule, describeTriggerFields } from './scheduleAssistant';
import { INPUT_FIELDS } from './knowledge/fields';

/** Pulls the documented help text for a column straight from the dictionary. */
function help(key: string, fallback: string): string {
  const doc = INPUT_FIELDS.find(f => f.key === key);
  if (!doc) return fallback;
  return [doc.meaning, doc.note].filter(Boolean).join(' ');
}

const TASK_TYPE_OPTIONS = [
  { value: 'taskUnix', label: 'Unix / Linux script (taskUnix)' },
  { value: 'taskWindows', label: 'Windows script (taskWindows)' },
  { value: 'taskUcmd', label: 'Universal Command (taskUcmd)' },
  { value: 'taskZos', label: 'z/OS (taskZos)' },
  { value: 'taskIbmi', label: 'IBM i (taskIbmi)' },
  { value: 'taskSql', label: 'SQL (taskSql)' },
  { value: 'taskStoredProc', label: 'Stored procedure (taskStoredProc)' },
  { value: 'taskFtp', label: 'FTP (taskFtp)' },
  { value: 'taskFileMonitor', label: 'File monitor (taskFileMonitor)' },
];

const SCRIPT_TYPES = new Set(['taskUnix', 'taskWindows', 'taskUcmd', 'taskIbmi', 'taskZos']);

const NAME_PATTERN = /^[A-Za-z0-9_.\-]+$/;

/** First previously used value, so common answers are pre-filled. */
const firstOf = (list: string[]): string | undefined => (list.length ? list[0] : undefined);

// ── The question list ────────────────────────────────────────────────────────

export const WIZARD_FIELDS: WizardFieldSpec[] = [
  {
    key: 'task_name',
    question: 'What would you like to name the job?',
    type: 'text',
    required: true,
    help: help('task_name', 'The task name in UAC.'),
    examples: ['PAY_DAILY_LOAD', 'FIN_MONTH_END_CLOSE'],
    validate: (v, answers) => {
      if (!v.trim()) return 'A job name is required — it also determines the trigger name.';
      if (!NAME_PATTERN.test(v.trim())) return 'Use letters, numbers, underscore, dot or hyphen only. Spaces and other characters cause problems in UAC.';
      if (v.trim().length > 100) return 'That is longer than UAC will accept comfortably. Keep it under 100 characters.';
      return undefined;
    },
  },
  {
    key: 'task_type',
    question: 'What kind of task is this?',
    type: 'choice',
    required: true,
    help: help('task_type', 'Which UAC task type to create.'),
    options: TASK_TYPE_OPTIONS,
    suggest: () => 'taskUnix',
    validate: v => (TASK_TYPE_OPTIONS.some(o => o.value === v.trim())
      ? undefined
      : `Pick one of: ${TASK_TYPE_OPTIONS.map(o => o.value).join(', ')}.`),
  },
  {
    key: 'command',
    question: 'What command or script should this job execute?',
    type: 'text',
    required: true,
    help: help('command', 'The command the agent runs.'),
    examples: ['/opt/app/bin/run_load.sh', 'D:\\jobs\\extract.bat'],
    appliesWhen: answers => SCRIPT_TYPES.has(answers.task_type || 'taskUnix'),
    validate: v => (v.trim() ? undefined : 'A script task with no command runs nothing and still reports success, so this one is required.'),
  },
  {
    key: 'agent',
    question: 'Which agent or agent cluster should it run on?',
    type: 'text',
    required: true,
    help: help('agent', 'Where the work runs.'),
    examples: ['LINUX_PROD_CLUSTER', 'WINAGENT01'],
    suggest: (_a, mem) => firstOf(mem.agents),
    validate: v => (v.trim() ? undefined : 'UAC needs somewhere to run the task.'),
  },
  {
    key: 'credential',
    question: 'Which UAC credential should it run as?',
    type: 'text',
    required: false,
    help: help('credential', 'The credential the command runs under.'),
    suggest: (_a, mem) => firstOf(mem.credentials),
  },
  {
    key: 'description',
    question: 'Give it a one-line description.',
    type: 'text',
    required: false,
    help: help('description', 'What the job does.'),
    examples: ['Nightly payments file load'],
  },
  {
    key: 'schedule_nl',
    question: 'When should this job run? Plain English is fine.',
    type: 'schedule',
    required: true,
    help: 'Describe the schedule the way you would say it. I will translate it into a valid UAC trigger and read it back to you before anything is created. There are no cron expressions in UAC time triggers.',
    examples: [
      'every weekday at 8 PM',
      'every 5 minutes on Monday, Tuesday and Wednesday',
      'every 15 minutes from 06:00 to 22:00',
      'the last Friday of every month at 23:00',
    ],
    validate: v => {
      if (!v.trim()) return 'A schedule is required. If you genuinely want no schedule, say "no schedule" and I will create the task without a trigger.';
      if (/^no( schedule)?$|^none$|^manual$/i.test(v.trim())) return undefined;
      const parsed = interpretSchedule(v);
      return parsed.understood
        ? undefined
        : `I could not turn that into a valid schedule with any confidence. Try something like: ${['every weekday at 8 PM', 'every 15 minutes from 06:00 to 22:00', 'the last Friday of every month'].join(' / ')}.`;
    },
  },
  {
    key: 'timezone',
    question: 'Which timezone is that time in?',
    type: 'text',
    required: false,
    help: help('timezone', 'The timezone the schedule is evaluated in.'),
    examples: ['America/New_York', 'Asia/Kolkata', 'UTC'],
    suggest: (answers, mem) => {
      // If the schedule text already named a timezone, do not ask again.
      const fromSchedule = answers.schedule_nl ? interpretSchedule(answers.schedule_nl).timezone : undefined;
      return fromSchedule || firstOf(mem.timezones);
    },
    appliesWhen: answers => {
      const parsed = answers.schedule_nl ? interpretSchedule(answers.schedule_nl) : null;
      // Skip when the schedule text already carried an explicit timezone.
      return !(parsed && parsed.timezone && /[A-Za-z]+\/[A-Za-z_]+/.test(answers.schedule_nl || ''));
    },
  },
  {
    key: 'first_run_date',
    question: 'Should it start on a particular date?',
    type: 'date',
    required: false,
    help: help('first_run_date', 'The earliest date the trigger may fire.'),
    examples: ['2026-08-01'],
    validate: v => {
      if (!v.trim()) return undefined;
      const lower = v.trim().toLowerCase();
      if (['scheduled', 'frequency', 'daily', 'weekly', 'monthly'].some(m => lower.includes(m))) {
        return 'That is a frequency, not a date. UAC validates this against the schedule and rejects it, so either give a date like 2026-08-01 or skip this.';
      }
      if (!/\d/.test(v)) return 'That does not look like a date. Give something like 2026-08-01, or skip it.';
      return undefined;
    },
  },
  {
    key: 'max_runtime',
    question: 'How long should this job normally take, in minutes?',
    type: 'number',
    required: false,
    help: help('max_runtime', 'Expected runtime in minutes.'),
    examples: ['30', '120'],
    validate: v => {
      if (!v.trim()) return undefined;
      const n = parseInt(v, 10);
      return !isNaN(n) && n > 0 ? undefined : 'Give a positive whole number of minutes, or skip it.';
    },
  },
  {
    key: 'business_services',
    question: 'Which business services does this belong to?',
    type: 'text',
    required: false,
    help: help('business_services', 'Business services for UAC reporting.'),
    examples: ['Payments', 'Finance;Reporting'],
    suggest: (_a, mem) => firstOf(mem.businessServices),
  },
  {
    key: 'servicenow_ticket',
    question: 'Which ServiceNow ticket authorises this job?',
    type: 'text',
    required: false,
    help: help('servicenow_ticket', 'The change record behind this job.'),
    examples: ['CHG0012345'],
  },
  {
    key: 'servicenow_group',
    question: 'Which ServiceNow assignment group supports it?',
    type: 'text',
    required: false,
    help: help('servicenow_group', 'The support group.'),
    suggest: (_a, mem) => firstOf(mem.serviceNowGroups),
  },
  {
    key: 'recovery1',
    question: 'What should on-call do first if this job fails?',
    type: 'text',
    required: false,
    help: help('recovery1', 'First-line recovery instruction.'),
    examples: ['Check the source file landed, then rerun from Ad-hoc Launch'],
  },
  {
    key: 'recovery2',
    question: 'And if that does not work — who or what is the escalation?',
    type: 'text',
    required: false,
    help: help('recovery2', 'Escalation path.'),
    examples: ['Escalate to the Payments application team'],
  },
  {
    key: 'want_trigger',
    question: 'Ready to build it — should I create the time trigger alongside the task?',
    type: 'choice',
    required: true,
    help: 'The trigger is what makes the job run on a schedule. It is always created disabled, so nothing fires until you verify and enable it. Answer no to create the task only, which you can still launch on demand from Ad-hoc Launch.',
    options: [
      { value: 'yes', label: 'Yes — create the task and its trigger' },
      { value: 'no', label: 'No — create the task only' },
    ],
    suggest: answers => (isNoSchedule(answers.schedule_nl) ? 'no' : 'yes'),
    validate: v => (/^(yes|no|y|n)$/i.test(v.trim()) ? undefined : 'Answer yes or no.'),
  },
];

function isNoSchedule(v?: string): boolean {
  return !!v && /^no( schedule)?$|^none$|^manual$/i.test(v.trim());
}

/** The questions that apply given the answers so far. */
function applicableFields(answers: Record<string, string>): WizardFieldSpec[] {
  return WIZARD_FIELDS.filter(f => !f.appliesWhen || f.appliesWhen(answers));
}

// ── Row assembly ─────────────────────────────────────────────────────────────

/** Converts collected answers into the spreadsheet row shape. */
export function answersToRow(answers: Record<string, string>): JobRowLike {
  const scheduleText = answers.schedule_nl || '';
  const noSchedule = isNoSchedule(scheduleText);
  const parsed = noSchedule || !scheduleText ? null : interpretSchedule(scheduleText, answers.timezone);

  const row: JobRowLike = {
    task_name: (answers.task_name || '').trim(),
    task_type: (answers.task_type || 'taskUnix').trim(),
    agent: (answers.agent || '').trim(),
    command: (answers.command || '').trim(),
    credential: (answers.credential || '').trim(),
    description: (answers.description || '').trim(),
    first_run_date: (answers.first_run_date || '').trim(),
    start_time: parsed?.scheduleString || '',
    end_time: parsed?.endTime || '',
    timezone: (answers.timezone || parsed?.timezone || '').trim(),
    frequency_type: parsed?.frequency || '',
    schedule_string: parsed?.scheduleString || '',
    max_runtime: (answers.max_runtime || '').trim(),
    business_services: (answers.business_services || '').trim(),
    servicenow_ticket: (answers.servicenow_ticket || '').trim(),
    servicenow_group: (answers.servicenow_group || '').trim(),
    recovery1: (answers.recovery1 || '').trim(),
    recovery2: (answers.recovery2 || '').trim(),
  };

  // Drop empties so the payload builder's own defaults apply cleanly.
  Object.keys(row).forEach(k => { if (row[k] === '') delete row[k]; });
  return row;
}

/** Builds the confirmation summary shown before the job is created. */
function buildSummary(answers: Record<string, string>, skipped: string[]): NonNullable<WizardStep['summary']> {
  const row = answersToRow(answers) as ExcelRow;
  // A trigger is built only when the user asked for one AND gave a real schedule.
  const includeTrigger = /^y/i.test(answers.want_trigger || 'yes') && !isNoSchedule(answers.schedule_nl);

  const task = buildTaskPayload(row);
  const trigger: Record<string, any> = includeTrigger ? buildTriggerPayload(row) : {};

  const scheduleSummary = includeTrigger
    ? describeTriggerFields(resolveSchedules([row])[0].fields)
    : 'No trigger — the task will only run when launched on demand.';

  // Validate the assembled row with the same analyzers used for uploads.
  const findings: Finding[] = [
    ...analyzeRow(row, 0),
    ...(includeTrigger ? analyzeSchedule(resolveSchedules([row])[0], row) : []),
  ];

  const lines = applicableFields(answers).map(f => {
    const raw = answers[f.key];
    const value = skipped.includes(f.key) || !raw
      ? '(skipped)'
      : f.key === 'schedule_nl'
        ? `${raw} → ${scheduleSummary}`
        : raw;
    return { label: f.question.replace(/\?$/, ''), value, optional: !f.required };
  });

  // Surface the resolved schedule fields too, so the summary is auditable.
  if (includeTrigger) {
    lines.push({ label: 'Trigger name', value: String(trigger.name || `${row.task_name}-TR001`), optional: false });
    lines.push({ label: 'Trigger state at creation', value: 'Disabled — enable it after verification', optional: false });
  }

  return { row, task, trigger, scheduleSummary, findings, lines };
}

// ── State machine ────────────────────────────────────────────────────────────

export type WizardAction = 'start' | 'answer' | 'skip' | 'back' | 'cancel' | 'status';

export interface WizardInput {
  action: WizardAction;
  answer?: string;
}

/**
 * Advances the wizard. Pure with respect to the state passed in: it returns the
 * next state plus the step to render, and the caller persists the state.
 */
export function advanceWizard(
  state: WizardState,
  input: WizardInput,
  memory: WizardMemoryHints,
): { state: WizardState; step: WizardStep } {
  let next: WizardState = {
    ...state,
    answers: { ...state.answers },
    skipped: [...state.skipped],
  };

  // ── start / cancel ────────────────────────────────────────────────────────
  if (input.action === 'cancel') {
    return {
      state: { active: false, cursor: 0, answers: {}, skipped: [], startedAt: '' },
      step: {
        done: true,
        field: null,
        message: 'Inline Assistant cancelled. Nothing was created. Your uploaded file and other session context are untouched.',
        answers: {},
      },
    };
  }

  if (input.action === 'start' || !state.active) {
    next = {
      active: true,
      cursor: 0,
      // Seed from anything the session already knows, so the first questions
      // arrive pre-filled rather than blank.
      answers: {},
      skipped: [],
      startedAt: new Date().toISOString(),
    };
    return { state: next, step: renderStep(next, memory, 'Let\'s build a job one field at a time. You can skip anything marked optional, and I will remember every answer — I will not ask you the same thing twice.') };
  }

  const fields = applicableFields(next.answers);

  // ── back ──────────────────────────────────────────────────────────────────
  if (input.action === 'back') {
    next.cursor = Math.max(0, next.cursor - 1);
    const field = fields[next.cursor];
    if (field) {
      delete next.answers[field.key];
      next.skipped = next.skipped.filter(k => k !== field.key);
    }
    return { state: next, step: renderStep(next, memory, 'Going back one step.') };
  }

  // ── status ────────────────────────────────────────────────────────────────
  if (input.action === 'status') {
    return { state: next, step: renderStep(next, memory) };
  }

  const current = fields[next.cursor];

  // Already finished.
  if (!current) {
    next.active = false;
    next.completedAt = next.completedAt || new Date().toISOString();
    return { state: next, step: finishedStep(next) };
  }

  // ── skip ──────────────────────────────────────────────────────────────────
  if (input.action === 'skip') {
    if (current.required) {
      return {
        state: next,
        step: renderStep(next, memory, undefined, `${current.question.replace(/\?$/, '')} is required — I cannot build a valid job without it.`),
      };
    }
    next.skipped.push(current.key);
    next.answers[current.key] = '';
    next.cursor += 1;
    return { state: next, step: renderStep(next, memory, 'Skipped.') };
  }

  // ── answer ────────────────────────────────────────────────────────────────
  const raw = (input.answer ?? '').trim();

  // An empty answer means "just press Enter".
  //
  // When there is a suggestion, Enter accepts it — that is what a prefilled
  // default means, and it holds for optional fields too. Losing a value the
  // session already knows (a timezone, an agent) because the user pressed Enter
  // would be the opposite of helpful. Skipping is still available explicitly.
  if (raw === '') {
    const suggestion = current.suggest?.(next.answers, memory);
    if (suggestion) {
      next.answers[current.key] = suggestion;
      next.skipped = next.skipped.filter(k => k !== current.key);
      next.cursor += 1;
      return { state: next, step: renderStep(next, memory, `Using ${suggestion}.`) };
    }
    if (current.required) {
      return {
        state: next,
        step: renderStep(next, memory, undefined, `${current.question.replace(/\?$/, '')} is required.`),
      };
    }
    next.skipped.push(current.key);
    next.answers[current.key] = '';
    next.cursor += 1;
    return { state: next, step: renderStep(next, memory, 'Skipped.') };
  }

  const error = current.validate?.(raw, next.answers);
  if (error) {
    return { state: next, step: renderStep(next, memory, undefined, error) };
  }

  next.answers[current.key] = raw;
  next.skipped = next.skipped.filter(k => k !== current.key);
  next.cursor += 1;

  // Confirmation prose for answers worth reading back immediately.
  let ack: string | undefined;
  if (current.key === 'schedule_nl' && !isNoSchedule(raw)) {
    const parsed = interpretSchedule(raw, next.answers.timezone);
    ack = `Understood: ${parsed.summary}${parsed.questions.length ? ` ${parsed.questions[0]}` : ''}`;
  }

  // Recompute applicability — the answer may have removed later questions.
  const remaining = applicableFields(next.answers);
  if (next.cursor >= remaining.length) {
    next.active = false;
    next.completedAt = new Date().toISOString();
    return { state: next, step: finishedStep(next, ack) };
  }

  return { state: next, step: renderStep(next, memory, ack) };
}

function renderStep(
  state: WizardState,
  memory: WizardMemoryHints,
  message?: string,
  error?: string,
): WizardStep {
  const fields = applicableFields(state.answers);
  const field = fields[state.cursor];

  if (!field) return finishedStep(state, message);

  const suggestion = field.suggest?.(state.answers, memory);

  // Warn about a name that already appeared in this session.
  let notice = '';
  if (field.key === 'task_name' && memory.existingNames.length) {
    notice = ` Names already used in this session: ${Array.from(new Set(memory.existingNames)).slice(0, 5).join(', ')}.`;
  }

  const { appliesWhen, suggest, validate, ...spec } = field;
  void appliesWhen; void suggest; void validate;

  return {
    done: false,
    error,
    message: [
      message,
      error ? undefined : undefined,
      `${field.question}${field.required ? '' : ' (optional — press Enter or choose Skip to leave it out)'}${notice}`,
    ].filter(Boolean).join(' '),
    field: {
      ...spec,
      suggestion,
      index: state.cursor + 1,
      total: fields.length,
    },
    answers: state.answers,
  };
}

function finishedStep(state: WizardState, message?: string): WizardStep {
  const summary = buildSummary(state.answers, state.skipped);
  const errors = summary.findings.filter(f => f.severity === 'error');
  const warnings = summary.findings.filter(f => f.severity === 'warning');

  const verdict = errors.length
    ? `${errors.length} problem(s) would stop this job being created — review them before confirming.`
    : warnings.length
      ? `Nothing blocking. ${warnings.length} thing(s) worth a look before you confirm.`
      : 'No problems found.';

  return {
    done: true,
    field: null,
    message: [
      message,
      'That is everything I need. Here is the job I will create — check it and confirm.',
      verdict,
    ].filter(Boolean).join(' '),
    answers: state.answers,
    summary,
  };
}
