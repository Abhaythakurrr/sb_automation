/**
 * Job Doc Parser
 * Converts free-text job documentation into a structured Excel row.
 * Handles the exact format used in the job request documents.
 */

export interface JobRow {
  task_name:         string;
  task_type:         string;
  agent:             string;
  command:           string;
  credential:        string;
  description:       string;
  enabled:           string;
  first_run_date:    string;
  start_time:        string;
  timezone:          string;
  frequency_type:    string;
  frequency_value:   string;
  max_runtime:       string;
  ref_job:           string;
  business_services: string;
  servicenow_ticket: string;
  servicenow_group:  string;
  schedule_string:   string;
  job_doc:           string;
  recovery1:         string;
  recovery2:         string;
  // Extended metadata from full job doc format
  business_unit?:    string;
  job_function?:     string;
  job_priority?:     string;
  stream_name?:      string;
  additional_info?:  string;
  end_time?:         string;   // End time for interval jobs (HH:MM)
}

export const EMPTY_ROW: JobRow = {
  task_name: '', task_type: 'taskUnix', agent: '', command: '',
  credential: '', description: '', enabled: 'true',
  first_run_date: '', start_time: '', timezone: '',
  frequency_type: '', frequency_value: '', max_runtime: '',
  ref_job: '', business_services: '', servicenow_ticket: '',
  servicenow_group: '', schedule_string: '', job_doc: '',
  recovery1: '', recovery2: '',
};

function extract(text: string, ...keys: string[]): string {
  for (const key of keys) {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const m = text.match(new RegExp(`${escaped}\\s*[=:]\\s*(.+?)(?:\\n|$)`, 'i'));
    if (m) return m[1].trim();
  }
  return '';
}

function parseMaxRuntime(val: string): string {
  if (!val) return '';
  const trimmed = val.trim().toLowerCase();

  // "3hrs" / "3 hrs" / "3hours" / "2hr" → hours to minutes
  const hrsMatch = trimmed.match(/^(\d+)\s*(?:hrs?|hours?)$/);
  if (hrsMatch) return String(parseInt(hrsMatch[1]) * 60);

  // "30min" / "45 mins" / "90minutes"
  const minMatch = trimmed.match(/^(\d+)\s*(?:mins?|minutes?)$/);
  if (minMatch) return String(parseInt(minMatch[1]));

  // "0100" → 60 min, "0015" → 15 min, "0030" → 30 min
  const clean = val.trim().replace(/[^\d]/g, '');
  if (clean.length === 4) {
    const h = parseInt(clean.slice(0, 2));
    const m = parseInt(clean.slice(2, 4));
    return String(h * 60 + m);
  }
  // Already a number
  const n = parseInt(clean);
  return isNaN(n) ? '' : String(n);
}

function parseStartTime(schedStr: string): { start_time: string; timezone: string; schedule_string: string } {
  if (!schedStr) return { start_time: '', timezone: '', schedule_string: '' };

  // Pass timezone as-is — Stonebranch accepts IANA, Etc/GMT+X, and abbreviations like IST
  // Do NOT convert — let the API validate

  // If it contains EVERY or UNTIL → use as schedule_string
  if (/EVERY|UNTIL/i.test(schedStr)) {
    const tzMatch = schedStr.match(/TIMEZONE\s+(\S+)/i);
    return {
      start_time:      '',
      timezone:        tzMatch?.[1] ?? '',
      schedule_string: schedStr.trim(),
    };
  }

  // "AT HHMM TIMEZONE tz" → simple absolute
  const atMatch = schedStr.match(/AT\s+(\d{4})/i);
  const tzMatch = schedStr.match(/TIMEZONE\s+(\S+)/i);
  if (atMatch) {
    const h = atMatch[1].slice(0, 2);
    const m = atMatch[1].slice(2, 4);
    return {
      start_time:      `${h}:${m}`,
      timezone:        tzMatch?.[1] ?? '',
      schedule_string: '',
    };
  }

  // Bare "HHMM" or "HH:MM" — just a time value without AT prefix
  const bareTime = schedStr.trim().match(/^(\d{2}):?(\d{2})$/);
  if (bareTime) {
    return {
      start_time:      `${bareTime[1]}:${bareTime[2]}`,
      timezone:        '',
      schedule_string: '',
    };
  }

  return { start_time: '', timezone: '', schedule_string: schedStr };
}

function mapTaskType(typeStr: string): string {
  const map: Record<string, string> = {
    'unix':        'taskUnix',
    'linux':       'taskUnix',
    'windows':     'taskWindows',
    'sql':         'taskSql',
    'email':       'taskEmail',
    'ftp':         'taskFtp',
    'webservice':  'taskWebService',
    'web service': 'taskWebService',
    'manual':      'taskManual',
    'sleep':       'taskSleep',
    'timer':       'taskSleep',
    'sap':         'taskSap',
  };
  const lower = typeStr.toLowerCase().trim();
  return map[lower] ?? (typeStr.startsWith('task') ? typeStr : `task${typeStr.charAt(0).toUpperCase()}${typeStr.slice(1)}`);
}

/**
 * Parse a free-text job document into a JobRow.
 * Handles the standard job request format.
 */
