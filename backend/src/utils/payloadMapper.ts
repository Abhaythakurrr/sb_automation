/**
 * Stonebranch Payload Mapper
 * Builds API-compliant task and trigger payloads from Excel rows.
 * Field names and values match exactly what UAC stores — verified against prod jobs.
 */
import { parseScheduleString } from './scheduleParser';

// ── Allowed fields (OpenAPI schema) ──────────────────────────────────────────

export const ALLOWED_TASK_FIELDS = new Set([
  'type','name',
  'agent','agentVar','agentCluster','agentClusterVar','broadcastCluster','broadcastClusterVar',
  'command','commandOrScript','script','runtimeDir','parameters',
  'credentials','credentialsVar','runAsSudo',
  'exitCodes','exitCodeProcessing','exitCodeText','exitCodeOutput',
  'outputType','retryExitCodes','waitForOutput','outputFailureOnly',
  'outputReturnType','outputReturnFile','outputReturnSline','outputReturnNline','outputReturnText',
  'environment',
  'summary','startHeld','startHeldReason','resolveNameImmediately',
  'resPriority','resPriorityVar','holdResources',
  'retryMaximum','retryIndefinitely','retryInterval','retrySuppressFailure',
  'maxRunTime','userEstimatedDuration','cpDuration','cpDurationUnit',
  'lsEnabled','lsType','lsTime','lsDayConstraint','lsNthAmount','lsDuration',
  'lfEnabled','lfType','lfTime','lfDayConstraint','lfNthAmount','lfDuration',
  'lfOffsetType','lfOffsetPercentage','lfOffsetDuration','lfOffsetDurationUnit',
  'efEnabled','efType','efTime','efDayConstraint','efNthAmount','efDuration',
  'efOffsetType','efOffsetPercentage','efOffsetDuration','efOffsetDurationUnit',
  'twWaitType','twWaitAmount','twWaitTime','twWaitDuration','twWaitDayConstraint',
  'twDelayType','twDelayAmount','twDelayDuration','twWorkflowOnly',
  'executionRestriction','restrictionPeriod',
  'restrictionPeriodBeforeDate','restrictionPeriodAfterDate',
  'restrictionPeriodBeforeTime','restrictionPeriodAfterTime','restrictionPeriodDateList',
  'logLevel','exclusiveWithSelf','timeZonePref',
  'opswiseGroups','variables','notes','actions','virtualResources','exclusiveTasks',
  'enforceVariables','lockVariables','simulation','overrideInstanceWait',
  'retainSysIds','excludeRelated',
  'customField1','customField2',
  'createConsole','desktopInteract','elevateUser',
  'connection','connectionVar','sqlCommand','storedProcName','storedProcParams',
  'resultProcessing','maxRows','autoCleanup','columnName','columnOp','columnValue',
  'toRecipients','ccRecipients','bccRecipients','subject','body','replyTo',
  'template','templateVar','report','reportVar','attachLocalFile','localAttachment',
  'url','httpMethod','httpPayloadType','payload','payloadScript','payloadSource',
  'httpHeaders','httpAuth','timeout','protocol','mimeType',
  'sleepAmount','sleepType','sleepDuration','sleepTime','sleepDayConstraint',
]);

export const ALLOWED_TRIGGER_FIELDS = new Set([
  'type','name','tasks','enabled','description',
  'time','timeZone','timeInterval','timeIntervalUnits','timeStyle',
  'startingAt','startTimeEnable',
  'dayStyle','dayInterval','intervalStartingDate','simpleDateType',
  'daily','sun','mon','tue','wed','thu','fri','sat','custom','businessDays',
  'dateAdjective','dateNoun','dateNouns','dateQualifier','dateQualifiers',
  'dateAdjustment','adjustmentAmount','adjustmentType','nthAmount','adjustInterval',
  'restrictedTimes','enabledStart','enabledEnd',
  'restriction','restrictionSimple','restrictionComplex','restrictionMode',
  'restrictionAdjective','restrictionNthAmount',
  'restrictionNoun','restrictionNouns','restrictionQualifier','restrictionQualifiers',
  'skipCount','skipActive','skipCondition','skipRestriction',
  'skipAfterDate','skipAfterTime','skipBeforeDate','skipBeforeTime','skipDateList',
  'calendar','forecast','action','situation','simulationOption','simulateTasks',
  'executionUser','opswiseGroups','variables','notes',
  'retentionDurationPurge','retentionDuration','retentionDurationUnit','rdExcludeBackup',
  'enforceVariables','lockVariables','retainSysIds','excludeRelated',
  // custom fields on trigger
  'customField1','customField2',
]);

