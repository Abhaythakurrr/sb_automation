/**
 * Generate test_schedule_200.xlsx — 200 jobs testing every supported schedule type
 * 
 * RULES (matching Stonebranch UAC):
 * - Every job MUST have a start time (AT time)
 * - Recurring jobs (interval) MUST have start + end time
 * - dayStyle is always "Simple", simpleDateType is always "Daily"
 * - Specific days are set via day flags (mon, tue, ...)
 * - No complex scheduling (dateNouns/dateQualifiers) — use ref jobs for those
 */
const XLSX = require('xlsx');
const path = require('path');

const AGENT  = 'S021S172_unixCluster';
const CRED   = 'mfg';
const TICKET = 'SCTASK0900000';
const BS     = 'QAD';
const SN_GROUP = 'QAD DBA Progress Global';

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
    'ServiceNow Group':            SN_GROUP,
    'Firstrun Date':               '2026-06-10',
    'Job Starttime':               starttime,
    'Job Timezone':                '',
    'Scheduled Frequency':         '',
    'Maximum Runtime':             '30',
    'Reference Job':               '',
    'Member of Business Services': BS,
    'ServiceNow Ticket':           TICKET,
    'Job Recovery1':               'Re-run job',
    'Job Recovery2':               'Raise Low priority ticket to support',
  };
}

// ── SECTION 1: Daily at fixed times (30 jobs) ────────────────────────────────
// Format: "Daily at HH:MM TIMEZONE"
for (let i = 0; i < 30; i++) {
  const h = String(i % 24).padStart(2, '0');
  const m = i < 15 ? '00' : '30';
  const tz = timezones[i % timezones.length];
  rows.push(job(`Daily at ${h}:${m} ${tz}`, `Daily at ${h}:${m} ${tz}`));
}

// ── SECTION 2: Specific weekdays at a time (30 jobs) ─────────────────────────
// Format: "Monday at HH:MM TIMEZONE" or "Monday,Wednesday,Friday at HH:MM TIMEZONE"
const dayNames = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
for (let i = 0; i < 14; i++) {
  const day = dayNames[i % 7];
  const h = String(6 + i).padStart(2, '0');
  const tz = timezones[i % timezones.length];
  rows.push(job(`${day} at ${h}:00 ${tz}`, `${day} at ${h}:00`));
}
const dayCombos = [
  'Monday,Wednesday,Friday',
  'Tuesday,Thursday',
  'Monday,Tuesday,Wednesday,Thursday,Friday',
  'Saturday,Sunday',
  'Monday,Wednesday',
  'Tuesday,Thursday,Saturday',
  'Monday,Friday',
  'Wednesday,Friday',
];
for (let i = 0; i < 16; i++) {
  const combo = dayCombos[i % dayCombos.length];
  const h = String(5 + (i % 18)).padStart(2, '0');
  const tz = timezones[i % timezones.length];
  rows.push(job(`${combo} at ${h}:00 ${tz}`, `${combo} at ${h}:00`));
}

// ── SECTION 3: Weekdays / Business Days at a time (10 jobs) ──────────────────
// Format: "Weekdays at HH:MM TIMEZONE"
for (let i = 0; i < 10; i++) {
  const label = i % 2 === 0 ? 'Weekdays' : 'Business Days';
  const h = String(7 + i).padStart(2, '0');
  const tz = timezones[i % timezones.length];
  rows.push(job(`${label} at ${h}:00 ${tz}`, `${label} at ${h}:00`));
}

// ── SECTION 4: Interval with start + end time (40 jobs) ──────────────────────
// Format: "Every N minutes from HH:MM to HH:MM TIMEZONE"
// Format: "Every N hours from HH:MM to HH:MM TIMEZONE"
const minuteIntervals = [5, 7, 10, 15, 20, 30, 45];
for (let i = 0; i < 25; i++) {
  const mins = minuteIntervals[i % minuteIntervals.length];
  const startH = String(5 + (i % 6)).padStart(2, '0');
  const endH = String(18 + (i % 5)).padStart(2, '0');
  const tz = timezones[i % timezones.length];
  rows.push(job(`Every ${mins} minutes from ${startH}:00 to ${endH}:00 ${tz}`, `Every ${mins}min ${startH}:00-${endH}:00 ${tz}`));
}
for (let i = 0; i < 15; i++) {
  const hrs = (i % 6) + 1;
  const startH = String(i % 8).padStart(2, '0');
  const endH = String(20 + (i % 4)).padStart(2, '0');
  const tz = timezones[i % timezones.length];
  rows.push(job(`Every ${hrs} hours from ${startH}:00 to ${endH}:00 ${tz}`, `Every ${hrs}hr ${startH}:00-${endH}:00 ${tz}`));
}

// ── SECTION 5: Weekday + Interval with window (30 jobs) ──────────────────────
// Format: "Monday every 15 minutes from 08:00 to 20:00 Asia/Kolkata"
for (let i = 0; i < 20; i++) {
  const day = dayNames[i % 7];
  const mins = minuteIntervals[i % minuteIntervals.length];
  const tz = timezones[i % timezones.length];
  rows.push(job(`${day} every ${mins} minutes from 06:00 to 22:00 ${tz}`, `${day} every ${mins}min 06-22 ${tz}`));
}
for (let i = 0; i < 10; i++) {
  const mins = minuteIntervals[i % minuteIntervals.length];
  const tz = timezones[i % timezones.length];
  rows.push(job(`Weekdays every ${mins} minutes from 07:00 to 19:00 ${tz}`, `Weekdays every ${mins}min 07-19 ${tz}`));
}

