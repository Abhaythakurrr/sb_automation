/**
 * Generate test_jobs_100.xlsx
 * Two sheets: Batch_1 (jobs 001-050) and Batch_2 (jobs 051-100)
 * Agent: S021S172_unixCluster (test env)
 * Credential: mfg
 * All UI-friendly column names
 */
const XLSX = require('xlsx');
const path = require('path');

const AGENT  = 'S021S172_unixCluster';
const CRED   = 'mfg';
const TICKET = 'SCTASK0868000';

const COLS = [
  { wch: 38 }, { wch: 12 }, { wch: 30 }, { wch: 80 },
  { wch: 10 }, { wch: 40 }, { wch: 8  }, { wch: 14 },
  { wch: 50 }, { wch: 10 }, { wch: 12 }, { wch: 28 },
  { wch: 18 }, { wch: 70 },
];

// Schedule patterns — varied across 100 jobs
const schedules = [
  'AT 0000 TIMEZONE UTC',
  'AT 0030 TIMEZONE Asia/Kolkata',
  'AT 0100 TIMEZONE Asia/Jakarta',
  'AT 0130 TIMEZONE Asia/Seoul',
  'AT 0200 TIMEZONE Asia/Shanghai',
  'AT 0230 TIMEZONE Asia/Singapore',
  'AT 0300 TIMEZONE Asia/Bangkok',
  'AT 0330 TIMEZONE Asia/Kolkata',
  'AT 0400 TIMEZONE Asia/Tokyo',
  'AT 0500 TIMEZONE Asia/Karachi',
  'AT 0600 TIMEZONE Europe/London',
  'AT 0700 TIMEZONE Europe/Berlin',
  'AT 0800 TIMEZONE America/New_York',
  'AT 0900 TIMEZONE America/Chicago',
  'AT 1000 TIMEZONE America/Los_Angeles',
  'AT 2200 TIMEZONE Asia/Kolkata',
  'AT 2300 TIMEZONE Asia/Jakarta',
  'AT 2330 TIMEZONE Asia/Singapore',
  'AT 0000 EVERY 0400 TIMEZONE UTC',
  'AT 0000 EVERY 0600 TIMEZONE Asia/Kolkata',
  'AT 0000 EVERY 1200 TIMEZONE UTC',
  'AT 0600 EVERY 0600 UNTIL 1800 TIMEZONE Asia/Jakarta',
  'AT 0800 EVERY 0200 UNTIL 2000 TIMEZONE Asia/Shanghai',
  'AT 0900 EVERY 0015 UNTIL 1700 TIMEZONE Asia/Kolkata',
  'AT 0000 EVERY 0030 UNTIL 2100 TIMEZONE Asia/Bangkok',
  'AT 0000 EVERY 0100 TIMEZONE UTC',
  'AT 0000 EVERY 0800 TIMEZONE Asia/Singapore',
  'AT 0100 EVERY 0300 UNTIL 2200 TIMEZONE Asia/Seoul',
  'AT 0000 EVERY 0200 TIMEZONE UTC',
  'AT 0600 EVERY 0400 UNTIL 2200 TIMEZONE America/New_York',
];

const maxRuntimes = [15, 20, 30, 45, 60, 90, 120, 180, 240, 300];

const scripts = [
  'sleep 10',
  'sleep 15',
  'sleep 20',
  'sleep 30',
  'sleep 5',
];

function makeRow(n) {
  const num     = String(n).padStart(3, '0');
  const sched   = schedules[(n - 1) % schedules.length];
  const runtime = maxRuntimes[(n - 1) % maxRuntimes.length];
  const script  = scripts[(n - 1) % scripts.length];

  const jobDoc = [
    'Job Type = Production',
    'Business Unit = AS',
    'Job Function = BU',
    'Job Priority = 4',
    `Job Name = Automation_Test_Job_${num}`,
    `Job Description = APAC - Automation Test Job ${num}`,
    `Job StreamName = DEMO-STREAM-${num}`,
    'ServiceNow Group = QAD Support Global',
    'Job Recovery1 = Re-run job',
    'Job Recovery2 = Raise Medium priority ticket to support',
    'Firstrun Date = 2026-05-08',
    'Scheduled Frequency = Daily',
    `Maximum Runtime = ${String(runtime).padStart(4, '0')}`,
    `Job Starttime = ${sched}`,
    `Job Workstation = ${AGENT}`,
    `Job Login Account = ${CRED}`,
    `ServiceNow Ticket = ${TICKET}`,
  ].join('\n');

  return {
    'Job Name':                    `Automation_Test_Job_${num}`,
    'Job Type':                    'taskUnix',
    'Job Workstation':             AGENT,
    'Job Script':                  script,
    'Job Login Account':           CRED,
    'Job Description':             `APAC - Automation Test Job ${num}`,
    'Active':                      'true',
    'Firstrun Date':               '2026-05-08',
    'Job Starttime':               sched,
    'Maximum Runtime':             String(runtime),
    'Reference Job':               '',
    'Member of Business Services': '',
    'ServiceNow Ticket':           TICKET,
    'Job Documentation':           jobDoc,
  };
}

// Build 100 rows
const batch1 = Array.from({ length: 50 }, (_, i) => makeRow(i + 1));
const batch2 = Array.from({ length: 50 }, (_, i) => makeRow(i + 51));

function makeSheet(rows) {
  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = COLS;
  return ws;
}

const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, makeSheet(batch1), 'Batch_1_001_050');
XLSX.utils.book_append_sheet(wb, makeSheet(batch2), 'Batch_2_051_100');

const out = path.join(__dirname, '..', 'test_jobs_100.xlsx');
XLSX.writeFile(wb, out);
console.log('Created:', out);
console.log('Sheet 1: Automation_Test_Job_001 → 050');
console.log('Sheet 2: Automation_Test_Job_051 → 100');
console.log('Agent:', AGENT);
console.log('Credential:', CRED);
console.log('Schedules: 30 different patterns across 100 jobs');
