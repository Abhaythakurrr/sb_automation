/**
 * ML-Based Schedule Parser
 * 
 * Lightweight pattern recognition engine for natural language schedule parsing.
 * Uses feature extraction and similarity matching instead of heavy neural networks.
 * 
 * Features:
 * - Pattern recognition for common schedule phrases
 * - Confidence scoring
 * - Format recommendations
 * - Learning from corrections
 */

// ── Pattern Database ──────────────────────────────────────────────────────────

interface SchedulePattern {
  id: string;
  patterns: RegExp[];              // Regex patterns to match (changed from string[])
  keywords: string[];              // Must contain these keywords
  antiKeywords?: string[];         // Must NOT contain these
  confidence: number;              // Base confidence score (0-1)
  recommendation: {
    starttime: string;
    frequency: string;
    timezone?: string;
    endtime?: string;
  };
  humanReadable: string;
  category: 'daily' | 'interval' | 'weekly' | 'monthly';
}

const SCHEDULE_PATTERNS: SchedulePattern[] = [
  // ── INTERVAL PATTERNS ────────────────────────────────────────────────────
  {
    id: 'interval_every_n_minutes',
    patterns: [
      /every\s+(\d+)\s*min/i,
      /every\s+(\d+)\s*minute/i,
    ],
    keywords: ['every', 'minute'],
    confidence: 0.95,
    recommendation: {
      starttime: '00:00',
      frequency: 'FREQ=INTERVAL;interval={n};units=minutes',
      timezone: 'America/New_York',
    },
    humanReadable: 'Recurring every N minutes',
    category: 'interval',
  },
  {
    id: 'interval_every_n_hours',
    patterns: [
      /every\s+(\d+)\s*h/i,
      /every\s+(\d+)\s*hour/i,
    ],
    keywords: ['every', 'hour'],
    confidence: 0.95,
    recommendation: {
      starttime: '00:00',
      frequency: 'FREQ=INTERVAL;interval={n};units=hours',
      timezone: 'America/New_York',
    },
    humanReadable: 'Recurring every N hours',
    category: 'interval',
  },
  {
    id: 'interval_with_window',
    patterns: [
      /every\s+(\d+)\s*min.*from.*to/i,
      /every\s+(\d+)\s*min.*between.*and/i,
    ],
    keywords: ['every', 'minute', 'from', 'to'],
    confidence: 0.98,
    recommendation: {
      starttime: '{start}',
      frequency: 'FREQ=INTERVAL;interval={n};units=minutes',
      timezone: 'America/New_York',
      endtime: '{end}',
    },
    humanReadable: 'Recurring every N minutes within time window',
    category: 'interval',
  },

  // ── DAILY PATTERNS ───────────────────────────────────────────────────────
  {
    id: 'daily_at_time',
    patterns: [
      /daily.*at\s+(\d{1,2}:\d{2})/i,
      /every\s*day.*at\s+(\d{1,2}:\d{2})/i,
      /everyday.*at\s+(\d{1,2}:\d{2})/i,
    ],
    keywords: ['daily', 'at'],
    antiKeywords: ['every', 'minute', 'hour', 'week'],
    confidence: 0.92,
    recommendation: {
      starttime: '{time}',
      frequency: 'FREQ=DAILY;INTERVAL=1',
      timezone: 'America/New_York',
    },
    humanReadable: 'Daily at specific time',
    category: 'daily',
  },
  {
    id: 'daily_midnight',
    patterns: [
      /midnight/i,
      /at\s+00:00/i,
      /at\s+0000/i,
      /12:00\s*am/i,
    ],
    keywords: ['midnight'],
    confidence: 0.90,
    recommendation: {
      starttime: '00:00',
      frequency: 'FREQ=DAILY;INTERVAL=1',
      timezone: 'America/New_York',
    },
    humanReadable: 'Daily at midnight',
    category: 'daily',
  },
  {
    id: 'daily_simple',
    patterns: [
      /^daily$/i,
      /^everyday$/i,
      /^every\s*day$/i,
    ],
    keywords: ['daily'],
    antiKeywords: ['at', 'every', 'minute', 'hour'],
    confidence: 0.85,
    recommendation: {
      starttime: '00:00',
      frequency: 'FREQ=DAILY;INTERVAL=1',
      timezone: 'America/New_York',
    },
    humanReadable: 'Daily (default midnight)',
    category: 'daily',
  },

  // ── WEEKLY PATTERNS ──────────────────────────────────────────────────────
  {
    id: 'weekdays',
    patterns: [
      /weekday/i,
      /mon.*fri/i,
      /business\s*day/i,
    ],
    keywords: ['weekday'],
    confidence: 0.93,
    recommendation: {
      starttime: '00:00',
      frequency: 'FREQ=WEEKLY;byday=Mon,Tue,Wed,Thu,Fri',
      timezone: 'America/New_York',
    },
    humanReadable: 'Weekdays (Mon-Fri)',
    category: 'weekly',
  },
  {
    id: 'specific_days',
    patterns: [
      /(mon|tue|wed|thu|fri|sat|sun).*(mon|tue|wed|thu|fri|sat|sun)/i,
    ],
    keywords: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
    confidence: 0.90,
    recommendation: {
      starttime: '00:00',
      frequency: 'FREQ=WEEKLY;byday={days}',
      timezone: 'America/New_York',
    },
    humanReadable: 'Specific days of week',
    category: 'weekly',
  },

  // ── MONTHLY PATTERNS ─────────────────────────────────────────────────────
  {
    id: 'monthly_day',
    patterns: [
      /monthly.*day\s+(\d+)/i,
      /day\s+(\d+).*month/i,
      /(\d+)(st|nd|rd|th).*month/i,
    ],
    keywords: ['month', 'day'],
    confidence: 0.94,
    recommendation: {
      starttime: '00:00',
      frequency: 'FREQ=MONTHLY;monthday={day}',
      timezone: 'America/New_York',
    },
    humanReadable: 'Monthly on specific day',
    category: 'monthly',
  },
];

