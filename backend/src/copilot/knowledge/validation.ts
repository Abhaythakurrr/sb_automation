/**
 * Validation rule knowledge.
 *
 * Each rule mirrors a check that the application actually performs, either in
 * the payload builder, the schedule builder, the upload security layer or the
 * Copilot's own pre-execution analyzer. The `id` is what a Finding cites, so a
 * user can always ask "which validation rule failed?" and get a real answer.
 */
import { KnowledgeChunk } from '../types';

export interface ValidationRule {
  id: string;
  title: string;
  /** What is checked. */
  rule: string;
  /** What goes wrong when it is violated. */
  consequence: string;
  /** How to fix it. */
  fix: string;
  /** Where the check lives. */
  enforcedBy: string;
  severity: 'error' | 'warning' | 'info';
}

export const VALIDATION_RULES: ValidationRule[] = [
  // ── Required input ─────────────────────────────────────────────────────────
  {
    id: 'required.task_name',
    title: 'Job name is required',
    rule: 'Every row must have task_name.',
    consequence: 'The task cannot be created and the trigger has nothing to reference, so the whole row fails.',
    fix: 'Fill the Job Name column.',
    enforcedBy: 'FileParserService row validation; buildTaskPayload uses it as the task name',
    severity: 'error',
  },
  {
    id: 'required.command',
    title: 'Command is required for script tasks',
    rule: 'Script task types (taskUnix, taskWindows, taskUcmd, taskIbmi, taskZos) must have a command.',
    consequence: 'UAC creates a task that runs nothing. It reports success and does no work.',
    fix: 'Fill the Job Script column with the command or script path.',
    enforcedBy: 'buildTaskPayload only sets command when the row provides one',
    severity: 'error',
  },
  {
    id: 'required.agent',
    title: 'Agent is required for agent-based tasks',
    rule: 'Agent-based task types must name an agent or agent cluster.',
    consequence: 'UAC has nowhere to run the work and the instance fails at launch.',
    fix: 'Fill the Job Workstation / Agent column with a valid agent or cluster name.',
    enforcedBy: 'buildTaskPayload agent resolution; resolveAgent probes UAC',
    severity: 'error',
  },
  {
    id: 'required.task_type',
    title: 'Task type defaults to taskUnix',
    rule: 'When task_type is empty the builder assumes taskUnix.',
    consequence: 'A Windows job created as taskUnix will not run, and taskUnix also forces runAsSudo.',
    fix: 'Set the task type explicitly on every row.',
    enforcedBy: 'buildTaskPayload default',
    severity: 'warning',
  },

  // ── Uniqueness ─────────────────────────────────────────────────────────────
  {
    id: 'duplicate.task_name_in_file',
    title: 'Duplicate job names within one upload',
    rule: 'task_name must be unique across the rows in a single upload.',
    consequence: 'The first row creates the task; every later row with the same name fails because UAC rejects a duplicate name. Both rows also generate the same -TR001 trigger name.',
    fix: 'Rename the duplicates, or remove the repeated rows.',
    enforcedBy: 'Copilot pre-execution analyzer; UAC rejects the duplicate at create time',
    severity: 'error',
  },
  {
    id: 'duplicate.task_name_in_uac',
    title: 'Job name already exists in UAC',
    rule: 'task_name must not already exist in the target environment.',
    consequence: 'Creation fails for that row. Nothing is overwritten — UAC refuses rather than replacing.',
    fix: 'Check the name in Search & Edit first. Either pick a new name, or if you meant to change the existing job use Search & Edit instead of creating.',
    enforcedBy: 'UAC at create time; Search & Edit lets you check beforehand',
    severity: 'error',
  },

  // ── Schedule integrity ─────────────────────────────────────────────────────
  {
    id: 'schedule.absolute-needs-time',
    title: 'Absolute trigger requires a time',
    rule: 'When timeStyle is Absolute the trigger must carry a time in HH:MM.',
    consequence: 'UAC rejects the trigger with "Time is required field for timeStyle: Absolute".',
    fix: 'Provide Job Starttime. The builder falls back to start_time, and if there is still no time it drops timeStyle and logs a warning, leaving the trigger to be configured by hand in UAC.',
    enforcedBy: 'buildTriggerPayload safety block',
    severity: 'error',
  },
  {
    id: 'schedule.interval-needs-interval',
    title: 'Interval trigger requires an interval',
    rule: 'When timeStyle is Interval the trigger must carry timeInterval and timeIntervalUnits.',
    consequence: 'Without them the trigger has no repeat period.',
    fix: 'State the interval, for example "every 15 minutes". The builder defaults to 60 Minutes and logs a warning rather than sending an invalid trigger.',
    enforcedBy: 'buildTriggerPayload safety block',
    severity: 'warning',
  },
  {
    id: 'schedule.interval-must-not-have-time',
    title: 'Interval trigger must not carry an absolute time',
    rule: 'The time field is removed from any trigger whose timeStyle is Interval.',
    consequence: 'If time is present UAC treats it as the absolute trigger time and ignores the interval entirely — the job runs once a day instead of every N minutes.',
    fix: 'Nothing to do; the builder deletes it. Use enabledStart and enabledEnd to bound an interval to a daily window.',
    enforcedBy: 'buildTriggerPayload — time deleted twice, defensively',
    severity: 'info',
  },
  {
    id: 'schedule.day-flags-need-specific-days',
    title: 'Day flags conflict with simpleDateType Daily',
    rule: 'When individual day flags are set, simpleDateType must be "Specific Days", not "Daily".',
    consequence: 'With simpleDateType Daily alongside day flags, UAC ignores the flags and runs every day.',
    fix: 'Nothing to do; the builder promotes simpleDateType to "Specific Days" when it sees day flags without one.',
    enforcedBy: 'buildTriggerPayload day-flag reconciliation',
    severity: 'info',
  },
  {
    id: 'schedule.complex-drops-simple-date-type',
    title: 'Complex day style drops simpleDateType',
    rule: 'simpleDateType is removed when dayStyle is Complex.',
    consequence: 'The two describe the day pattern in incompatible ways.',
    fix: 'Nothing to do; the builder removes it.',
    enforcedBy: 'buildTriggerPayload',
    severity: 'info',
  },
  {
    id: 'schedule.first-run-date-must-be-a-date',
    title: 'First run date must be a real date',
    rule: 'first_run_date is rejected when it contains "scheduled", "frequency", "daily", "weekly" or "monthly".',
    consequence: 'UAC validates skipBeforeDate against the schedule frequency and rejects a value that is not a date, failing the whole trigger.',
    fix: 'Put a date in the Firstrun Date column, or leave it empty. Empty is safe — no skip fields are set and the trigger can fire on its next qualifying time.',
    enforcedBy: 'buildTriggerPayload first-run-date guard',
    severity: 'error',
  },
  {
    id: 'schedule.missing-timezone',
    title: 'Missing timezone',
    rule: 'A trigger with a time but no timeZone falls back to the UAC controller default.',
    consequence: 'The job runs at the controller\'s local time, which is usually not the time the business asked for. This is the most common silent scheduling defect.',
    fix: 'Set the Job Timezone column, for example America/New_York or Asia/Kolkata.',
    enforcedBy: 'Copilot pre-execution analyzer',
    severity: 'warning',
  },
  {
    id: 'schedule.window-inverted',
    title: 'Interval window ends before it starts',
    rule: 'enabledEnd must be later than enabledStart.',
    consequence: 'The daily window is empty or wraps unexpectedly, so the job may never fire.',
    fix: 'Correct Job Starttime and Job End Time so the window runs forward.',
    enforcedBy: 'Copilot pre-execution analyzer',
    severity: 'error',
  },
  {
    id: 'schedule.inherited-from-ref-job',
    title: 'Schedule inherited from a reference job',
    rule: 'When ref_job is set, the schedule comes from that job\'s trigger and the row\'s own frequency and start time are ignored.',
    consequence: 'A schedule typed into the row has no effect, which is surprising if you did not intend to inherit.',
    fix: 'Clear ref_job to use the row\'s own schedule. If you do want inheritance, confirm the reference job resolves and check the qualifying times after creation.',
    enforcedBy: 'buildTriggerPayload SCHEDULE_ONLY copy from the resolved reference trigger',
    severity: 'info',
  },
  {
    id: 'schedule.overlap',
    title: 'Schedule conflict between uploaded jobs',
    rule: 'Two jobs in the same upload that target the same agent and fire at the same time on overlapping days are flagged.',
    consequence: 'Both instances compete for the same agent at the same moment. Depending on the work this causes contention, lock waits, or duplicated processing.',
    fix: 'Stagger the start times, or confirm the two jobs are genuinely safe to run together.',
    enforcedBy: 'Copilot pre-execution analyzer',
    severity: 'warning',
  },
  {
    id: 'schedule.high-frequency',
    title: 'Very short interval',
    rule: 'An interval below 5 minutes is flagged.',
    consequence: 'Frequent launches add controller and agent load, and a job that sometimes runs longer than its interval will keep skipping.',
    fix: 'Confirm the interval is intended. Keep skipCondition "Active By Trigger" so overlapping instances are skipped rather than stacked.',
    enforcedBy: 'Copilot pre-execution analyzer',
    severity: 'warning',
  },

  // ── Operational quality ────────────────────────────────────────────────────
  {
    id: 'quality.missing-max-runtime',
    title: 'No maximum runtime set',
    rule: 'max_runtime should be set so the Late Finish monitor is enabled.',
    consequence: 'Nothing detects an overrun. A hung job stays hung silently until someone notices downstream.',
    fix: 'Put the expected runtime in minutes in the Maximum Runtime column. The builder then sets maxRunTime plus lfEnabled, lfType Duration and lfDuration.',
    enforcedBy: 'Copilot pre-execution analyzer',
    severity: 'warning',
  },
  {
    id: 'quality.missing-recovery-notes',
    title: 'No recovery instructions',
    rule: 'recovery1 should describe the first-line action when the job fails.',
    consequence: 'On-call has nothing to act on and escalates instead of recovering.',
    fix: 'Fill Job Recovery1, and Job Recovery2 for the escalation path.',
    enforcedBy: 'Copilot pre-execution analyzer',
    severity: 'warning',
  },
  {
    id: 'quality.missing-servicenow-ticket',
    title: 'No ServiceNow ticket',
    rule: 'servicenow_ticket links the job to the change that authorised it.',
    consequence: 'The job has no traceable authorisation and the notes entry is titled with the job name instead of the ticket.',
    fix: 'Add the change or request number to the ServiceNow Ticket column.',
    enforcedBy: 'Copilot pre-execution analyzer',
    severity: 'warning',
  },
  {
    id: 'quality.missing-business-services',
    title: 'No business services',
    rule: 'business_services maps to opswiseGroups and drives UAC reporting and visibility.',
    consequence: 'The job does not appear under any business service view.',
    fix: 'Add the business service names, separated by ";" or ",".',
    enforcedBy: 'Copilot pre-execution analyzer',
    severity: 'info',
  },
  {
    id: 'quality.missing-description',
    title: 'No description',
    rule: 'description populates the task summary and the trigger description.',
    consequence: 'The job is unidentifiable in UAC lists, and the schedule verifier loses the cross-check it uses to correct a misparsed schedule.',
    fix: 'Add a one-line Job Description.',
    enforcedBy: 'Copilot pre-execution analyzer',
    severity: 'info',
  },
  {
    id: 'quality.unix-sudo',
    title: 'taskUnix always runs as sudo',
    rule: 'Every taskUnix task is created with runAsSudo = true.',
    consequence: 'The command runs with elevated privilege whether or not it needs it.',
    fix: 'If the job must not run as sudo, change it in Search & Edit after creation.',
    enforcedBy: 'buildTaskPayload',
    severity: 'info',
  },

  // ── Payload safety ─────────────────────────────────────────────────────────
  {
    id: 'payload.allow-list',
    title: 'Unknown fields are dropped from payloads',
    rule: 'Only fields on the task and trigger allow-lists are sent to UAC. Everything else is removed, along with empty values.',
    consequence: 'A misspelled column never reaches UAC. It is silently dropped rather than causing a schema error — the removal is written to the debug log.',
    fix: 'Check the field name against the allow-list if a value you expected is missing from the preview.',
    enforcedBy: 'filterPayload in payloadMapper.ts',
    severity: 'info',
  },
  {
    id: 'payload.read-only-fields',
    title: 'Read-only UAC fields are stripped',
    rule: 'sysId, version, nextScheduledTime, enabledBy/Time, disabledBy/Time, avgRunTime, minRunTime, maxRunTimeDisplay, lastRunTime, runCount, firstRun, lastRun and taskName are removed from any payload.',
    consequence: 'UAC owns these values. Sending them is rejected or silently ignored.',
    fix: 'Nothing to do. Search & Edit also refuses to write them.',
    enforcedBy: 'filterPayload READ_ONLY set; search route field protection',
    severity: 'info',
  },
  {
    id: 'payload.trigger-created-disabled',
    title: 'Triggers are always created disabled',
    rule: 'enabled is forced to false on every trigger this application creates.',
    consequence: 'Nothing runs on a schedule until you enable it, so a bad bulk load cannot start firing before you have looked at it.',
    fix: 'Verify, check the qualifying times, then enable via the Enable Triggers step.',
    enforcedBy: 'buildTriggerPayload base payload',
    severity: 'info',
  },

  // ── Upload safety ──────────────────────────────────────────────────────────
  {
    id: 'upload.filename-and-content',
    title: 'Uploads are checked twice',
    rule: 'The filename must be safe and the file content must match its extension by magic bytes.',
    consequence: 'A renamed or disguised file is rejected before parsing.',
    fix: 'Upload a genuine .xlsx, .xls, .ods or .csv file.',
    enforcedBy: 'fileSecurity.isSafeFilename and verifyFileContent',
    severity: 'error',
  },
  {
    id: 'upload.size-and-rate',
    title: 'Upload size and rate limits',
    rule: 'Files are capped at MAX_FILE_SIZE (10 MB default) and uploads at 30 per minute per IP.',
    consequence: 'Oversized or too-frequent uploads are rejected.',
    fix: 'Split very large sheets. Remember the execution queue caps a run at 100 jobs anyway.',
    enforcedBy: 'multer limits and the upload rate limiter',
    severity: 'info',
  },

  // ── Deletion safety ────────────────────────────────────────────────────────
  {
    id: 'deletion.order',
    title: 'Deletion order: trigger before task',
    rule: 'Triggers are disabled and deleted before the task they reference.',
    consequence: 'Deleting the task first leaves an orphaned trigger pointing at nothing.',
    fix: 'Use Job Deletion, which enforces the order.',
    enforcedBy: 'jobDeletion route sequence',
    severity: 'error',
  },
  {
    id: 'deletion.active-instances-block',
    title: 'Active instances block deletion',
    rule: 'A task with running instances cannot be deleted.',
    consequence: 'Deletion fails until the instance is finished.',
    fix: 'Inspect the job, then force-finish the blocking instance if it is genuinely stuck.',
    enforcedBy: 'deletion inspect and force-finish',
    severity: 'error',
  },
  {
    id: 'deletion.backup-first',
    title: 'Back up before deleting',
    rule: 'Take the backup snapshot before removing anything.',
    consequence: 'Without a snapshot there is nothing for Job Recovery to restore, and the server store only keeps entries for 7 days.',
    fix: 'Run the backup step, and keep the exported Excel for anything you might need beyond 7 days.',
    enforcedBy: 'deletion backup endpoint and recoveryStore retention',
    severity: 'warning',
  },
];

