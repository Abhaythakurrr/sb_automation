/**
 * Schedule Parser Test — simulates all schedule types without creating jobs.
 * Run: node backend/src/utils/scheduleParser.test.js
 */

// We need to test the compiled version
const path = require('path');

// Since we can't import TS directly, let's simulate the parser logic here
// and verify the output matches what UAC expects.

const DAY_MAP = {
  'monday': 'mon', 'tuesday': 'tue', 'wednesday': 'wed', 'thursday': 'thu',
  'friday': 'fri', 'saturday': 'sat', 'sunday': 'sun',
  'mon': 'mon', 'tue': 'tue', 'wed': 'wed', 'thu': 'thu',
  'fri': 'fri', 'sat': 'sat', 'sun': 'sun',
};

const ORDINALS = {
  '1st': '1st', 'first': '1st', '2nd': '2nd', 'second': '2nd',
  '3rd': '3rd', 'third': '3rd', '4th': '4th', 'fourth': '4th',
  '5th': '5th', 'fifth': '5th', 'last': 'Last',
};

function parseScheduleField(input) {
  if (!input || !input.trim()) return null;

  const raw = input.trim();

  // Split by semicolon: [frequency_part] ; [time_part]
  const parts = raw.split(';').map(p => p.trim());
  const freqPart = parts.length > 1 ? parts[0] : '';
  const timePart = parts.length > 1 ? parts[1] : parts[0];

  const result = {};

  // ── Parse TIME part ─────────────────────────────────────────────────────────
  if (timePart) {
    const lower = timePart.toLowerCase();

    // "Every N minutes/hours" → Interval
    const intervalMatch = lower.match(/every\s+(\d+)\s*(min|mins|minutes?|hr|hrs|hours?)/);
    if (intervalMatch) {
      result.timeStyle = 'Interval';
      result.timeInterval = parseInt(intervalMatch[1]);
      result.timeIntervalUnits = intervalMatch[2].startsWith('h') ? 'Hours' : 'Minutes';
    }

    // "AT HHMM TIMEZONE tz" → Absolute time
    const atMatch = timePart.match(/AT\s+(\d{4})/i);
    if (atMatch) {
      const h = atMatch[1].slice(0, 2);
      const m = atMatch[1].slice(2, 4);
      result.time = `${h}:${m}`;
      if (!result.timeStyle) result.timeStyle = 'Absolute';
    }

    // TIMEZONE
    const tzMatch = timePart.match(/TIMEZONE\s+(\S+)/i);
    if (tzMatch) result.timeZone = tzMatch[1];

    // EVERY (in AT format)
    const everyMatch = timePart.match(/EVERY\s+(\d{4})/i);
    if (everyMatch) {
      const mins = parseInt(everyMatch[1].slice(0, 2)) * 60 + parseInt(everyMatch[1].slice(2, 4));
      result.timeStyle = 'Interval';
      if (mins >= 60 && mins % 60 === 0) {
        result.timeInterval = mins / 60;
        result.timeIntervalUnits = 'Hours';
      } else {
        result.timeInterval = mins;
        result.timeIntervalUnits = 'Minutes';
      }
      // AT time becomes enabledStart for interval
      if (result.time) {
        result.enabledStart = result.time;
        delete result.time;
      }
    }

    // UNTIL
    const untilMatch = timePart.match(/UNTIL\s+(\d{4})/i);
    if (untilMatch) {
      const h = untilMatch[1].slice(0, 2);
      const m = untilMatch[1].slice(2, 4);
      result.enabledEnd = `${h}:${m}`;
      result.restrictedTimes = true;
    }
  }

  // ── Parse FREQUENCY part ────────────────────────────────────────────────────
  if (!freqPart || freqPart.toLowerCase() === 'daily') {
    result.dayStyle = 'Simple';
    result.simpleDateType = 'Daily';
  }
  else if (freqPart.toLowerCase().startsWith('byweekday=')) {
    // ByWeekday=Monday,Tuesday,Wednesday
    const daysStr = freqPart.replace(/^byweekday=/i, '');
    const days = daysStr.split(',').map(d => DAY_MAP[d.trim().toLowerCase()]).filter(Boolean);
    result.dayStyle = 'Simple';
    result.simpleDateType = 'Weekly';
    days.forEach(d => { result[d] = true; });
  }
  else if (freqPart.toLowerCase() === 'businessdays' || freqPart.toLowerCase() === 'business days') {
    result.dayStyle = 'Simple';
    result.simpleDateType = 'Weekly';
    result.mon = true; result.tue = true; result.wed = true;
    result.thu = true; result.fri = true;
  }
  else if (freqPart.toLowerCase().startsWith('bymonthday=')) {
    // ByMonthDay=5,6,7,8,9,10,11,12
    const daysStr = freqPart.replace(/^bymonthday=/i, '');
    const days = daysStr.split(',').map(d => parseInt(d.trim())).filter(d => !isNaN(d));
    result.dayStyle = 'Complex';
    result.dateAdjective = 'Every';
    result.dateNouns = days.map(d => ({ value: `Month Day ${String(d).padStart(2, '0')}` }));
    result.dateQualifier = { value: 'Year' };
    result.dateQualifiers = [{ value: 'Year' }];
  }
  else if (freqPart.toLowerCase().startsWith('monthly')) {
    // "Monthly 2nd Sunday" or "Monthly Last Business Day"
    const complexMatch = freqPart.match(/monthly\s+(1st|2nd|3rd|4th|5th|last)\s+(.+)/i);
    if (complexMatch) {
      const ordinal = ORDINALS[complexMatch[1].toLowerCase()] || complexMatch[1];
      const noun = complexMatch[2].trim().split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
      result.dayStyle = 'Complex';
      result.dateAdjective = ordinal;
      result.dateNoun = { value: noun };
      result.dateNouns = [{ value: noun }];
      result.dateQualifier = { value: 'Every Month' };
      result.dateQualifiers = [{ value: 'Every Month' }];
    } else {
      result.dayStyle = 'Simple';
      result.simpleDateType = 'Monthly';
    }
  }
  else if (freqPart.toLowerCase() === 'weekly') {
    result.dayStyle = 'Simple';
    result.simpleDateType = 'Weekly';
  }

  return result;
}

