/**
 * Confirms the frozen artifact reproduces the model that was trained.
 *
 *   npx tsx src/copilot/ml/freeze.verify.ts
 *
 * WHY THIS IS NOT OPTIONAL
 *
 * Weights are stored as Float32 to halve the artifact, and they are addressed by
 * vocabulary index. Both of those are places where a mistake produces a model
 * that loads cleanly, runs at full speed, and is wrong — no exception, no warning,
 * just different answers. The only way to know freezing was lossless is to run
 * both models over the same inputs and compare.
 *
 * The comparison is on predicted labels, not on raw weights: labels are what the
 * Copilot acts on, and Float32 rounding legitimately shifts a probability in the
 * seventh decimal place without changing any decision. A single label
 * disagreement fails the check.
 *
 * Runs in one process, holding both models at once: the corpus-trained pair is
 * built first, its predictions are recorded, then the artifact is loaded and asked
 * the same questions.
 */
import { spawnSync } from 'child_process';
import path from 'path';

interface Probe { text: string }

/** Inputs spanning both text surfaces the Copilot actually sees. */
function probes(): string[] {
  return [
    // Prose, as typed into the dock.
    'every 5 minutes of monday, tuesday and wednesday',
    'weekdays only at 06:30',
    'on tuesdays and thursdays at 07:00',
    'mon-fri from 0900 to 1800',
    'the first business day of every month',
    'the last wednesday of each month at 23:00',
    'on the 15th of each month at midnight',
    'every 3 days',
    'daily at 9pm',
    'hourly',
    'every half an hour on weekends',
    'monday, thursday, friday only at 11:15',
    'runs daily at 03:15',
    'business days at 22:00',
    'every 45 minutes between 6 am and 10 pm on friday',
    'every other day at noon',
    'fortnightly',
    'monthly on day 24',
    'at the weekend',
    'every 2 hours mon,wed,fri',
    // Intake syntax, as it arrives in a spreadsheet.
    'FREQ=INTERVAL;interval=10;units=MINUTES;byday=Mon,Tue,Wed,Thu,Fri 06:00:00 AM to AT 2100',
    'FREQ=WEEKLY;byday=Mon,Tue,Wed,Thu,Fri 06:00:00 AM',
    'FREQ=MONTHLY;INTERVAL=1;byday=24 11:30:00 PM',
    'Monday,Wednesday,Friday 0315',
    'Weekdays 07:45:00 AM',
    'Daily AT 0600 TIMEZONE Asia/Kolkata',
    'FREQ=INTERVAL;interval=30;units=minutes;byday=Daily 05:00 to 23:00',
    'Mon,Wed 6:00 pm',
    // Intent routing.
    'what does maxruntime mean',
    'check my uploaded file for problems',
    'explain this payload',
    'why did this fail',
    'what will happen if i execute this',
    'how do i delete a job safely',
    'what can you do',
    'what is a trigger',
    'i need this executing every tuesday morning at 7',
    'who won the world cup in 1998',
  ];
}

/**
 * Collects predictions in a child process with a given weights mode.
 *
 * Two processes rather than one, because `weights()` is consulted lazily and
 * cached inside the model modules — flipping the mode mid-process would leave
 * whichever model was touched first on the wrong side of the comparison.
 */
function collect(mode: 'trained' | 'frozen'): Record<string, string> {
  const script = `
    import { classifyShape, schedulePatternStats } from './src/copilot/ml/schedulePattern';
    import { classifyIntent, intentModelStats } from './src/copilot/ml/intent';
    const probes = ${JSON.stringify(probes())};
    const out: Record<string, string> = {};
    for (const p of probes) {
      const s = classifyShape(p);
      const i = classifyIntent(p);
      out[p] = s.time + '/' + s.day + '/' + i.intent;
    }
    out['__source'] = schedulePatternStats().weightSource + ' | ' + intentModelStats().weightSource;
    process.stdout.write(JSON.stringify(out));
  `;

  const res = spawnSync(process.execPath, [require.resolve('tsx/cli'), '--eval', script], {
    cwd: process.cwd(),
    encoding: 'utf-8',
    maxBuffer: 32 * 1024 * 1024,
    env: {
      ...process.env,
      LOG_LEVEL: 'fatal',
      ENABLE_CONSOLE_LOGGING: 'false',
      COPILOT_IGNORE_FROZEN_WEIGHTS: mode === 'trained' ? 'true' : 'false',
    },
  });

  if (res.status !== 0) {
    console.error(`the ${mode} probe process failed`);
    console.error((res.stderr || res.stdout || '').slice(-3000));
    process.exit(1);
  }
  const json = (res.stdout || '').trim();
  const start = json.indexOf('{');
  return JSON.parse(json.slice(start));
}

if (require.main === module) {
  console.log('collecting predictions from the corpus-trained models…');
  const trained = collect('trained');
  console.log(`  ${trained.__source}`);

  console.log('collecting predictions from the frozen artifact…');
  const frozen = collect('frozen');
  console.log(`  ${frozen.__source}`);

  if (!frozen.__source.includes('frozen')) {
    console.error('\nFAIL: the artifact was not loaded. Either it is still a placeholder, or the');
    console.error('feature fingerprint no longer matches. Run: npx tsx src/copilot/ml/freeze.ts');
    process.exit(1);
  }

  const keys = probes();
  const mismatches: { text: string; trained: string; frozen: string }[] = [];
  for (const k of keys) {
    if (trained[k] !== frozen[k]) mismatches.push({ text: k, trained: trained[k], frozen: frozen[k] });
  }

  console.log(`\n${'─'.repeat(76)}`);
  console.log(`FREEZE VERIFICATION — ${keys.length} probes, time shape / day shape / intent`);
  console.log('─'.repeat(76));

  if (mismatches.length === 0) {
    console.log(`PASS: the artifact reproduces every prediction of the trained model.`);
    console.log('      Float32 storage and the vocabulary round-trip are lossless for these decisions.');
    process.exit(0);
  }

  console.log(`FAIL: ${mismatches.length} of ${keys.length} predictions differ.\n`);
  for (const m of mismatches.slice(0, 20)) {
    console.log(`  "${m.text}"`);
    console.log(`     trained ${m.trained}`);
    console.log(`     frozen  ${m.frozen}`);
  }
  console.log('\nDo not ship this artifact. Freezing changed the model.');
  process.exit(1);
}
