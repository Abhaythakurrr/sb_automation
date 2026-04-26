/**
 * Stonebranch Payload Mapper
 * OpenAPI schema field names only. Universal Excel schema support.
 */
import { parseScheduleString } from './scheduleParser';

// ── Allowed fields (OpenAPI schema) ──────────────────────────────────────────

export const ALLOWED_TASK_FIELDS = new Set([
  // identity
  'type','name',
  // agent
  'agent','agentVar','agentCluster','agentClusterVar','broadcastCluster','broadcastClusterVar',
  // execution
  'command','commandOrScript','script','runtimeDir','parameters',
  'credentials','credentialsVar','runAsSudo',
  // exit codes
  'exitCodes','exitCodeProcessing','exitCodeText','exitCodeOutput',
  // output
  'outputType','retryExitCodes','waitForOutput','outputFailureOnly',
  'outputReturnType','outputReturnFile','outputReturnSline','outputReturnNline','outputReturnText',
  'environment',
  // task base
  'summary','startHeld','startHeldReason','resolveNameImmediately',
  'resPriority','resPriorityVar','holdResources',
  'retryMaximum','retryIndefinitely','retryInterval','retrySuppressFailure',
  // runtime
  'maxRunTime','userEstimatedDuration','cpDuration','cpDurationUnit',
  // late start
  'lsEnabled','lsType','lsTime','lsDayConstraint','lsNthAmount','lsDuration',
  // late finish
  'lfEnabled','lfType','lfTime','lfDayConstraint','lfNthAmount','lfDuration',
  'lfOffsetType','lfOffsetPercentage','lfOffsetDuration','lfOffsetDurationUnit',
  // early finish
  'efEnabled','efType','efTime','efDayConstraint','efNthAmount','efDuration',
  'efOffsetType','efOffsetPercentage','efOffsetDuration','efOffsetDurationUnit',
  // time window
  'twWaitType','twWaitAmount','twWaitTime','twWaitDuration','twWaitDayConstraint',
  'twDelayType','twDelayAmount','twDelayDuration','twWorkflowOnly',
  // restriction
  'executionRestriction','restrictionPeriod',
  'restrictionPeriodBeforeDate','restrictionPeriodAfterDate',
  'restrictionPeriodBeforeTime','restrictionPeriodAfterTime','restrictionPeriodDateList',
  // misc
  'logLevel','exclusiveWithSelf','timeZonePref',
  'opswiseGroups','variables','notes','actions','virtualResources','exclusiveTasks',
  'enforceVariables','lockVariables','simulation','overrideInstanceWait',
  'retainSysIds','excludeRelated',
  // custom fields
  'customField1','customField2',
  // Windows-specific
  'createConsole','desktopInteract','elevateUser',
  // SQL/StoredProc
  'connection','connectionVar','sqlCommand','storedProcName','storedProcParams',
  'resultProcessing','maxRows','autoCleanup','columnName','columnOp','columnValue',
  // Email
  'toRecipients','ccRecipients','bccRecipients','subject','body','replyTo',
  'template','templateVar','report','reportVar','attachLocalFile','localAttachment',
  // Web Service
  'url','httpMethod','httpPayloadType','payload','payloadScript','payloadSource',
  'httpHeaders','httpAuth','timeout','protocol','mimeType',
  // Sleep/Timer
  'sleepAmount','sleepType','sleepDuration','sleepTime','sleepDayConstraint',
]);

export const ALLOWED_TRIGGER_FIELDS = new Set([
  'type','name','tasks','enabled','description',
  // schedule
  'time','timeZone','timeInterval','timeIntervalUnits','timeStyle',
  'startingAt','startTimeEnable',
  'dayStyle','dayInterval','intervalStartingDate','simpleDateType',
  'daily','sun','mon','tue','wed','thu','fri','sat','custom','businessDays',
  'dateAdjective','dateNoun','dateNouns','dateQualifier','dateQualifiers',
  'dateAdjustment','adjustmentAmount','adjustmentType','nthAmount','adjustInterval',
  // restricted times (UNTIL)
  'restrictedTimes','enabledStart','enabledEnd',
  // restriction
  'restriction','restrictionSimple','restrictionComplex','restrictionMode',
  'restrictionAdjective','restrictionNthAmount',
  'restrictionNoun','restrictionNouns','restrictionQualifier','restrictionQualifiers',
  // skip
  'skipCount','skipActive','skipCondition','skipRestriction',
  'skipAfterDate','skipAfterTime','skipBeforeDate','skipBeforeTime','skipDateList',
  // other
  'calendar','forecast','action','situation','simulationOption','simulateTasks',
  'executionUser','opswiseGroups','variables','notes',
  'retentionDurationPurge','retentionDuration','retentionDurationUnit','rdExcludeBackup',
  'enforceVariables','lockVariables','retainSysIds','excludeRelated',
]);

