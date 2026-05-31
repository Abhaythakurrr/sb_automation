/**
 * Generate test_schedule_200.xlsx — 200 jobs testing every schedule type
 * Agent: S021S172_unixCluster (test env)
 * Credential: mfg
 * Uses the new natural language Job Starttime format
 */
const XLSX = require('xlsx');
const path = require('path');

const AGENT  = 'S021S172_unixCluster';
const CRED   = 'mfg';
const TICKET = 'SCTASK0900000';
const BS     = 'QAD';

const timezones = [
  'Asia/Kolkata','Asia/Seoul','Asia/Shanghai','Asia/Jakarta',
  'Asia/Bangkok','Asia/Singapore','Asia/Tokyo','UTC',
  'America/New_York','America/Chicago','America/Los_Angeles',
  'Europe/London','Europe/Berlin',
];

const rows = [];
let n = 0;

function job(starttime, desc) {
  n++;
  const num = String(n).padStart(3, '0');
  return {
    'Job Name':                    `Schedule-Test-${num}`,
    'Job Type':                    'taskUnix',
    'Job Workstation':             AGENT,
    'Job Script':                  'sleep 5',
    'Job Login Account':           CRED,
    'Job Description':             desc || `Test ${num}`,
    'Firstrun Date':               '2026-06-10',
    'Job Starttime':               starttime,
    'Maximum Runtime':             '30',
    'Reference Job':               '',
    'Member of Business Services': BS,
    'ServiceNow Ticket':           TICKET,
  };
}

function refJob(refName, desc) {
  n++;
  const num = String(n).padStart(3, '0');
  return {
    'Job Name':                    `Schedule-Test-${num}`,
    'Job Type':                    'taskUnix',
    'Job Workstation':             AGENT,
    'Job Script':                  'sleep 5',
    'Job Login Account':           CRED,
    'Job Description':             desc || `Ref job test ${num}`,
    'Firstrun Date':               '2026-06-10',
    'Job Starttime':               '',
    'Maximum Runtime':             '30',
    'Reference Job':               refName,
    'Member of Business Services': BS,
    'ServiceNow Ticket':           TICKET,
  };
}

// ── SECTION 1: Daily at fixed times (20 jobs) ────────────────────────────────
for (let i = 0; i < 20; i++) {
  const h = String(i + 1).padStart(2, '0');
  const tz = timezones[i % timezones.length];
  rows.push(job(`Daily at ${h}:00 ${tz}`, `Daily at ${h}:00 ${tz}`));
}

// ── SECTION 2: Daily at half-hour times (10 jobs) ────────────────────────────
for (let i = 0; i < 10; i++) {
  const h = String((i * 2) + 1).padStart(2, '0');
  const tz = timezones[i % timezones.length];
  rows.push(job(`Daily at ${h}:30 ${tz}`, `Daily at ${h}:30 ${tz}`));
}

// ── SECTION 3: Weekly single day (14 jobs — 2 per day) ───────────────────────
const days = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
for (let i = 0; i < 14; i++) {
  const day = days[i % 7];
  const h = String(6 + i).padStart(2, '0');
  const tz = timezones[i % timezones.length];
  rows.push(job(`${day} at ${h}:00 ${tz}`, `Weekly ${day} at ${h}:00`));
}

// ── SECTION 4: Weekly multiple days (20 jobs) ────────────────────────────────
const dayCombos = [
  'Monday,Wednesday,Friday',
  'Tuesday,Thursday',
  'Monday,Tuesday,Wednesday,Thursday,Friday',
  'Saturday,Sunday',
  'Monday,Wednesday',
  'Tuesday,Thursday,Saturday',
  'Monday,Friday',
  'Wednesday,Friday,Sunday',
  'Monday,Tuesday,Wednesday',
  'Thursday,Friday,Saturday',
];
for (let i = 0; i < 20; i++) {
  const combo = dayCombos[i % dayCombos.length];
  const h = String(5 + (i % 18)).padStart(2, '0');
  const tz = timezones[i % timezones.length];
  rows.push(job(`${combo} at ${h}:00 ${tz}`, `Weekly ${combo}`));
}

