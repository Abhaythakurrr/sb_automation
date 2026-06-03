/**
 * Stonebranch Schedule Parser
 * Parses trigger JSON AND job-doc schedule strings into normalized output.
 */

export interface ParsedSchedule {
  schedule_type:   'SIMPLE' | 'COMPLEX' | 'INTERVAL';
  frequency_type:  string;
  frequency_value: string;
  human_readable:  string;
  raw: Record<string, any>;
}

const DAY_NAMES: Record<string, string> = {
  sun: 'Sunday', mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday',
  thu: 'Thursday', fri: 'Friday', sat: 'Saturday',
};

// ── Parse from trigger JSON (API response) ────────────────────────────────────
export function parseSchedule(trigger: Record<string, any>): ParsedSchedule {
  const dayStyle: string  = trigger.dayStyle  ?? '';
  const timeStyle: string = trigger.timeStyle ?? '';

  // INTERVAL schedule
  if (timeStyle === 'Interval' && trigger.timeInterval) {
    const units = trigger.timeIntervalUnits ?? 'Hours';
    const start = trigger.enabledStart && trigger.enabledStart !== '00:00' ? ` from ${trigger.enabledStart}` : '';
    const end   = trigger.enabledEnd   && trigger.enabledEnd   !== '00:00' ? ` until ${trigger.enabledEnd}`  : '';
    return {
      schedule_type:  'INTERVAL',
      frequency_type: 'INTERVAL',
      frequency_value:`${trigger.timeInterval} ${units}`,
      human_readable: `Every ${trigger.timeInterval} ${units}${start}${end}`,
      raw: extractRawFields(trigger),
    };
  }

  // SIMPLE schedule
  if (dayStyle === 'Simple') {
    const sdt = trigger.simpleDateType ?? '';
    const enabledDays = Object.keys(DAY_NAMES).filter(d => trigger[d] === true);

    let frequency_type  = sdt || 'DAILY';
    let frequency_value = '';
    let human_readable  = '';

    if (sdt === 'Daily' || (!sdt && enabledDays.length === 0)) {
      frequency_type  = 'DAILY';
      frequency_value = String(trigger.dayInterval ?? 1);
      human_readable  = trigger.dayInterval > 1 ? `Every ${trigger.dayInterval} days` : 'Every day';
    } else if (sdt === 'Weekly' || enabledDays.length > 0) {
      frequency_type  = 'WEEKLY';
      frequency_value = enabledDays.join(',');
      human_readable  = enabledDays.length > 0 ? `Every ${enabledDays.map(d => DAY_NAMES[d]).join(', ')}` : 'Weekly';
    } else if (sdt === 'Monthly') {
      frequency_type  = 'MONTHLY';
      frequency_value = String(trigger.dayInterval ?? '');
      human_readable  = 'Monthly';
    } else {
      frequency_type  = sdt.toUpperCase();
      frequency_value = '';
      human_readable  = sdt;
    }

    return { schedule_type: 'SIMPLE', frequency_type, frequency_value, human_readable, raw: extractRawFields(trigger) };
  }

  // COMPLEX schedule
  if (dayStyle === 'Complex') {
    const dateNouns      = trigger.dateNouns      ?? (trigger.dateNoun      ? [trigger.dateNoun]      : []);
    const dateQualifiers = trigger.dateQualifiers ?? (trigger.dateQualifier ? [trigger.dateQualifier] : []);
    const adjective      = trigger.dateAdjective  ?? 'Every';
    const nounValues     = dateNouns.map((n: any) => n.value ?? n).join(', ');
    const qualValues     = dateQualifiers.map((q: any) => q.value ?? q).join(', ');

    let frequency_type  = 'COMPLEX';
    let human_readable  = nounValues && qualValues ? `${adjective} ${nounValues} of ${qualValues}` : nounValues ? `${adjective} ${nounValues}` : 'Complex Schedule';

    if (nounValues.toLowerCase().includes('month day')) frequency_type = 'MONTHLY_COMPLEX';
    else if (nounValues.toLowerCase().includes('week'))  frequency_type = 'WEEKLY_COMPLEX';

    return { schedule_type: 'COMPLEX', frequency_type, frequency_value: nounValues, human_readable, raw: extractRawFields(trigger) };
  }

  // Fallback
  if (trigger.time || trigger.timeZone) {
    return { schedule_type: 'SIMPLE', frequency_type: 'DAILY', frequency_value: '1', human_readable: 'Daily (inferred)', raw: extractRawFields(trigger) };
  }

  throw new Error(`Unknown schedule format — dayStyle: "${dayStyle}", timeStyle: "${timeStyle}"`);
}