// Never send these to the API
const READ_ONLY = new Set([
  'sysId','version','exportReleaseLevel','exportTable',
  'nextScheduledTime','enabledBy','enabledTime','disabledBy','disabledTime',
  'avgRunTime','avgRunTimeDisplay','minRunTime','minRunTimeDisplay',
  'maxRunTimeDisplay','lastRunTime','lastRunTimeDisplay',
  'runCount','runTime','firstRun','lastRun','taskName',
]);

// ── Universal Excel Row ───────────────────────────────────────────────────────
// All fields optional except task_name, task_type, agent, command
export interface ExcelRow {
  // Required
  task_name:          string;
  task_type:          string;
  agent:              string;
  command:            string;
  // Common optional
  credential?:        string;
  description?:       string;
  enabled?:           string;
  first_run_date?:    string;
  start_time?:        string;
  timezone?:          string;
  frequency_type?:    string;
  frequency_value?:   string;
  max_runtime?:       string;
  ref_job?:           string;
  // New fields
  business_services?: string;   // comma-separated → opswiseGroups
  servicenow_ticket?: string;   // → customField2.value
  schedule_string?:   string;   // raw schedule string e.g. "AT 0130 EVERY 1200 UNTIL 2100"
  job_doc?:           string;   // full job doc text → notes.text
  // Pass-through: any extra column goes directly to API if it's in ALLOWED_TASK_FIELDS
  [key: string]: any;
}

// ── Interfaces ────────────────────────────────────────────────────────────────
export interface TaskPayload {
  type:                  string;
  name:                  string;
  command?:              string;   // optional — not all task types use command
  agentCluster?:         string;
  agent?:                string;
  commandOrScript?:      string;
  credentials?:          string;
  summary?:              string;
  startHeld?:            boolean;
  resolveNameImmediately:boolean;
  runAsSudo?:            boolean;
  exitCodes?:            string;
  exitCodeProcessing?:   string;
  outputType?:           string;
  outputReturnType?:     string;
  outputReturnSline?:    string;
  outputReturnNline?:    string;
  outputFailureOnly?:    boolean;
  waitForOutput?:        boolean;
  retryMaximum?:         number;
  retryIndefinitely?:    boolean;
  retryInterval?:        number;
  retrySuppressFailure?: boolean;
  maxRunTime?:           number;
  lfEnabled?:            boolean;
  lfType?:               string;
  lfDuration?:           string;
  [key: string]: any;
}