// ── SECTION 5: Weekdays / Business Days (10 jobs) ────────────────────────────
for (let i = 0; i < 10; i++) {
  const label = i % 2 === 0 ? 'Weekdays' : 'Business Days';
  const h = String(7 + i).padStart(2, '0');
  const tz = timezones[i % timezones.length];
  rows.push(job(`${label} at ${h}:00 ${tz}`, `${label} at ${h}:00`));
}

// ── SECTION 6: Interval — minutes (20 jobs) ──────────────────────────────────
const minuteIntervals = [5, 7, 10, 15, 20, 30, 45];
for (let i = 0; i < 20; i++) {
  const mins = minuteIntervals[i % minuteIntervals.length];
  rows.push(job(`Every ${mins} minutes`, `Interval every ${mins} min`));
}

// ── SECTION 7: Interval — hours (10 jobs) ────────────────────────────────────
for (let i = 0; i < 10; i++) {
  const hrs = (i % 6) + 1;
  rows.push(job(`Every ${hrs} hours`, `Interval every ${hrs} hr`));
}

// ── SECTION 8: Interval with time window (20 jobs) ───────────────────────────
for (let i = 0; i < 20; i++) {
  const mins = minuteIntervals[i % minuteIntervals.length];
  const startH = String(5 + (i % 6)).padStart(2, '0');
  const endH = String(18 + (i % 5)).padStart(2, '0');
  const tz = timezones[i % timezones.length];
  rows.push(job(`Every ${mins} minutes from ${startH}:00 to ${endH}:00 ${tz}`, `Interval ${mins}min ${startH}-${endH} ${tz}`));
}

// ── SECTION 9: Weekly + interval combined (20 jobs) ──────────────────────────
for (let i = 0; i < 20; i++) {
  const day = days[i % 7];
  const mins = minuteIntervals[i % minuteIntervals.length];
  rows.push(job(`${day} every ${mins} minutes`, `${day} every ${mins} min`));
}

// ── SECTION 10: Weekdays + interval (10 jobs) ────────────────────────────────
for (let i = 0; i < 10; i++) {
  const mins = minuteIntervals[i % minuteIntervals.length];
  rows.push(job(`Weekdays every ${mins} minutes`, `Weekdays every ${mins} min`));
}

// ── SECTION 11: Monthly ordinal (14 jobs) ────────────────────────────────────
const ordinals = ['1st','2nd','3rd','4th','Last'];
for (let i = 0; i < 14; i++) {
  const ord = ordinals[i % ordinals.length];
  const day = days[i % 7];
  const tz = timezones[i % timezones.length];
  rows.push(job(`Monthly ${ord} ${day} at 15:00 ${tz}`, `Monthly ${ord} ${day}`));
}

// ── SECTION 12: Monthly day range (12 jobs) ──────────────────────────────────
const ranges = [[1,5],[5,12],[10,15],[15,20],[20,25],[1,10],[5,15],[10,20],[1,3],[25,28],[1,7],[8,14]];
for (let i = 0; i < 12; i++) {
  const [s, e] = ranges[i];
  const tz = timezones[i % timezones.length];
  rows.push(job(`Monthly Day ${s}-${e} at 14:00 ${tz}`, `Monthly Day ${s}-${e}`));
}