// ── Parse schedule string from job doc ────────────────────────────────────────
// Handles: "AT HHMM TIMEZONE tz UNTIL HHMM TIMEZONE tz MAXDUR HHMM EVERY HHMM"
// Also: "FREQ=DAILY;INTERVAL=1"
export interface ParsedScheduleString {
  timeStyle:         string;
  time?:             string;
  timeInterval?:     number;
  timeIntervalUnits?:string;
  timeZone?:         string;
  restrictedTimes?:  boolean;
  enabledStart?:     string;
  enabledEnd?:       string;
  dayStyle:          string;
  simpleDateType:    string;
  human_readable:    string;
}

export function parseScheduleString(schedStr: string, startTime?: string, timezone?: string): ParsedScheduleString {
  const s = schedStr.trim();
  // Pass timezone as-is — Stonebranch accepts IANA, Etc/GMT+X, IST, etc.

  // FREQ=DAILY;INTERVAL=1 style
  if (s.startsWith('FREQ=')) {
    const freq     = s.match(/FREQ=([^;]+)/)?.[1] ?? 'DAILY';
    const interval = parseInt(s.match(/INTERVAL=(\d+)/)?.[1] ?? '1');
    return {
      timeStyle:      'Absolute',
      time:           startTime ?? '00:00',
      timeZone:       timezone  ?? 'UTC',
      dayStyle:       'Simple',
      simpleDateType: freq === 'DAILY' ? 'Daily' : freq,
      human_readable: `Every ${interval} day(s)`,
    };
  }

  // AT HHMM [TIMEZONE tz] [UNTIL HHMM [TIMEZONE tz]] [MAXDUR HHMM] [EVERY HHMM]
  const atMatch    = s.match(/AT\s+(\d{4})/i);
  const untilMatch = s.match(/UNTIL\s+(\d{4})/i);
  const everyMatch = s.match(/EVERY\s+(\d{4})/i);
  const tzMatch    = s.match(/AT\s+\d{4}\s+TIMEZONE\s+(\S+)/i);

  const atTime    = atMatch    ? formatHHMM(atMatch[1])    : (startTime ?? '00:00');
  const untilTime = untilMatch ? formatHHMM(untilMatch[1]) : null;
  const tz = tzMatch?.[1] ?? timezone ?? 'UTC';

  if (everyMatch) {
    // Interval schedule
    const everyMins = parseHHMM(everyMatch[1]);
    const { interval, units } = minsToInterval(everyMins);

    const result: ParsedScheduleString = {
      timeStyle:          'Interval',
      timeInterval:       interval,
      timeIntervalUnits:  units,
      timeZone:           tz,
      dayStyle:           'Simple',
      simpleDateType:     'Daily',
      enabledStart:       atTime,
      human_readable:     `Every ${interval} ${units} starting ${atTime}`,
    };

    if (untilTime) {
      result.restrictedTimes = true;
      result.enabledEnd      = untilTime;
      result.human_readable += ` until ${untilTime}`;
    }

    return result;
  }

  // Absolute (no EVERY) — single run at AT time
  return {
    timeStyle:      'Absolute',
    time:           atTime,
    timeZone:       tz,
    dayStyle:       'Simple',
    simpleDateType: 'Daily',
    human_readable: `Daily at ${atTime} ${tz}`,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatHHMM(hhmm: string): string {
  const h = hhmm.slice(0, 2);
  const m = hhmm.slice(2, 4);
  return `${h}:${m}`;
}

function parseHHMM(hhmm: string): number {
  const h = parseInt(hhmm.slice(0, 2));
  const m = parseInt(hhmm.slice(2, 4));
  return h * 60 + m;
}

function minsToInterval(mins: number): { interval: number; units: string } {
  if (mins >= 60 && mins % 60 === 0) return { interval: mins / 60, units: 'Hours' };
  if (mins >= 1440 && mins % 1440 === 0) return { interval: mins / 1440, units: 'Days' };
  return { interval: mins, units: 'Minutes' };
}

function extractRawFields(trigger: Record<string, any>): Record<string, any> {
  const SCHEDULE_FIELDS = [
    'time','timeZone','timeStyle','timeInterval','timeIntervalUnits',
    'dayStyle','dayInterval','intervalStartingDate','simpleDateType',
    'daily','sun','mon','tue','wed','thu','fri','sat',
    'custom','businessDays','startingAt','startTimeEnable',
    'dateAdjective','dateNoun','dateNouns','dateQualifier','dateQualifiers',
    'dateAdjustment','adjustmentAmount','adjustmentType',
    'nthAmount','restrictedTimes','enabledStart','enabledEnd',
    'adjustInterval','restriction','restrictionMode',
    'restrictionAdjective','restrictionNoun','restrictionNouns',
    'restrictionQualifier','restrictionQualifiers','restrictionNthAmount',
  ];
  const raw: Record<string, any> = {};
  SCHEDULE_FIELDS.forEach(f => { if (trigger[f] !== undefined && trigger[f] !== null) raw[f] = trigger[f]; });
  return raw;
}

// ── Parse Scheduled Frequency field from Excel ────────────────────────────────
// Converts natural language frequency descriptions into UAC trigger fields.
//
// Supported formats:
//   "Daily"                          → Simple Daily
//   "Weekdays" / "Mon-Fri"          → Weekly Mon-Fri
//   "Mon,Wed,Fri"                   → Weekly specific days
//   "Weekly"                        → Weekly all days
//   "Monthly"                       → Monthly (day from first_run_date)
//   "Monthly Day 15"               → Monthly on 15th
//   "Monthly 2nd Sunday"           → Complex: 2nd Sunday of every month
//   "Monthly Last Business Day"    → Complex: last business day
//   "Monthly Day 5 to Day 12"     → Complex: month days 5-12
//   "From Date 5 to Date 12"      → Complex: month days 5-12
//   "Business Days"                → Simple Daily with businessDays=true
//   "Every 7 minutes"             → Interval 7 minutes
//   "Every 15 mins"               → Interval 15 minutes
//   "Every 4 hours"               → Interval 4 hours

const DAY_MAP: Record<string, string> = {
  'mon': 'mon', 'monday': 'mon',
  'tue': 'tue', 'tuesday': 'tue',
  'wed': 'wed', 'wednesday': 'wed',
  'thu': 'thu', 'thursday': 'thu',
  'fri': 'fri', 'friday': 'fri',
  'sat': 'sat', 'saturday': 'sat',
  'sun': 'sun', 'sunday': 'sun',
};

const ORDINALS: Record<string, string> = {
  '1st': '1st', 'first': '1st',
  '2nd': '2nd', 'second': '2nd',
  '3rd': '3rd', 'third': '3rd',
  '4th': '4th', 'fourth': '4th',
  '5th': '5th', 'fifth': '5th',
  'last': 'Last',
};

export interface FrequencyFields {
  dayStyle:        string;
  simpleDateType?: string;
  dayInterval?:    number;
  businessDays?:   boolean;
  sun?: boolean; mon?: boolean; tue?: boolean; wed?: boolean;
  thu?: boolean; fri?: boolean; sat?: boolean;
  dateAdjective?:  string;
  dateNoun?:       { value: string };
  dateNouns?:      { value: string }[];
  dateQualifier?:  { value: string };
  dateQualifiers?: { value: string }[];
  timeStyle?:      string;
  time?:           string;
  timeZone?:       string;
  timeInterval?:   number;
  timeIntervalUnits?: string;
  enabledStart?:   string;
  enabledEnd?:     string;
  restrictedTimes?: boolean;
}

export function parseFrequencyString(freq: string): FrequencyFields | null {
  if (!freq || !freq.trim()) return null;
  const f = freq.trim();
  const lower = f.toLowerCase();

  // ── Extract time and timezone from anywhere in the string ─────────────────
  // These apply regardless of which frequency pattern matches
  let extractedTime: string | undefined;
  let extractedTz: string | undefined;
  let extractedStart: string | undefined;
  let extractedEnd: string | undefined;
  let hasWindow = false;

  // Time: "at HH:MM" or standalone "HH:MM" (but not inside "from/to")
  const timeMatch = f.match(/(?:at\s+)?(\d{1,2}):(\d{2})(?!\s*to)/i);
  if (timeMatch) {
    extractedTime = timeMatch[1].padStart(2, '0') + ':' + timeMatch[2];
  }

  // Timezone: Asia/Kolkata, UTC, America/New_York etc.
  const tzMatch = f.match(/((?:Asia|Europe|America|Pacific|Africa|Australia)\/[\w\/]+|UTC|GMT)/i);
  if (tzMatch) extractedTz = tzMatch[1];

  // Window: "from HH:MM to HH:MM"
  const windowMatch = f.match(/from\s+(\d{1,2}:\d{2})\s+to\s+(\d{1,2}:\d{2})/i);
  if (windowMatch) {
    extractedStart = windowMatch[1];
    extractedEnd   = windowMatch[2];
    hasWindow = true;
  }

  // Helper to apply time fields to result
  function applyTime(result: FrequencyFields): void {
    if (extractedTime) result.time = extractedTime;
    if (extractedTz)   result.timeZone = extractedTz;
    if (hasWindow) {
      result.enabledStart = extractedStart;
      result.enabledEnd   = extractedEnd;
      result.restrictedTimes = true;
    }
    // Set timeStyle if not already set
    if (!result.timeStyle && extractedTime) result.timeStyle = 'Absolute';
  }

  // ── Combined: "Monday Every 7 minutes" / "Mon-Fri Every 15 mins" ──────────
  const combinedMatch = lower.match(/^(.+?)\s+every\s+(\d+)\s*(min|mins|minutes?|hr|hrs|hours?)/i);
  if (combinedMatch) {
    const daysPart    = combinedMatch[1].trim();
    const amount      = parseInt(combinedMatch[2]);
    const unitRaw     = combinedMatch[3].toLowerCase();
    const units       = unitRaw.startsWith('h') ? 'Hours' : 'Minutes';

    // Parse the days part
    const result: FrequencyFields = {
      dayStyle:          'Simple',
      simpleDateType:    'Daily',
      timeStyle:         'Interval',
      timeInterval:      amount,
      timeIntervalUnits: units,
    };

    // Check if days part is "weekdays", "mon-fri", or specific days
    const daysLower = daysPart.toLowerCase();
    if (daysLower === 'weekdays' || daysLower === 'mon-fri' || daysLower === 'business days') {
      result.mon = true; result.tue = true; result.wed = true; result.thu = true; result.fri = true;
    } else if (daysLower === 'daily' || daysLower === 'everyday') {
      result.simpleDateType = 'Daily';
    } else {
      // Parse individual days: "Mon,Wed,Fri" or "Monday" or "Mon Wed Fri"
      const days = daysPart.split(/[,\s]+/).map(d => DAY_MAP[d.toLowerCase()]).filter(Boolean);
      if (days.length > 0) {
        days.forEach(d => { (result as any)[d] = true; });
      } else {
        // Single day name without comma
        const singleDay = DAY_MAP[daysLower];
        if (singleDay) (result as any)[singleDay] = true;
      }
    }

    applyTime(result);
    return result;
  }

  // ── Interval only: "Every N minutes/hours" ────────────────────────────────
  const intervalMatch = lower.match(/every\s+(\d+)\s*(min|mins|minutes?|hr|hrs|hours?)/i);
  if (intervalMatch) {
    const amount = parseInt(intervalMatch[1]);
    const unitRaw = intervalMatch[2].toLowerCase();
    const units = unitRaw.startsWith('h') ? 'Hours' : 'Minutes';
    return {
      dayStyle:          'Simple',
      simpleDateType:    'Daily',
      timeStyle:         'Interval',
      timeInterval:      amount,
      timeIntervalUnits: units,
    };
  }

  // ── Business Days ─────────────────────────────────────────────────────────
  if (lower === 'business days' || lower === 'businessdays' || lower === 'weekdays' || lower === 'mon-fri') {
    return {
      dayStyle:       'Simple',
      simpleDateType: 'Daily',
      mon: true, tue: true, wed: true, thu: true, fri: true,
    };
  }

  // ── Weekly specific days: "Mon,Wed,Fri" or "Mon, Wed, Fri" ────────────────
  const dayList = f.split(/[,\s]+/).map(d => DAY_MAP[d.toLowerCase()]).filter(Boolean);
  if (dayList.length >= 2 && dayList.length <= 7) {
    const result: FrequencyFields = { dayStyle: 'Simple', simpleDateType: 'Daily' };
    dayList.forEach(d => { (result as any)[d] = true; });
    applyTime(result);
    return result;
  }

  // ── Complex: "Monthly Day 5 to Day 12" or "From Date 5 to Date 12" ───────
  const dayRangeMatch = lower.match(/(?:monthly\s+)?(?:from\s+)?date?\s*(\d+)\s*to\s*date?\s*(\d+)/i);
  if (dayRangeMatch) {
    const start = parseInt(dayRangeMatch[1]);
    const end   = parseInt(dayRangeMatch[2]);
    const nouns: { value: string }[] = [];
    for (let d = start; d <= end; d++) {
      nouns.push({ value: `Month Day ${String(d).padStart(2, '0')}` });
    }
    return {
      dayStyle:       'Complex',
      dateAdjective:  'Every',
      dateNouns:      nouns,
      dateQualifier:  { value: 'Year' },
      dateQualifiers: [{ value: 'Year' }],
    };
  }

  // ── Complex: "Monthly 2nd Sunday" / "Monthly Last Business Day" ───────────
  const complexMatch = lower.match(/monthly\s+(1st|2nd|3rd|4th|5th|first|second|third|fourth|fifth|last)\s+(.+)/i);
  if (complexMatch) {
    const ordinal = ORDINALS[complexMatch[1].toLowerCase()] || complexMatch[1];
    const noun    = complexMatch[2].trim();
    // Capitalize first letter of each word
    const nounValue = noun.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
    return {
      dayStyle:       'Complex',
      dateAdjective:  ordinal,
      dateNoun:       { value: nounValue },
      dateNouns:      [{ value: nounValue }],
      dateQualifier:  { value: 'Every Month' },
      dateQualifiers: [{ value: 'Every Month' }],
    };
  }

  // ── Monthly on specific day: "Monthly Day 15" or "Monthly" ────────────────
  const monthlyDayMatch = lower.match(/monthly\s+day\s+(\d+)/i);
  if (monthlyDayMatch) {
    return {
      dayStyle:       'Complex',
      dateAdjective:  'Every',
      dateNouns:      [{ value: `Month Day ${String(parseInt(monthlyDayMatch[1])).padStart(2, '0')}` }],
      dateQualifier:  { value: 'Every Month' },
      dateQualifiers: [{ value: 'Every Month' }],
    };
  }

  if (lower === 'monthly') {
    return { dayStyle: 'Simple', simpleDateType: 'Monthly' };
  }

  // ── Weekly ────────────────────────────────────────────────────────────────
  if (lower === 'weekly') {
    return { dayStyle: 'Simple', simpleDateType: 'Daily' };
  }

  // ── Daily (default) ───────────────────────────────────────────────────────
  if (lower === 'daily' || lower === 'everyday' || lower === 'every day') {
    return { dayStyle: 'Simple', simpleDateType: 'Daily' };
  }

  // ── FREQ= format (already handled by parseScheduleString, but catch here too)
  if (f.startsWith('FREQ=')) {
    return null; // let parseScheduleString handle it
  }

  // Unknown — return null, let the default (Daily) apply
  return null;
}
