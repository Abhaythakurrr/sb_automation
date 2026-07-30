/**
 * Natural-language schedule test matrix.
 *
 * Run with:  npx tsx src/copilot/scheduleAssistant.test.ts
 *
 * Each case asserts on the resolved UAC trigger fields, not on the prose, so a
 * wording change cannot make a test pass while the schedule is wrong. The
 * fields are produced by buildScheduleFields — the same function bulk job
 * creation uses — so a passing case here means the created trigger matches.
 */
import { interpretSchedule, describeTriggerFields, normalizeTimezone } from './scheduleAssistant';

interface Expect {
  timeStyle?: string;
  time?: string;
  timeInterval?: number;
  timeIntervalUnits?: string;
  timeZone?: string;
  dayStyle?: string;
  simpleDateType?: string;
  businessDays?: boolean;
  enabledStart?: string;
  enabledEnd?: string;
  dayInterval?: number;
  dateAdjective?: string;
  /** Weekday flags that must be true. */
  days?: string[];
  /** Weekday flags that must NOT be set. */
  notDays?: string[];
  /** dateNouns[].value must equal this. */
  dateNouns?: string[];
  understood?: boolean;
  spreadsheetSupported?: boolean;
}

const CASES: { say: string; tz?: string; want: Expect }[] = [
  // ── The reported bug ──────────────────────────────────────────────────────
  {
    say: 'every 5 minutes of monday, tuesday and wednesday',
    want: {
      timeStyle: 'Interval', timeInterval: 5, timeIntervalUnits: 'Minutes',
      dayStyle: 'Simple', simpleDateType: 'Specific Days',
      days: ['mon', 'tue', 'wed'], notDays: ['thu', 'fri', 'sat', 'sun'],
      understood: true,
    },
  },
  {
    say: 'every 15 minutes on Mon, Wed and Fri',
    want: {
      timeStyle: 'Interval', timeInterval: 15,
      simpleDateType: 'Specific Days', days: ['mon', 'wed', 'fri'], notDays: ['tue', 'thu'],
    },
  },
  {
    say: 'every 30 minutes on weekdays',
    want: { timeStyle: 'Interval', timeInterval: 30, simpleDateType: 'Business Days' },
  },
  {
    say: 'every 10 minutes at the weekend',
    want: { timeStyle: 'Interval', timeInterval: 10, simpleDateType: 'Specific Days', days: ['sat', 'sun'] },
  },
  {
    say: 'every 15 minutes from 06:00 to 22:00 on tuesday and thursday',
    want: {
      timeStyle: 'Interval', timeInterval: 15,
      enabledStart: '06:00', enabledEnd: '22:00',
      simpleDateType: 'Specific Days', days: ['tue', 'thu'],
    },
  },

  // ── Intervals ─────────────────────────────────────────────────────────────
  { say: 'every 15 minutes', want: { timeStyle: 'Interval', timeInterval: 15, timeIntervalUnits: 'Minutes' } },
  { say: 'every 2 hours', want: { timeStyle: 'Interval', timeInterval: 2, timeIntervalUnits: 'Hours' } },
  { say: 'hourly', want: { timeStyle: 'Interval', timeInterval: 1, timeIntervalUnits: 'Hours' } },
  { say: 'every half an hour', want: { timeStyle: 'Interval', timeInterval: 30, timeIntervalUnits: 'Minutes' } },
  { say: 'every other hour', want: { timeStyle: 'Interval', timeInterval: 2, timeIntervalUnits: 'Hours' } },
  { say: 'every 30 seconds', want: { timeStyle: 'Interval', timeInterval: 30, timeIntervalUnits: 'Seconds' } },
  {
    say: 'every 15 minutes from 6am to 10pm Asia/Kolkata',
    want: {
      timeStyle: 'Interval', timeInterval: 15,
      enabledStart: '06:00', enabledEnd: '22:00', timeZone: 'Asia/Kolkata',
    },
  },

  // ── Absolute times ────────────────────────────────────────────────────────
  { say: 'every weekday at 8 PM', want: { timeStyle: 'Absolute', time: '20:00', simpleDateType: 'Business Days' } },
  { say: 'daily at 03:30', want: { timeStyle: 'Absolute', time: '03:30', simpleDateType: 'Daily' } },
  { say: 'every day at 6am', want: { timeStyle: 'Absolute', time: '06:00', simpleDateType: 'Daily' } },
  { say: 'every night at 11pm', want: { timeStyle: 'Absolute', time: '23:00', simpleDateType: 'Daily' } },
  { say: 'every morning at 05:45', want: { timeStyle: 'Absolute', time: '05:45', simpleDateType: 'Daily' } },
  { say: 'at midnight', want: { timeStyle: 'Absolute', time: '00:00' } },
  { say: 'every day at noon', want: { timeStyle: 'Absolute', time: '12:00', simpleDateType: 'Daily' } },
  { say: 'every Monday at 06:30', want: { timeStyle: 'Absolute', time: '06:30', simpleDateType: 'Specific Days', days: ['mon'], notDays: ['tue'] } },
  { say: 'mondays and fridays at 7', want: { time: '07:00', simpleDateType: 'Specific Days', days: ['mon', 'fri'] } },
  { say: 'only on business days at 0900', want: { time: '09:00', simpleDateType: 'Business Days' } },
  { say: 'Monday through Friday at 18:00', want: { time: '18:00', simpleDateType: 'Business Days' } },
  { say: 'saturdays at 4pm', want: { time: '16:00', simpleDateType: 'Specific Days', days: ['sat'] } },

  // ── Monthly ───────────────────────────────────────────────────────────────
  {
    say: 'on the 24th of every month at 5am',
    want: { time: '05:00', dayStyle: 'Complex', dateNouns: ['Month Day 24'], spreadsheetSupported: true },
  },
  {
    say: 'the last Friday of every month at 23:00',
    want: { time: '23:00', dayStyle: 'Complex', dateAdjective: 'Last', dateNouns: ['Friday'], spreadsheetSupported: false },
  },
  {
    say: 'first business day of the month at 07:00',
    want: { time: '07:00', dayStyle: 'Complex', dateAdjective: '1st', dateNouns: ['Business Day'], spreadsheetSupported: false },
  },
  {
    say: 'on the 1st and 15th of every month at 02:00',
    want: { time: '02:00', dayStyle: 'Complex', dateNouns: ['Month Day 01', 'Month Day 15'], spreadsheetSupported: false },
  },
  {
    say: 'last day of the month at 22:00',
    want: { time: '22:00', dayStyle: 'Complex', dateAdjective: 'Last', dateNouns: ['Day'], spreadsheetSupported: false },
  },

  // ── Every N days ──────────────────────────────────────────────────────────
  { say: 'every 3 days at 08:00', want: { time: '08:00', dayStyle: 'Every', dayInterval: 3, spreadsheetSupported: false } },
  { say: 'every other day at 09:00', want: { time: '09:00', dayStyle: 'Every', dayInterval: 2, spreadsheetSupported: false } },
  { say: 'every 2 weeks at 10:00', want: { time: '10:00', dayStyle: 'Every', dayInterval: 14, spreadsheetSupported: false } },

  // ── Timezones ─────────────────────────────────────────────────────────────
  { say: 'daily at 9am IST', want: { time: '09:00', timeZone: 'Asia/Kolkata' } },
  { say: 'daily at 9am EST', want: { time: '09:00', timeZone: 'America/New_York' } },
  { say: 'daily at 9am UTC', want: { time: '09:00', timeZone: 'UTC' } },
  // An abbreviation carried over from session memory must also be expanded.
  { say: 'every Monday at 9am', tz: 'IST', want: { time: '09:00', timeZone: 'Asia/Kolkata', days: ['mon'] } },

  // ── Should not be understood ───────────────────────────────────────────────
  { say: 'purple monkey dishwasher', want: { understood: false } },
  { say: 'whenever', want: { understood: false } },
];