// ── SECTION 6: AT/EVERY/UNTIL format (20 jobs) ──────────────────────────────
// This is the standard Stonebranch schedule string format
rows.push(job('AT 0330 TIMEZONE Asia/Kolkata', 'AT 0330 IST'));
rows.push(job('AT 0000 EVERY 0400 UNTIL 2200 TIMEZONE UTC', 'Every 4hr 00:00-22:00 UTC'));
rows.push(job('AT 0600 EVERY 0030 UNTIL 2200 TIMEZONE Asia/Jakarta', 'Every 30min 06-22 WIB'));
rows.push(job('AT 0100 TIMEZONE Asia/Seoul', 'AT 0100 KST'));
rows.push(job('AT 2200 TIMEZONE America/New_York', 'AT 2200 EST'));
rows.push(job('AT 0000 EVERY 0100 UNTIL 2300 TIMEZONE UTC', 'Hourly 00-23 UTC'));
rows.push(job('AT 0800 EVERY 0200 UNTIL 2000 TIMEZONE Asia/Shanghai', 'Every 2hr 08-20 CST'));
rows.push(job('AT 0900 EVERY 0015 UNTIL 1700 TIMEZONE Asia/Kolkata', 'Every 15min 09-17 IST'));
rows.push(job('AT 1400 TIMEZONE Europe/London', 'AT 1400 GMT'));
rows.push(job('AT 0000 EVERY 1200 UNTIL 1200 TIMEZONE Asia/Seoul', 'Every 12hr 00-12 KST'));
rows.push(job('AT 0500 EVERY 0300 UNTIL 2300 TIMEZONE America/Chicago', 'Every 3hr 05-23 CST'));
rows.push(job('AT 0730 TIMEZONE Asia/Bangkok', 'AT 0730 ICT'));
rows.push(job('AT 1000 EVERY 0045 UNTIL 1800 TIMEZONE Europe/Berlin', 'Every 45min 10-18 CET'));
rows.push(job('AT 0200 TIMEZONE Asia/Singapore', 'AT 0200 SGT'));
rows.push(job('AT 0600 EVERY 0020 UNTIL 2000 TIMEZONE Asia/Kolkata', 'Every 20min 06-20 IST'));
rows.push(job('AT 1100 TIMEZONE America/Los_Angeles', 'AT 1100 PST'));
rows.push(job('AT 0400 EVERY 0600 UNTIL 2200 TIMEZONE UTC', 'Every 6hr 04-22 UTC'));
rows.push(job('AT 0300 TIMEZONE Asia/Tokyo', 'AT 0300 JST'));
rows.push(job('AT 0800 EVERY 0010 UNTIL 0900 TIMEZONE Asia/Kolkata', 'Every 10min 08-09 IST'));
rows.push(job('AT 2100 TIMEZONE Europe/London', 'AT 2100 GMT'));

// ── SECTION 7: Reference jobs (10 jobs) ──────────────────────────────────────
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
    'ServiceNow Group':            SN_GROUP,
    'Firstrun Date':               '2026-06-10',
    'Job Starttime':               '',
    'Job Timezone':                '',
    'Scheduled Frequency':         '',
    'Maximum Runtime':             '30',
    'Reference Job':               refName,
    'Member of Business Services': BS,
    'ServiceNow Ticket':           TICKET,
    'Job Recovery1':               'Re-run job',
    'Job Recovery2':               'Raise Low priority ticket to support',
  };
}

rows.push(refJob('Schedule-Test-001', 'Ref: inherits from Test-001 (Daily)'));
rows.push(refJob('Schedule-Test-031', 'Ref: inherits from Test-031 (Monday)'));
rows.push(refJob('Schedule-Test-045', 'Ref: inherits from Test-045 (Mon,Wed,Fri)'));
rows.push(refJob('Schedule-Test-065', 'Ref: inherits from Test-065 (Weekdays)'));
rows.push(refJob('Schedule-Test-075', 'Ref: inherits from Test-075 (Interval)'));
rows.push(refJob('Schedule-Test-095', 'Ref: inherits from Test-095 (Hourly)'));
rows.push(refJob('Schedule-Test-115', 'Ref: inherits from Test-115 (Mon interval)'));
rows.push(refJob('Schedule-Test-135', 'Ref: inherits from Test-135 (Wkday interval)'));
rows.push(refJob('Schedule-Test-145', 'Ref: inherits from Test-145 (AT format)'));
rows.push(refJob('Schedule-Test-155', 'Ref: inherits from Test-155 (AT interval)'));

console.log('Total jobs generated:', rows.length);
console.log('');
console.log('Breakdown:');
console.log('  Daily at fixed time:       30');
console.log('  Specific weekdays:         30');
console.log('  Weekdays/Business Days:    10');
console.log('  Interval with window:      40');
console.log('  Weekday + interval:        30');
console.log('  AT/EVERY/UNTIL format:     20');
console.log('  Reference jobs:            10');
console.log('  Remaining to fill 200:    ', 200 - rows.length);

// Fill remaining to reach exactly 200
while (rows.length < 200) {
  const i = rows.length;
  const h = String(i % 24).padStart(2, '0');
  const tz = timezones[i % timezones.length];
  rows.push(job(`Daily at ${h}:00 ${tz}`, `Fill job ${i + 1} — Daily at ${h}:00`));
}

console.log('  Total:                    ', rows.length);

// Write Excel — 2 sheets of 100
const COLS = [
  { wch: 30 }, { wch: 12 }, { wch: 28 }, { wch: 20 },
  { wch: 12 }, { wch: 40 }, { wch: 30 }, { wch: 14 },
  { wch: 55 }, { wch: 20 }, { wch: 20 }, { wch: 10 },
  { wch: 25 }, { wch: 12 }, { wch: 18 }, { wch: 30 },
  { wch: 40 },
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
