/* Comprehensive NLP schedule-parsing test suite for buildScheduleFields. */
const { buildScheduleFields } = require('../../dist/utils/triggerSchedule');

let pass = 0, fail = 0;
const fails = [];

// check(label, args, expectations) where expectations is a subset to match.
function check(label, [start, freq, rawTime, tz, endTime], exp) {
  const r = buildScheduleFields(start || '', freq || '', rawTime || '', tz || '', endTime || '');
  const problems = [];
  for (const [k, v] of Object.entries(exp)) {
    const got = r[k];
    let ok;
    if (k === 'dateNounsCount') ok = (Array.isArray(r.dateNouns) ? r.dateNouns.length : 0) === v;
    else if (k === 'dateNounsFirst') ok = r.dateNouns && r.dateNouns[0] && r.dateNouns[0].value === v;
    else if (k === 'dateNounsLast') ok = r.dateNouns && r.dateNouns[r.dateNouns.length-1] && r.dateNouns[r.dateNouns.length-1].value === v;
    else ok = JSON.stringify(got) === JSON.stringify(v);
    if (!ok) problems.push(`${k}: expected ${JSON.stringify(v)} got ${JSON.stringify(k.startsWith('dateNouns')? (r.dateNouns||[]).map(n=>n.value):got)}`);
  }
  if (problems.length) { fail++; fails.push(`FAIL [${label}]\n   ${problems.join('\n   ')}`); }
  else { pass++; }
}

// ── Absolute / fixed time ──────────────────────────────────────────────────
check('AT 24h + Daily', ['AT 1800 TIMEZONE Asia/Kolkata', 'Daily'], { timeStyle:'Absolute', time:'18:00', timeZone:'Asia/Kolkata', dayStyle:'Simple' });
check('bare 24h', ['22:00', 'Daily', ''], { timeStyle:'Absolute', time:'22:00' });
check('bare HHMM', ['0730', 'Daily'], { timeStyle:'Absolute', time:'07:30' });
check('AM time', ['07:30 AM', 'Daily'], { timeStyle:'Absolute', time:'07:30' });
check('PM time', ['7:30 PM', 'Daily'], { timeStyle:'Absolute', time:'19:30' });
check('dot time', ['07.30', 'Daily'], { timeStyle:'Absolute', time:'07:30' });
check('noon 12 PM', ['12:00 PM', 'Daily'], { timeStyle:'Absolute', time:'12:00' });
check('midnight 12 AM', ['12:00 AM', 'Daily'], { timeStyle:'Absolute', time:'00:00' });
check('rawTime fallback', ['', 'Daily', '22:00', 'UTC'], { timeStyle:'Absolute', time:'22:00', timeZone:'UTC' });
check('natural at h:mm', ['at 6:05 UTC', 'Daily'], { timeStyle:'Absolute', time:'06:05' });

// ── Intervals ──────────────────────────────────────────────────────────────
check('AT/EVERY/UNTIL', ['AT 0730 EVERY 0200 UNTIL 1930 TIMEZONE Asia/Kolkata', 'Daily'], { timeStyle:'Interval', timeInterval:2, timeIntervalUnits:'Hours', enabledStart:'07:30', enabledEnd:'19:30' });
check('NL every hours window', ['', 'every 2 hours from 07:30 to 19:30', '', 'Asia/Kolkata'], { timeStyle:'Interval', timeInterval:2, timeIntervalUnits:'Hours', enabledStart:'07:30', enabledEnd:'19:30' });
check('NL every mins dots', ['', 'Daily every 30 mins from 07.30 to 19.30'], { timeStyle:'Interval', timeInterval:30, timeIntervalUnits:'Minutes', enabledStart:'07:30', enabledEnd:'19:30' });
check('NL every AM/PM window', ['every 2 hours from 7:30 AM to 7:30 PM', 'Daily'], { timeStyle:'Interval', timeInterval:2, timeIntervalUnits:'Hours', enabledStart:'07:30', enabledEnd:'19:30' });
check('NL between window weekdays', ['', 'every 15 minutes between 0800 and 1800 on weekdays'], { timeStyle:'Interval', timeInterval:15, timeIntervalUnits:'Minutes', enabledStart:'08:00', enabledEnd:'18:00', mon:true, fri:true });
check('FREQ=INTERVAL', ['', 'FREQ=INTERVAL;interval=2;units=hours;starttime=07:30;endtime=19:30;byday=daily', '', 'Asia/Kolkata'], { timeStyle:'Interval', timeInterval:2, timeIntervalUnits:'Hours', enabledStart:'07:30', enabledEnd:'19:30' });

// ── Day patterns ─────────────────────────────────────────────────────────────
check('Weekdays', ['AT 0900 TIMEZONE UTC', 'Weekdays'], { mon:true, tue:true, wed:true, thu:true, fri:true, timeStyle:'Absolute', time:'09:00' });
check('Specific days', ['AT 0900 TIMEZONE UTC', 'Mon,Wed,Fri'], { mon:true, wed:true, fri:true });
check('FREQ=WEEKLY', ['0900', 'FREQ=WEEKLY;byday=Tue,Thu', 'UTC'], { tue:true, thu:true });
check('Daily plain', ['AT 0600 TIMEZONE UTC', 'Daily'], { dayStyle:'Simple', simpleDateType:'Daily', time:'06:00' });

// ── Monthly single + ranges ──────────────────────────────────────────────────
check('Monthly Day 24', ['AT 0600 TIMEZONE UTC', 'Monthly Day 24'], { dayStyle:'Complex', dateNounsFirst:'Month Day 24', dateNounsCount:1 });
check('Range 1st-10th each month', ['', 'Daily starting from 1st till 10th each month', '22:00', 'Asia/Bangkok'], { dayStyle:'Complex', dateNounsCount:10, dateNounsFirst:'Month Day 01', dateNounsLast:'Month Day 10', time:'22:00', timeZone:'Asia/Bangkok' });
check('Range day 1 to day 10', ['', 'day 1 to day 10 each month', '22:00'], { dayStyle:'Complex', dateNounsCount:10 });
check('Range between 5th and 8th', ['', 'between 5th and 8th of the month', '06:00'], { dayStyle:'Complex', dateNounsCount:4, dateNounsFirst:'Month Day 05', dateNounsLast:'Month Day 08' });
check('Range 1-3 each month', ['0900', '1-3 of each month'], { dayStyle:'Complex', dateNounsCount:3 });
check('Range reversed 10 to 1', ['', '10 to 1 of each month', '22:00'], { dayStyle:'Complex', dateNounsCount:10, dateNounsFirst:'Month Day 01', dateNounsLast:'Month Day 10' });

// ── Regression: window must NOT become a month range (no "month" word) ──────
check('interval window not month-range', ['', 'every 2 hours from 1 to 10', '', 'UTC'], { timeStyle:'Interval', dayStyle:'Simple' });
check('empty frequency defaults Daily', ['AT 1200 TIMEZONE UTC', ''], { dayStyle:'Simple', simpleDateType:'Daily', time:'12:00' });

// ── Report ───────────────────────────────────────────────────────────────────
console.log(`\nNLP suite: ${pass} passed, ${fail} failed`);
if (fails.length) { console.log('\n' + fails.join('\n\n')); process.exit(1); }