// ── Runner ───────────────────────────────────────────────────────────────────

let pass = 0;
const failures: string[] = [];

for (const { say, tz, want } of CASES) {
  const got = interpretSchedule(say, tz);
  const f = got.fields as Record<string, any>;
  const errs: string[] = [];

  const check = (label: string, actual: unknown, expected: unknown) => {
    if (expected === undefined) return;
    if (actual !== expected) errs.push(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  };

  check('timeStyle', f.timeStyle, want.timeStyle);
  check('time', f.time, want.time);
  check('timeInterval', f.timeInterval, want.timeInterval);
  check('timeIntervalUnits', f.timeIntervalUnits, want.timeIntervalUnits);
  check('timeZone', f.timeZone, want.timeZone);
  check('dayStyle', f.dayStyle, want.dayStyle);
  check('simpleDateType', f.simpleDateType, want.simpleDateType);
  check('enabledStart', f.enabledStart, want.enabledStart);
  check('enabledEnd', f.enabledEnd, want.enabledEnd);
  check('dayInterval', f.dayInterval, want.dayInterval);
  check('dateAdjective', f.dateAdjective, want.dateAdjective);
  check('understood', got.understood, want.understood);
  check('spreadsheetSupported', got.spreadsheetSupported, want.spreadsheetSupported);

  for (const d of want.days || []) {
    if (f[d] !== true) errs.push(`day flag ${d}: expected true, got ${JSON.stringify(f[d])}`);
  }
  for (const d of want.notDays || []) {
    if (f[d]) errs.push(`day flag ${d}: expected unset, got ${JSON.stringify(f[d])}`);
  }
  if (want.dateNouns) {
    const actual = (f.dateNouns || []).map((n: any) => n.value);
    if (JSON.stringify(actual) !== JSON.stringify(want.dateNouns)) {
      errs.push(`dateNouns: expected ${JSON.stringify(want.dateNouns)}, got ${JSON.stringify(actual)}`);
    }
  }

  if (errs.length === 0) {
    pass++;
    console.log(`  PASS  "${say}"\n          ${describeTriggerFields(got.fields)}`);
  } else {
    failures.push(`  FAIL  "${say}"\n          summary: ${describeTriggerFields(got.fields)}\n          ${errs.join('\n          ')}`);
  }
}

// Timezone normalisation is used on values that never pass through the parser.
const tzCases: [string, string][] = [
  ['IST', 'Asia/Kolkata'], ['ist', 'Asia/Kolkata'], ['EST', 'America/New_York'],
  ['PST', 'America/Los_Angeles'], ['UTC', 'UTC'], ['GMT', 'UTC'],
  ['Asia/Kolkata', 'Asia/Kolkata'], ['Europe/Berlin', 'Europe/Berlin'],
];
for (const [input, expected] of tzCases) {
  const got = normalizeTimezone(input).value;
  if (got === expected) pass++;
  else failures.push(`  FAIL  normalizeTimezone("${input}"): expected ${expected}, got ${got}`);
}

const total = CASES.length + tzCases.length;
console.log('\n' + '─'.repeat(70));
if (failures.length) {
  console.log(failures.join('\n'));
  console.log(`\n${pass}/${total} passed, ${failures.length} FAILED`);
  process.exit(1);
}
console.log(`${pass}/${total} passed`);
