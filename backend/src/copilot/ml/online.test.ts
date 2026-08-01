/**
 * Runtime learning tests.
 *
 *   npx tsx src/copilot/ml/online.test.ts
 *
 * The behaviour worth testing here is not "does a gradient step change the
 * output" — it will. It is the guard: that a correction which cannot be absorbed
 * without collateral damage gets refused and rolled back, and that the model is
 * exactly where it started afterwards. That property is the reason this feature is
 * safe to have enabled, so it needs a test that would notice if it broke.
 */
import fs from 'fs';
import { classifyShape, TimeShape, DayShape } from './schedulePattern';
import { classifyIntent } from './intent';
import { routeIntent } from './route';
import {
  learnShape, learnIntent, forgetOnline, onlineStatus, replayOnline,
  exemplarIntent, ONLINE_STORE_FILE,
} from './online';
import { weightsStatus } from './weights';

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, detail = '') => {
  if (cond) { pass++; console.log(`  PASS  ${name}${detail ? '  ' + detail : ''}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? '  ' + detail : ''}`); }
};

/** Guard-set accuracy, read straight off the status report. */
const guardAcc = () => {
  const s = onlineStatus();
  return s.guardAccuracy ? `${(s.guardAccuracy.time * 100).toFixed(2)}/${(s.guardAccuracy.day * 100).toFixed(2)}` : 'n/a';
};

function section(title: string) { console.log(`\n=== ${title}`); }

// Start from a clean slate, and put it back afterwards so running the test does
// not leave a trained-on artifact behind in a developer's working copy.
const had = fs.existsSync(ONLINE_STORE_FILE);
const backup = had ? fs.readFileSync(ONLINE_STORE_FILE, 'utf-8') : null;
forgetOnline();

try {
  section('Preconditions');
  const w = weightsStatus();
  ok('frozen weights are loaded', w.loaded, w.reason);
  ok('a guard set shipped with them', (w.invariantCount ?? 0) > 100, `${w.invariantCount} cases`);

  section('A correction the model already agrees with is a no-op');
  {
    const probe = 'every 15 minutes on weekdays';
    const p = classifyShape(probe);
    const r = learnShape(probe, p.time, p.day);
    ok('not applied, because nothing needed changing', !r.applied, r.reason.slice(0, 60));
    ok('still classified the same way', classifyShape(probe).day === p.day);
  }

  section('A learnable correction is applied and sticks');
  {
    // A phrasing the shipped model gets wrong, whose correct reading does not
    // conflict with anything in the guard set — so it is absorbable. Pinned rather
    // than searched for, because a test that only asserts "something happened"
    // would keep passing if learning stopped working entirely.
    const text = 'kick off nightly around teatime';
    const want: DayShape = 'daily';
    const start = classifyShape(text);
    ok('the shipped model reads this one wrongly', start.day !== want,
      `reads it as ${start.day}`);

    const before = guardAcc();
    const r = learnShape(text, undefined, want);
    ok('the correction was applied', r.applied, r.reason.slice(0, 70));
    ok('the model now reads it as asked', classifyShape(text).day === want,
      `${r.before} -> ${r.after}`);
    ok('guard accuracy did not fall', !!r.guard && r.guard.dayAfter >= r.guard.dayBefore,
      `${before} -> ${guardAcc()}`);
    ok('the correction is persisted', onlineStatus().shapeCorrections >= 1,
      `${onlineStatus().shapeCorrections} stored`);
  }

  section('Guard blocks a correction that would break known-good cases');
  {
    // A flatly wrong label on a phrase whose meaning is unambiguous. Absorbing it
    // requires the net to unlearn what business days are, which the guard set will
    // see immediately.
    const before = guardAcc();
    const r = learnShape('weekdays only at 06:30', undefined, 'monthlyOrdinal');
    const after = guardAcc();
    ok('refused or rolled back', !r.applied, r.reason.slice(0, 74));
    ok('guard accuracy is exactly where it was', before === after, `${before} -> ${after}`);
    ok('business days still read correctly', classifyShape('weekdays only at 06:30').day === 'businessDays');
    ok('the refusal was recorded', onlineStatus().refused >= 1);
  }

  section('Intent corrections are exemplar-matched, not trained');
  {
    const phrase = 'give me the runbook for taking a box out of rotation';
    const base = classifyIntent(phrase).intent;
    const r = learnIntent(phrase, 'howto');
    ok('recorded', r.applied, r.reason.slice(0, 60));

    const ex = exemplarIntent(phrase);
    ok('exact phrase matches its own exemplar', !!ex && ex.intent === 'howto',
      ex ? `similarity ${ex.similarity.toFixed(3)}` : 'no match');
    ok('routing honours it', routeIntent(phrase).intent === 'howto', `base model said ${base}`);
    ok('the base classifier is untouched', classifyIntent(phrase).intent === base,
      'measurement must describe the shipped model');

    const unrelated = 'what does maxruntime mean';
    ok('an unrelated question is not captured', routeIntent(unrelated).intent !== 'howto',
      `-> ${routeIntent(unrelated).intent}`);
  }

  section('Replay after a restart');
  {
    const stored = onlineStatus().shapeCorrections;
    const learnedText = 'kick off nightly around teatime';
    const r = replayOnline();
    ok('every stored correction was considered', r.corrections === stored,
      `${r.corrections} of ${stored}: ${r.reason}`);
    ok('the learned reading is back after reloading base weights',
      classifyShape(learnedText).day === 'daily',
      `reads as ${classifyShape(learnedText).day}`);
    ok('guard still intact after replay', guardAcc() === '100.00/100.00', guardAcc());

    // Idempotence: replay used to train on whatever was already in memory, so
    // calling it twice applied everything twice and drifted the model further.
    const again = replayOnline();
    ok('replay is idempotent', again.satisfied === r.satisfied,
      `${r.satisfied} then ${again.satisfied}`);
    ok('and still has not damaged the guard set', guardAcc() === '100.00/100.00', guardAcc());
  }

  section('Reset returns to the shipped weights');
  {
    forgetOnline();
    ok('nothing is remembered', onlineStatus().shapeCorrections === 0 && onlineStatus().intentExemplars === 0);
    ok('exemplar override is gone',
      routeIntent('give me the runbook for taking a box out of rotation').source !== 'exemplar');
    ok('business days still correct after reset',
      classifyShape('weekdays only at 06:30').day === 'businessDays');
  }
} finally {
  // Restore whatever was there before.
  try {
    if (backup !== null) fs.writeFileSync(ONLINE_STORE_FILE, backup);
    else if (fs.existsSync(ONLINE_STORE_FILE)) fs.unlinkSync(ONLINE_STORE_FILE);
  } catch { /* best effort */ }
}

console.log('\n' + '─'.repeat(72));
console.log(fail === 0 ? `all ${pass} runtime-learning checks passed` : `${fail} of ${pass + fail} CHECK(S) FAILED`);
process.exit(fail === 0 ? 0 : 1);
