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
