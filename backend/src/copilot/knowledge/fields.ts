/**
 * Field dictionary — inline documentation for every input column and every
 * payload field this application generates.
 *
 * Sourced from backend/src/utils/payloadMapper.ts (ExcelRow, ALLOWED_TASK_FIELDS,
 * ALLOWED_TRIGGER_FIELDS, the builders and their defaults) and
 * backend/src/utils/triggerSchedule.ts (TriggerScheduleFields).
 */
import { KnowledgeChunk } from '../types';

export interface FieldDoc {
  /** Canonical key: spreadsheet column or payload field name. */
  key: string;
  /** Human label as it appears in the UI or the job document. */
  label: string;
  /** Where the field lives. */
  scope: 'input' | 'task' | 'trigger';
  required?: boolean;
  /** What it means, in plain English. */
  meaning: string;
  /** Where the value comes from / why it gets generated. */
  origin?: string;
  examples?: string[];
  /** Allowed values, when the set is fixed. */
  allowed?: string[];
  /** Gotchas worth surfacing proactively. */
  note?: string;
}

// ── Spreadsheet input columns ────────────────────────────────────────────────

export const INPUT_FIELDS: FieldDoc[] = [
  { key: 'task_name', label: 'Job Name', scope: 'input', required: true,
    meaning: 'The task name in UAC. Also determines the trigger name, which is always this name plus -TR001.',
    origin: 'You supply it. It must be unique in the target UAC environment.',
    examples: ['PAY_DAILY_LOAD', 'FIN_MONTH_END_CLOSE'],
    note: 'Duplicate names are the single most common cause of a failed creation run. UAC rejects a task whose name already exists.' },
  { key: 'task_type', label: 'Task Type', scope: 'input', required: true,
    meaning: 'Which kind of UAC task to create. Decides which other fields apply.',
    origin: 'Defaults to taskUnix when the column is empty.',
    allowed: ['taskUnix', 'taskWindows', 'taskUcmd', 'taskIbmi', 'taskZos', 'taskSql', 'taskStoredProc', 'taskFtp', 'taskSap', 'taskPeoplesoft', 'taskFileMonitor', 'taskSystemMonitor', 'taskVariableMonitor'],
    note: 'taskUnix, taskWindows, taskUcmd, taskIbmi and taskZos are script tasks — they get command, exit-code and retry defaults. taskUnix additionally gets runAsSudo = true.' },
  { key: 'agent', label: 'Job Workstation / Agent', scope: 'input', required: true,
    meaning: 'Where the work runs — an agent or an agent cluster.',
    origin: 'The name is probed against UAC to decide whether it is an agent or a cluster, and it is written to the matching field.',
    examples: ['LINUX_PROD_CLUSTER', 'WINAGENT01'],
    note: 'The resolved value is also copied to customField1 labelled "Agent Cluster Name", matching UAC convention.' },
  { key: 'command', label: 'Job Script', scope: 'input', required: true,
    meaning: 'The command or script the task executes.',
    origin: 'You supply it. Only applies to script task types.',
    examples: ['/opt/app/bin/run_load.sh', 'D:\\jobs\\extract.bat'],
    note: 'Not validated against the agent filesystem. A wrong path fails at runtime, not at creation.' },
  { key: 'credential', label: 'Job Login Account', scope: 'input',
    meaning: 'The UAC credential the task runs under.',
    origin: 'You supply it. Written to the credentials field.',
    note: 'The credential must already exist in UAC. It is not created for you.' },
  { key: 'description', label: 'Job Description', scope: 'input',
    meaning: 'What the job does. Written to the task summary and the trigger description.',
    origin: 'You supply it.',
    note: 'Also read by the schedule verifier: if the description says "weekdays" but the parsed schedule came out Daily, the verifier corrects the trigger.' },
  { key: 'first_run_date', label: 'Firstrun Date', scope: 'input',
    meaning: 'The earliest date the trigger may fire.',
    origin: 'When present and valid it sets intervalStartingDate, plus skipRestriction = "Before" and skipBeforeDate so the trigger cannot fire earlier.',
    examples: ['2026-08-01'],
    note: 'Text that looks like a frequency rather than a date is ignored — values containing "scheduled", "frequency", "daily", "weekly" or "monthly" are rejected so a copy/paste error does not produce an invalid skip date. When it is absent no skip fields are set at all.' },
  { key: 'start_time', label: 'Job Starttime', scope: 'input',
    meaning: 'The time of day the job runs.',
    origin: 'Parsed into the trigger time for an absolute schedule, or into enabledStart for an interval schedule.',
    examples: ['0800', '08:00', '8:00 PM', 'AT 1800 TIMEZONE America/New_York'],
    note: 'Many spellings are accepted and normalised to 24-hour HH:MM — 0730, 07:30, 7.30, 7:30 AM, 7am, noon and midnight all work.' },
  { key: 'timezone', label: 'Job Timezone', scope: 'input',
    meaning: 'The timezone the schedule time is expressed in.',
    origin: 'Written to the trigger timeZone.',
    examples: ['America/New_York', 'Asia/Kolkata', 'UTC', 'Europe/London'],
    note: 'Leaving it blank means UAC uses the controller default, which is rarely what a business schedule intends. Always set it.' },
  { key: 'frequency_type', label: 'Scheduled Frequency', scope: 'input',
    meaning: 'How often the job runs. Drives the trigger day pattern.',
    origin: 'Parsed by the trigger schedule builder.',
    examples: ['Daily', 'Weekdays', 'Monday,Wednesday,Friday', 'Monthly', 'FREQ=DAILY', 'FREQ=WEEKLY;byday=Mon,Wed,Fri', 'FREQ=MONTHLY;INTERVAL=1;byday=24th', 'FREQ=INTERVAL;interval=15;units=minutes'],
    note: 'Empty defaults to Daily.' },
  { key: 'frequency_value', label: 'Frequency Value', scope: 'input',
    meaning: 'Optional numeric qualifier for the frequency, such as the interval count.',
    origin: 'You supply it; most schedules express this inside frequency_type instead.' },
  { key: 'schedule_string', label: 'Schedule String', scope: 'input',
    meaning: 'A full schedule expression, used in preference to start_time when present.',
    origin: 'Parsed by the trigger schedule builder, which understands the AT / EVERY / UNTIL / TIMEZONE form.',
    examples: ['AT 1800 TIMEZONE America/New_York', 'AT 0600 EVERY 0030 UNTIL 2200 TIMEZONE UTC', 'Every 15 minutes from 06:00 to 22:00 Asia/Kolkata'] },
  { key: 'end_time', label: 'Job End Time', scope: 'input',
    meaning: 'The end of the window for an interval job.',
    origin: 'Written to enabledEnd and sets restrictedTimes = true.',
    examples: ['22:00'],
    note: 'Only meaningful for interval schedules. An interval with no end time runs until midnight.' },
  { key: 'max_runtime', label: 'Maximum Runtime', scope: 'input',
    meaning: 'How long the job is expected to run, in minutes.',
    origin: 'Sets maxRunTime and also enables the Late Finish monitor: lfEnabled = true, lfType = "Duration", lfDuration = DD:HH:MM:00 derived from the minutes.',
    examples: ['30', '120'],
    note: 'This is what makes an overrunning job visible. Without it nobody is told the job is hanging.' },
  { key: 'ref_job', label: 'Reference Job', scope: 'input',
    meaning: 'An existing job whose schedule the new job should copy exactly.',
    origin: 'Resolved against UAC; only schedule fields plus maxRunTime are inherited.',
    note: 'When set, schedule_string and frequency_type are ignored for that row.' },
  { key: 'business_services', label: 'Business Services', scope: 'input',
    meaning: 'The business services the job belongs to. Drives UAC reporting and visibility.',
    origin: 'Split on ";" or "," and written to opswiseGroups on both the task and the trigger.',
    examples: ['Payments', 'Finance;Reporting'] },
  { key: 'servicenow_ticket', label: 'ServiceNow Ticket', scope: 'input',
    meaning: 'The change or request record that authorised this job.',
    origin: 'Written to customField2 labelled "ServiceNow Ticket" on both objects, and used as the title of the notes entry.',
    examples: ['CHG0012345'],
    note: 'Without it the notes entry is titled with the job name instead, and the job has no traceable authorisation.' },
  { key: 'servicenow_group', label: 'ServiceNow Group / Queue', scope: 'input',
    meaning: 'The assignment group that owns support for this job.',
    origin: 'Recorded inside the job documentation notes.' },
  { key: 'recovery1', label: 'Job Recovery1', scope: 'input',
    meaning: 'First-line recovery instruction for when the job fails.',
    origin: 'Recorded inside the job documentation notes on both objects.',
    note: 'This is what an on-call engineer reads at 3am. Leaving it blank is the difference between a two-minute fix and an escalation.' },
  { key: 'recovery2', label: 'Job Recovery2', scope: 'input',
    meaning: 'Second-line recovery instruction or escalation path.',
    origin: 'Recorded inside the job documentation notes on both objects.' },
  { key: 'job_doc', label: 'Job Document', scope: 'input',
    meaning: 'The full pasted job request document.',
    origin: 'When present it is written verbatim into the notes of both the task and the trigger, instead of the notes being reconstructed field by field.' },
  { key: 'enabled', label: 'Enabled', scope: 'input',
    meaning: 'Intent for whether the job should be active.',
    note: 'Triggers are always created disabled regardless of this column. You enable them after verification.' },
  { key: 'business_unit', label: 'Business Unit', scope: 'input', meaning: 'Owning business unit, recorded in the job documentation notes.' },
  { key: 'job_function', label: 'Job Function', scope: 'input', meaning: 'Functional category, recorded in the job documentation notes.' },
  { key: 'job_priority', label: 'Job Priority', scope: 'input', meaning: 'Business priority, recorded in the job documentation notes.' },
  { key: 'stream_name', label: 'Job StreamName', scope: 'input', meaning: 'The job stream this job belongs to, recorded in the job documentation notes.' },
  { key: 'additional_info', label: 'Additional Information', scope: 'input', meaning: 'Free text, recorded in the job documentation notes.' },
];

