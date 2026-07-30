/**
 * Scheduling knowledge — every scheduling option the trigger builder supports,
 * plus the natural-language phrasings it understands.
 *
 * Grounded in backend/src/utils/triggerSchedule.ts (buildScheduleFields, the
 * AT/EVERY/UNTIL grammar, TriggerScheduleFields) and scheduleParser.ts.
 */
import { KnowledgeChunk } from '../types';

/** Worked examples used both as knowledge and as UI hints. */
export interface ScheduleExample {
  say: string;
  means: string;
  fields: string;
}

export const SCHEDULE_EXAMPLES: ScheduleExample[] = [
  { say: 'every day at 8 AM',
    means: 'Runs once a day at 08:00.',
    fields: 'timeStyle Absolute, time 08:00, dayStyle Simple, simpleDateType Daily' },
  { say: 'every weekday at 8 PM',
    means: 'Runs Monday to Friday at 20:00, skipping calendar holidays.',
    fields: 'timeStyle Absolute, time 20:00, dayStyle Simple, simpleDateType Business Days' },
  { say: 'only on business days',
    means: 'Runs on business days per the calendar, which excludes weekends and holidays.',
    fields: 'dayStyle Simple, simpleDateType Business Days' },
  { say: 'every Monday',
    means: 'Runs once a week on Monday.',
    fields: 'dayStyle Simple, simpleDateType Specific Days, mon true' },
  { say: 'Monday, Wednesday and Friday at 06:30',
    means: 'Runs three times a week at 06:30.',
    fields: 'timeStyle Absolute, time 06:30, simpleDateType Specific Days, mon/wed/fri true' },
  { say: 'every 15 minutes',
    means: 'Repeats every 15 minutes, all day.',
    fields: 'timeStyle Interval, timeInterval 15, timeIntervalUnits Minutes (no time field)' },
  { say: 'every 30 minutes from 06:00 to 22:00',
    means: 'Repeats every 30 minutes, but only inside the 06:00–22:00 window each day.',
    fields: 'timeStyle Interval, timeInterval 30, timeIntervalUnits Minutes, restrictedTimes true, enabledStart 06:00, enabledEnd 22:00' },
  { say: 'every 2 hours',
    means: 'Repeats every 2 hours.',
    fields: 'timeStyle Interval, timeInterval 2, timeIntervalUnits Hours' },
  { say: 'on the last Friday of every month',
    means: 'Runs once a month, on the final Friday.',
    fields: 'dayStyle Complex, dateAdjective Last, dateNouns [{ value: "Friday" }], dateQualifiers [{ value: "Month" }]' },
  { say: 'on the 24th of every month',
    means: 'Runs monthly on the 24th.',
    fields: 'dayStyle Complex, dateAdjective Every, dateNouns [{ value: "Month Day 24" }], dateQualifiers [{ value: "Month" }]' },
  { say: 'the first business day of the month',
    means: 'Runs monthly on the first working day.',
    fields: 'dayStyle Complex, dateAdjective 1st, dateNouns [{ value: "Business Day" }], dateQualifiers [{ value: "Month" }]' },
  { say: 'every 3 days starting 2026-08-01',
    means: 'Runs every third day, counting from the start date.',
    fields: 'dayStyle Every, dayInterval 3, intervalStartingDate 2026-08-01' },
];

