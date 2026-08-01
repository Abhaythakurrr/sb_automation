/**
 * Freeze — trains the models once and writes them out as the shipped artifact.
 *
 *   npx tsx src/copilot/ml/freeze.ts
 *
 * Run this whenever anything the models depend on changes: the hand-written
 * corpora, the learned corpus, the feature extractor, or the label sets. The
 * fingerprint check in weights.ts will catch a stale artifact and fall back to
 * training, so forgetting to run it degrades boot time rather than correctness —
 * but it will say so loudly in the health endpoint.
 *
 * WHAT ELSE GOES IN THE ARTIFACT
 *
 * A guard set: cases the frozen model provably gets right. Runtime learning
 * checks every update against it and rolls back anything that costs accuracy
 * there. Without a guard set, online fine-tuning has no way to tell "fixed one
 * phrasing" from "fixed one phrasing and broke forty others", so the guard is not
 * decoration — it is the thing that makes runtime learning safe enough to enable.
 *
 * The guard set is drawn from the held-out split and the mined corpus, i.e. from
 * data the base model was measured on rather than fitted to.
 */
import fs from 'fs';
import path from 'path';
import {
  exportScheduleWeights, evaluateShapes, schedulePatternStats,
  resetSchedulePattern, classifyShape, heldOutShapeSamples,
  TimeShape, DayShape,
} from './schedulePattern';
import { exportIntentWeights, evaluateIntent, intentModelStats, resetIntent, classifyIntent } from './intent';
import { learnedScheduleSamples } from './corpus';
import { featureFingerprint, WeightsArtifact, ShapeInvariant, IntentInvariant } from './weights';

const OUT = path.join(process.cwd(), 'src/copilot/ml/weights.generated.json');

/** Guard cases: only phrases the freshly trained model actually gets right. */
function buildInvariants(): { shape: ShapeInvariant[]; intent: IntentInvariant[] } {
  const candidates: { text: string; time: TimeShape; day: DayShape }[] = [
    ...heldOutShapeSamples(),
    ...learnedScheduleSamples().map(s => ({ text: s.text, time: s.time, day: s.day })),
  ];

  // Keep only what the model gets right. A guard case the model already fails is
  // worse than useless: it can never regress, so it only dilutes the measurement.
  const shape: ShapeInvariant[] = [];
  const seen = new Set<string>();
  for (const c of candidates) {
    if (seen.has(c.text)) continue;
    seen.add(c.text);
    const p = classifyShape(c.text);
    if (p.time === c.time && p.day === c.day) shape.push({ text: c.text, time: c.time, day: c.day });
  }

  // A small set of intent cases, for the same reason.
  const intentProbes: { text: string; intent: string }[] = [
    { text: 'every 15 minutes on weekdays', intent: 'schedule' },
    { text: 'check my uploaded file for problems', intent: 'analyze-upload' },
    { text: 'what does maxruntime mean', intent: 'explain-field' },
    { text: 'explain this payload', intent: 'explain-payload' },
    { text: 'why did this fail', intent: 'explain-error' },
    { text: 'what will happen if i execute this', intent: 'impact' },
    { text: 'how do i delete a job safely', intent: 'howto' },
    { text: 'what can you do', intent: 'capability' },
    { text: 'what is a trigger', intent: 'general' },
  ];
  const intent: IntentInvariant[] = intentProbes.filter(p => classifyIntent(p.text).intent === p.intent);

  return { shape, intent };
}

