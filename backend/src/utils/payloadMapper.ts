/**
 * Stonebranch Payload Mapper
 * Builds API-compliant task and trigger payloads from Excel rows.
 * Field names and values match exactly what UAC stores — verified against prod jobs.
 */
import { buildScheduleFields } from './triggerSchedule';

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
  servicenow_group?:  string;   // ServiceNow Group / QUEUES
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

  // ── customField1 = Agent Cluster Name (matches UAC convention) ─────────────
  if (isAgentTask && row.agent) {
    const resolvedAgent = agentResolved?.value || row.agent;
    payload[agentResolved?.field ?? 'agentCluster'] = resolvedAgent;

    // customField1 stores the agent cluster name — same as trigger
    payload.customField1 = { label: 'Agent Cluster Name', value: resolvedAgent };
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
    `ServiceNow Group = ${row.servicenow_group || ''}`,
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
    'max_runtime','ref_job','business_services','servicenow_ticket','servicenow_group',
    'schedule_string','job_doc','recovery1','recovery2',
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

  // ── Schedule: use the triggerSchedule module ────────────────────────────────
  if (!rawRefTrigger) {
    const schedFields = buildScheduleFields(
      row.schedule_string?.trim() || '',
      row.frequency_type?.trim() || '',
      row.start_time?.trim() || '',
      row.timezone?.trim() || '',
    );

    // Apply schedule fields to trigger payload
    if (schedFields.timeStyle)         base.timeStyle = schedFields.timeStyle;
    if (schedFields.time)              base.time = schedFields.time;
    if (schedFields.timeInterval)      base.timeInterval = schedFields.timeInterval;
    if (schedFields.timeIntervalUnits) base.timeIntervalUnits = schedFields.timeIntervalUnits;
    if (schedFields.timeZone)          base.timeZone = schedFields.timeZone;
    if (schedFields.dayStyle)          base.dayStyle = schedFields.dayStyle;
    if (schedFields.simpleDateType)    base.simpleDateType = schedFields.simpleDateType;
    if (schedFields.dateAdjective)     base.dateAdjective = schedFields.dateAdjective;
    if (schedFields.dateNouns)         base.dateNouns = schedFields.dateNouns;
    if (schedFields.dateQualifiers)    base.dateQualifiers = schedFields.dateQualifiers;
    if (schedFields.nthAmount)         base.nthAmount = schedFields.nthAmount;
    if (schedFields.dayInterval)       base.dayInterval = schedFields.dayInterval;
    if (schedFields.restrictedTimes)   base.restrictedTimes = schedFields.restrictedTimes;
    if (schedFields.enabledStart)      base.enabledStart = schedFields.enabledStart;
    if (schedFields.enabledEnd)        base.enabledEnd = schedFields.enabledEnd;
    if (schedFields.businessDays)      base.businessDays = schedFields.businessDays;
    if (schedFields.mon) base.mon = true;
    if (schedFields.tue) base.tue = true;
    if (schedFields.wed) base.wed = true;
    if (schedFields.thu) base.thu = true;
    if (schedFields.fri) base.fri = true;
    if (schedFields.sat) base.sat = true;
    if (schedFields.sun) base.sun = true;

    // Remove conflicting defaults
    if (base.dayStyle === 'Complex') delete base.simpleDateType;
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
    `ServiceNow Group = ${row.servicenow_group || ''}`,
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

  // ── SAFETY: Ensure timeStyle=Absolute always has a time value ─────────────
  // UAC rejects "Time is required field for timeStyle: Absolute" if time is missing
  if (base.timeStyle === 'Absolute' && !base.time) {
    // Last resort: try to extract from start_time field
    const fallbackTime = row.start_time?.trim();
    if (fallbackTime) {
      if (/^\d{4}$/.test(fallbackTime)) {
        base.time = fallbackTime.slice(0, 2) + ':' + fallbackTime.slice(2, 4);
      } else {
        base.time = fallbackTime;
      }
    } else {
      // No time available at all — switch to Interval-less style to avoid API error
      // This means the trigger will need manual time configuration in UAC
      console.warn(`[TRIGGER] ${base.name}: timeStyle=Absolute but no time found — removing timeStyle`);
      delete base.timeStyle;
    }
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