// ── Generated task payload fields ────────────────────────────────────────────

export const TASK_FIELDS: FieldDoc[] = [
  { key: 'type', label: 'Task Type', scope: 'task', meaning: 'The UAC task class being created.', origin: 'From task_type, defaulting to taskUnix.' },
  { key: 'name', label: 'Task Name', scope: 'task', meaning: 'The task name in UAC.', origin: 'From task_name.' },
  { key: 'command', label: 'Command', scope: 'task', meaning: 'The command line executed on the agent.', origin: 'From command. Only set for script task types.' },
  { key: 'commandOrScript', label: 'Command or Script', scope: 'task', meaning: 'Whether the task runs an inline command or a stored script.', origin: 'Always set to "Command" for script task types.', allowed: ['Command', 'Script'] },
  { key: 'agent', label: 'Agent', scope: 'task', meaning: 'A single named agent to run on.', origin: 'Set when the agent name resolved to an individual agent.' },
  { key: 'agentCluster', label: 'Agent Cluster', scope: 'task', meaning: 'An agent cluster to run on; UAC picks a member.', origin: 'Set when the agent name resolved to a cluster. This is also the default when resolution is inconclusive.' },
  { key: 'credentials', label: 'Credentials', scope: 'task', meaning: 'The UAC credential the command runs as.', origin: 'From credential.' },
  { key: 'runAsSudo', label: 'Run as Sudo', scope: 'task', meaning: 'Run the command through sudo.', origin: 'Forced to true for taskUnix. Not set for any other type.' },
  { key: 'summary', label: 'Summary', scope: 'task', meaning: 'Short description shown in UAC lists.', origin: 'From description.' },
  { key: 'resolveNameImmediately', label: 'Resolve Name Immediately', scope: 'task', meaning: 'Resolve variables in the task name at launch time.', origin: 'Always true.' },
  { key: 'startHeld', label: 'Start Held', scope: 'task', meaning: 'Whether instances start in Held state and wait for a manual release.', origin: 'Always false, so instances run when triggered.' },
  { key: 'exitCodes', label: 'Success Exit Codes', scope: 'task', meaning: 'Which process exit codes count as success.', origin: 'Defaulted to "0" for script tasks.' },
  { key: 'exitCodeProcessing', label: 'Exit Code Processing', scope: 'task', meaning: 'How exit codes are interpreted.', origin: 'Defaulted to "Success Exitcode Range" for script tasks.' },
  { key: 'outputType', label: 'Output Type', scope: 'task', meaning: 'Which stream is captured.', origin: 'Defaulted to STDOUT.' },
  { key: 'outputReturnType', label: 'Output Return Type', scope: 'task', meaning: 'How much captured output is returned to the controller.', origin: 'Defaulted to NONE, with outputReturnSline 1 and outputReturnNline 100 pre-set for when you switch it on.' },
  { key: 'outputFailureOnly', label: 'Output Failure Only', scope: 'task', meaning: 'Return output only when the task fails.', origin: 'Defaulted to false.' },
  { key: 'waitForOutput', label: 'Wait For Output', scope: 'task', meaning: 'Hold the instance open until output is collected.', origin: 'Defaulted to false.' },
  { key: 'retryMaximum', label: 'Retry Maximum', scope: 'task', meaning: 'How many automatic retries on failure.', origin: 'Defaulted to 0 — no automatic retry.', note: 'Deliberate: a job that retries silently hides a real failure. Turn it on per job when the work is genuinely idempotent.' },
  { key: 'retryInterval', label: 'Retry Interval', scope: 'task', meaning: 'Seconds between retries.', origin: 'Defaulted to 60, used only when retryMaximum is raised.' },
  { key: 'retryIndefinitely', label: 'Retry Indefinitely', scope: 'task', meaning: 'Retry forever.', origin: 'Defaulted to false.' },
  { key: 'retrySuppressFailure', label: 'Retry Suppress Failure', scope: 'task', meaning: 'Hide the failure while retries are in progress.', origin: 'Defaulted to false.' },
  { key: 'maxRunTime', label: 'Maximum Runtime', scope: 'task', meaning: 'Expected runtime ceiling in minutes.', origin: 'From max_runtime, or inherited from the reference task.' },
  { key: 'lfEnabled', label: 'Late Finish Enabled', scope: 'task', meaning: 'Raise a Late Finish condition when the instance overruns.', origin: 'Set to true automatically whenever maxRunTime is set.' },
  { key: 'lfType', label: 'Late Finish Type', scope: 'task', meaning: 'How lateness is measured.', origin: 'Set to "Duration" alongside lfEnabled.' },
  { key: 'lfDuration', label: 'Late Finish Duration', scope: 'task', meaning: 'The overrun threshold as DD:HH:MM:SS.', origin: 'Derived from maxRunTime minutes.' },
  { key: 'opswiseGroups', label: 'Business Services', scope: 'task', meaning: 'The business services the object belongs to.', origin: 'From business_services, split on ";" or ",".' },
  { key: 'customField1', label: 'Agent Cluster Name', scope: 'task', meaning: 'UAC custom field carrying the agent or cluster name.', origin: 'Set to { label: "Agent Cluster Name", value: <resolved agent> }.' },
  { key: 'customField2', label: 'ServiceNow Ticket', scope: 'task', meaning: 'UAC custom field carrying the authorising ticket.', origin: 'Set to { label: "ServiceNow Ticket", value: <servicenow_ticket> } when the column is filled.' },
  { key: 'notes', label: 'Notes', scope: 'task', meaning: 'The job documentation attached to the object.', origin: 'Titled with the ServiceNow ticket, or the job name when there is no ticket. The body is job_doc verbatim if supplied, otherwise a reconstructed Job Type / Business Unit / Job Function / Job Name / Description / StreamName / ServiceNow Group / Recovery1 / Recovery2 / Firstrun Date / Frequency / Maximum Runtime / Starttime / Timezone / Script / Workstation / Login Account / Business Services / Ticket / Additional Information block.' },
];

