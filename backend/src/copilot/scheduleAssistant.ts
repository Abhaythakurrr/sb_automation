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
    const amount = f.timeInterval ?? 60;
    const rawUnits = (f.timeIntervalUnits || 'Minutes').toLowerCase();
    // "every 1 hours" reads badly; drop the count and singularise.
    const units = amount === 1 ? rawUnits.replace(/s$/, '') : rawUnits;
    const window = f.enabledStart && f.enabledEnd
      ? ` between ${f.enabledStart} and ${f.enabledEnd}`
      : f.enabledStart
        ? ` from ${f.enabledStart} until midnight`
        : '';
    const every = amount === 1 ? `every ${units}` : `every ${amount} ${units}`;
    return `Repeats ${every}${window}, ${days}${tz}.`;
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

/**
 * Common timezone spellings mapped to IANA names.
 *
 * UAC needs a real IANA zone. An abbreviation like "IST" is ambiguous (India
 * Standard Time and Irish Standard Time both claim it) and is not a value the
 * controller resolves, so anything recognised here is expanded rather than
 * passed through.
 */
const TZ_ALIASES: Record<string, string> = {
  utc: 'UTC', gmt: 'UTC', zulu: 'UTC',
  est: 'America/New_York', edt: 'America/New_York', et: 'America/New_York',
  eastern: 'America/New_York', ny: 'America/New_York', nyc: 'America/New_York',
  cst: 'America/Chicago', cdt: 'America/Chicago', ct: 'America/Chicago', central: 'America/Chicago',
  mst: 'America/Denver', mdt: 'America/Denver', mountain: 'America/Denver',
  pst: 'America/Los_Angeles', pdt: 'America/Los_Angeles', pt: 'America/Los_Angeles', pacific: 'America/Los_Angeles',
  ist: 'Asia/Kolkata', india: 'Asia/Kolkata', kolkata: 'Asia/Kolkata', calcutta: 'Asia/Kolkata',
  bst: 'Europe/London', uk: 'Europe/London', london: 'Europe/London',
  cet: 'Europe/Paris', cest: 'Europe/Paris',
  jst: 'Asia/Tokyo', tokyo: 'Asia/Tokyo',
  sgt: 'Asia/Singapore', singapore: 'Asia/Singapore',
  aest: 'Australia/Sydney', aedt: 'Australia/Sydney', sydney: 'Australia/Sydney',
  brt: 'America/Sao_Paulo',
};

export interface NormalizedTimezone {
  value?: string;
  /** True when an abbreviation was expanded, so the caller can say so. */
  expanded: boolean;
  original?: string;
}

/** Expands a timezone abbreviation to its IANA name. Leaves IANA names alone. */
export function normalizeTimezone(raw?: string): NormalizedTimezone {
  const t = (raw || '').trim();
  if (!t) return { expanded: false };
  if (t.includes('/')) return { value: t, expanded: false, original: t };
  const mapped = TZ_ALIASES[t.toLowerCase()];
  return mapped
    ? { value: mapped, expanded: mapped.toLowerCase() !== t.toLowerCase(), original: t }
    : { value: t, expanded: false, original: t };
}

/** Finds an IANA timezone or a recognised abbreviation in free text. */
function findTimezone(text: string): NormalizedTimezone {
  const iana = text.match(/\b([A-Za-z]+\/[A-Za-z_]+)\b/);
  if (iana) return { value: iana[1], expanded: false, original: iana[1] };

  const alt = Object.keys(TZ_ALIASES).join('|');
  const abbr = text.toLowerCase().match(new RegExp(`\\b(${alt})\\b`));
  if (!abbr) return { expanded: false };
  // "et" and "ct" are short enough to appear inside other words; the word
  // boundary handles that, but a bare "pt"/"et" in prose is still risky, so
  // only trust them when they look like a trailing timezone tag.
  return { value: TZ_ALIASES[abbr[1]], expanded: true, original: abbr[1].toUpperCase() };
}

