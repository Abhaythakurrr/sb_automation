/**
 * Generate 3 test Excel files for Stonebranch job creation testing
 *
 * Batch 1: 100 Unix jobs — all independent, sleep 5, S021S172_unixCluster
 * Batch 2: 100 Unix ref jobs — inherit schedule from Batch 1 jobs
 * Batch 3: 100 Windows jobs — taskWindows, sleep 5, S021S172_winCluster
 */
const XLSX = require('xlsx');
const path = require('path');

const UNIX_CLUSTER    = 'S021S172_unixCluster';
const WIN_CLUSTER     = 'S021S172_winCluster';
const CRED_UNIX       = 'mfg';
const CRED_WIN        = 'mfgwin';
const TICKET          = 'SCTASK0900001';
const BS              = 'QAD';
const SN_GROUP        = 'QAD DBA Progress Global';

const COLS = [
  { wch: 40 }, // Job Name
  { wch: 14 }, // Job Type
  { wch: 28 }, // Job Workstation
  { wch: 20 }, // Job Script
  { wch: 12 }, // Job Login Account
  { wch: 45 }, // Job Description
  { wch: 30 }, // ServiceNow Group
  { wch: 12 }, // Firstrun Date
  { wch: 55 }, // Job Starttime
  { wch: 18 }, // Job Timezone
  { wch: 35 }, // Scheduled Frequency
  { wch: 10 }, // Maximum Runtime
  { wch: 35 }, // Reference Job
  { wch: 30 }, // Member of Business Services
  { wch: 18 }, // ServiceNow Ticket
  { wch: 35 }, // Job Recovery1
  { wch: 40 }, // Job Recovery2
];

const timezones = [
  'Asia/Kolkata','Asia/Seoul','Asia/Shanghai','Asia/Jakarta',
  'Asia/Bangkok','Asia/Singapore','UTC','America/New_York',
  'America/Chicago','Europe/London','Europe/Berlin','Asia/Tokyo',
];

const schedules = [
  'Daily at 01:00 Asia/Kolkata',
  'Daily at 02:30 UTC',
  'Daily at 03:00 America/New_York',
  'Daily at 04:00 Asia/Shanghai',
  'Weekdays at 06:00 Asia/Kolkata',
  'Weekdays at 07:30 UTC',
  'Monday,Wednesday,Friday at 08:00 UTC',
  'Tuesday,Thursday at 09:00 Asia/Kolkata',
  'AT 1000 TIMEZONE Asia/Seoul',
  'AT 1100 TIMEZONE Europe/London',
  'AT 1200 TIMEZONE Asia/Jakarta',
  'AT 1300 TIMEZONE America/Chicago',
  'Every 4 hours from 06:00 to 22:00 UTC',
  'Every 6 hours from 00:00 to 18:00 Asia/Kolkata',
  'Every 2 hours from 08:00 to 20:00 Europe/Berlin',
  'Monday every 30 minutes from 09:00 to 17:00 UTC',
];

function makeRow(n, type, cluster, cred, sched, refJob, desc) {
  const num = String(n).padStart(3, '0');
  const prefix = type === 'taskWindows' ? 'Win-Test' : 'Unix-Test';
  return {
    'Job Name':                    `SB-AUTO-${prefix}-${num}`,
    'Job Type':                    type,
    'Job Workstation':             cluster,
    'Job Script':                  'sleep 5',
    'Job Login Account':           cred,
    'Job Description':             desc || `Test job ${num} — ${type}`,
    'ServiceNow Group':            SN_GROUP,
    'Firstrun Date':               '2026-07-01',
    'Job Starttime':               sched,
    'Job Timezone':                '',
    'Scheduled Frequency':         '',
    'Maximum Runtime':             '30',
    'Reference Job':               refJob || '',
    'Member of Business Services': BS,
    'ServiceNow Ticket':           TICKET,
    'Job Recovery1':               'Re-run job',
    'Job Recovery2':               'Raise Low priority ticket to support',
  };
}

// ── BATCH 1: 100 Unix Jobs ────────────────────────────────────────────────────
const batch1 = [];
for (let i = 1; i <= 100; i++) {
  const sched = schedules[(i - 1) % schedules.length];
  batch1.push(makeRow(i, 'taskUnix', UNIX_CLUSTER, CRED_UNIX, sched, '',
    `Unix batch job ${String(i).padStart(3,'0')} — automated test`));
}

// ── BATCH 2: 100 Unix Ref Jobs (inherit schedule from Batch 1) ───────────────
const batch2 = [];
for (let i = 1; i <= 100; i++) {
  const num = String(i).padStart(3, '0');
  const refJob = `SB-AUTO-Unix-Test-${num}`;
  batch2.push(makeRow(i, 'taskUnix', UNIX_CLUSTER, CRED_UNIX, '', refJob,
    `Unix ref job ${num} — inherits schedule from ${refJob}`));
}

// ── BATCH 3: 100 Windows Jobs ─────────────────────────────────────────────────
const batch3 = [];
for (let i = 1; i <= 100; i++) {
  const sched = schedules[(i - 1) % schedules.length];
  batch3.push(makeRow(i, 'taskWindows', WIN_CLUSTER, CRED_WIN, sched, '',
    `Windows batch job ${String(i).padStart(3,'0')} — automated test`));
}

function writeExcel(rows, filename) {
  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = COLS;
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Jobs');
  const out = path.join(__dirname, '..', filename);
  XLSX.writeFile(wb, out);
  console.log(`Created: ${out} (${rows.length} jobs)`);
}

writeExcel(batch1, 'test_batch1_unix_100.xlsx');
writeExcel(batch2, 'test_batch2_unix_ref_100.xlsx');
writeExcel(batch3, 'test_batch3_windows_100.xlsx');

console.log('\nAll 3 test Excel files created.');
console.log('Batch 1: 100 Unix jobs with schedules');
console.log('Batch 2: 100 Unix ref jobs (inherit from Batch 1)');
console.log('Batch 3: 100 Windows jobs with schedules');
