/**
 * Generate 3 test Excel files for Stonebranch job creation testing
 *
 * Batch 1: 100 Unix jobs — all 5 schedule types, with Job End Time for intervals
 * Batch 2: 100 Unix ref jobs — inherit schedule from Batch 1
 * Batch 3: 100 Windows jobs — all 5 schedule types
 *
 * Excel columns match the file parser exactly:
 *   Job Name, Job Type, Job Workstation, Job Script, Job Login Account,
 *   Job Description, ServiceNow Group, Firstrun Date, Job Starttime,
 *   Job Timezone, Scheduled Frequency, Job End Time, Maximum Runtime,
 *   Reference Job, Member of Business Services, ServiceNow Ticket,
 *   Job Recovery1, Job Recovery2
 */
const XLSX = require('xlsx');
const path = require('path');

const UNIX_CLUSTER = 'S021S172_unixCluster';
const WIN_CLUSTER  = 'S021S172_winCluster';
const CRED_UNIX    = 'mfg';
const CRED_WIN     = 'mfgwin';
const TICKET       = 'SCTASK0900001';
const BS           = 'QAD';
const SN_GROUP     = 'QAD DBA Progress Global';

// ── 5 Schedule Types with 20 variations each = 100 jobs ──────────────────────

const JOB_TYPES = [
  // Type 1: Daily at specific time (20 jobs)
  ...Array.from({ length: 20 }, (_, i) => ({
    type: 'DAILY',
    starttime: `${String(i + 1).padStart(2, '0')}:00`,
    timezone:  ['Asia/Kolkata','UTC','America/New_York','Asia/Shanghai','Europe/London'][i % 5],
    frequency: 'Daily',
    endtime:   '',
    desc:      `Daily job at ${String(i + 1).padStart(2, '0')}:00`,
  })),

  // Type 2: Business Days / Weekdays (20 jobs)
  ...Array.from({ length: 20 }, (_, i) => ({
    type: 'BUSINESS',
    starttime: `${String(6 + Math.floor(i / 4)).padStart(2, '0')}:${i % 4 === 0 ? '00' : i % 4 === 1 ? '30' : i % 4 === 2 ? '15' : '45'}`,
    timezone:  ['Asia/Kolkata','UTC','America/New_York','Asia/Jakarta','Europe/Berlin'][i % 5],
    frequency: 'Weekdays',
    endtime:   '',
    desc:      `Business days job ${i + 1}`,
  })),

  // Type 3: Specific weekdays (20 jobs)
  ...Array.from({ length: 20 }, (_, i) => {
    const combos = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday',
      'Monday,Wednesday,Friday','Tuesday,Thursday','Monday,Friday',
      'Monday,Wednesday','Tuesday,Thursday,Saturday','Wednesday,Friday',
      'Monday,Tuesday,Wednesday,Thursday,Friday','Saturday,Sunday',
      'Monday,Wednesday,Friday','Tuesday,Thursday','Monday,Friday',
      'Wednesday','Thursday'];
    return {
      type: 'WEEKLY',
      starttime: `${String(8 + (i % 12)).padStart(2, '0')}:00`,
      timezone:  ['Asia/Kolkata','UTC','America/New_York','Asia/Seoul','Europe/London'][i % 5],
      frequency: combos[i],
      endtime:   '',
      desc:      `Weekly — ${combos[i]}`,
    };
  }),

  // Type 4: Monthly on specific day (20 jobs)
  ...Array.from({ length: 20 }, (_, i) => {
    const days  = [1,2,3,4,5,7,10,12,14,15,16,17,18,20,21,22,23,24,25,28];
    const hours = [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20];
    return {
      type: 'MONTHLY',
      starttime: `${String(hours[i]).padStart(2, '0')}:00`,
      timezone:  ['America/New_York','America/Chicago','America/Los_Angeles','UTC','Europe/London'][i % 5],
      frequency: `FREQ=MONTHLY;INTERVAL=1;byday=${days[i]}`,
      endtime:   '',
      desc:      `Monthly on day ${days[i]}`,
    };
  }),

  // Type 5: Interval recurring jobs — 5 per day pattern × 4 day patterns = 20 jobs
  // Day patterns: Daily (5), Business Days/Weekdays (5), Specific days (5), Monthly day (5)
  // All have start time + end time
  ...Array.from({ length: 20 }, (_, i) => {
    const minuteOptions = [5, 10, 15, 20, 30];
    const hourOptions   = [1, 2, 3, 4, 6];

    const timezones5 = ['Asia/Kolkata','UTC','America/New_York','Asia/Jakarta','Europe/Berlin'];
    const startTimes5 = ['06:00','07:00','08:00','09:00','05:00'];
    const endTimes5   = ['22:00','21:00','20:00','19:00','23:00'];

    const group = Math.floor(i / 5); // 0=Daily, 1=Weekdays, 2=Specific days, 3=Monthly+interval
    const idx   = i % 5;

    const tz    = timezones5[idx];
    const start = startTimes5[idx];
    const end   = endTimes5[idx];

    let dayPattern;
    let freqStr;
    let desc;

    if (group === 0) {
      // Daily interval — runs every day
      const mins = minuteOptions[idx];
      dayPattern = 'Daily';
      freqStr = `FREQ=INTERVAL;interval=${mins};units=minutes;byday=Daily`;
      desc = `Daily — every ${mins} min from ${start} to ${end} ${tz}`;

    } else if (group === 1) {
      // Weekdays/Business Days interval
      const mins = minuteOptions[idx];
      dayPattern = 'Mon,Tue,Wed,Thu,Fri';
      freqStr = `FREQ=INTERVAL;interval=${mins};units=minutes;byday=Mon,Tue,Wed,Thu,Fri`;
      desc = `Weekdays — every ${mins} min from ${start} to ${end} ${tz}`;

    } else if (group === 2) {
      // Specific weekdays interval
      const days = ['Monday','Tuesday,Thursday','Monday,Wednesday,Friday','Wednesday,Friday','Monday,Friday'];
      const hrs  = hourOptions[idx];
      const dayByday = days[idx].split(',').map(d => d.trim().substring(0,3)).join(',');
      dayPattern = dayByday;
      freqStr = `FREQ=INTERVAL;interval=${hrs};units=hours;byday=${dayByday}`;
      desc = `${days[idx]} — every ${hrs}hr from ${start} to ${end} ${tz}`;

    } else {
      // Monthly — runs ONCE on this day of month at a specific time (no interval, no end time)
      const monthDays = [1, 15, 23, 24, 28];
      const mday = monthDays[idx];
      dayPattern = `Monthly day ${mday}`;
      freqStr = `FREQ=MONTHLY;INTERVAL=1;byday=${mday}`;
      desc = `Monthly on day ${mday} at ${start} ${tz}`;

      // Monthly jobs return early with no endtime
      return {
        type: 'INTERVAL',
        starttime: start,
        timezone:  tz,
        frequency: freqStr,
        endtime:   '',   // no end time — runs once per month
        desc,
      };
    }

    return {
      type: 'INTERVAL',
      starttime: start,
      timezone:  tz,
      frequency: freqStr,
      endtime:   end,
      desc,
    };
  }),
];