// ── Feature Extraction ────────────────────────────────────────────────────────

interface ExtractedFeatures {
  hasEvery: boolean;
  hasMinute: boolean;
  hasHour: boolean;
  hasDay: boolean;
  hasWeek: boolean;
  hasMonth: boolean;
  hasTime: boolean;
  hasWindow: boolean;
  hasMidnight: boolean;
  hasWeekday: boolean;
  numbers: number[];
  times: string[];
  days: string[];
  keywords: string[];
}

function extractFeatures(input: string): ExtractedFeatures {
  const lower = input.toLowerCase();
  
  return {
    hasEvery: /\bevery\b/.test(lower),
    hasMinute: /\bmin(ute)?s?\b/.test(lower),
    hasHour: /\bhours?\b/.test(lower),
    hasDay: /\bdays?\b/.test(lower),
    hasWeek: /\bweeks?\b/.test(lower),
    hasMonth: /\bmonths?\b/.test(lower),
    hasTime: /\d{1,2}:\d{2}/.test(lower) || /\bat\b/.test(lower),
    hasWindow: /\b(from|between)\b.*\b(to|and)\b/.test(lower),
    hasMidnight: /\bmidnight\b/.test(lower),
    hasWeekday: /\bweekday|business\s*day|mon.*fri\b/.test(lower),
    numbers: (lower.match(/\d+/g) || []).map(Number),
    times: lower.match(/\d{1,2}:\d{2}/g) || [],
    days: lower.match(/\b(mon|tue|wed|thu|fri|sat|sun)/gi) || [],
    keywords: lower.split(/\s+/).filter(w => w.length > 2),
  };
}

// ── Pattern Matching ──────────────────────────────────────────────────────────

interface MatchResult {
  pattern: SchedulePattern;
  confidence: number;
  extracted: Record<string, any>;
}

function matchPatterns(input: string): MatchResult[] {
  const features = extractFeatures(input);
  const results: MatchResult[] = [];

  for (const pattern of SCHEDULE_PATTERNS) {
    let confidence = pattern.confidence;
    const extracted: Record<string, any> = {};

    // Check if required keywords are present
    const hasRequiredKeywords = pattern.keywords.every(kw => 
      input.toLowerCase().includes(kw)
    );
    if (!hasRequiredKeywords) continue;

    // Check if anti-keywords are absent
    if (pattern.antiKeywords) {
      const hasAntiKeywords = pattern.antiKeywords.some(kw => 
        input.toLowerCase().includes(kw)
      );
      if (hasAntiKeywords) continue;
    }

    // Try to match regex patterns
    let matched = false;
    for (const regex of pattern.patterns) {
      const match = input.match(regex);
      if (match) {
        matched = true;
        // Extract numbers from match
        if (match[1]) extracted.n = match[1];
        if (match[2]) extracted.extra = match[2];
        break;
      }
    }

    if (!matched && pattern.patterns.length > 0) {
      confidence *= 0.7; // Reduce confidence if pattern didn't match
    }

    // Boost confidence based on features
    if (pattern.category === 'interval' && features.hasEvery) confidence *= 1.1;
    if (pattern.category === 'interval' && features.hasWindow) confidence *= 1.15;
    if (pattern.category === 'daily' && features.hasTime) confidence *= 1.1;
    if (pattern.category === 'weekly' && features.hasWeekday) confidence *= 1.1;
    if (pattern.category === 'monthly' && features.hasMonth) confidence *= 1.1;

    // Extract additional data
    if (features.times.length > 0) extracted.time = features.times[0];
    if (features.times.length > 1) extracted.endTime = features.times[1];
    if (features.numbers.length > 0) extracted.n = extracted.n || features.numbers[0];
    if (features.days.length > 0) extracted.days = features.days.join(',');

    results.push({
      pattern,
      confidence: Math.min(confidence, 1.0),
      extracted,
    });
  }

  // Sort by confidence descending
  return results.sort((a, b) => b.confidence - a.confidence);
}

