// Test with the ACTUAL compiled JS to verify the payload exactly
const { buildScheduleFields } = require('../dist/utils/triggerSchedule.js');
const { buildTriggerPayload } = require('../dist/utils/payloadMapper.js');

// Row for job 048
const row = {
  task_name: 'SB-Unix-Test-048',
  schedule_string: 'Weekly — Monday,Wednesday,Friday',
  frequency_type: 'Monday,Wednesday,Friday',
  start_time: '03:00:00 PM',
  timezone: 'America/New_York',
  end_time: '',
  description: 'Re-run job',
  agent: 'S021S172_unixCluster',
  servicenow_ticket: 'SCTASK47',
  servicenow_group: 'SNOWQ',
  recovery1: 'Re-run job',
  recovery2: 'Raise Low priority ticket to support',
  job_doc: '',
  business_services: 'QAD',
  first_run_date: '2026-07-01',
  command: 'sleep 5',
  credential: 'mfg',
  task_type: 'taskUnix',
  max_runtime: '30',
};

// Test 1: buildScheduleFields directly
const sched = buildScheduleFields(
  row.schedule_string?.trim() || '',
  row.frequency_type?.trim() || '',
  row.start_time?.trim() || '',
  row.timezone?.trim() || '',
  row.end_time?.trim() || '',
);
console.log('=== buildScheduleFields output ===');
console.log(JSON.stringify(sched, null, 2));

// Test 2: full payload
console.log('\n=== buildTriggerPayload output ===');
const payload = buildTriggerPayload(row);
console.log(JSON.stringify(payload, null, 2));

// Test 3: Check key fields
console.log('\n=== Key checks ===');
const dayFlags = ['mon','tue','wed','thu','fri','sat','sun'];
const setDays = dayFlags.filter(d => payload[d] === true);
console.log('Set day flags:', setDays.length ? setDays : '(none)');
console.log('simpleDateType:', payload.simpleDateType || '(not set)');
console.log('dayStyle:', payload.dayStyle);
console.log('timeStyle:', payload.timeStyle);
console.log('time:', payload.time);
console.log('timeZone:', payload.timeZone);

// The critical check
if (payload.simpleDateType === 'Daily' || !payload.simpleDateType) {
  console.log('\n⚠️  CHECK: simpleDateType is', payload.simpleDateType || 'undefined', '-',
    payload.simpleDateType === 'Daily' ? 'PROBLEM: Daily will show in UI!' : 'OK (deleted as expected)');
}
if (setDays.includes('mon') && setDays.includes('wed') && setDays.includes('fri')) {
  console.log('✅ Mon, Wed, Fri correctly set');
} else {
  console.log('❌ Missing day flags! Expected mon, wed, fri');
}