export const RULES_BY_ID = new Map(VALIDATION_RULES.map(r => [r.id, r]));

export function lookupRule(id: string): ValidationRule | undefined {
  return RULES_BY_ID.get(id);
}

export const VALIDATION_CHUNKS: KnowledgeChunk[] = [
  ...VALIDATION_RULES.map<KnowledgeChunk>(r => ({
    id: `validation.${r.id}`,
    kind: 'validation',
    title: r.title,
    pages: ['validation', 'preview', 'upload', 'job-creation'],
    keywords: [r.id, r.title, 'validation', 'rule', 'error', 'why failed'],
    source: r.enforcedBy,
    body: `${r.title} [${r.severity}] (rule id: ${r.id})
Rule: ${r.rule}
Why it matters: ${r.consequence}
Fix: ${r.fix}
Enforced by: ${r.enforcedBy}`,
  })),
  {
    id: 'validation.overview',
    kind: 'validation',
    title: 'How validation works across the application',
    pages: ['validation', 'preview', 'upload'],
    keywords: ['validation', 'checks', 'rules', 'safety', 'guardrails', 'smart validation'],
    source: 'backend/src/utils/payloadMapper.ts, backend/src/copilot/analyzers.ts',
    body: `Validation happens in four places.

1. On upload: the filename and the file content are checked, then each row is parsed and unusable rows are reported.
2. In the payload builder: fields not on the UAC allow-list are dropped, read-only fields are stripped, and a set of schedule safety rules fire — an Absolute trigger must have a time, an Interval trigger must have an interval and must not have a time, day flags force simpleDateType to "Specific Days", a Complex day style drops simpleDateType, and a first run date that is not a date is ignored.
3. Before execution: the Copilot's smart validation scans every row for missing required fields, invalid values, duplicate names, schedule conflicts and missing operational fields, and reports each finding with the rule that produced it.
4. After creation: Verify re-reads the objects from UAC and Qualifying Times shows the dates UAC itself calculates, which is the only authoritative confirmation that a schedule is right.

Nothing runs on a schedule until you enable the trigger, so every one of these checks happens while the blast radius is still zero.`,
  },
];
