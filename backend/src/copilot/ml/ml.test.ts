/**
 * Tests for the Copilot's self-contained ML layer.
 *
 * Run with:  npx tsx src/copilot/ml/ml.test.ts
 *
 * These are measurements, not smoke tests. Each model is scored on held-out
 * data it was not trained on, determinism is asserted by retraining in a fresh
 * process and comparing outputs, and the semantic index is checked on the exact
 * cases lexical search cannot solve.
 */
import { classifyIntent, evaluateIntent, intentModelStats, HELD_OUT } from './intent';
import { classifyShape, evaluateShapes, schedulePatternStats } from './schedulePattern';
import { semanticSimilarities, semanticIndex } from './index';
import { sentences, compose } from './summarize';
import { median, mad, outliers, dice, nearDuplicates } from './stats';
import { KNOWLEDGE } from '../knowledge';
import { retrieve } from '../retriever';
import { interpretSchedule } from '../scheduleAssistant';

let failures = 0;
const ok = (cond: boolean, label: string, detail = '') => {
  if (cond) console.log(`  PASS  ${label}${detail ? '  ' + detail : ''}`);
  else { console.log(`  FAIL  ${label}${detail ? '  ' + detail : ''}`); failures++; }
};

// ── 1. Intent classifier ─────────────────────────────────────────────────────
console.log('\n=== Intent classifier (Multinomial Naive Bayes)');
console.log(' ', JSON.stringify(intentModelStats()));
{
  const { train, heldOut } = evaluateIntent();
  ok(train.accuracy >= 0.95, 'fits its training corpus', `${train.correct}/${train.total} = ${(train.accuracy * 100).toFixed(1)}%`);
  ok(heldOut.accuracy >= 0.75, 'generalises to unseen phrasings', `${heldOut.correct}/${heldOut.total} = ${(heldOut.accuracy * 100).toFixed(1)}%`);
  heldOut.confusions.forEach(c => console.log(`        miss: "${c.text}" → ${c.predicted} (wanted ${c.actual})`));

  // The guardrail regexes must win outright.
  ok(classifyIntent('help').source === 'rule', 'guardrail fires for "help"');
  ok(classifyIntent('what will happen if I execute this').intent === 'impact', 'guardrail routes impact questions');

  // Explainability: a model decision must be able to justify itself.
  const p = classifyIntent('i need it running every tuesday at 7am');
  ok(p.intent === 'schedule' && p.evidence.length > 0, 'model decisions carry evidence',
    `intent=${p.intent} conf=${p.confidence.toFixed(2)} top=${p.evidence[0]?.feature}`);
}

// ── 2. Schedule pattern network ──────────────────────────────────────────────
console.log('\n=== Schedule pattern classifier (MLP)');
console.log(' ', JSON.stringify(schedulePatternStats()));
{
  const { time, day } = evaluateShapes();
  ok(time.train.accuracy >= 0.95, 'time head fits its corpus', `${(time.train.accuracy * 100).toFixed(1)}%`);
  ok(time.heldOut.accuracy >= 0.93, 'time head generalises', `${(time.heldOut.accuracy * 100).toFixed(1)}%`);
  ok(day.train.accuracy >= 0.95, 'day head fits its corpus', `${(day.train.accuracy * 100).toFixed(1)}%`);
  ok(day.heldOut.accuracy >= 0.90, 'day head generalises', `${(day.heldOut.accuracy * 100).toFixed(1)}%`);

  // Phrasings absent from the generator, including both dimensions at once.
  const novel: [string, string, string][] = [
    ['kick it off every 7 minutes', 'interval', 'daily'],
    ['run it once every single day at 9pm', 'absolute', 'daily'],
    ['only on working days please at 6am', 'absolute', 'businessDays'],
    ['on tuesdays and thursdays at 07:00', 'absolute', 'specificDays'],
    ['the last wednesday of each month at 23:00', 'absolute', 'monthlyOrdinal'],
    ['every 5 minutes of monday, tuesday and wednesday', 'interval', 'specificDays'],
    ['every 20 mins on weekdays', 'interval', 'businessDays'],
  ];
  for (const [text, wantTime, wantDay] of novel) {
    const p = classifyShape(text);
    ok(p.time === wantTime && p.day === wantDay, `novel: "${text}"`,
      `→ ${p.time}/${p.day} (${(p.timeConfidence * 100).toFixed(0)}%/${(p.dayConfidence * 100).toFixed(0)}%)`);
  }
}

