/**
 * Frozen weights — the trained models as a shipped artifact.
 *
 * WHY FREEZE AT ALL
 *
 * The models used to be trained from their corpora on first use, which took
 * ~10 seconds of the first request that needed them. Correct, but it meant the
 * training corpora had to ship, be traversed on every boot, and stay in step with
 * the feature extractor for ever. Freezing the result removes all three: the
 * artifact is the model.
 *
 * WHY A FINGERPRINT
 *
 * Weights are indexed by vocabulary position, and the vocabulary is produced by
 * `features()`. Change the feature extractor — add a feature, change the
 * tokeniser, alter the day-set weighting — and every index shifts, which turns
 * a set of trained weights into noise that still runs and still returns
 * confident-looking answers. That failure is silent, which makes it the dangerous
 * kind.
 *
 * So the artifact records a fingerprint of the feature pipeline that produced it,
 * computed by running fixed probe strings through the real extractor. If the
 * fingerprint does not match at load time the artifact is rejected and the models
 * fall back to training from their corpora. Slower, correct, and loud about it.
 *
 * WHAT IS NOT IN HERE
 *
 * The LSA retrieval index. It is built from the knowledge base, which is prose
 * that changes whenever the documentation does, so pinning it to an artifact
 * would let the index drift out of step with the text it indexes. It stays
 * derived at boot.
 */
import crypto from 'crypto';
import { MLPWeights, NBWeights } from './models';
import { features, FeatureOptions, DAY_SET_FEATURE_WEIGHT } from './core';
import raw from './weights.generated.json';

export interface ScheduleWeights {
  vocabulary: string[];
  timeShapes: string[];
  dayShapes: string[];
  timeNet: MLPWeights;
  dayNet: MLPWeights;
  corpus: { generated: number; learned: number };
  accuracy: {
    timeTrain: number; timeHeldOut: number;
    dayTrain: number; dayHeldOut: number;
  };
  epochs: number;
}

export interface IntentWeights {
  nb: NBWeights;
  corpus: { handWritten: number; learned: number };
  guardrailRules: number;
}

/** A case the online learner is not allowed to break. */
export interface ShapeInvariant { text: string; time: string; day: string }
export interface IntentInvariant { text: string; intent: string }

export interface WeightsArtifact {
  version: number;
  generatedAt: string;
  generator: string;
  note: string;
  featureFingerprint: string;
  schedule: ScheduleWeights | null;
  intent: IntentWeights | null;
  /** The measurements the models were signed off against. */
  metrics: Record<string, unknown> | null;
  invariants: ShapeInvariant[];
  intentInvariants: IntentInvariant[];
}

const ARTIFACT = raw as unknown as WeightsArtifact;

// ── Feature fingerprint ──────────────────────────────────────────────────────

/**
 * Probe strings chosen to touch every branch of the extractor: word and
 * character n-grams, every shape flag, the weekday-set logic including ranges,
 * plurals, collective terms and the ordinal case that must NOT register a day.
 */
const PROBES = [
  'every 5 minutes of monday, tuesday and wednesday',
  'weekdays only at 06:30 Asia/Kolkata',
  'on tuesdays and thursdays at 07:00',
  'mon-fri from 0900 to 1800',
  'the first business day of every month',
  'on the 15th of each month at midnight',
  'FREQ=INTERVAL;interval=10;units=MINUTES;byday=Mon,Tue,Wed,Thu,Fri 06:00:00 AM',
  'what does maxruntime mean?',
];

const PROBE_OPTS: FeatureOptions[] = [
  { wordNGrams: [1, 2], charNGrams: [3, 4], dropStop: false, shape: true },
  { wordNGrams: [1, 2], charNGrams: [3, 4, 5], dropStop: true, shape: true },
];

/**
 * Hash of what the feature extractor actually produces.
 *
 * Deliberately computed from real output rather than from a hand-maintained
 * version number: a version number only catches the changes somebody remembered
 * to bump it for.
 */
export function featureFingerprint(): string {
  const h = crypto.createHash('sha256');
  h.update(`daySetWeight=${DAY_SET_FEATURE_WEIGHT}\n`);
  for (const opts of PROBE_OPTS) {
    h.update(JSON.stringify(opts) + '\n');
    for (const p of PROBES) {
      const bag = features(p, opts);
      const keys = [...bag.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
      h.update(keys.map(([k, v]) => `${k}=${v}`).join('|') + '\n');
    }
  }
  return h.digest('hex').slice(0, 32);
}

// ── Load ─────────────────────────────────────────────────────────────────────

export type RejectReason = 'placeholder' | 'feature-drift' | null;

let cachedReason: RejectReason = null;

/**
 * The artifact, if it is usable.
 *
 * Returns null rather than throwing: a missing or stale artifact is a
 * performance problem, not a correctness one, because the corpora are still in
 * the repository and the models can rebuild themselves from them.
 */
export function weights(): WeightsArtifact | null {
  // Escape hatch for the freeze step, which must train from the corpora rather
  // than re-freeze whatever is already frozen — otherwise a bug in an artifact
  // would survive every regeneration.
  if (process.env.COPILOT_IGNORE_FROZEN_WEIGHTS === 'true') {
    cachedReason = 'placeholder';
    return null;
  }
  if (!ARTIFACT || ARTIFACT.version === 0 || !ARTIFACT.schedule || !ARTIFACT.intent) {
    cachedReason = 'placeholder';
    return null;
  }
  if (ARTIFACT.featureFingerprint !== featureFingerprint()) {
    cachedReason = 'feature-drift';
    return null;
  }
  cachedReason = null;
  return ARTIFACT;
}

/** Why the artifact was rejected, for the health endpoint to report honestly. */
export function weightsRejection(): RejectReason {
  weights();
  return cachedReason;
}

export function weightsStatus() {
  const w = weights();
  const reason = cachedReason;
  return {
    loaded: !!w,
    version: ARTIFACT?.version ?? 0,
    generatedAt: ARTIFACT?.generatedAt || null,
    parameters: w
      ? (w.schedule!.timeNet.inputSize * w.schedule!.timeNet.hiddenSize)
        + (w.schedule!.dayNet.inputSize * w.schedule!.dayNet.hiddenSize)
      : 0,
    reason: reason === 'placeholder'
      ? 'No frozen weights in this build — models trained from their corpora at first use.'
      : reason === 'feature-drift'
        ? 'Frozen weights REJECTED: the feature extractor has changed since they were produced. Models retrained from their corpora. Re-run: npx tsx src/copilot/ml/freeze.ts'
        : 'Frozen weights loaded; no training at boot.',
    metrics: w?.metrics ?? null,
    invariantCount: (ARTIFACT?.invariants || []).length + (ARTIFACT?.intentInvariants || []).length,
  };
}

export const WEIGHTS_PATH = 'src/copilot/ml/weights.generated.json';