// ── Generated trigger payload fields ─────────────────────────────────────────

export const TRIGGER_FIELDS: FieldDoc[] = [
  { key: 'type', label: 'Trigger Type', scope: 'trigger', meaning: 'The trigger class.', origin: 'Always triggerTime — this application creates time triggers only.' },
  { key: 'name', label: 'Trigger Name', scope: 'trigger', meaning: 'The trigger name in UAC.', origin: 'Always the task name plus -TR001.' },
  { key: 'tasks', label: 'Tasks', scope: 'trigger', meaning: 'The tasks this trigger launches.', origin: 'Always the single task from task_name.' },
  { key: 'enabled', label: 'Enabled', scope: 'trigger', meaning: 'Whether the trigger is live.', origin: 'Always false at creation. You enable it after verifying the qualifying times.' },
  { key: 'timeStyle', label: 'Time Style', scope: 'trigger', meaning: 'Whether the trigger fires at a fixed time or on a repeating interval.', allowed: ['Absolute', 'Interval'], origin: 'Derived from the schedule text.', note: 'Absolute requires time. Interval requires timeInterval and must not carry time.' },
  { key: 'time', label: 'Time', scope: 'trigger', meaning: 'The fixed time of day the trigger fires, HH:MM.', origin: 'Parsed from schedule_string or start_time.', note: 'Deleted for interval triggers — setting it makes UAC ignore the interval.' },
  { key: 'timeInterval', label: 'Time Interval', scope: 'trigger', meaning: 'How often an interval trigger repeats.', origin: 'Parsed from the schedule. Defaults to 60 with a warning if a trigger ends up Interval without one.' },
  { key: 'timeIntervalUnits', label: 'Time Interval Units', scope: 'trigger', meaning: 'The unit of timeInterval.', allowed: ['Seconds', 'Minutes', 'Hours'] },
  { key: 'timeZone', label: 'Time Zone', scope: 'trigger', meaning: 'The timezone the schedule is evaluated in.', origin: 'From the schedule text or the timezone column.' },
  { key: 'dayStyle', label: 'Day Style', scope: 'trigger', meaning: 'How the day pattern is expressed.', allowed: ['Simple', 'Complex', 'Every'], origin: 'Simple for daily / business days / named weekdays. Complex for formula patterns like the last Friday of the month. Every for "every N days".' },
  { key: 'simpleDateType', label: 'Simple Date Type', scope: 'trigger', meaning: 'The simple day pattern.', allowed: ['Daily', 'Business Days', 'Specific Days'], origin: 'Defaults to Daily. Set to "Specific Days" automatically when individual day flags are present.', note: 'Removed when dayStyle is Complex, because the two conflict.' },
  { key: 'mon', label: 'Monday', scope: 'trigger', meaning: 'Run on Monday. Same for tue, wed, thu, fri, sat, sun.', origin: 'Set from named weekdays in the schedule.', note: 'Day flags alongside simpleDateType Daily make UAC ignore the flags and run every day, so the builder switches to "Specific Days".' },
  { key: 'businessDays', label: 'Business Days', scope: 'trigger', meaning: 'Run on business days only, per the calendar.', origin: 'Set for "weekdays" and "business days" phrasing.' },
  { key: 'dateAdjective', label: 'Date Adjective', scope: 'trigger', meaning: 'The ordinal part of a complex pattern.', allowed: ['Every', '1st', '2nd', '3rd', '4th', 'Last', 'Nth'] },
  { key: 'dateNouns', label: 'Date Nouns', scope: 'trigger', meaning: 'What the ordinal counts, as { value } objects.', examples: ['[{ value: "Friday" }]', '[{ value: "Month Day 24" }]', '[{ value: "Business Day" }]'] },
  { key: 'dateQualifiers', label: 'Date Qualifiers', scope: 'trigger', meaning: 'The period the pattern repeats over, as { value } objects.', examples: ['[{ value: "Month" }]', '[{ value: "Year" }]', '[{ value: "Jan" }]'] },
  { key: 'nthAmount', label: 'Nth Amount', scope: 'trigger', meaning: 'The N when dateAdjective is Nth.' },
  { key: 'dayInterval', label: 'Day Interval', scope: 'trigger', meaning: 'Run every N days, used with dayStyle Every.' },
  { key: 'restrictedTimes', label: 'Restricted Times', scope: 'trigger', meaning: 'Confine an interval trigger to a daily window.', origin: 'Set true whenever enabledStart or enabledEnd is present.' },
  { key: 'enabledStart', label: 'Window Start', scope: 'trigger', meaning: 'Start of the daily window for an interval trigger, HH:MM.' },
  { key: 'enabledEnd', label: 'Window End', scope: 'trigger', meaning: 'End of the daily window for an interval trigger, HH:MM.', note: 'Without it the interval runs until midnight.' },
  { key: 'intervalStartingDate', label: 'Interval Starting Date', scope: 'trigger', meaning: 'The date the schedule starts counting from.', origin: 'From first_run_date when it is a valid date.' },
  { key: 'skipRestriction', label: 'Skip Restriction', scope: 'trigger', meaning: 'Skip qualifying times before or after a boundary date.', origin: 'Set to "Before" together with skipBeforeDate when first_run_date is supplied.' },
  { key: 'skipBeforeDate', label: 'Skip Before Date', scope: 'trigger', meaning: 'Suppress firing before this date.', origin: 'From first_run_date.', note: 'When no first run date is given, no skip fields are set at all — UAC validates skipBeforeDate against the frequency and rejects mismatches.' },
  { key: 'skipCondition', label: 'Skip Condition', scope: 'trigger', meaning: 'When to skip a qualifying time.', origin: 'Defaulted to "Active By Trigger" — skip if the previous instance launched by this trigger is still running.', note: 'This is what stops a slow job from stacking up on itself.' },
  { key: 'calendar', label: 'Calendar', scope: 'trigger', meaning: 'The calendar used to evaluate business days and holidays.', origin: 'Defaulted to "System Default".' },
  { key: 'situation', label: 'Situation', scope: 'trigger', meaning: 'The calendar situation the action applies to.', origin: 'Defaulted to "Holiday".' },
  { key: 'action', label: 'Action', scope: 'trigger', meaning: 'What to do when the situation applies.', origin: 'Defaulted to "Do Not Trigger", so holidays are skipped rather than run.' },
  { key: 'retentionDuration', label: 'Retention Duration', scope: 'trigger', meaning: 'How long trigger history is kept.', origin: 'Defaulted to 1 with retentionDurationUnit "Days".' },
  { key: 'description', label: 'Description', scope: 'trigger', meaning: 'Free text description.', origin: 'From the description column.' },
  { key: 'opswiseGroups', label: 'Business Services', scope: 'trigger', meaning: 'Business services, mirrored from the task.', origin: 'From business_services.' },
  { key: 'customField1', label: 'Agent Cluster Name', scope: 'trigger', meaning: 'Agent or cluster name, mirrored onto the trigger.', origin: 'From the agent column.' },
  { key: 'customField2', label: 'ServiceNow Ticket', scope: 'trigger', meaning: 'Authorising ticket, mirrored onto the trigger.', origin: 'From servicenow_ticket.' },
  { key: 'notes', label: 'Notes', scope: 'trigger', meaning: 'The same job documentation block attached to the task.', origin: 'job_doc verbatim, or reconstructed from the row.' },
];