// ── 3. Semantic index ────────────────────────────────────────────────────────
console.log('\n=== Semantic index (LSA)');
{
  const sem = semanticIndex();
  ok(sem.documentCount === KNOWLEDGE.length, 'indexes every knowledge chunk', `${sem.documentCount} docs`);
  ok(sem.dimensions >= 30, 'learned a useful number of concepts', `${sem.dimensions} dimensions`);

  // Vectors must be finite — a diverging power iteration would produce NaN and
  // silently poison every retrieval score.
  const sims = semanticSimilarities('how do I stop a job stacking up on itself');
  ok(sims.every(v => Number.isFinite(v)), 'similarities are all finite');
  ok(Math.max(...sims) > 0.15, 'finds a related concept', `best cosine ${Math.max(...sims).toFixed(3)}`);

  // The point of adding LSA: questions whose wording does not overlap the answer.
  const paraphrases: [string, string][] = [
    ['stop a slow job running twice at once', 'scheduling.holidays-and-calendar'],
    ['who owns support for a job when it breaks', 'field.input.servicenow_group'],
  ];
  for (const [q, wantId] of paraphrases) {
    const hits = retrieve(q, { limit: 8 });
    const rank = hits.findIndex(h => h.chunk.id === wantId);
    ok(rank >= 0, `hybrid retrieval surfaces ${wantId}`, `for "${q}" at rank ${rank + 1}`);
  }
}

// ── 4. Answer composer ───────────────────────────────────────────────────────
console.log('\n=== Answer composer (MMR)');
{
  const chunk = KNOWLEDGE.find(c => c.id === 'feature.job-deletion')!;
  const pool = sentences(chunk.body, chunk.id, chunk.title);
  ok(pool.length >= 4, 'splits a chunk into sentences', `${pool.length} sentences`);

  const { picked, sources } = compose('how do I delete a job safely', pool, { limit: 4 });
  ok(picked.length >= 2, 'selects multiple sentences', `${picked.length} picked`);
  ok(sources.length >= 1, 'reports its sources');

  // Redundancy control: no two selected sentences may be identical.
  const texts = picked.map(p => p.text);
  ok(new Set(texts).size === texts.length, 'selection is not redundant');

  // Every sentence must exist verbatim in the source — this is the guarantee
  // that replaced "prompt the model to stay grounded".
  ok(picked.every(p => chunk.body.includes(p.text)), 'every sentence is verbatim from the knowledge base');
}

// ── 5. Anomaly detection ─────────────────────────────────────────────────────
console.log('\n=== Anomaly detection (median / MAD, Dice)');
{
  ok(median([1, 2, 3, 4]) === 2.5, 'median of an even set');
  ok(mad([10, 10, 10, 10]) === 0, 'MAD of identical values is zero');

  const o = outliers([30, 30, 32, 28, 31, 4000]);
  ok(o.length === 1 && o[0].index === 5 && o[0].direction === 'high',
    'flags a single extreme value', `z=${o[0]?.z}`);
  ok(outliers([30, 31, 32]).length === 0, 'stays silent on a batch too small to judge');
  ok(outliers([30, 31, 29, 32, 30, 31]).length === 0, 'no false positives on a tight batch');

  ok(dice('PAY_DAILY_LOAD', 'PAY_DAILY_LOAD') === 1, 'identical names score 1');
  const nd = nearDuplicates(['PAY_DAILY_LOAD', 'PAY_DAILY_LOAD2', 'FIN_CLOSE']);
  ok(nd.length === 1, 'catches a near-duplicate name', nd[0] ? `${nd[0].a} ~ ${nd[0].b} (${nd[0].score})` : '');
}

// ── 6. Schedule cross-check ──────────────────────────────────────────────────
console.log('\n=== Rule parser + neural cross-check');
{
  // Well-formed requests must NOT trigger a disagreement warning.
  for (const s of ['every weekday at 8 PM', 'every 15 minutes from 06:00 to 22:00', 'every Monday at 06:30']) {
    const r = interpretSchedule(s);
    ok(r.modelAgrees, `no false disagreement: "${s}"`);
  }
  // The regression case: interval plus explicit days.
  const r = interpretSchedule('every 5 minutes of monday, tuesday and wednesday');
  ok(r.fields.timeStyle === 'Interval' && !!r.fields.mon && !!r.fields.tue && !!r.fields.wed,
    'interval keeps its day restriction');
  ok(r.modelAgrees, 'classifier agrees with the interval reading');
}

// ── 7. Determinism ───────────────────────────────────────────────────────────
console.log('\n=== Determinism');
{
  // Same process, repeated calls.
  const a = classifyShape('every 12 minutes on friday');
  const b = classifyShape('every 12 minutes on friday');
  ok(a.time === b.time && a.day === b.day && a.timeConfidence === b.timeConfidence,
    'classifier is stable within a process');

  const s1 = semanticSimilarities('agent offline alert');
  const s2 = semanticSimilarities('agent offline alert');
  ok(s1.every((v, i) => v === s2[i]), 'semantic scores are stable within a process');

  // A fingerprint the cross-process check compares against.
  const fp = [
    classifyIntent('check my rows for problems').intent,
    classifyShape('every 3 days').day,
    semanticSimilarities('teams webhook').slice(0, 3).map(v => v.toFixed(6)).join(','),
    schedulePatternStats().finalLoss.day,
  ].join('|');
  console.log('  fingerprint:', fp);
  if (process.env.PRINT_FINGERPRINT === '1') { console.log('FINGERPRINT<<' + fp + '>>'); }
}

console.log('\n' + '─'.repeat(72));
if (failures) { console.log(`${failures} CHECK(S) FAILED`); process.exit(1); }
console.log('all ML checks passed');
