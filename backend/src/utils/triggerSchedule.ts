/**
 * Trigger Schedule Builder
 * 
 * Converts client input (Job Starttime + Scheduled Frequency) into
 * UAC Time Trigger API fields.
 * 
 * UAC Time Trigger has 3 sections:
 * 
 * 1. TIME DETAILS (timeStyle)
 *    - "Time" (Absolute): triggers at a specific time → requires `time` (HH:MM)
 *    - "Time Interval": triggers at intervals → requires `timeInterval` + `timeIntervalUnits`
 *      Optional: `enabledStart`, `enabledEnd`, `restrictedTimes`
 * 
 * 2. DAY DETAILS (dayStyle)
 *    - "Simple": daily, business days, or specific weekdays
 *      Fields: `simpleDateType: "Daily"`, day flags (mon, tue, ..., businessDays)
 *    - "Complex": formula-based (monthly, nth day, etc.)
 *      Fields: `dateAdjective`, `dateNouns[]`, `dateQualifiers[]`
 *      dateAdjective: "Every" | "1st" | "2nd" | "3rd" | "4th" | "Last" | "Nth"
 *      dateNouns: [{ value: "Month Day 24" }] or [{ value: "Monday" }] or [{ value: "Business Day" }]
 *      dateQualifiers: [{ value: "Year" }] or [{ value: "Month" }] or [{ value: "Jan" }] etc.
 *    - "Every": run every N days from a start date
 *      Fields: `dayInterval`, `intervalStartingDate`
 * 
 * 3. RESTRICTIONS (for intervals)
 *    - `restrictedTimes: true`, `enabledStart`, `enabledEnd`
 * 
 * CLIENT INPUT FORMATS:
 *   Job Starttime:
 *     "AT 1800 TIMEZONE America/New_York"
 *     "AT 0600 EVERY 0030 UNTIL 2200 TIMEZONE UTC"
 *     "Daily at 03:30 Asia/Kolkata"
 *     "Monday at 08:00 UTC"
 *     "Every 15 minutes from 06:00 to 22:00 Asia/Kolkata"
 *     "1600" (bare time)
 *   
 *   Scheduled Frequency:
 *     "FREQ=MONTHLY;INTERVAL=1;byday=24th"
 *     "FREQ=DAILY"
 *     "FREQ=WEEKLY;byday=Mon,Wed,Fri"
 *     "Daily"
 *     "Weekdays"
 *     "Monday,Wednesday,Friday"
 *     "Monthly"
 *     (empty — defaults to Daily)
 */

export interface TriggerScheduleFields {
  // Time details
  timeStyle?: string;         // "Absolute" or "Interval"
  time?: string;              // HH:MM (for Absolute)
  timeInterval?: number;      // interval amount (for Interval)
  timeIntervalUnits?: string; // "Minutes" | "Hours" | "Seconds"
  timeZone?: string;

  // Day details
  dayStyle?: string;          // "Simple" | "Complex" | "Every"
  simpleDateType?: string;    // "Daily" (only for Simple)
  // Day flags (Simple with specific days)
  mon?: boolean; tue?: boolean; wed?: boolean; thu?: boolean;
  fri?: boolean; sat?: boolean; sun?: boolean;
  businessDays?: boolean;
  // Complex fields
  dateAdjective?: string;
  dateNouns?: { value: string }[];
  dateQualifiers?: { value: string }[];
  nthAmount?: number;
  dateAdjustment?: string;
  adjustmentAmount?: number;
  adjustmentType?: string;
  // Every fields
  dayInterval?: number;

