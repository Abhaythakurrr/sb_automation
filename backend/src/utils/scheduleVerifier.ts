/**
 * Schedule Verifier
 *
 * Lightweight ML-like schedule intent extractor that cross-validates
 * parser output against the job description to catch mismatches.
 *
 * Flow:
 *   1. Extract schedule intent from job description text
 *   2. Compare against what the field-based parser produced
 *   3. If mismatch detected, auto-correct (high confidence) or warn
 *
 * Designed to run in < 5ms per job.
 */

interface ScheduleIntent {
  type: 'daily' | 'business_days' | 'specific_days' | 'monthly' | 'monthly_ordinal' | 'interval' | 'unknown';
  days?: string[];
  time?: string;
  interval?: { amount: number; unit: string };
  window?: { start: string; end: string };
  monthDay?: number;
  /** For monthly_ordinal: 1st | 2nd | 3rd | 4th | Last. */
  ordinal?: string;
  /** For monthly_ordinal: the weekday or "Business Day" being counted. */
  ordinalNoun?: string;
  confidence: number;
}

const ORDINAL_WORDS: Record<string, string> = {
  first: '1st', '1st': '1st',
  second: '2nd', '2nd': '2nd',
  third: '3rd', '3rd': '3rd',
  fourth: '4th', '4th': '4th',
  fifth: 'Nth', last: 'Last', final: 'Last',
};

const DAY_TITLES: Record<string, string> = {
  mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday',
  fri: 'Friday', sat: 'Saturday', sun: 'Sunday',
};

const DAY_ALIASES: Record<string, string> = {
  mon: 'mon', monday: 'mon',
  tue: 'tue', tuesday: 'tue',
  wed: 'wed', wednesday: 'wed',
  thu: 'thu', thursday: 'thu',
  fri: 'fri', friday: 'fri',
  sat: 'sat', saturday: 'sat',
  sun: 'sun', sunday: 'sun',
};

function extractDayNames(text: string): string[] {
  const lower = text.toLowerCase();
  const found: string[] = [];
  for (const [alias, short] of Object.entries(DAY_ALIASES)) {
    if (alias.length > 3 && new RegExp(`\\b${alias}\\b`).test(lower) && !found.includes(short)) {
      found.push(short);
    }
  }
  return found;
}

function extractScheduleIntent(description: string): ScheduleIntent {
  if (!description) return { type: 'unknown', confidence: 0 };

  const lower = description.toLowerCase();

  // ── Business days ──
  if (/\bbusiness\s*days?\b|\bweekdays?\b|\bworking\s*days?\b|\bmon\s*[-–]?\s*fri\b|\bmon(day)?\s*(?:to|through|thru|[-–])\s*fri(day)?\b/i.test(lower)) {
    return { type: 'business_days', confidence: 0.95 };
  }

  // ── Interval patterns ──
  const intervalMatch = lower.match(/every\s+(\d+)\s*(minutes?|mins?|hours?|hrs?)/i);
  if (intervalMatch) {
    const amount = parseInt(intervalMatch[1]);
    const unit = intervalMatch[2].toLowerCase().startsWith('h') ? 'Hours' : 'Minutes';
    const result: ScheduleIntent = {
      type: 'interval',
      interval: { amount, unit },
      confidence: 0.92,
    };
    const windowMatch = lower.match(/(?:from|between)\s+(\d{1,2}:\d{2})\s+(?:to|and|until)\s+(\d{1,2}:\d{2})/i);
    if (windowMatch) {
      result.window = { start: windowMatch[1], end: windowMatch[2] };
      result.confidence = 0.96;
    }
    // Check for days in the description for interval
    const days = extractDayNames(lower);
    if (days.length > 0) {
      result.days = days;
    }
    return result;
  }

  // ── Monthly patterns ──
  const monthlyMatch = lower.match(/monthly\s+day\s+(\d+)/i) || lower.match(/day\s+(\d+).*month/i);
  if (monthlyMatch) {
    return {
      type: 'monthly',
      monthDay: parseInt(monthlyMatch[1]),
      confidence: 0.94,
    };
  }
  if (/\bmonthly\b/.test(lower)) {
    return { type: 'monthly', confidence: 0.85 };
  }

  // ── Ordinal weekday of the month ──
  //
  // This check MUST precede the specific-days check. "The first Wednesday of
  // every month" contains a weekday name, so the specific-days branch used to
  // claim it and rewrite the trigger to fire every Wednesday — turning a monthly
  // job into a weekly one, roughly a 4x over-execution, with the description
  // still reading correctly. Found by the bulk simulation.
  const ordinalMatch = lower.match(/\b(first|second|third|fourth|fifth|last|final|1st|2nd|3rd|4th)\s+(?:(mon|tue|wed|thu|fri|sat|sun)[a-z]*|(business\s*day|working\s*day|day))\b/);
  if (ordinalMatch && /\bmonth\b|\bmonthly\b/.test(lower)) {
    const ordinal = ORDINAL_WORDS[ordinalMatch[1]] || 'Every';
    const noun = ordinalMatch[2]
      ? DAY_TITLES[ordinalMatch[2]]
      : /business|working/.test(ordinalMatch[3] || '') ? 'Business Day' : 'Day';
    return { type: 'monthly_ordinal', ordinal, ordinalNoun: noun, confidence: 0.94 };
  }

  // ── Specific days ──
  const days = extractDayNames(lower);

  // All five weekdays and no weekend day means business days, however the
  // description spells it out. Treating "Monday, Tuesday, Wednesday, Thursday,
  // Friday" as five individual flags looks equivalent but is not: individual
  // flags fire on public holidays, whereas Business Days consults the calendar
  // and skips them. The bulk simulation caught this downgrading a correctly
  // parsed Business Days trigger.
  const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri'];
  if (WEEKDAYS.every(d => days.includes(d)) && !days.includes('sat') && !days.includes('sun')) {
    return { type: 'business_days', confidence: 0.95 };
  }

  if (days.length > 0) {
    // A weekday name alongside month wording is a monthly pattern the ordinal
    // branch above did not recognise. Correcting day flags here would again
    // produce a weekly trigger, so leave it to the parser and stay silent.
    if (/\bmonth\b|\bmonthly\b/.test(lower)) {
      return { type: 'unknown', confidence: 0 };
    }
    return {
      type: 'specific_days',
      days,
      confidence: 0.93,
    };
  }

  // ── Daily ──
  if (/\bdaily\b|\bevery\s*day\b|\beveryday\b/.test(lower)) {
    return { type: 'daily', confidence: 0.90 };
  }

  return { type: 'unknown', confidence: 0 };
}