function numberBefore(text: string, unitPattern: string): number | undefined {
  const re = new RegExp(`\\b(\\d+|${Object.keys(WORD_NUMBERS).join('|')})\\s*${unitPattern}`, 'i');
  const m = text.match(re);
  if (!m) return undefined;
  const raw = m[1].toLowerCase();
  return /^\d+$/.test(raw) ? parseInt(raw, 10) : WORD_NUMBERS[raw];
}

/** Every distinct time mentioned, so multiple times can be detected. */
function findAllTimes(text: string): string[] {
  const found = new Set<string>();
  // Split on connectors and scan each fragment, since findTime returns first-match.
  for (const frag of text.split(/\b(?:and|,|&|\+|then)\b/i)) {
    const t = findTime(frag);
    if (t) found.add(t);
  }
  const whole = findTime(text);
  if (whole) found.add(whole);
  return Array.from(found);
}

// ── Day pattern extraction ───────────────────────────────────────────────────

/**
 * The day dimension of a schedule, extracted independently of the time
 * dimension. Keeping these separate is the point: "every 5 minutes on Monday,
 * Tuesday and Wednesday" has an interval time pattern AND a specific-day
 * pattern, and an earlier version of this parser dropped the days whenever it
 * saw an interval.
 */
type DayKind =
  | 'daily'
  | 'businessDays'
  | 'specificDays'
  | 'monthlyDay'      // day-of-month, e.g. the 24th
  | 'monthlyOrdinal'  // ordinal weekday, e.g. last Friday
  | 'everyNDays'
  | 'unknown';

interface DayPattern {
  kind: DayKind;
  /** Weekday flags, e.g. ['mon','tue','wed']. */
  days: string[];
  /** Days of the month, e.g. [1, 15]. */
  monthDays: number[];
  ordinal?: string;      // '1st' | '2nd' | '3rd' | '4th' | 'Last'
  ordinalNoun?: string;  // 'Friday' | 'Business Day' | 'Day'
  qualifier?: string;    // 'Month' | 'Jan' …
  dayInterval?: number;  // every N days
  reason: string;
}

const ORDINAL_WORDS: Record<string, string> = {
  first: '1st', '1st': '1st',
  second: '2nd', '2nd': '2nd',
  third: '3rd', '3rd': '3rd',
  fourth: '4th', '4th': '4th',
  last: 'Last', final: 'Last',
};