export const SCHEDULING_CHUNKS: KnowledgeChunk[] = [
  {
    id: 'scheduling.model',
    kind: 'scheduling',
    title: 'The UAC time trigger model — three independent parts',
    pages: ['scheduling', 'preview', 'job-creation'],
    keywords: ['schedule', 'trigger', 'timeStyle', 'dayStyle', 'how scheduling works', 'cron'],
    source: 'backend/src/utils/triggerSchedule.ts',
    body: `A UAC time trigger is described by three parts that are set independently.

1. TIME DETAILS — timeStyle.
   "Absolute" fires at a specific time and needs time in HH:MM.
   "Interval" repeats and needs timeInterval plus timeIntervalUnits (Seconds, Minutes or Hours). It must not carry a time. Optionally bounded by restrictedTimes with enabledStart and enabledEnd.

2. DAY DETAILS — dayStyle.
   "Simple" covers daily, business days and named weekdays, using simpleDateType (Daily, Business Days, Specific Days) plus the mon…sun flags.
   "Complex" covers formula patterns, using dateAdjective (Every, 1st, 2nd, 3rd, 4th, Last, Nth), dateNouns and dateQualifiers.
   "Every" runs every N days, using dayInterval and intervalStartingDate.

3. RESTRICTIONS — the daily window for an interval, and the skip rules.

There are no cron expressions anywhere in UAC time triggers or in this application. You never need to write one. Describe the schedule in plain English or in the AT/EVERY/UNTIL form and the builder produces the correct field combination.`,
  },
  {
    id: 'scheduling.at-every-until',
    kind: 'scheduling',
    title: 'The AT / EVERY / UNTIL / TIMEZONE schedule syntax',
    pages: ['scheduling', 'job-creation', 'upload'],
    keywords: ['AT', 'EVERY', 'UNTIL', 'TIMEZONE', 'schedule string', 'starttime format', 'syntax'],
    source: 'backend/src/utils/triggerSchedule.ts',
    body: `The Job Starttime and Schedule String columns accept a compact form:

AT 1800 TIMEZONE America/New_York — fires at 18:00 New York time.
AT 0600 EVERY 0030 UNTIL 2200 TIMEZONE UTC — every 30 minutes between 06:00 and 22:00 UTC.
Daily at 03:30 Asia/Kolkata — plain-English form, also accepted.
Monday at 08:00 UTC — a day name in the start time sets the day pattern too.
Every 15 minutes from 06:00 to 22:00 Asia/Kolkata — natural interval with a window.
1600 — a bare time.

Time spellings are normalised to 24-hour HH:MM. 0730, 07:30, 7:30, 07.30, 7.30, "07:30 AM", "7:30 pm", "7 AM", 7am, midnight and noon all parse.

When a day name appears in the start time and the row is not an interval job, the day pattern comes from the start time and overrides the frequency column. For interval jobs the frequency column wins on the day pattern, because the interval owns the timing.`,
  },
  {
    id: 'scheduling.frequency-forms',
    kind: 'scheduling',
    title: 'Frequency values the builder understands',
    pages: ['scheduling', 'upload', 'job-creation'],
    keywords: ['frequency', 'FREQ', 'RRULE', 'daily', 'weekly', 'monthly', 'weekdays', 'interval'],
    source: 'backend/src/utils/triggerSchedule.ts, backend/src/utils/scheduleParser.ts',
    body: `The Scheduled Frequency column accepts plain words or an RRULE-like form.

Plain: Daily, Weekdays, Business Days, Monday,Wednesday,Friday, Monthly, Weekly.
Structured: FREQ=DAILY, FREQ=WEEKLY;byday=Mon,Wed,Fri, FREQ=MONTHLY;INTERVAL=1;byday=24th, FREQ=INTERVAL;interval=15;units=minutes.

Empty defaults to Daily.

When the frequency declares an interval it takes priority over an absolute time in the start time column: the start time becomes the window start (enabledStart) rather than an absolute trigger time. That is deliberate — otherwise an interval job would silently collapse to a single daily run.`,
  },
  {
    id: 'scheduling.natural-language',
    kind: 'scheduling',
    title: 'Describing a schedule in plain English',
    pages: ['scheduling', 'job-creation'],
    keywords: ['natural language', 'plain english', 'i want', 'how do i say', 'translate', 'nl'],
    source: 'backend/src/copilot/scheduleAssistant.ts, backend/src/utils/triggerSchedule.ts',
    body: `You can state a schedule the way you would say it out loud and the Copilot converts it into a valid trigger configuration, then reads it back in plain English so you can confirm it before anything is created.

Worked examples:
${SCHEDULE_EXAMPLES.map(e => `"${e.say}" → ${e.means}\n   ${e.fields}`).join('\n')}`,
  },
  {
    id: 'scheduling.verifier',
    kind: 'scheduling',
    title: 'The schedule verifier — cross-checking against the description',
    pages: ['scheduling', 'preview', 'validation'],
    keywords: ['verifier', 'correction', 'mismatch', 'description', 'auto correct'],
    source: 'backend/src/utils/scheduleVerifier.ts',
    body: `After the schedule fields are built, and only when the row has a description, the verifier re-reads the description for schedule intent and compares it with what the parser produced.

When they disagree it corrects the fields and logs the correction. The classic case: the frequency column says "Daily" but the description says the job runs on weekdays, so the verifier switches the trigger to business days.

This is a safety net, not a substitute for a correct frequency column. It only runs when a description exists, which is one reason the description is worth filling in.`,
  },
  {
    id: 'scheduling.holidays-and-calendar',
    kind: 'scheduling',
    title: 'Holidays, calendars and skip behaviour',
    pages: ['scheduling', 'preview'],
    keywords: ['holiday', 'calendar', 'skip', 'business day', 'do not trigger', 'overlap', 'still running'],
    source: 'backend/src/utils/payloadMapper.ts',
    body: `Every trigger this application creates gets the same calendar defaults:

calendar "System Default" — the calendar used to evaluate business days and holidays.
situation "Holiday" and action "Do Not Trigger" — the job is skipped on holidays rather than run.
skipCondition "Active By Trigger" — if the previous instance launched by this trigger is still running, the new qualifying time is skipped instead of stacking a second instance. This is what protects a slow job from piling up on itself.
retentionDuration 1 Days — how long trigger history is kept.

When a first run date is supplied, skipRestriction "Before" and skipBeforeDate stop the trigger firing before that date. When it is not supplied, no skip fields are set at all, because UAC validates skipBeforeDate against the frequency and rejects a mismatch.`,
  },
  {
    id: 'scheduling.verify-with-qualifying-times',
    kind: 'scheduling',
    title: 'Confirming a schedule is right',
    pages: ['scheduling', 'execution', 'validation'],
    keywords: ['qualifying times', 'next run', 'when will it run', 'confirm schedule', 'forecast'],
    source: 'backend/src/routes/execution.ts',
    body: `The only authoritative check on a schedule is UAC's own forecast. GET /api/execution/qualifying-times asks the controller for the next N dates a trigger will fire, and the verification step in Job Creation shows them.

Read them before enabling the trigger. If the dates are wrong the schedule fields are wrong, no matter how right the summary text looked. Common tells: dates every day when you expected weekdays only, a single daily date when you expected an interval, or times shifted by hours which means the timezone is wrong or missing.`,
  },
];