export function parseJobDoc(text: string): JobRow {
  const row: JobRow = { ...EMPTY_ROW };

  // Core fields
  row.task_name   = extract(text, 'Job Name', 'Task Name', 'Name');
  row.description = extract(text, 'Job Description', 'Description', 'Task Description');
  row.agent       = extract(text, 'Job Workstation', 'Workstation', 'Agent', 'Job Workstation');
  row.credential  = extract(text, 'Job Login Account', 'Login Account', 'Credential', 'Credentials');
  row.command     = extract(text, 'Job Script', 'Script', 'Command');

  // Extended metadata fields (from full job doc format)
  row.business_unit  = extract(text, 'Business Unit', 'BU');
  row.job_function   = extract(text, 'Job Function', 'Function');
  row.job_priority   = extract(text, 'Job Priority', 'Priority');
  row.stream_name    = extract(text, 'Job StreamName', 'StreamName', 'Stream Name', 'Stream');
  row.additional_info = extract(text, 'Additional Information', 'Additional Info', 'Others');

  // Task type
  const rawType = extract(text, 'Job Type', 'Task Type', 'Type');
  // "Production" is the job category, not task type — default to taskUnix
  if (rawType && rawType.toLowerCase() !== 'production') {
    row.task_type = mapTaskType(rawType);
  } else {
    row.task_type = 'taskUnix';
  }

  // Store the full raw text as job_doc so notes contain the complete original input
  row.job_doc = text.trim();

  // Dates
  const firstRun = extract(text, 'Firstrun Date', 'First Run Date', 'First Run', 'Start Date');
  row.first_run_date = firstRun || '';

  // Schedule
  const schedStr = extract(text, 'Job Starttime', 'Start Time', 'Job Start Time', 'Starttime');
  const { start_time, timezone, schedule_string } = parseStartTime(schedStr);
  row.start_time      = start_time;
  row.schedule_string = schedule_string;

  // Timezone (explicit field overrides parsed)
  // Strip "TIMEZONE " prefix if present (client writes "TIMEZONE America/New_York")
  let explicitTz = extract(text, 'Job Timezone', 'Timezone', 'Time Zone');
  explicitTz = explicitTz.replace(/^TIMEZONE\s+/i, '').trim();
  row.timezone = explicitTz || timezone;

  // Frequency — extract from job doc and understand natural language
  const freqStr = extract(text, 'Scheduled Frequency', 'Frequency', 'Schedule Frequency', 'Schedule');
  // Also check for inline frequency patterns in additional info
  const addInfoFreq = extract(text, 'Additional Information', 'Additional Info');
  const freqFromInfo = addInfoFreq.match(/every\s+(?:month\s+)?(\d+(?:st|nd|rd|th)\s+\w+|last\s+\w+\s+\w+)/i)?.[0]
    || addInfoFreq.match(/((?:from\s+)?date?\s*\d+\s*to\s*date?\s*\d+)/i)?.[0]
    || addInfoFreq.match(/(every\s+\d+\s*(?:min|hour|day)s?)/i)?.[0]
    || '';

  // Use the most specific frequency found
  const finalFreq = freqStr || freqFromInfo;
  row.frequency_type  = finalFreq;
  row.frequency_value = '';

  // Max runtime
  const maxRaw = extract(text, 'Maximum Runtime', 'Max Runtime', 'MAXDUR', 'Max Run Time');
  row.max_runtime = parseMaxRuntime(maxRaw);

  // Ref job
  const addInfo = extract(text, 'Additional Information', 'Additional Info');
  const refMatch = addInfo.match(/same as\s+([\w\-]+)/i) || text.match(/ref_job\s*[=:]\s*([\w\-]+)/i);
  row.ref_job = refMatch?.[1] ?? '';

  // Recovery instructions
  row.recovery1 = extract(text, 'Job Recovery1', 'Job Recovery 1', 'Recovery1');
  row.recovery2 = extract(text, 'Job Recovery2', 'Job Recovery 2', 'Recovery2');

  // ServiceNow ticket — explicit field first, then auto-detect from text
  const explicitTicket = extract(text, 'ServiceNow Ticket', 'ServiceNow Ticket Number', 'RITM', 'Ticket', 'Snow Ticket');
  const autoTicket     = text.match(/\b(RITM\d+|INC\d+|CHG\d+|REQ\d+)\b/i)?.[1] ?? '';
  row.servicenow_ticket = explicitTicket || autoTicket;

  // ServiceNow Group (QUEUES)
  row.servicenow_group = extract(text, 'ServiceNow Group', 'Snow Group', 'Queues', 'Queue');

  // End time for interval jobs
  row.end_time = extract(text, 'Job End Time', 'End Time', 'Endtime', 'Job Endtime');

  // Business Services
  row.business_services = extract(text, 'Business Services', 'Business Service', 'Member of Business Services', 'Business Unit Group');

  row.enabled  = 'true';
  row.job_doc  = text.trim();   // store full original text for notes

  return row;
}

/**
 * Validate a row has minimum required fields.
 */
export function validateRow(row: JobRow): string[] {
  const errors: string[] = [];
  if (!row.task_name) errors.push('task_name is required');
  if (!row.agent)     errors.push('agent (Job Workstation) is required');
  if (!row.command)   errors.push('command (Job Script) is required');
  return errors;
}
