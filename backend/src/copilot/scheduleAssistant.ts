/**
 * Scheduling assistant.
 *
 * Two jobs:
 *  1. Turn what a user says ("run every weekday at 8 PM") into the schedule
 *     text the existing builder understands, then into real trigger fields.
 *  2. Read any set of trigger fields back in plain English, so nobody has to
 *     interpret timeStyle / dayStyle / dateQualifiers to know when a job runs.
 *
 * The field generation deliberately reuses buildScheduleFields — the same
 * function job creation uses — so what the Copilot describes is exactly what
 * will be created. No second implementation to drift out of sync.
 */
import { buildScheduleFields, TriggerScheduleFields } from '../utils/triggerSchedule';
import { SCHEDULE_EXAMPLES } from './knowledge/scheduling';

// ── Plain-English rendering ──────────────────────────────────────────────────

const DAY_LABEL: Record<string, string> = {
  mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday',
  fri: 'Friday', sat: 'Saturday', sun: 'Sunday',
};
const DAY_ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

function joinList(items: string[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

function dayPhrase(f: Partial<TriggerScheduleFields>): string {
  if (f.dayStyle === 'Complex') {
    const adj = f.dateAdjective || 'Every';
    const nouns = (f.dateNouns || []).map(n => n.value);
    const quals = (f.dateQualifiers || []).map(q => q.value);

    // "Month Day 24" is UAC's way of saying day-of-month. Rendering it
    // literally ("the every month day 24 of every year") is unreadable, so
    // day-of-month nouns get their own phrasing.
    const monthDays = nouns
      .map(n => n.match(/^Month Day\s*0*(\d{1,2})$/i)?.[1])
      .filter((d): d is string => !!d);

    if (monthDays.length === nouns.length && monthDays.length > 0) {
      const period = quals.some(q => /year/i.test(q)) ? 'month' : (quals[0] || 'month').toLowerCase();
      const dayList = monthDays.length === 1
        ? `day ${monthDays[0]}`
        : `days ${joinList(monthDays)}`;
      return monthDays.length > 2
        ? `on ${dayList} of every ${period}`
        : `on ${dayList} of every ${period}`;
    }

    // Day and month names keep their capitalisation; only the ordinal is lowered.
    const nounText = nouns.length ? joinList(nouns) : 'day';
    const qualText = quals.length ? ` of every ${joinList(quals)}` : '';
    const nth = adj === 'Nth' && f.nthAmount ? `${f.nthAmount}th` : adj;
    // "Every Friday of every Month" reads better without the leading "the".
    return /^every$/i.test(nth)
      ? `every ${nounText}${qualText}`
      : `on the ${nth.toLowerCase()} ${nounText}${qualText}`;
  }

  if (f.dayStyle === 'Every' && f.dayInterval) {
    return `every ${f.dayInterval} day(s)`;
  }

  const named = DAY_ORDER.filter(d => (f as any)[d]);
  if (named.length > 0 && named.length < 7) {
    return `on ${joinList(named.map(d => DAY_LABEL[d]))}`;
  }
  if (f.businessDays || f.simpleDateType === 'Business Days') {
    return 'on business days (Monday to Friday, excluding calendar holidays)';
  }
  if (named.length === 7 || f.simpleDateType === 'Daily' || !f.simpleDateType) {
    return 'every day';
  }
  return `on ${f.simpleDateType.toLowerCase()}`;
}

/** Renders trigger schedule fields as a sentence a non-specialist can check. */
export function describeTriggerFields(f: Partial<TriggerScheduleFields>): string {
  const days = dayPhrase(f);
  const tz = f.timeZone ? ` (${f.timeZone})` : '';

  if (f.timeStyle === 'Interval') {
    const units = (f.timeIntervalUnits || 'Minutes').toLowerCase();
    const amount = f.timeInterval ?? 60;
    const window = f.enabledStart && f.enabledEnd
      ? ` between ${f.enabledStart} and ${f.enabledEnd}`
      : f.enabledStart
        ? ` from ${f.enabledStart} until midnight`
        : '';
    return `Repeats every ${amount} ${units}${window}, ${days}${tz}.`;
  }

  return f.time
    ? `Runs ${days} at ${f.time}${tz}.`
    : `Runs ${days}${tz}, but no time of day was resolved — the trigger needs a time before it will fire.`;
}

/**
 * Same rendering, but from a full trigger payload (which may have come back
 * from UAC or from the preview endpoint rather than from the builder).
 */
export function describeTriggerPayload(trigger: Record<string, any>): string {
  const fields: Partial<TriggerScheduleFields> = {
    timeStyle: trigger.timeStyle,
    time: trigger.time,
    timeInterval: trigger.timeInterval,
    timeIntervalUnits: trigger.timeIntervalUnits,
    timeZone: trigger.timeZone,
    dayStyle: trigger.dayStyle,
    simpleDateType: trigger.simpleDateType,
    businessDays: trigger.businessDays,
    dateAdjective: trigger.dateAdjective,
    dateNouns: trigger.dateNouns,
    dateQualifiers: trigger.dateQualifiers,
    nthAmount: trigger.nthAmount,
    dayInterval: trigger.dayInterval,
    enabledStart: trigger.enabledStart,
    enabledEnd: trigger.enabledEnd,
    restrictedTimes: trigger.restrictedTimes,
  };
  DAY_ORDER.forEach(d => { if (trigger[d]) (fields as any)[d] = true; });

  let text = describeTriggerFields(fields);
  if (trigger.skipBeforeDate) text += ` It will not fire before ${trigger.skipBeforeDate}.`;
  if (trigger.action === 'Do Not Trigger' && trigger.situation === 'Holiday') {
    text += ' Calendar holidays are skipped.';
  }
  if (trigger.skipCondition === 'Active By Trigger') {
    text += ' If the previous run is still going, the next one is skipped rather than stacked.';
  }
  if (trigger.enabled === false) text += ' The trigger is currently disabled, so it will not fire until enabled.';
  return text;
}

// ── Natural language → schedule text ─────────────────────────────────────────

const WORD_NUMBERS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  nine: 9, ten: 10, eleven: 11, twelve: 12, fifteen: 15, twenty: 20, thirty: 30,
  forty: 40, forty5: 45, fortyfive: 45, sixty: 60, half: 30, quarter: 15,
};

const DAY_WORDS: { re: RegExp; key: typeof DAY_ORDER[number] }[] = [
  { re: /\bmon(day)?s?\b/i, key: 'mon' },
  { re: /\btue(s|sday)?s?\b/i, key: 'tue' },
  { re: /\bwed(nesday)?s?\b/i, key: 'wed' },
  { re: /\bthu(r|rs|rsday)?s?\b/i, key: 'thu' },
  { re: /\bfri(day)?s?\b/i, key: 'fri' },
  { re: /\bsat(urday)?s?\b/i, key: 'sat' },
  { re: /\bsun(day)?s?\b/i, key: 'sun' },
];

const MONTH_WORDS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** Extracts a 24-hour HH:MM from a fragment of natural language. */
function findTime(text: string): string | undefined {
  const t = text.toLowerCase();

  if (/\bmidnight\b/.test(t)) return '00:00';
  if (/\b(noon|midday)\b/.test(t)) return '12:00';

  // 8 PM / 8:30pm / 08:30 AM
  const ampm = t.match(/\b(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)\b/);
  if (ampm) {
    let h = parseInt(ampm[1], 10);
    const m = ampm[2] ? parseInt(ampm[2], 10) : 0;
    const isPm = ampm[3].startsWith('p');
    if (isPm && h < 12) h += 12;
    if (!isPm && h === 12) h = 0;
    if (h < 24 && m < 60) return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  // 20:30 / 20.30
  const colon = t.match(/\b(\d{1,2})[:.](\d{2})\b/);
  if (colon) {
    const h = parseInt(colon[1], 10);
    const m = parseInt(colon[2], 10);
    if (h < 24 && m < 60) return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  // "at 1800" / "at 6" — only after an explicit "at", so an interval count
  // like "every 15 minutes" is never mistaken for a time.
  const bare = t.match(/\bat\s+(\d{1,4})\b/);
  if (bare) {
    const raw = bare[1];
    if (raw.length === 4) {
      const h = parseInt(raw.slice(0, 2), 10);
      const m = parseInt(raw.slice(2), 10);
      if (h < 24 && m < 60) return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    } else {
      const h = parseInt(raw, 10);
      if (h < 24) return `${String(h).padStart(2, '0')}:00`;
    }
  }

  return undefined;
}

/** Finds an IANA timezone or a common abbreviation. */
function findTimezone(text: string): string | undefined {
  const iana = text.match(/\b([A-Za-z]+\/[A-Za-z_]+)\b/);
  if (iana) return iana[1];
  const map: Record<string, string> = {
    utc: 'UTC', gmt: 'UTC',
    est: 'America/New_York', edt: 'America/New_York', et: 'America/New_York',
    cst: 'America/Chicago', cdt: 'America/Chicago',
    pst: 'America/Los_Angeles', pdt: 'America/Los_Angeles',
    ist: 'Asia/Kolkata',
    bst: 'Europe/London', uk: 'Europe/London',
  };
  const abbr = text.toLowerCase().match(/\b(utc|gmt|est|edt|et|cst|cdt|pst|pdt|ist|bst|uk)\b/);
  return abbr ? map[abbr[1]] : undefined;
}

function numberBefore(text: string, unitPattern: string): number | undefined {
  const re = new RegExp(`\\b(\\d+|${Object.keys(WORD_NUMBERS).join('|')})\\s*${unitPattern}`, 'i');
  const m = text.match(re);
  if (!m) return undefined;
  const raw = m[1].toLowerCase();
  return /^\d+$/.test(raw) ? parseInt(raw, 10) : WORD_NUMBERS[raw];
}

export interface ScheduleInterpretation {
  /** True when the phrasing was understood well enough to build fields. */
  understood: boolean;
  /** How confident the parse is, 0–1. */
  confidence: number;
  /** The value to put in the Job Starttime / schedule_string column. */
  scheduleString: string;
  /** The value to put in the Scheduled Frequency column. */
  frequency: string;
  timezone?: string;
  endTime?: string;
  /** The resolved trigger fields. */
  fields: TriggerScheduleFields;
  /** Plain-English read-back. */
  summary: string;
  /** How the interpretation was reached, shown so the user can correct it. */
  reasoning: string[];
  /** Follow-up questions when something material is missing. */
  questions: string[];
  /**
   * False when the pattern cannot be expressed in the spreadsheet frequency
   * column, so the fields must be applied to the trigger another way.
   */
  spreadsheetSupported: boolean;
  /** Explains the limitation when spreadsheetSupported is false. */
  caveat?: string;
}

/**
 * Ordinal-weekday monthly patterns ("last Friday of the month") are valid UAC
 * trigger configurations, but the spreadsheet frequency parser has no syntax
 * for them — it only understands day-of-month. Rather than emit a frequency
 * string that would silently misparse into "day 1 of the month", these fields
 * are applied directly and the limitation is reported.
 */
interface ComplexOverride {
  fields: Partial<TriggerScheduleFields>;
  caveat: string;
}

/**
 * Interprets a natural-language schedule request.
 *
 * @param input     What the user said.
 * @param fallbackTz Timezone to assume when the user did not state one.
 */
export function interpretSchedule(input: string, fallbackTz?: string): ScheduleInterpretation {
  const text = (input || '').trim();
  const lower = text.toLowerCase();
  const reasoning: string[] = [];
  const questions: string[] = [];
  let confidence = 0.5;

  const timezone = findTimezone(text) || (fallbackTz || undefined);
  if (findTimezone(text)) {
    reasoning.push(`Timezone "${timezone}" read from the request.`);
    confidence += 0.1;
  } else if (fallbackTz) {
    reasoning.push(`No timezone stated, so the one you used earlier in this session (${fallbackTz}) is assumed.`);
  } else {
    questions.push('Which timezone should this run in? Without one UAC falls back to the controller default, which is rarely what a business schedule intends.');
  }

  // ── Interval? ─────────────────────────────────────────────────────────────
  // Plurals matter here: "every 15 minutes" and "every 2 hours" are the normal
  // phrasings, so the unit pattern has to accept them.
  const isInterval = (/\bevery\b/.test(lower) || /\b(hourly|every other)\b/.test(lower))
    && /\b(mins?|minutes?|hrs?|hours?|secs?|seconds?|hourly)\b/.test(lower)
    && !/\bevery\s+(day|weekday|business|mon|tue|wed|thu|fri|sat|sun|week|month|year)/.test(lower);

  let frequency = '';
  let scheduleString = '';
  let endTime: string | undefined;
  let complexOverride: ComplexOverride | undefined;

  if (isInterval) {
    const minutes = numberBefore(lower, '(?:mins?|minutes?)');
    const hours = numberBefore(lower, '(?:hrs?|hours?)');
    const seconds = numberBefore(lower, '(?:secs?|seconds?)');

    let amount: number;
    let units: string;
    if (minutes !== undefined) { amount = minutes; units = 'minutes'; }
    else if (hours !== undefined) { amount = hours; units = 'hours'; }
    else if (seconds !== undefined) { amount = seconds; units = 'seconds'; }
    else if (/\bevery\s+(half\s*(an\s*)?hour|half-hour)\b/.test(lower)) { amount = 30; units = 'minutes'; }
    else if (/\bhourly\b/.test(lower)) { amount = 1; units = 'hours'; }
    else { amount = 60; units = 'minutes'; }

    frequency = `FREQ=INTERVAL;interval=${amount};units=${units}`;
    reasoning.push(`Interval schedule: every ${amount} ${units}.`);
    confidence += 0.3;

    // Window: "from 06:00 to 22:00" / "between 6am and 10pm" / "until 22:00"
    const windowMatch = lower.match(/\b(?:from|between|starting(?:\s+at)?)\s+(.+?)\s+(?:to|until|till|and|-)\s+([^,.;]+)/);
    if (windowMatch) {
      const start = findTime(`at ${windowMatch[1]}`) || findTime(windowMatch[1]);
      const end = findTime(`at ${windowMatch[2]}`) || findTime(windowMatch[2]);
      if (start && end) {
        scheduleString = start;
        endTime = end;
        reasoning.push(`Confined to a daily window from ${start} to ${end}.`);
        confidence += 0.1;
      }
    }
    if (!scheduleString) {
      const untilOnly = lower.match(/\b(?:until|till)\s+([^,.;]+)/);
      const startOnly = findTime(lower);
      if (startOnly) { scheduleString = startOnly; reasoning.push(`Window starts at ${startOnly}.`); }
      if (untilOnly) {
        const end = findTime(`at ${untilOnly[1]}`) || findTime(untilOnly[1]);
        if (end) { endTime = end; reasoning.push(`Window ends at ${end}.`); }
      }
      if (!scheduleString && !endTime) {
        reasoning.push('No time window given, so the interval runs all day.');
      }
    }
  } else {
    // ── Day pattern ─────────────────────────────────────────────────────────
    const time = findTime(text);
    if (time) {
      scheduleString = time;
      reasoning.push(`Fires at ${time}.`);
      confidence += 0.2;
    } else {
      questions.push('What time of day should it run?');
    }

    const namedDays = DAY_WORDS.filter(d => d.re.test(lower)).map(d => d.key);
    const wantsWeekdays = /\b(weekday|week day|business day|working day|mon(day)?\s*(-|to|through)\s*fri(day)?)\b/.test(lower);
    const wantsWeekend = /\bweekend\b/.test(lower);

    // Monthly / complex patterns.
    const ordinal = lower.match(/\b(first|1st|second|2nd|third|3rd|fourth|4th|last)\b/);
    const monthly = /\b(month|monthly)\b/.test(lower);
    const nthDayOfMonth = lower.match(/\b(?:on\s+the\s+)?(\d{1,2})(?:st|nd|rd|th)\b/);

    if (ordinal && (monthly || namedDays.length > 0 || /\bbusiness day\b/.test(lower))) {
      const map: Record<string, string> = {
        first: '1st', '1st': '1st', second: '2nd', '2nd': '2nd',
        third: '3rd', '3rd': '3rd', fourth: '4th', '4th': '4th', last: 'Last',
      };
      const adj = map[ordinal[1]] || 'Every';
      const noun = namedDays.length
        ? DAY_LABEL[namedDays[0]]
        : /\bbusiness day\b/.test(lower) ? 'Business Day' : 'Day';
      const monthWord = MONTH_WORDS.find(m => new RegExp(`\\b${m}`, 'i').test(lower));
      const qualifier = monthWord && !monthly ? monthWord.charAt(0).toUpperCase() + monthWord.slice(1) : 'Month';

      // The spreadsheet frequency column has no syntax for an ordinal weekday,
      // so build the UAC fields directly and say so.
      complexOverride = {
        fields: {
          dayStyle: 'Complex',
          dateAdjective: adj,
          dateNouns: [{ value: noun }],
          dateQualifiers: [{ value: qualifier }],
          simpleDateType: undefined,
        },
        caveat: `The Scheduled Frequency column cannot express "${adj.toLowerCase()} ${noun.toLowerCase()} of every ${qualifier.toLowerCase()}" — it only understands day-of-month. Set this pattern either by pointing ref_job at an existing job that already has it, or by configuring dateAdjective, dateNouns and dateQualifiers on the trigger after creation. The fields below are the correct UAC configuration.`,
      };
      // Closest supported value, used only so the rest of the row stays valid.
      frequency = 'Monthly';
      reasoning.push(`Monthly pattern: the ${adj.toLowerCase()} ${noun.toLowerCase()} of every ${qualifier.toLowerCase()}.`);
      confidence += 0.25;
    } else if (monthly && nthDayOfMonth) {
      frequency = `FREQ=MONTHLY;INTERVAL=1;byday=${nthDayOfMonth[1]}th`;
      reasoning.push(`Monthly on day ${nthDayOfMonth[1]}.`);
      confidence += 0.25;
    } else if (wantsWeekdays) {
      frequency = 'Weekdays';
      reasoning.push('Business days only — weekends and calendar holidays are skipped.');
      confidence += 0.3;
    } else if (wantsWeekend) {
      frequency = 'Saturday,Sunday';
      reasoning.push('Weekends only.');
      confidence += 0.25;
    } else if (namedDays.length > 0) {
      frequency = namedDays.map(d => DAY_LABEL[d]).join(',');
      reasoning.push(`Specific days: ${joinList(namedDays.map(d => DAY_LABEL[d]))}.`);
      confidence += 0.3;
    } else if (/\b(daily|every day|each day|everyday)\b/.test(lower)) {
      frequency = 'Daily';
      reasoning.push('Runs every day.');
      confidence += 0.3;
    } else if (/\b(week|weekly)\b/.test(lower)) {
      frequency = 'Weekly';
      reasoning.push('Weekly.');
      confidence += 0.15;
      questions.push('Which day of the week?');
    } else {
      frequency = 'Daily';
      reasoning.push('No day pattern recognised, so Daily is assumed — the builder\'s own default.');
      confidence -= 0.1;
    }
  }

  // Build the real fields with the same function job creation uses, then apply
  // any pattern the spreadsheet syntax cannot carry.
  let fields = buildScheduleFields(scheduleString, frequency, scheduleString, timezone || '', endTime || '');
  if (complexOverride) {
    fields = { ...fields, ...complexOverride.fields };
    delete (fields as Partial<TriggerScheduleFields>).simpleDateType;
  }

  const summary = describeTriggerFields(fields);
  const understood = confidence >= 0.55 && (!!fields.time || !!fields.timeInterval || !!fields.dayStyle);

  return {
    understood,
    confidence: Math.max(0, Math.min(1, confidence)),
    scheduleString,
    frequency,
    timezone,
    endTime,
    fields,
    summary,
    reasoning,
    questions,
    spreadsheetSupported: !complexOverride,
    caveat: complexOverride?.caveat,
  };
}

/** Example phrasings, for UI hints and for the "I didn't understand" reply. */
export function scheduleExamples(): string[] {
  return SCHEDULE_EXAMPLES.map(e => e.say);
}