// ── SECTION 13: Old AT/EVERY/UNTIL format — backward compat (10 jobs) ────────
rows.push(job('AT 0330 TIMEZONE Asia/Kolkata', 'Old format: AT 0330 IST'));
rows.push(job('AT 0000 EVERY 0400 TIMEZONE UTC', 'Old format: every 4hr UTC'));
rows.push(job('AT 0600 EVERY 0030 UNTIL 2200 TIMEZONE Asia/Jakarta', 'Old format: 30min 06-22 WIB'));
rows.push(job('AT 0100 TIMEZONE Asia/Seoul', 'Old format: AT 0100 KST'));
rows.push(job('AT 2200 TIMEZONE America/New_York', 'Old format: AT 2200 EST'));
rows.push(job('AT 0000 EVERY 0100 TIMEZONE UTC', 'Old format: hourly UTC'));
rows.push(job('AT 0800 EVERY 0200 UNTIL 2000 TIMEZONE Asia/Shanghai', 'Old format: 2hr 08-20 CST'));
rows.push(job('AT 0900 EVERY 0015 UNTIL 1700 TIMEZONE Asia/Kolkata', 'Old format: 15min 09-17 IST'));
rows.push(job('FREQ=DAILY;INTERVAL=1', 'Old format: FREQ=DAILY'));
rows.push(job('AT 0000 EVERY 1200 TIMEZONE Asia/Seoul', 'Old format: 12hr KST'));

// ── SECTION 14: Reference jobs (10 jobs) ─────────────────────────────────────
// These inherit schedule from earlier jobs
rows.push(refJob('Schedule-Test-001', 'Ref: inherits from Test-001 (Daily IST)'));
rows.push(refJob('Schedule-Test-031', 'Ref: inherits from Test-031 (Monday)'));
rows.push(refJob('Schedule-Test-045', 'Ref: inherits from Test-045 (Mon,Wed,Fri)'));
rows.push(refJob('Schedule-Test-065', 'Ref: inherits from Test-065 (Weekdays)'));
rows.push(refJob('Schedule-Test-075', 'Ref: inherits from Test-075 (Every 7 min)'));
rows.push(refJob('Schedule-Test-095', 'Ref: inherits from Test-095 (Interval window)'));
rows.push(refJob('Schedule-Test-115', 'Ref: inherits from Test-115 (Mon every 7min)'));
rows.push(refJob('Schedule-Test-145', 'Ref: inherits from Test-145 (Monthly 2nd)'));
rows.push(refJob('Schedule-Test-160', 'Ref: inherits from Test-160 (Monthly Day range)'));
rows.push(refJob('Schedule-Test-170', 'Ref: inherits from Test-170 (Old AT format)'));

console.log('Total jobs generated:', rows.length);
console.log('');
console.log('Breakdown:');
console.log('  Daily fixed time:       30');
console.log('  Weekly single day:      14');
console.log('  Weekly multiple days:   20');
console.log('  Weekdays/Business:      10');
console.log('  Interval minutes:       20');
console.log('  Interval hours:         10');
console.log('  Interval with window:   20');
console.log('  Weekly + interval:      20');
console.log('  Weekdays + interval:    10');
console.log('  Monthly ordinal:        14');
console.log('  Monthly day range:      12');
console.log('  Old format (compat):    10');
console.log('  Reference jobs:         10');
console.log('  ─────────────────────────');
console.log('  Total:                 ', rows.length);

// Write Excel — 2 sheets of 100
const COLS = [
  { wch: 30 }, { wch: 12 }, { wch: 28 }, { wch: 20 },
  { wch: 10 }, { wch: 40 }, { wch: 14 }, { wch: 55 },
  { wch: 10 }, { wch: 25 }, { wch: 12 }, { wch: 18 },
];

function makeSheet(data) {
  const ws = XLSX.utils.json_to_sheet(data);
  ws['!cols'] = COLS;
  return ws;
}

const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, makeSheet(rows.slice(0, 100)), 'Batch_1_001_100');
XLSX.utils.book_append_sheet(wb, makeSheet(rows.slice(100, 200)), 'Batch_2_101_200');

const out = path.join(__dirname, '..', 'test_schedule_200.xlsx');
XLSX.writeFile(wb, out);
console.log('\nCreated:', out);