export const ALL_FIELD_DOCS: FieldDoc[] = [...INPUT_FIELDS, ...TASK_FIELDS, ...TRIGGER_FIELDS];

/** Fast lookup by key, then by label, case-insensitive. */
const BY_KEY = new Map<string, FieldDoc[]>();
for (const f of ALL_FIELD_DOCS) {
  const k = f.key.toLowerCase();
  BY_KEY.set(k, [...(BY_KEY.get(k) || []), f]);
}

export function lookupField(nameOrLabel: string, scope?: FieldDoc['scope']): FieldDoc | undefined {
  const needle = nameOrLabel.trim().toLowerCase();
  const direct = BY_KEY.get(needle) || [];
  const scoped = scope ? direct.find(f => f.scope === scope) : undefined;
  if (scoped) return scoped;
  if (direct.length) return direct[0];

  // Label match, then loose match ignoring separators.
  const byLabel = ALL_FIELD_DOCS.find(f => f.label.toLowerCase() === needle && (!scope || f.scope === scope));
  if (byLabel) return byLabel;

  const flat = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const loose = flat(needle);
  return ALL_FIELD_DOCS.find(f => (flat(f.key) === loose || flat(f.label) === loose) && (!scope || f.scope === scope));
}

/** Group day-flag siblings onto the single documented entry. */
const DAY_FLAG_ALIASES: Record<string, string> = {
  tue: 'mon', wed: 'mon', thu: 'mon', fri: 'mon', sat: 'mon', sun: 'mon',
};