const READ_ONLY = new Set([
  'sysId','version','exportReleaseLevel','exportTable',
  'nextScheduledTime','enabledBy','enabledTime','disabledBy','disabledTime',
  'avgRunTime','avgRunTimeDisplay','minRunTime','minRunTimeDisplay',
  'maxRunTimeDisplay','lastRunTime','lastRunTimeDisplay',
  'runCount','runTime','firstRun','lastRun','taskName',
]);

// ── Universal Excel Row ───────────────────────────────────────────────────────
export interface ExcelRow {
  task_name:          string;
  task_type:          string;
  agent:              string;
  command:            string;
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
  business_services?: string;
  servicenow_ticket?: string;
  schedule_string?:   string;
  job_doc?:           string;
  recovery1?:         string;   // Job Recovery1 — goes into customField1
  recovery2?:         string;   // Job Recovery2 — goes into customField1
  [key: string]: any;
}

// ── Interfaces ────────────────────────────────────────────────────────────────
export interface TaskPayload {
  type:                  string;
  name:                  string;
  command?:              string;
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

// Trigger name uses hyphen separator — matches UAC convention (e.g. JOBNAME-TR001)
function triggerName(taskName: string): string {
  return `${taskName}-TR001`;
}

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
  const taskType    = row.task_type || 'taskUnix';
  const isScriptTask = SCRIPT_TASK_TYPES.has(taskType);
  const isAgentTask  = AGENT_TASK_TYPES.has(taskType);

  const payload: TaskPayload = {
    type:                  taskType,
    name:                  row.task_name,
    resolveNameImmediately:true,
    startHeld:             false,
  };

  if (row.credential)  payload.credentials = row.credential;
  if (row.description) payload.summary      = row.description;

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

  if (taskType === 'taskUnix') {
    payload.runAsSudo = true;
  }