export interface TriggerPayload {
  type:                  string;
  name:                  string;
  tasks:                 string[];
  enabled:               boolean;
  intervalStartingDate?: string;
  time?:                 string;
  timeZone?:             string;
  timeStyle?:            string;
  [key: string]: any;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
export function derivMaxRunTimeFromLF(lfType: string, lfDuration: string): number | null {
  if ((lfType ?? 'Duration') !== 'Duration' || !lfDuration) return null;
  const parts = lfDuration.split(':').map(Number);
  if (parts.length !== 4 || parts.some(isNaN)) return null;
  const [days, hours, minutes, seconds] = parts;
  const total = (days * 1440) + (hours * 60) + minutes + Math.round(seconds / 60);
  return total > 0 ? total : null;
}

function minutesToDuration(minutes: number): string {
  const d = Math.floor(minutes / 1440);
  const h = Math.floor((minutes % 1440) / 60);
  const m = minutes % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d)}:${pad(h)}:${pad(m)}:00`;
}

// ── Task type groups ──────────────────────────────────────────────────────────
// Fields that are only valid for specific task type families
const SCRIPT_TASK_TYPES = new Set([
  'taskUnix','taskWindows','taskUcmd','taskIbmi','taskZos',
]);
const AGENT_TASK_TYPES = new Set([
  'taskUnix','taskWindows','taskUcmd','taskIbmi','taskZos',
  'taskSql','taskStoredProc','taskFtp','taskSap','taskPeoplesoft',
  'taskFileMonitor','taskSystemMonitor','taskVariableMonitor',
]);

// ── Task payload builder ──────────────────────────────────────────────────────
export function buildTaskPayload(
  row: ExcelRow,
  maxRunTime?: number | null,
  agentResolved?: { field: 'agent' | 'agentCluster'; value: string }
): TaskPayload {
  const taskType = row.task_type || 'taskUnix';
  const isScriptTask = SCRIPT_TASK_TYPES.has(taskType);
  const isAgentTask  = AGENT_TASK_TYPES.has(taskType);

  // ── Base fields valid for ALL task types ──────────────────────────────────
  const payload: TaskPayload = {
    type:                  taskType,
    name:                  row.task_name,
    resolveNameImmediately:true,
    startHeld:             false,
  };

  // Optional base fields — only set if provided
  if (row.credential)   payload.credentials = row.credential;
  if (row.description)  payload.summary      = row.description;

  // ── Script-based task defaults (Unix, Windows, UCMD, etc.) ───────────────
  if (isScriptTask) {
    if (row.command) payload.command = row.command;
    payload.commandOrScript    = 'Command';
    payload.exitCodes          = '0';
    payload.exitCodeProcessing = 'Success Exitcode Range';
    payload.outputType         = 'STDOUT';
    payload.outputReturnType   = 'NONE';
    payload.outputReturnSline  = '1';
    payload.outputReturnNline  = '100';
    payload.outputFailureOnly  = false;
    payload.waitForOutput      = false;
    payload.retryMaximum       = 0;
    payload.retryIndefinitely  = false;
    payload.retryInterval      = 60;
    payload.retrySuppressFailure = false;
  }

  // runAsSudo only for Unix
  if (taskType === 'taskUnix') {
    payload.runAsSudo = true;
  }

  // ── Agent resolution — only for agent-based tasks ─────────────────────────
  if (isAgentTask && row.agent) {
    if (agentResolved?.value) {
      payload[agentResolved.field] = agentResolved.value;
      payload.customField1 = { label: 'Instructions', value: agentResolved.value };
    } else {
      payload.agentCluster = row.agent;
      payload.customField1 = { label: 'Instructions', value: row.agent };
    }
  }

  // ── Business Services ─────────────────────────────────────────────────────
  const bsRaw = String(row.business_services ?? '').trim();
  if (bsRaw) {
    const sep = bsRaw.includes(';') ? ';' : ',';
    payload.opswiseGroups = bsRaw.split(sep).map((s: string) => s.trim()).filter(Boolean);
  }

  // ── ServiceNow Ticket ─────────────────────────────────────────────────────
  if (row.servicenow_ticket?.trim()) {
    payload.customField2 = { label: 'ServiceNow Ticket', value: row.servicenow_ticket.trim() };
  }

  // ── Notes ─────────────────────────────────────────────────────────────────
  const noteTitle = row.servicenow_ticket?.trim() || '';
  const noteText  = row.job_doc?.trim()
    || [
        `Job Name = ${row.task_name}`,
        `Job Description = ${row.description || ''}`,
        `Job Script = ${row.command || ''}`,
        `Job Workstation = ${row.agent || ''}`,
        `Job Login Account = ${row.credential || ''}`,
        `Firstrun Date = ${row.first_run_date || ''}`,
        `Job Timezone = ${row.timezone || ''}`,
        `Maximum Runtime = ${row.max_runtime || ''}`,
        `ServiceNow ticket = ${noteTitle}`,
      ].join('\n');
  if (noteTitle || noteText) {
    payload.notes = [{ title: noteTitle || 'Job Details', text: noteText }];
  }

  // ── maxRunTime + Late Finish ──────────────────────────────────────────────
  const mr = row.max_runtime ? parseInt(row.max_runtime) : (maxRunTime ?? null);
  if (mr !== null && !isNaN(mr) && mr > 0) {
    payload.maxRunTime = mr;
    payload.lfEnabled  = true;
    payload.lfType     = 'Duration';
    payload.lfDuration = minutesToDuration(mr);
  }

  // ── Pass-through: any extra Excel column → API field ─────────────────────
  // Anything in the Excel that matches an OpenAPI field name goes straight through
  const STANDARD_COLS = new Set([
    'task_name','task_type','agent','command','credential','description','enabled',
    'first_run_date','start_time','timezone','frequency_type','frequency_value',
    'max_runtime','ref_job','business_services','servicenow_ticket','schedule_string','job_doc',
  ]);
  Object.keys(row).forEach(k => {
    if (!STANDARD_COLS.has(k) && ALLOWED_TASK_FIELDS.has(k) && row[k] !== '' && row[k] !== undefined) {
      payload[k] = row[k];
    }
  });

  return filterPayload(payload, ALLOWED_TASK_FIELDS, 'TASK') as TaskPayload;
}

// ── Trigger payload builder ───────────────────────────────────────────────────
export function buildTriggerPayload(
  row: ExcelRow,
  rawRefTrigger?: Record<string, any>
): TriggerPayload {
  const SCHEDULE_ONLY = new Set([
    'time','timeZone','timeInterval','timeIntervalUnits','timeStyle',
    'startingAt','startTimeEnable','dayStyle','dayInterval','intervalStartingDate',
    'simpleDateType','daily','sun','mon','tue','wed','thu','fri','sat',
    'custom','businessDays','dateAdjective','dateNoun','dateNouns',
    'dateQualifier','dateQualifiers','dateAdjustment','adjustmentAmount','adjustmentType',
    'nthAmount','adjustInterval','restrictedTimes','enabledStart','enabledEnd',
    'restriction','restrictionSimple','restrictionComplex','restrictionMode',
    'restrictionAdjective','restrictionNthAmount','restrictionNoun','restrictionNouns',
    'restrictionQualifier','restrictionQualifiers','calendar','forecast',
  ]);

  const base: Record<string, any> = {
    type:    'triggerTime',
    name:    `${row.task_name}_TR001`,
    tasks:   [row.task_name],
    enabled: row.enabled === 'true',
    dayStyle:       'Simple',
    simpleDateType: 'Daily',
  };

  // Copy ONLY schedule fields from ref trigger
  if (rawRefTrigger) {
    Object.keys(rawRefTrigger).forEach(k => {
      if (SCHEDULE_ONLY.has(k) && rawRefTrigger[k] !== null && rawRefTrigger[k] !== undefined) {
        base[k] = rawRefTrigger[k];
      }
    });
  }

  // Parse schedule_string if provided (e.g. "AT 0130 EVERY 1200 UNTIL 2100")
  if (row.schedule_string?.trim()) {
    const parsed = parseScheduleString(row.schedule_string, row.start_time, row.timezone);
    Object.assign(base, parsed);
    // Remove human_readable — not an API field
    delete base.human_readable;
  } else {
    // Use individual columns
    if (row.start_time) base.time     = row.start_time;
    if (row.timezone)   base.timeZone = row.timezone;

    // Map frequency_type/value to API fields
    if (row.frequency_type) {
      const ft = row.frequency_type.toUpperCase();
      if (ft === 'DAILY') {
        base.timeStyle      = 'Absolute';
        base.dayStyle       = 'Simple';
        base.simpleDateType = 'Daily';
        if (row.frequency_value && parseInt(row.frequency_value) > 1) {
          base.dayInterval = parseInt(row.frequency_value);
        }
      } else if (ft === 'WEEKLY') {
        base.timeStyle      = 'Absolute';
        base.dayStyle       = 'Simple';
        base.simpleDateType = 'Weekly';
      } else if (ft === 'MONTHLY') {
        base.timeStyle      = 'Absolute';
        base.dayStyle       = 'Simple';
        base.simpleDateType = 'Monthly';
      } else if (ft === 'INTERVAL') {
        base.timeStyle         = 'Interval';
        base.timeInterval      = parseInt(row.frequency_value ?? '1');
        base.timeIntervalUnits = 'Hours';
      }
    } else if (!rawRefTrigger) {
      // Default
      base.timeStyle      = 'Absolute';
    }
  }

  // First run date → intervalStartingDate
  // This is the correct way to control first execution in UAC
  // DO NOT use skipCondition/skipBeforeDate — "Before" is not a valid value
  if (row.first_run_date) {
    base.intervalStartingDate = row.first_run_date;
  }

  // Explicitly set skip to None (safe defaults)
  base.skipCondition  = 'None';
  base.skipRestriction = 'None';

  // Business Services on trigger
  const bsTrigger = String(row.business_services ?? '').trim();
  if (bsTrigger) {
    const sep = bsTrigger.includes(';') ? ';' : ',';
    base.opswiseGroups = bsTrigger.split(sep).map((s: string) => s.trim()).filter(Boolean);
  }

  return filterPayload(base, ALLOWED_TRIGGER_FIELDS, 'TRIGGER') as TriggerPayload;
}

// ── Filter + log ──────────────────────────────────────────────────────────────
function filterPayload(
  payload: Record<string, any>,
  allowed: Set<string>,
  label: string
): Record<string, any> {
  const clean: Record<string, any> = {};
  const removed: string[] = [];

  Object.keys(payload).forEach(k => {
    if (READ_ONLY.has(k)) {
      removed.push(`${k}(read-only)`);
    } else if (!allowed.has(k)) {
      removed.push(`${k}(unknown)`);
    } else if (payload[k] !== null && payload[k] !== undefined && payload[k] !== '') {
      clean[k] = payload[k];
    }
  });

  if (removed.length > 0) {
    console.warn(`[PAYLOAD] ${label} removed: ${removed.join(', ')}`);
  }
  console.log(`[PAYLOAD] Final ${label}:\n${JSON.stringify(clean, null, 2)}`);
  return clean;
}