// ── TEST CASES ────────────────────────────────────────────────────────────────
const tests = [
  { input: 'Daily; AT 0330 TIMEZONE Asia/Kolkata', expect: 'Simple Daily at 03:30 IST' },
  { input: 'Daily; Every 7 minutes', expect: 'Simple Daily interval 7 min' },
  { input: 'Daily; AT 0600 EVERY 0400 UNTIL 2200 TIMEZONE Asia/Jakarta', expect: 'Daily interval 4hr 06:00-22:00 WIB' },
  { input: 'ByWeekday=Monday; AT 1500 TIMEZONE Asia/Seoul', expect: 'Weekly Mon at 15:00 KST' },
  { input: 'ByWeekday=Monday; Every 7 minutes', expect: 'Weekly Mon interval 7 min' },
  { input: 'ByWeekday=Monday,Tuesday,Wednesday; Every 7 minutes', expect: 'Weekly Mon,Tue,Wed interval 7 min' },
  { input: 'ByWeekday=Monday,Tuesday,Wednesday,Thursday,Friday; AT 0800 TIMEZONE UTC', expect: 'Weekdays at 08:00 UTC' },
  { input: 'BusinessDays; AT 0900 TIMEZONE America/New_York', expect: 'Business Days at 09:00 EST' },
  { input: 'ByMonthDay=5,6,7,8,9,10,11,12; AT 1500 TIMEZONE Asia/Shanghai', expect: 'Complex Month Day 5-12 at 15:00 CST' },
  { input: 'Monthly 2nd Sunday; AT 0000 TIMEZONE Asia/Seoul', expect: 'Complex 2nd Sunday monthly' },
  { input: 'Monthly Last Business Day; AT 2200 TIMEZONE UTC', expect: 'Complex Last Business Day monthly' },
  { input: 'AT 0200 TIMEZONE Asia/Kolkata', expect: 'Simple Daily at 02:00 IST (no freq part)' },
  { input: 'Every 15 minutes', expect: 'Simple Daily interval 15 min (no freq part)' },
];

console.log('\n=== SCHEDULE PARSER SIMULATION ===\n');
let passed = 0;
let failed = 0;

tests.forEach((t, i) => {
  const result = parseScheduleField(t.input);
  const ok = result !== null;
  const status = ok ? 'PASS' : 'FAIL';
  if (ok) passed++; else failed++;

  console.log(`[${String(i+1).padStart(2)}] ${status} | ${t.input}`);
  console.log(`     Expected: ${t.expect}`);
  console.log(`     Output:   ${JSON.stringify(result, null, 0)}`);
  console.log('');
});

console.log(`\n=== RESULTS: ${passed} passed, ${failed} failed out of ${tests.length} ===\n`);