  // ── customField1 = Recovery instructions (matches UAC convention) ─────────
  // Real jobs store: "Re-run job;Raise Low priority ticket to support"
  if (isAgentTask && row.agent) {
    const resolvedAgent = agentResolved?.value || row.agent;
    payload[agentResolved?.field ?? 'agentCluster'] = resolvedAgent;

    // Build recovery string from job doc fields if available
    const rec1 = row.recovery1?.trim() || '';
    const rec2 = row.recovery2?.trim() || '';
    const recoveryValue = [rec1, rec2].filter(Boolean).join(';') || resolvedAgent;
    payload.customField1 = { label: 'Instructions', value: recoveryValue };
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

  // ── Notes — auto-generated from all fields, no separate job_doc needed ────
  const noteTitle = row.servicenow_ticket?.trim() || 'Job Details';
  const noteText = [
    `Job Name = ${row.task_name}`,
    `Job Description = ${row.description || ''}`,
    `Job Script = ${row.command || ''}`,
    `Job Workstation = ${row.agent || ''}`,
    `Job Login Account = ${row.credential || ''}`,
    `Firstrun Date = ${row.first_run_date || ''}`,
    `Job Starttime = ${row.schedule_string || row.start_time || row.frequency_type || ''}`,
    `Maximum Runtime = ${row.max_runtime || ''}`,
    `Business Services = ${row.business_services || ''}`,
    `ServiceNow Ticket = ${row.servicenow_ticket || ''}`,
    row.ref_job ? `Reference Job = ${row.ref_job}` : '',
  ].filter(Boolean).join('\n');

  payload.notes = [{ title: noteTitle, text: row.job_doc?.trim() || noteText }];

  // ── maxRunTime + Late Finish ──────────────────────────────────────────────
  const mr = row.max_runtime ? parseInt(row.max_runtime) : (maxRunTime ?? null);
  if (mr !== null && !isNaN(mr) && mr > 0) {
    payload.maxRunTime = mr;
    payload.lfEnabled  = true;
    payload.lfType     = 'Duration';
    payload.lfDuration = minutesToDuration(mr);
  }

  // ── Pass-through extra columns ────────────────────────────────────────────
  const STANDARD_COLS = new Set([
    'task_name','task_type','agent','command','credential','description','enabled',
    'first_run_date','start_time','timezone','frequency_type','frequency_value',
    'max_runtime','ref_job','business_services','servicenow_ticket','schedule_string',
    'job_doc','recovery1','recovery2',
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
    type:           'triggerTime',
    name:           triggerName(row.task_name),   // hyphen separator: JOBNAME-TR001
    tasks:          [row.task_name],
    enabled:        false,  // Always create disabled — user enables after verification
    dayStyle:       'Simple',
    simpleDateType: 'Daily',
    // Standard trigger defaults matching UAC convention
    calendar:       'System Default',
    situation:      'Holiday',
    action:         'Do Not Trigger',
    retentionDurationPurge: true,
    retentionDuration:      1,
    retentionDurationUnit:  'Days',
  };

  // Copy schedule fields from ref trigger
  if (rawRefTrigger) {
    Object.keys(rawRefTrigger).forEach(k => {
      if (SCHEDULE_ONLY.has(k) && rawRefTrigger[k] !== null && rawRefTrigger[k] !== undefined) {
        base[k] = rawRefTrigger[k];
      }
    });
  }

  // Parse schedule — unified approach
  // Job Starttime handles everything: "Daily at 03:30 Asia/Kolkata", "Monday every 7 minutes", etc.
  const schedInput = row.schedule_string?.trim() || row.frequency_type?.trim() || '';

  if (schedInput) {
    // Old AT/EVERY/UNTIL format — backward compatible
    if (schedInput.match(/^AT\s+\d{4}/i) || schedInput.startsWith('FREQ=')) {
      const parsed = parseScheduleString(schedInput, row.start_time, row.timezone);
      Object.assign(base, parsed);
      delete base.human_readable;
    } else {
      // Natural language — parse inline
      const lower = schedInput.toLowerCase();

      // Extract time: "at HH:MM"
      const timeMatch = schedInput.match(/(?:at\s+)?(\d{1,2}):(\d{2})/i);
      if (timeMatch) base.time = timeMatch[1].padStart(2, '0') + ':' + timeMatch[2];

      // Extract timezone
      const tzMatch = schedInput.match(/((?:Asia|Europe|America|Pacific|Africa|Australia)\/[\w\/]+|UTC|GMT)/i);
      if (tzMatch) base.timeZone = tzMatch[1];

      // Extract interval: "every N minutes/hours"
      const intMatch = lower.match(/every\s+(\d+)\s*(min|mins|minutes?|hr|hrs|hours?)/);
      if (intMatch) {
        base.timeStyle = 'Interval';
        base.timeInterval = parseInt(intMatch[1]);
        base.timeIntervalUnits = intMatch[2].startsWith('h') ? 'Hours' : 'Minutes';
      }

      // Extract window: "from HH:MM to HH:MM"
      const windowMatch = schedInput.match(/from\s+(\d{1,2}:\d{2})\s+to\s+(\d{1,2}:\d{2})/i);
      if (windowMatch) {
        base.enabledStart = windowMatch[1];
        base.enabledEnd = windowMatch[2];
        base.restrictedTimes = true;
      }

      // Determine day pattern
      const dayMap: Record<string, string> = { monday:'mon',tuesday:'tue',wednesday:'wed',thursday:'thu',friday:'fri',saturday:'sat',sunday:'sun' };
      const foundDays: string[] = [];
      Object.entries(dayMap).forEach(([full, short]) => { if (lower.includes(full)) foundDays.push(short); });

      // Monthly patterns
      const monthRange = lower.match(/monthly\s+day\s+(\d+)[\-to\s]+(\d+)/);
      const monthOrd = lower.match(/monthly\s+(1st|2nd|3rd|4th|5th|last)\s+(\w+)/);

      if (monthRange) {
        const start = parseInt(monthRange[1]), end = parseInt(monthRange[2]);
        base.dayStyle = 'Complex';
        base.dateAdjective = 'Every';
        base.dateNouns = [];
        for (let d = start; d <= end; d++) base.dateNouns.push({ value: `Month Day ${String(d).padStart(2, '0')}` });
        base.dateQualifiers = [{ value: 'Year' }];
      } else if (monthOrd) {
        const ordMap: Record<string, string> = { '1st':'1st','2nd':'2nd','3rd':'3rd','4th':'4th','5th':'5th','last':'Last' };
        base.dayStyle = 'Complex';
        base.dateAdjective = ordMap[monthOrd[1].toLowerCase()] || monthOrd[1];
        base.dateNouns = [{ value: monthOrd[2].charAt(0).toUpperCase() + monthOrd[2].slice(1) }];
        base.dateQualifiers = [{ value: 'Every Month' }];
      } else if (lower.includes('weekday') || lower.includes('business day')) {
        base.dayStyle = 'Simple';
        base.simpleDateType = 'Weekly';
        base.mon = true; base.tue = true; base.wed = true; base.thu = true; base.fri = true;
      } else if (foundDays.length > 0) {
        base.dayStyle = 'Simple';
        base.simpleDateType = 'Weekly';
        foundDays.forEach(d => { (base as any)[d] = true; });
      } else {
        base.dayStyle = 'Simple';
        base.simpleDateType = 'Daily';
      }

      // Set timeStyle if not already set
      if (!base.timeStyle && base.time) base.timeStyle = 'Absolute';
    }
  } else {
    // No schedule input — use individual fields
    if (row.start_time) base.time     = row.start_time;
    if (row.timezone)   base.timeZone = row.timezone;
    if (!rawRefTrigger) base.timeStyle = 'Absolute';
  }

  // ── First run date ────────────────────────────────────────────────────────
  if (row.first_run_date) {
    base.intervalStartingDate = row.first_run_date;
    // skipBeforeDate + skipRestriction = "Before" ensures trigger doesn't fire
    // before the first run date — matches how UAC creates jobs manually
    base.skipRestriction = 'Before';
    base.skipBeforeDate  = row.first_run_date;
  } else {
    base.skipCondition   = 'None';
    base.skipRestriction = 'None';
  }

  // ── Description = job description ─────────────────────────────────────────
  if (row.description) {
    base.description = row.description;
  }

  // ── customField1 = Agent Cluster Name (matches UAC convention on triggers) ─
  const agentValue = row.agent?.trim();
  if (agentValue) {
    base.customField1 = { label: 'Agent Cluster Name', value: agentValue };
  }

  // ── customField2 = ServiceNow Ticket ─────────────────────────────────────
  if (row.servicenow_ticket?.trim()) {
    base.customField2 = { label: 'ServiceNow Ticket', value: row.servicenow_ticket.trim() };
  }

  // ── Notes — same info as task, auto-generated ─────────────────────────────
  const trigNoteTitle = row.servicenow_ticket?.trim() || 'Job Details';
  const trigNoteText = [
    `Job Name = ${row.task_name}`,
    `Job Description = ${row.description || ''}`,
    `Job Workstation = ${row.agent || ''}`,
    `Firstrun Date = ${row.first_run_date || ''}`,
    `Job Starttime = ${row.schedule_string || row.start_time || row.frequency_type || ''}`,
    `ServiceNow Ticket = ${row.servicenow_ticket || ''}`,
  ].filter(l => !l.endsWith('= ')).join('\n');
  base.notes = [{ title: trigNoteTitle, text: row.job_doc?.trim() || trigNoteText }];

  // ── Business Services ─────────────────────────────────────────────────────
  const bsTrigger = String(row.business_services ?? '').trim();
  if (bsTrigger) {
    const sep = bsTrigger.includes(';') ? ';' : ',';
    base.opswiseGroups = bsTrigger.split(sep).map((s: string) => s.trim()).filter(Boolean);
  }

  return filterPayload(base, ALLOWED_TRIGGER_FIELDS, 'TRIGGER') as TriggerPayload;
}

// ── Filter payload — remove read-only and unknown fields ─────────────────────
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
  return clean;
}