// ── Recommendation Generator ──────────────────────────────────────────────────

export interface ScheduleRecommendation {
  confidence: number;
  starttime: string;
  frequency: string;
  timezone: string;
  endtime?: string;
  explanation: string;
  category: string;
  alternatives: Array<{
    starttime: string;
    frequency: string;
    timezone: string;
    endtime?: string;
    explanation: string;
    confidence: number;
  }>;
}

function getScheduleRecommendation(input: string): ScheduleRecommendation | null {
  if (!input || !input.trim()) return null;

  const matches = matchPatterns(input);
  if (matches.length === 0) return null;

  const best = matches[0];
  const rec = best.pattern.recommendation;

  // Replace placeholders
  let starttime = rec.starttime.replace('{time}', best.extracted.time || '00:00');
  starttime = starttime.replace('{start}', best.extracted.time || '00:00');
  
  let frequency = rec.frequency.replace('{n}', best.extracted.n || '15');
  frequency = frequency.replace('{days}', best.extracted.days || 'Mon,Wed,Fri');
  frequency = frequency.replace('{day}', best.extracted.n || '1');

  const timezone = rec.timezone || 'America/New_York';
  let endtime = rec.endtime?.replace('{end}', best.extracted.endTime || '23:55');

  // Build alternatives
  const alternatives = matches.slice(1, 4).map(m => {
    let altStart = m.pattern.recommendation.starttime.replace('{time}', m.extracted.time || '00:00');
    altStart = altStart.replace('{start}', m.extracted.time || '00:00');
    
    let altFreq = m.pattern.recommendation.frequency.replace('{n}', m.extracted.n || '15');
    altFreq = altFreq.replace('{days}', m.extracted.days || 'Mon,Wed,Fri');
    altFreq = altFreq.replace('{day}', m.extracted.n || '1');

    const altTz = m.pattern.recommendation.timezone || 'America/New_York';
    const altEnd = m.pattern.recommendation.endtime?.replace('{end}', m.extracted.endTime || '23:55');

    return {
      starttime: altStart,
      frequency: altFreq,
      timezone: altTz,
      endtime: altEnd,
      explanation: m.pattern.humanReadable,
      confidence: m.confidence,
    };
  });

  return {
    confidence: best.confidence,
    starttime,
    frequency,
    timezone,
    endtime,
    explanation: best.pattern.humanReadable,
    category: best.pattern.category,
    alternatives,
  };
}

// ── Training Data Analyzer ────────────────────────────────────────────────────

interface AnalysisResult {
  totalPatterns: number;
  categoryDistribution: Record<string, number>;
  commonPhrases: string[];
  recommendations: string[];
}

function analyzeSchedulePatterns(schedules: string[]): AnalysisResult {
  const categoryCount: Record<string, number> = {};
  const phraseCount: Record<string, number> = {};

  for (const schedule of schedules) {
    const rec = getScheduleRecommendation(schedule);
    if (rec) {
      categoryCount[rec.category] = (categoryCount[rec.category] || 0) + 1;
    }

    // Extract common phrases
    const words = schedule.toLowerCase().split(/\s+/);
    const phrases: string[] = [];
    for (let i = 0; i < words.length - 1; i++) {
      const phrase = words[i] + ' ' + words[i + 1];
      phrases.push(phrase);
    }
    phrases.forEach(p => {
      phraseCount[p] = (phraseCount[p] || 0) + 1;
    });
  }

  const commonPhrases = Object.entries(phraseCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([phrase]) => phrase);

  const recommendations = [
    `Found ${schedules.length} schedule patterns`,
    `Most common category: ${Object.entries(categoryCount).sort((a, b) => b[1] - a[1])[0]?.[0] || 'unknown'}`,
    `Top phrases: ${commonPhrases.slice(0, 3).join(', ')}`,
  ];

  return {
    totalPatterns: schedules.length,
    categoryDistribution: categoryCount,
    commonPhrases,
    recommendations,
  };
}

// ── Export Public API ─────────────────────────────────────────────────────────

export default getScheduleRecommendation;
export { analyzeSchedulePatterns, extractFeatures, matchPatterns };