export interface ScheduleVerificationResult {
  match: boolean;
  intent: ScheduleIntent;
  corrections?: {
    field: string;
    from: any;
    to: any;
    reason: string;
  }[];
  confidence: number;
}

export function verifySchedule(
  description: string,
  frequency: string,
  parsedFields: { dayStyle?: string; simpleDateType?: string; mon?: boolean; tue?: boolean; wed?: boolean; thu?: boolean; fri?: boolean; sat?: boolean; sun?: boolean; timeStyle?: string; timeInterval?: number; dateNouns?: { value: string }[] },
): ScheduleVerificationResult {
  const intent = extractScheduleIntent(description);
  const corrections: { field: string; from: any; to: any; reason: string }[] = [];

  if (intent.type === 'unknown' || intent.confidence < 0.7) {
    return { match: true, intent, confidence: intent.confidence };
  }

  // Build a fingerprint of what the parser produced
  const parsedDays = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].filter(d => (parsedFields as any)[d]);
  const parsedSimpleDateType = parsedFields.simpleDateType;
  const parsedDayStyle = parsedFields.dayStyle;

  // ── Check Daily match ──
  if (intent.type === 'daily' && parsedSimpleDateType === 'Daily') {
    return { match: true, intent, confidence: intent.confidence };
  }

  // ── Check Business Days match ──
  if (intent.type === 'business_days') {
    if (parsedSimpleDateType === 'Business Days' || (parsedFields as any).businessDays) {
      return { match: true, intent, confidence: intent.confidence };
    }

    // Correct when the parser produced the five weekday flags, or no day
    // pattern at all.
    //
    // The previous guard also required simpleDateType to be unset, which meant a
    // frequency column spelling out "Monday,Tuesday,Wednesday,Thursday,Friday"
    // was left as five literal flags even though the description said business
    // days. The two are not equivalent: literal flags fire on public holidays,
    // Business Days consults the calendar and skips them.
    const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri'];
    const isWeekdaySet = WEEKDAYS.every(d => parsedDays.includes(d))
      && !parsedDays.includes('sat') && !parsedDays.includes('sun');

    if (isWeekdaySet || parsedDays.length === 0) {
      corrections.push({
        field: 'simpleDateType',
        from: parsedSimpleDateType ?? (parsedDays.join(',') || undefined),
        to: 'Business Days',
        reason: `Description says "${description}" → Business Days, which skips calendar holidays, rather than literal day flags which do not`,
      });
    }
    // A partial weekday set (Mon,Wed,Fri) is left alone: the description saying
    // "weekdays" is weaker evidence than an explicit list of days.
    return { match: corrections.length === 0, intent, corrections, confidence: intent.confidence };
  }

  // ── Check specific days match ──
  if (intent.type === 'specific_days' && intent.days) {
    const matchedDays = intent.days.filter(d => parsedDays.includes(d));
    const missingDays = intent.days.filter(d => !parsedDays.includes(d));
    const extraDays = parsedDays.filter(d => !intent.days!.includes(d));

    if (missingDays.length === 0 && extraDays.length === 0 && parsedSimpleDateType !== 'Daily') {
      return { match: true, intent, confidence: intent.confidence };
    }

    // Mismatch — correct the day flags
    if (missingDays.length > 0 || extraDays.length > 0 || parsedSimpleDateType === 'Daily') {
      // Remove all existing day flags
      corrections.push({
        field: 'days',
        from: parsedDays.join(',') || 'Daily/all',
        to: intent.days.join(','),
        reason: `Description specifies "${intent.days.join(', ')}", overriding parser result`,
      });
    }
    return { match: false, intent, corrections, confidence: intent.confidence };
  }

  // ── Check ordinal-weekday-of-month match ──
  // The Scheduled Frequency column has no syntax for this pattern, so the
  // parser can only ever produce "Monthly day 1" from it. The description is the
  // only place the real intent exists, which makes this the one case where the
  // verifier adds a capability rather than just catching a mistake.
  if (intent.type === 'monthly_ordinal') {
    const nouns = parsedFields.dateNouns?.map(n => n.value) ?? [];
    const alreadyRight = parsedDayStyle === 'Complex'
      && (parsedFields as any).dateAdjective === intent.ordinal
      && nouns.length === 1 && nouns[0] === intent.ordinalNoun;
    if (alreadyRight) return { match: true, intent, confidence: intent.confidence };

    corrections.push({
      field: 'complexOrdinal',
      from: `${parsedDayStyle ?? 'Simple'} / ${nouns.join(',') || parsedSimpleDateType || 'none'}`,
      to: `${intent.ordinal} ${intent.ordinalNoun} of every Month`,
      reason: `Description says "${intent.ordinal} ${intent.ordinalNoun} of every month", which the frequency column cannot express`,
    });
    return { match: false, intent, corrections, confidence: intent.confidence };
  }

  // ── Check Monthly match ──
  if (intent.type === 'monthly') {
    if (parsedDayStyle === 'Complex' && parsedFields.dateNouns?.length) {
      return { match: true, intent, confidence: intent.confidence };
    }
    if (parsedDayStyle !== 'Complex') {
      corrections.push({
        field: 'dayStyle',
        from: parsedDayStyle,
        to: 'Complex',
        reason: `Description says monthly → should be complex day style`,
      });
    }
    return { match: false, intent, corrections, confidence: intent.confidence };
  }

  return { match: true, intent, confidence: intent.confidence };
}

