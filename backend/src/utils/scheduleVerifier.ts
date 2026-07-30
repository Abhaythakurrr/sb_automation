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
  type: 'daily' | 'business_days' | 'specific_days' | 'monthly' | 'interval' | 'unknown';
  days?: string[];
  time?: string;
  interval?: { amount: number; unit: string };
  window?: { start: string; end: string };
  monthDay?: number;
  confidence: number;
}

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
  if (/\bbusiness\s*days?\b|\bweekdays?\b|\bmon\s*[-–]?\s*fri\b/i.test(lower)) {
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

  // ── Specific days ──
  const days = extractDayNames(lower);
  if (days.length > 0) {
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
    if (parsedSimpleDateType === 'Business Days') {
      return { match: true, intent, confidence: intent.confidence };
    }
    // Parser produced day flags instead of Business Days — correct it
    if (parsedDays.length > 0 && !parsedSimpleDateType) {
      corrections.push({
        field: 'simpleDateType',
        from: undefined,
        to: 'Business Days',
        reason: `Description says "${description}" → should be Business Days, not individual flags`,
      });
    }
    return { match: false, intent, corrections, confidence: intent.confidence };
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
    }
  }

  return corrected;
}