function main(): void {
  // Train from the corpora, never from an existing artifact — otherwise a freeze
  // would re-freeze whatever was already frozen and quietly preserve a bug.
  resetSchedulePattern();
  resetIntent();
  process.env.COPILOT_IGNORE_FROZEN_WEIGHTS = 'true';

  console.log('training from corpora…');
  const t0 = Date.now();
  const schedule = exportScheduleWeights();
  const intent = exportIntentWeights();
  const trainMs = Date.now() - t0;

  const sStats = schedulePatternStats();
  const iStats = intentModelStats();
  if (sStats.weightSource.startsWith('frozen') || iStats.weightSource.startsWith('frozen')) {
    console.error('refusing to freeze: the models loaded an existing artifact instead of training.');
    console.error('set COPILOT_IGNORE_FROZEN_WEIGHTS=true before importing, or delete the artifact first.');
    process.exit(1);
  }

  console.log('measuring…');
  const shapes = evaluateShapes();
  const intentEval = evaluateIntent();
  const invariants = buildInvariants();

  const artifact: WeightsArtifact = {
    version: 1,
    generatedAt: new Date().toISOString(),
    generator: 'backend/src/copilot/ml/freeze.ts',
    note: 'Trained weights, shipped so nothing is trained at boot. Regenerate whenever the corpora, the feature extractor or the label sets change: npx tsx src/copilot/ml/freeze.ts',
    featureFingerprint: featureFingerprint(),
    schedule,
    intent,
    metrics: {
      trainMs,
      schedule: {
        vocabulary: schedule.vocabulary.length,
        timeParameters: schedule.timeNet.inputSize * schedule.timeNet.hiddenSize + schedule.timeNet.hiddenSize
          + schedule.timeNet.hiddenSize * schedule.timeNet.outputSize + schedule.timeNet.outputSize,
        dayParameters: schedule.dayNet.inputSize * schedule.dayNet.hiddenSize + schedule.dayNet.hiddenSize
          + schedule.dayNet.hiddenSize * schedule.dayNet.outputSize + schedule.dayNet.outputSize,
        corpus: schedule.corpus,
        timeAccuracy: { train: shapes.time.train.accuracy, heldOut: shapes.time.heldOut.accuracy },
        dayAccuracy: { train: shapes.day.train.accuracy, heldOut: shapes.day.heldOut.accuracy },
      },
      intent: {
        vocabulary: intent.nb.terms.length,
        classes: intent.nb.labels.length,
        corpus: intent.corpus,
        accuracy: { train: intentEval.train.accuracy, heldOut: intentEval.heldOut.accuracy },
      },
      guardSet: { shape: invariants.shape.length, intent: invariants.intent.length },
    },
    invariants: invariants.shape,
    intentInvariants: invariants.intent,
  };

  fs.writeFileSync(OUT, JSON.stringify(artifact) + '\n');
  const bytes = fs.statSync(OUT).size;

  console.log(`\nwrote ${path.relative(process.cwd(), OUT)}  (${(bytes / 1024 / 1024).toFixed(2)} MB)`);
  console.log(`  fingerprint      ${artifact.featureFingerprint}`);
  console.log(`  trained in       ${trainMs} ms  (this is what boot no longer pays)`);
  console.log(`  schedule vocab   ${schedule.vocabulary.length}`);
  console.log(`  schedule params  ${(schedule.timeNet.inputSize * schedule.timeNet.hiddenSize + schedule.dayNet.inputSize * schedule.dayNet.hiddenSize).toLocaleString()}`);
  console.log(`  time accuracy    train ${(shapes.time.train.accuracy * 100).toFixed(2)}%  held-out ${(shapes.time.heldOut.accuracy * 100).toFixed(2)}%`);
  console.log(`  day accuracy     train ${(shapes.day.train.accuracy * 100).toFixed(2)}%  held-out ${(shapes.day.heldOut.accuracy * 100).toFixed(2)}%`);
  console.log(`  intent accuracy  train ${(intentEval.train.accuracy * 100).toFixed(2)}%  held-out ${(intentEval.heldOut.accuracy * 100).toFixed(2)}%`);
  console.log(`  guard set        ${invariants.shape.length} shape + ${invariants.intent.length} intent cases`);
  console.log('\nNow confirm the artifact reproduces the trained model:');
  console.log('  npx tsx src/copilot/ml/freeze.verify.ts');
}

if (require.main === module) main();