export function correctScheduleFields(
  parsedFields: Record<string, any>,
  verification: ScheduleVerificationResult,
): Record<string, any> {
  if (verification.match || !verification.corrections?.length) return parsedFields;

  const corrected = { ...parsedFields };

  for (const c of verification.corrections) {
    if (c.field === 'simpleDateType') {
      corrected.simpleDateType = 'Business Days';
      // Remove individual day flags when setting Business Days
      delete corrected.mon;
      delete corrected.tue;
      delete corrected.wed;
      delete corrected.thu;
      delete corrected.fri;
      delete corrected.sat;
      delete corrected.sun;
    } else if (c.field === 'days') {
      // Reset all day flags and set only what the intent says
      delete corrected.mon;
      delete corrected.tue;
      delete corrected.wed;
      delete corrected.thu;
      delete corrected.fri;
      delete corrected.sat;
      delete corrected.sun;
      delete corrected.simpleDateType;
      if (verification.intent.days) {
        verification.intent.days.forEach(d => { corrected[d] = true; });
      }
    } else if (c.field === 'dayStyle') {
      corrected.dayStyle = 'Complex';
    } else if (c.field === 'complexOrdinal') {
      // Build the real ordinal pattern from the description.
      corrected.dayStyle = 'Complex';
      corrected.dateAdjective = verification.intent.ordinal;
      corrected.dateNouns = [{ value: verification.intent.ordinalNoun }];
      corrected.dateQualifiers = [{ value: 'Month' }];
      // Complex day style and simpleDateType are mutually exclusive, and a
      // stray day flag here would make the trigger fire weekly as well.
      delete corrected.simpleDateType;
      delete corrected.mon; delete corrected.tue; delete corrected.wed;
      delete corrected.thu; delete corrected.fri; delete corrected.sat;
      delete corrected.sun;
    }
  }

  return corrected;
}