function extractDayPattern(lower: string): DayPattern {
  const empty = { days: [], monthDays: [] };

  // Named weekdays. Deduplicated and returned in week order so
  // "wednesday, monday" reads back as "Monday and Wednesday".
  const named = DAY_WORDS.filter(d => d.re.test(lower)).map(d => d.key);
  const days = DAY_ORDER.filter(d => named.includes(d));

  const wantsWeekdays = /\b(weekday|week day|business day|working day|mon(day)?\s*(-|to|through|thru)\s*fri(day)?)s?\b/.test(lower);
  const wantsWeekend = /\bweekends?\b/.test(lower);
  const monthly = /\b(month|monthly)\b/.test(lower);

  // ── Ordinal weekday / ordinal business day: "last Friday of every month" ──
  //
  // Precedence matters. A *word* ordinal ("last", "first") signals an ordinal
  // pattern. A *numeric* ordinal only does so when it is attached to a weekday
  // or business day — "1st Monday of the month" is ordinal, but "the 1st and
  // 15th" is plain day-of-month and must not collapse to "1st Day".
  const wordOrdinal = lower.match(/\b(first|second|third|fourth|last|final)\b/);
  const numericOrdinal = lower.match(/\b(1st|2nd|3rd|4th)\b/);
  const ordinalTarget = days.length > 0 || /\bbusiness day\b/.test(lower);
  const ordinalMatch = wordOrdinal || (numericOrdinal && ordinalTarget ? numericOrdinal : null);

  if (ordinalMatch && (monthly || ordinalTarget || /\bday\b/.test(lower))) {
    const ordinal = ORDINAL_WORDS[ordinalMatch[1]];
    const ordinalNoun = days.length
      ? DAY_LABEL[days[0]]
      : /\bbusiness day\b/.test(lower) ? 'Business Day' : 'Day';
    const monthWord = MONTH_WORDS.find(m => new RegExp(`\\b${m}`, 'i').test(lower));
    const qualifier = monthWord && !monthly
      ? monthWord.charAt(0).toUpperCase() + monthWord.slice(1)
      : 'Month';
    return {
      ...empty, kind: 'monthlyOrdinal', ordinal, ordinalNoun, qualifier,
      reason: `Monthly pattern: the ${ordinal.toLowerCase()} ${ordinalNoun.toLowerCase()} of every ${qualifier.toLowerCase()}.`,
    };
  }

  // ── Day-of-month: "on the 24th", "on the 1st and 15th of every month" ──────
  if (monthly || /\b\d{1,2}(st|nd|rd|th)\b/.test(lower)) {
    const nums = Array.from(lower.matchAll(/\b(\d{1,2})(?:st|nd|rd|th)\b/g))
      .map(m => parseInt(m[1], 10))
      .filter(n => n >= 1 && n <= 31);
    const dayOf = Array.from(lower.matchAll(/\bday\s+(\d{1,2})\b/g))
      .map(m => parseInt(m[1], 10))
      .filter(n => n >= 1 && n <= 31);
    const monthDays = Array.from(new Set([...nums, ...dayOf])).sort((a, b) => a - b);
    if (monthDays.length > 0) {
      return {
        ...empty, kind: 'monthlyDay', monthDays,
        reason: monthDays.length === 1
          ? `Monthly on day ${monthDays[0]}.`
          : `Monthly on days ${monthDays.join(', ')}.`,
      };
    }
    if (monthly) {
      return { ...empty, kind: 'monthlyDay', monthDays: [1], reason: 'Monthly — no day given, so day 1 is assumed.' };
    }
  }

  // ── Every N days / weeks ──────────────────────────────────────────────────
  const everyOtherDay = /\bevery\s+other\s+day\b/.test(lower);
  const nDays = numberBefore(lower, '(?:days?)');
  const nWeeks = numberBefore(lower, '(?:weeks?)');
  const everyOtherWeek = /\bevery\s+other\s+week\b|\bbi-?weekly\b|\bfortnight/.test(lower);
  if (everyOtherDay || everyOtherWeek || (nDays && nDays > 1 && /\bevery\b/.test(lower)) || (nWeeks && nWeeks > 1)) {
    const interval = everyOtherDay ? 2
      : everyOtherWeek ? 14
        : nWeeks && nWeeks > 1 ? nWeeks * 7
          : nDays!;
    return {
      ...empty, kind: 'everyNDays', dayInterval: interval,
      reason: `Runs every ${interval} day(s) counting from the start date.`,
    };
  }

  if (wantsWeekdays) {
    return { ...empty, kind: 'businessDays', reason: 'Business days only — weekends and calendar holidays are skipped.' };
  }
  if (wantsWeekend) {
    return { ...empty, kind: 'specificDays', days: ['sat', 'sun'], reason: 'Weekends only.' };
  }
  if (days.length > 0) {
    return {
      ...empty, kind: 'specificDays', days,
      reason: `Specific days: ${joinList(days.map(d => DAY_LABEL[d]))}.`,
    };
  }
  // "every day", "daily", and the time-of-day forms people actually use.
  if (/\b(daily|every\s*day|each\s*day|everyday|every\s+(morning|night|evening|afternoon|midnight|noon))\b/.test(lower)) {
    return { ...empty, kind: 'daily', reason: 'Runs every day.' };
  }
  if (/\b(weekly|every\s+week)\b/.test(lower)) {
    return { ...empty, kind: 'unknown', reason: 'Weekly, but no day of the week was given.' };
  }
  return { ...empty, kind: 'unknown', reason: '' };
}