  // Restrictions (interval time windows)
  restrictedTimes?: boolean;
  enabledStart?: string;      // HH:MM
  enabledEnd?: string;        // HH:MM
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function toHHMM(raw: string): string {
  const s = raw.trim();
  if (/^\d{4}$/.test(s)) return s.slice(0, 2) + ':' + s.slice(2, 4);
  if (/^\d{1,2}:\d{2}$/.test(s)) return s.padStart(5, '0');
  return s;
}

function parseHHMMtoMinutes(hhmm: string): number {
  const h = parseInt(hhmm.slice(0, 2));
  const m = parseInt(hhmm.slice(2, 4));
  return h * 60 + m;
}

const DAY_MAP: Record<string, string> = {
  monday: 'mon', tuesday: 'tue', wednesday: 'wed', thursday: 'thu',
  friday: 'fri', saturday: 'sat', sunday: 'sun',
  mon: 'mon', tue: 'tue', wed: 'wed', thu: 'thu',
  fri: 'fri', sat: 'sat', sun: 'sun',
};

// ── Parse Time (from Job Starttime) ──────────────────────────────────────────

function parseTimeInput(starttime: string): Partial<TriggerScheduleFields> {
  if (!starttime) return {};
  const result: Partial<TriggerScheduleFields> = {};

  // Extract timezone from anywhere in the string
  const tzMatch = starttime.match(/((?:Asia|Europe|America|Pacific|Africa|Australia)\/[\w\/]+|UTC|GMT)/i);
  if (tzMatch) result.timeZone = tzMatch[1];

  // AT HHMM format
  const atMatch = starttime.match(/AT\s+(\d{4})/i);
  if (atMatch) {
    const time = toHHMM(atMatch[1]);

    // Check for EVERY (interval)
    const everyMatch = starttime.match(/EVERY\s+(\d{4})/i);
    if (everyMatch) {
      const mins = parseHHMMtoMinutes(everyMatch[1]);
      result.timeStyle = 'Interval';
      result.timeInterval = mins >= 60 && mins % 60 === 0 ? mins / 60 : mins;
      result.timeIntervalUnits = mins >= 60 && mins % 60 === 0 ? 'Hours' : 'Minutes';
      result.enabledStart = time;

      // Check for UNTIL (end time)
      const untilMatch = starttime.match(/UNTIL\s+(\d{4})/i);
      if (untilMatch) {
        result.enabledEnd = toHHMM(untilMatch[1]);
        result.restrictedTimes = true;
      }
    } else {
      // Simple absolute time
      result.timeStyle = 'Absolute';
      result.time = time;
    }
    return result;
  }

  // Natural language: "at HH:MM"
  const atNatural = starttime.match(/at\s+(\d{1,2}):(\d{2})/i);
  if (atNatural) {
    result.time = atNatural[1].padStart(2, '0') + ':' + atNatural[2];
  }

  // Natural language: "every N minutes/hours"
  const everyNatural = starttime.match(/every\s+(\d+)\s*(min|mins|minutes?|hr|hrs|hours?|sec|secs|seconds?)/i);
  if (everyNatural) {
    const amount = parseInt(everyNatural[1]);
    const unit = everyNatural[2].toLowerCase();
    result.timeStyle = 'Interval';
    result.timeInterval = amount;
    result.timeIntervalUnits = unit.startsWith('h') ? 'Hours' : unit.startsWith('s') ? 'Seconds' : 'Minutes';
  }

  // Window: "from HH:MM to HH:MM"
  const windowMatch = starttime.match(/from\s+(\d{1,2}:\d{2})\s+to\s+(\d{1,2}:\d{2})/i);
  if (windowMatch) {
    result.enabledStart = windowMatch[1].padStart(5, '0');
    result.enabledEnd = windowMatch[2].padStart(5, '0');
    result.restrictedTimes = true;
  }

  // If we have time but no timeStyle yet, it's absolute
  if (result.time && !result.timeStyle) {
    result.timeStyle = 'Absolute';
  }

  // Bare HHMM or HH:MM (just a time value)
  if (!result.time && !result.timeStyle) {
    const bare = starttime.trim();
    if (/^\d{4}$/.test(bare) || /^\d{1,2}:\d{2}$/.test(bare)) {
      result.timeStyle = 'Absolute';
      result.time = toHHMM(bare);
    }
  }

  return result;
}

// ── Parse Frequency (from Scheduled Frequency) ───────────────────────────────

function parseFrequencyInput(frequency: string): Partial<TriggerScheduleFields> {
  if (!frequency) return { dayStyle: 'Simple', simpleDateType: 'Daily' };

  const lower = frequency.trim().toLowerCase();

  // ── FREQ= format ──
  if (frequency.toUpperCase().startsWith('FREQ=')) {
    const freqType = frequency.match(/FREQ=([^;]+)/i)?.[1]?.toUpperCase() || 'DAILY';

    if (freqType === 'MONTHLY') {
      // Extract day of month: byday=24th, byday=24, byday=5
      const byDay = frequency.match(/byday=(\d+)/i);
      const dayNum = byDay ? String(parseInt(byDay[1])).padStart(2, '0') : '01';
      return {
        dayStyle: 'Complex',
        dateAdjective: 'Every',
        dateNouns: [{ value: `Month Day ${dayNum}` }],
        dateQualifiers: [{ value: 'Year' }],
      };
    }

    if (freqType === 'WEEKLY') {
      // Extract days: byday=Mon,Wed,Fri
      const byDay = frequency.match(/byday=([^;]+)/i)?.[1] || '';
      const result: Partial<TriggerScheduleFields> = { dayStyle: 'Simple', simpleDateType: 'Daily' };
      const days = byDay.split(',').map(d => DAY_MAP[d.trim().toLowerCase()]).filter(Boolean);
      if (days.length > 0) {
        days.forEach(d => { (result as any)[d] = true; });
      }
      return result;
    }

    // FREQ=DAILY or unknown → daily
    return { dayStyle: 'Simple', simpleDateType: 'Daily' };
  }

  // ── Natural language ──

  // "Monthly" or "Monthly Day 24"
  if (lower.startsWith('monthly')) {
    const dayMatch = lower.match(/day\s*(\d+)/);
    const dayNum = dayMatch ? String(parseInt(dayMatch[1])).padStart(2, '0') : '01';
    return {
      dayStyle: 'Complex',
      dateAdjective: 'Every',
      dateNouns: [{ value: `Month Day ${dayNum}` }],
      dateQualifiers: [{ value: 'Year' }],
    };
  }

  // "Weekdays" / "Business Days" / "Mon-Fri"
  if (lower === 'weekdays' || lower === 'business days' || lower === 'businessdays' || lower === 'mon-fri') {
    return {
      dayStyle: 'Simple', simpleDateType: 'Daily',
      mon: true, tue: true, wed: true, thu: true, fri: true,
    };
  }

  // "Daily" / "Everyday"
  if (lower === 'daily' || lower === 'everyday' || lower === 'every day') {
    return { dayStyle: 'Simple', simpleDateType: 'Daily' };
  }

  // Specific days: "Monday", "Mon,Wed,Fri", "Monday,Friday"
  const parts = lower.split(/[,\s]+/).map(p => DAY_MAP[p]).filter(Boolean);
  if (parts.length > 0) {
    const result: Partial<TriggerScheduleFields> = { dayStyle: 'Simple', simpleDateType: 'Daily' };
    parts.forEach(d => { (result as any)[d] = true; });
    return result;
  }

  // Default: daily
  return { dayStyle: 'Simple', simpleDateType: 'Daily' };
}

// ── Main: Build Schedule Fields ──────────────────────────────────────────────

export function buildScheduleFields(
  starttime: string,   // Job Starttime field (time + optionally days)
  frequency: string,   // Scheduled Frequency field
  rawTime?: string,    // start_time (separate HH:MM field)
  rawTz?: string,      // timezone (separate field)
): TriggerScheduleFields {
  // 1. Parse time from Job Starttime
  const timeFields = parseTimeInput(starttime);

  // 2. Parse frequency/day pattern
  const dayFields = parseFrequencyInput(frequency);

  // 3. Merge — time fields take priority, day fields fill in the day pattern
  const result: TriggerScheduleFields = { ...dayFields, ...timeFields };

  // 4. If Job Starttime also contained day names (e.g. "Monday at 08:00"), override day pattern
  if (starttime && !starttime.toUpperCase().startsWith('AT ') && !starttime.startsWith('FREQ=')) {
    const lower = starttime.toLowerCase();
    const foundDays: string[] = [];
    for (const [name, short] of Object.entries(DAY_MAP)) {
      if (name.length > 3 && lower.includes(name) && !foundDays.includes(short)) foundDays.push(short);
    }
    if (lower.includes('weekday') || lower.includes('business day')) {
      result.dayStyle = 'Simple';
      result.simpleDateType = 'Daily';
      result.mon = true; result.tue = true; result.wed = true; result.thu = true; result.fri = true;
    } else if (foundDays.length > 0 && !result.dateNouns) {
      result.dayStyle = 'Simple';
      result.simpleDateType = 'Daily';
      foundDays.forEach(d => { (result as any)[d] = true; });
    }
  }

  // 5. Fallbacks from separate fields
  if (!result.timeZone && rawTz) {
    result.timeZone = rawTz.replace(/^TIMEZONE\s+/i, '').trim();
  }
  if (!result.time && !result.timeInterval && rawTime) {
    result.timeStyle = 'Absolute';
    result.time = toHHMM(rawTime);
  }

  return result;
}