export function lookupFieldWithAliases(name: string, scope?: FieldDoc['scope']): FieldDoc | undefined {
  const direct = lookupField(name, scope);
  if (direct) return direct;
  const alias = DAY_FLAG_ALIASES[name.trim().toLowerCase()];
  return alias ? lookupField(alias, scope) : undefined;
}

// ── Knowledge chunks derived from the dictionary ─────────────────────────────

function fieldBody(f: FieldDoc): string {
  const lines = [
    `${f.label} (${f.scope === 'input' ? 'spreadsheet column' : f.scope + ' payload field'}: ${f.key})`,
    f.required ? 'Required.' : '',
    f.meaning,
    f.origin ? `How it is set: ${f.origin}` : '',
    f.allowed?.length ? `Allowed values: ${f.allowed.join(', ')}.` : '',
    f.examples?.length ? `Examples: ${f.examples.join(' | ')}.` : '',
    f.note ? `Note: ${f.note}` : '',
  ];
  return lines.filter(Boolean).join('\n');
}

export const FIELD_CHUNKS: KnowledgeChunk[] = [
  ...ALL_FIELD_DOCS.map<KnowledgeChunk>(f => ({
    id: `field.${f.scope}.${f.key}`,
    kind: 'field',
    title: `${f.label} — ${f.key}`,
    pages: f.scope === 'input'
      ? ['upload', 'job-creation', 'validation']
      : ['preview', 'validation', 'search'],
    keywords: [f.key, f.label, ...(f.examples || [])],
    source: 'backend/src/utils/payloadMapper.ts',
    body: fieldBody(f),
  })),
  {
    id: 'field.input-columns-overview',
    kind: 'field',
    title: 'Spreadsheet columns the upload understands',
    pages: ['upload', 'job-creation'],
    keywords: ['columns', 'headers', 'template', 'what columns', 'spreadsheet format', 'required fields'],
    source: 'backend/src/utils/payloadMapper.ts (ExcelRow)',
    body: `Required for every row: task_name, task_type, agent, command.

Scheduling: first_run_date, start_time, timezone, frequency_type, frequency_value, schedule_string, end_time, ref_job.

Operational: credential, description, max_runtime, business_services, servicenow_ticket, servicenow_group, recovery1, recovery2, job_doc, enabled.

Documentation only: business_unit, job_function, job_priority, stream_name, additional_info.

Header names are normalised on upload, so the job-document labels ("Job Name", "Job Script", "Job Workstation", "Scheduled Frequency", "Maximum Runtime", "Job Starttime", "Job Timezone", "Job Login Account") map onto these columns automatically.

Any extra column is dropped unless its name exactly matches a UAC task field on the allow-list, in which case it is passed straight through to the task payload.`,
  },
];