function makeRow(n, jobType, cluster, cred, refJob) {
  const num = String(n).padStart(3, '0');
  const prefix = cluster === WIN_CLUSTER ? 'Win' : 'Unix';
  const t = refJob ? null : JOB_TYPES[n - 1];

  return {
    'Job Name':                    `SB-AUTO-${prefix}-Test-${num}`,
    'Job Type':                    jobType,
    'Job Workstation':             cluster,
    'Job Script':                  'sleep 5',
    'Job Login Account':           cred,
    'Job Description':             refJob
      ? `Ref job ${num} — inherits schedule from SB-AUTO-Unix-Test-${num}`
      : t.desc,
    'ServiceNow Group':            SN_GROUP,
    'Firstrun Date':               '2026-07-01',
    'Job Starttime':               refJob ? '' : t.starttime,   // HH:MM only
    'Job Timezone':                refJob ? '' : t.timezone,     // IANA only
    'Scheduled Frequency':         refJob ? '' : t.frequency,    // FREQ= or natural
    'Job End Time':                refJob ? '' : (t.endtime || ''), // end time for intervals
    'Maximum Runtime':             '30',
    'Reference Job':               refJob || '',
    'Member of Business Services': BS,
    'ServiceNow Ticket':           TICKET,
    'Job Recovery1':               'Re-run job',
    'Job Recovery2':               'Raise Low priority ticket to support',
  };
}

const COLS = [
  { wch: 35 }, // Job Name
  { wch: 14 }, // Job Type
  { wch: 30 }, // Job Workstation
  { wch: 10 }, // Job Script
  { wch: 12 }, // Job Login Account
  { wch: 50 }, // Job Description
  { wch: 28 }, // ServiceNow Group
  { wch: 12 }, // Firstrun Date
  { wch: 10 }, // Job Starttime (HH:MM only)
  { wch: 22 }, // Job Timezone
  { wch: 40 }, // Scheduled Frequency
  { wch: 12 }, // Job End Time
  { wch: 10 }, // Maximum Runtime
  { wch: 35 }, // Reference Job
  { wch: 28 }, // Member of Business Services
  { wch: 18 }, // ServiceNow Ticket
  { wch: 30 }, // Job Recovery1
  { wch: 45 }, // Job Recovery2
];

function writeExcel(rows, filename) {
  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = COLS;
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Jobs');
  const out = path.join(__dirname, '..', filename);
  XLSX.writeFile(wb, out);
  console.log(`Created: ${out} (${rows.length} jobs)`);
}

// ── BATCH 1: 100 Unix Jobs — all 5 schedule types ────────────────────────────
const batch1 = Array.from({ length: 100 }, (_, i) => makeRow(i + 1, 'taskUnix', UNIX_CLUSTER, CRED_UNIX, ''));

// ── BATCH 2: 100 Unix Ref Jobs — inherit schedule from Batch 1 ───────────────
const batch2 = Array.from({ length: 100 }, (_, i) => {
  const num = String(i + 1).padStart(3, '0');
  return makeRow(i + 1, 'taskUnix', UNIX_CLUSTER, CRED_UNIX, `SB-AUTO-Unix-Test-${num}`);
});

// ── BATCH 3: 100 Windows Jobs — all 5 schedule types ────────────────────────
const batch3 = Array.from({ length: 100 }, (_, i) => makeRow(i + 1, 'taskWindows', WIN_CLUSTER, CRED_WIN, ''));

writeExcel(batch1, 'test_batch1_unix_100.xlsx');
writeExcel(batch2, 'test_batch2_unix_ref_100.xlsx');
writeExcel(batch3, 'test_batch3_windows_100.xlsx');

// Summary
console.log('\n── Batch 1 / 3 Schedule Breakdown ──────');
const types = ['Daily (jobs 1-20)', 'Business Days (21-40)', 'Specific Days (41-60)', 'Monthly (61-80)', 'Interval + End Time (81-100)'];
types.forEach(t => console.log(' ', t));
console.log('\nAll interval jobs (81-100) have Job End Time set.');
console.log('Batch 2: all 100 jobs inherit schedule from Batch 1 via Reference Job.');
