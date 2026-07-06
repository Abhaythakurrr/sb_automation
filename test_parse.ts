import { parseStartTime } from './frontend/src/utils/jobDocParser';

// Test case 1: "21:00 EST" format
const test1 = parseStartTime("21:00 EST");
console.log('Test 1 - "21:00 EST":');
console.log('  start_time:', test1.start_time);
console.log('  timezone:', test1.timezone);
console.log('  schedule_string:', test1.schedule_string);
console.log();

// Test case 2: "AT 0330 TIMEZONE Asia/Kolkata" format
const test2 = parseStartTime("AT 0330 TIMEZONE Asia/Kolkata");
console.log('Test 2 - "AT 0330 TIMEZONE Asia/Kolkata":');
console.log('  start_time:', test2.start_time);
console.log('  timezone:', test2.timezone);
console.log('  schedule_string:', test2.schedule_string);
console.log();

// Test case 3: "08:30" format (bare time)
const test3 = parseStartTime("08:30");
console.log('Test 3 - "08:30":');
console.log('  start_time:', test3.start_time);
console.log('  timezone:', test3.timezone);
console.log('  schedule_string:', test3.schedule_string);
console.log();

// Test case 4: "AT 1800 EVERY 0030 UNTIL 2200 TIMEZONE UTC" format
const test4 = parseStartTime("AT 1800 EVERY 0030 UNTIL 2200 TIMEZONE UTC");
console.log('Test 4 - "AT 1800 EVERY 0030 UNTIL 2200 TIMEZONE UTC":');
console.log('  start_time:', test4.start_time);
console.log('  timezone:', test4.timezone);
console.log('  schedule_string:', test4.schedule_string);