/** Renders a day pattern as the `byday=` value the trigger builder parses. */
function bydayToken(p: DayPattern): string | undefined {
  if (p.kind === 'businessDays') return 'weekdays';
  if (p.kind === 'specificDays' && p.days.length) {
    return p.days.map(d => d.charAt(0).toUpperCase() + d.slice(1)).join(',');
  }
  return undefined;
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

  // ── Timezone ──────────────────────────────────────────────────────────────
  const stated = findTimezone(text);
  const fallback = normalizeTimezone(fallbackTz);
  const tz = stated.value ? stated : fallback;
  const timezone = tz.value;

  if (stated.value) {
    reasoning.push(stated.expanded
      ? `Timezone: "${stated.original}" expanded to ${stated.value} — UAC needs an IANA zone, and abbreviations like ${stated.original} are ambiguous.`
      : `Timezone ${stated.value} read from the request.`);
    confidence += 0.1;
  } else if (fallback.value) {
    reasoning.push(fallback.expanded
      ? `No timezone stated. Using ${fallback.value}, expanded from the "${fallback.original}" you used earlier in this session.`
      : `No timezone stated, so the one you used earlier in this session (${fallback.value}) is assumed.`);
  } else {
    questions.push('Which timezone should this run in? Without one UAC falls back to the controller default, which is rarely what a business schedule intends.');
  }

  // ── Day pattern, extracted independently of the time pattern ──────────────
  // This is the whole point of the split: a schedule can be an interval AND be
  // restricted to specific days. Deriving the two separately means neither can
  // swallow the other.
  const dayPattern = extractDayPattern(lower);

  // ── Interval? ─────────────────────────────────────────────────────────────
  // Plurals matter here: "every 15 minutes" and "every 2 hours" are the normal
  // phrasings, so the unit pattern has to accept them. The exclusion only
  // covers day/week/month words directly after "every", so "every 5 minutes of
  // Monday" is still correctly read as an interval.
  const isInterval = (/\bevery\b/.test(lower) || /\b(hourly|every other hour)\b/.test(lower))
    && /\b(mins?|minutes?|hrs?|hours?|secs?|seconds?|hourly)\b/.test(lower)
    && !/\bevery\s+(day|weekday|business|week|month|year)\b/.test(lower);

  let frequency = '';
  let scheduleString = '';
  let endTime: string | undefined;
  let complexOverride: ComplexOverride | undefined;

  // Multiple distinct times cannot be expressed by one UAC time trigger.
  const allTimes = findAllTimes(text);
  const windowPhrase = /\b(from|between|until|till|starting)\b/.test(lower);
  if (!isInterval && allTimes.length > 1 && !windowPhrase) {
    questions.push(`You mentioned ${allTimes.length} times (${allTimes.join(', ')}). A single UAC time trigger fires at one time, so this needs either an interval, or one job per time, or separate triggers on the same task. I have used ${allTimes[0]}.`);
    confidence -= 0.1;
  }

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
    else if (/\bevery\s+other\s+hour\b/.test(lower)) { amount = 2; units = 'hours'; }
    else if (/\bhourly\b/.test(lower)) { amount = 1; units = 'hours'; }
    else { amount = 60; units = 'minutes'; }

    frequency = `FREQ=INTERVAL;interval=${amount};units=${units}`;
    reasoning.push(`Interval schedule: every ${amount} ${units}.`);
    confidence += 0.3;

    // Restrict the interval to the requested days. The trigger builder already
    // understands byday= and monthday= on a FREQ=INTERVAL string, so these
    // flow straight through instead of needing an override.
    const byday = bydayToken(dayPattern);
    if (byday) {
      frequency += `;byday=${byday}`;
      reasoning.push(dayPattern.reason);
      confidence += 0.15;
    } else if (dayPattern.kind === 'monthlyDay' && dayPattern.monthDays.length === 1) {
      frequency += `;monthday=${dayPattern.monthDays[0]}`;
      reasoning.push(`${dayPattern.reason} The interval repeats within that day.`);
      confidence += 0.1;
    } else if (dayPattern.kind === 'daily') {
      reasoning.push('Runs every day.');
      confidence += 0.05;
    } else if (dayPattern.kind === 'monthlyOrdinal' || dayPattern.kind === 'everyNDays'
      || (dayPattern.kind === 'monthlyDay' && dayPattern.monthDays.length > 1)) {
      // An interval combined with a complex day pattern is expressible in UAC
      // but not in the frequency column; flag rather than silently drop it.
      questions.push(`I read the timing as an interval, but "${dayPattern.reason.replace(/\.$/, '')}" is a complex day pattern. Combining the two needs the day fields set on the trigger directly — confirm that is what you want.`);
    } else {
      reasoning.push('No day restriction given, so the interval runs on every day.');
    }

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

    switch (dayPattern.kind) {
      case 'monthlyOrdinal': {
        // The spreadsheet frequency column has no syntax for an ordinal
        // weekday, so build the UAC fields directly and say so.
        const { ordinal, ordinalNoun, qualifier } = dayPattern;
        complexOverride = {
          fields: {
            dayStyle: 'Complex',
            dateAdjective: ordinal,
            dateNouns: [{ value: ordinalNoun! }],
            dateQualifiers: [{ value: qualifier! }],
            simpleDateType: undefined,
          },
          caveat: `The Scheduled Frequency column cannot express "${ordinal!.toLowerCase()} ${ordinalNoun!.toLowerCase()} of every ${qualifier!.toLowerCase()}" — it only understands day-of-month. Set this pattern either by pointing ref_job at an existing job that already has it, or by configuring dateAdjective, dateNouns and dateQualifiers on the trigger after creation. The fields below are the correct UAC configuration.`,
        };
        frequency = 'Monthly'; // closest supported value, keeps the row valid
        reasoning.push(dayPattern.reason);
        confidence += 0.25;
        break;
      }

      case 'monthlyDay': {
        if (dayPattern.monthDays.length === 1) {
          frequency = `FREQ=MONTHLY;INTERVAL=1;byday=${dayPattern.monthDays[0]}th`;
        } else {
          // Several days of the month: valid in UAC as multiple dateNouns, but
          // the frequency column carries only one.
          frequency = `FREQ=MONTHLY;INTERVAL=1;byday=${dayPattern.monthDays[0]}th`;
          complexOverride = {
            fields: {
              dayStyle: 'Complex',
              dateAdjective: 'Every',
              dateNouns: dayPattern.monthDays.map(d => ({ value: `Month Day ${String(d).padStart(2, '0')}` })),
              dateQualifiers: [{ value: 'Month' }],
              simpleDateType: undefined,
            },
            caveat: `The Scheduled Frequency column carries a single day of the month, so days ${dayPattern.monthDays.join(', ')} cannot be expressed there. The dateNouns below are the correct UAC configuration — set them on the trigger, or inherit from a ref_job that already has this pattern.`,
          };
        }
        reasoning.push(dayPattern.reason);
        confidence += 0.25;
        break;
      }

      case 'everyNDays': {
        complexOverride = {
          fields: {
            dayStyle: 'Every',
            dayInterval: dayPattern.dayInterval,
            simpleDateType: undefined,
          },
          caveat: `"Every ${dayPattern.dayInterval} days" uses UAC's Every day style with dayInterval, which the Scheduled Frequency column has no syntax for. Set dayStyle and dayInterval on the trigger, and give the job a first run date so the count has a starting point.`,
        };
        frequency = 'Daily';
        reasoning.push(dayPattern.reason);
        confidence += 0.2;
        break;
      }

      case 'businessDays':
        frequency = 'Weekdays';
        reasoning.push(dayPattern.reason);
        confidence += 0.3;
        break;

      case 'specificDays':
        frequency = dayPattern.days.map(d => DAY_LABEL[d]).join(',');
        reasoning.push(dayPattern.reason);
        confidence += 0.3;
        break;

      case 'daily':
        frequency = 'Daily';
        reasoning.push(dayPattern.reason);
        confidence += 0.3;
        break;

      default:
        frequency = 'Daily';
        if (dayPattern.reason) {
          reasoning.push(dayPattern.reason);
          questions.push('Which day or days of the week?');
          confidence += 0.15;
        } else {
          reasoning.push('No day pattern recognised, so Daily is assumed — the builder\'s own default.');
          confidence -= 0.1;
        }
        break;
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
