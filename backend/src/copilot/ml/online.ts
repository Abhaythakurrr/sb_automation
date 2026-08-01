/**
 * Online learning — the Copilot adapting while people use it.
 *
 * WHAT ACTUALLY LEARNS
 *
 * The two schedule-shape heads. A confirmed correction becomes a handful of
 * gradient steps against the live network — the same backward pass the offline
 * training used, at a much smaller step size. Weights change in place, the change
 * survives a restart, and no corpus or harness is involved.
 *
 * The intent classifier does not learn this way. It is Naive Bayes, so there is
 * no gradient to descend; adapting it would mean editing count tables, and a
 * single user's phrasing has no business shifting a class prior. Confirmed intent
 * corrections are held as exemplars instead and matched by similarity, which is a
 * memory rather than a model update. Calling it learning would be overselling it.
 *
 * WHY EVERY UPDATE IS GUARDED
 *
 * Fine-tuning on one example is how you destroy a model. The gradient does not
 * know that the other few hundred cases the network already gets right are worth
 * preserving, so left unchecked a correction to "monday and friday only" will
 * happily break every business-day phrase on the way past. This is catastrophic
 * forgetting and it takes about three examples to set in.
 *
 * So the sequence for every update is: snapshot the weights, apply the step,
 * re-check a frozen set of cases the model is known to get right, and roll back
 * if accuracy on that set dropped. An update that cannot be applied without
 * collateral damage is refused and recorded as refused. The user is told the
 * truth either way.
 *
 * WHY CORRECTIONS ACCUMULATE
 *
 * Each update trains on every correction gathered so far, not only the newest.
 * Training on the newest alone lets the model drift away from an earlier
 * correction that nothing is currently reminding it about.
 *
 * WHAT THIS CANNOT DO
 *
 * The vocabulary is fixed at freeze time. A correction whose distinguishing words
 * are not in it produces a feature vector with nothing to adjust, and no amount
 * of gradient will help. Those are rejected explicitly rather than silently
 * accepted and then found to have done nothing.
 */
import fs from 'fs';
import path from 'path';
import { MLPSnapshot } from './models';
import { cosine, features, normalise, vectorise, Vocabulary } from './core';
import {
  scheduleNets, shapeVector, classifyShape, resetSchedulePattern,
  TimeShape, DayShape, TIME_SHAPES, DAY_SHAPES,
} from './schedulePattern';
import { INTENT_FEATURES, Intent, INTENT_LABELS } from './intent';
import { weights } from './weights';
import { createModuleLogger } from '../../config/logger';

const log = createModuleLogger('copilot:online');
const STORE_FILE = path.join(process.cwd(), 'copilot_online.json');

/** Corrections retained. Beyond this the oldest are dropped. */
const MAX_SHAPE_CORRECTIONS = 200;
const MAX_INTENT_EXEMPLARS = 300;
/** Minimum in-vocabulary features before a correction is considered learnable. */
const MIN_ACTIVE_FEATURES = 3;
/** Similarity an intent exemplar must reach before it overrides the model. */
export const EXEMPLAR_FLOOR = 0.86;

export interface ShapeCorrection {
  text: string;
  time: TimeShape;
  day: DayShape;
  at: string;
  /** Hashed session, so repeat corrections from one person are visible. */
  who?: string;
}

export interface IntentExemplar {
  text: string;
  intent: Intent;
  at: string;
  who?: string;
}

interface OnlineStore {
  version: 1;
  updatedAt: string;
  /** Applied to the networks by gradient descent. */
  shape: ShapeCorrection[];
  /** Held as similarity-matched memory, not trained. */
  intent: IntentExemplar[];
  /** Refused updates, so the same impossible correction is not retried. */
  refused: { text: string; reason: string; at: string }[];
  /** Cumulative counters, for the score endpoint. */
  stats: { applied: number; refused: number; rolledBack: number; replays: number };
}

const empty = (): OnlineStore => ({
  version: 1,
  updatedAt: new Date().toISOString(),
  shape: [], intent: [], refused: [],
  stats: { applied: 0, refused: 0, rolledBack: 0, replays: 0 },
});

let store: OnlineStore | null = null;

function load(): OnlineStore {
  if (store) return store;
  try {
    if (fs.existsSync(STORE_FILE)) {
      const raw = JSON.parse(fs.readFileSync(STORE_FILE, 'utf-8'));
      if (raw && Array.isArray(raw.shape)) {
        store = {
          version: 1,
          updatedAt: raw.updatedAt || new Date().toISOString(),
          shape: raw.shape || [],
          intent: raw.intent || [],
          refused: raw.refused || [],
          stats: { applied: 0, refused: 0, rolledBack: 0, replays: 0, ...(raw.stats || {}) },
        };
        return store;
      }
    }
  } catch { /* a corrupt store must not take the Copilot down */ }
  store = empty();
  return store;
}

function save(): void {
  if (!store) return;
  try {
    store.updatedAt = new Date().toISOString();
    fs.writeFileSync(STORE_FILE, JSON.stringify(store, null, 2));
  } catch (e) {
    log.warn('Could not persist online learning store', { error: String(e) });
  }
}

// ── The guard set ────────────────────────────────────────────────────────────

interface Guard {
  cases: { text: string; time: TimeShape; day: DayShape }[];
  baselineTime: number;
  baselineDay: number;
}

let guard: Guard | null = null;

/**
 * Cases the model is known to handle, plus the accuracy it currently achieves on
 * them.
 *
 * The baseline is measured live rather than read from the artifact, because the
 * question an update has to answer is "did you make things worse than they were a
 * moment ago" — not "worse than at freeze time". Otherwise the first accepted
 * update would permanently loosen the bar for every update after it.
 */
function buildGuard(): Guard | null {
  const w = weights();
  if (!w || w.invariants.length === 0) return null;
  const cases = w.invariants
    .filter(i => TIME_SHAPES.includes(i.time as TimeShape) && DAY_SHAPES.includes(i.day as DayShape))
    .map(i => ({ text: i.text, time: i.time as TimeShape, day: i.day as DayShape }));
  if (cases.length === 0) return null;
  const acc = accuracyOn(cases);
  return { cases, baselineTime: acc.time, baselineDay: acc.day };
}

function accuracyOn(cases: { text: string; time: TimeShape; day: DayShape }[]): { time: number; day: number } {
  let t = 0, d = 0;
  for (const c of cases) {
    const p = classifyShape(c.text);
    if (p.time === c.time) t++;
    if (p.day === c.day) d++;
  }
  return { time: t / cases.length, day: d / cases.length };
}

// ── Shape learning ───────────────────────────────────────────────────────────

export interface LearnResult {
  applied: boolean;
  reason: string;
  /** Prediction before and after, so the caller can report what changed. */
  before?: string;
  after?: string;
  /** Guard-set accuracy before and after the step. */
  guard?: { timeBefore: number; timeAfter: number; dayBefore: number; dayAfter: number; cases: number };
  correctionCount: number;
}

/**
 * Escalating step sizes.
 *
 * A single gentle pass does essentially nothing. These nets are confident — often
 * above 99% — so the cross-entropy gradient on a phrase they are already sure
 * about is tiny, and a conservative step leaves the prediction exactly where it
 * was. The first version of this reported "adjusted" on every correction,
 * including a deliberately nonsensical one, while changing no output at all.
 *
 * Escalating rather than simply picking a large step keeps the smallest effective
 * update: most corrections land in the first round, and only stubborn ones pay the
 * risk of a bigger one. The guard is re-checked after every round, so "bigger"
 * never means "unchecked".
 */
const ROUNDS = [
  { epochs: 12, learningRate: 0.05 },
  { epochs: 25, learningRate: 0.12 },
  { epochs: 40, learningRate: 0.25 },
];

interface ApplyOutcome {
  applied: boolean;
  damaged: boolean;
  beforeAcc: { time: number; day: number } | null;
  afterAcc: { time: number; day: number } | null;
  guardCases: number;
}

/**
 * Trains the heads on a correction set and keeps the result only if it is safe.
 *
 * Shared by the interactive path and by restart replay so both are governed by
 * exactly the same rule. When they were separate, replay used the weak default
 * step on top of already-adapted weights and quietly drifted the model — the
 * kind of divergence that only shows up as "it was fine yesterday".
 *
 * @param corrections Every correction to train on, not just the new one. Training
 *   on the newest alone lets the model drift away from an earlier correction that
 *   nothing is currently reminding it about.
 * @param success Evaluated after each round. Returning false exhausts the rounds
 *   and rolls back, because an update that changed no behaviour is not worth the
 *   weight perturbation or the claim that something was learned.
 */
function applyCorrections(corrections: ShapeCorrection[], success: () => boolean): ApplyOutcome {
  const { timeNet, dayNet, vocab } = scheduleNets();
  const g = guard ?? (guard = buildGuard());
  const beforeAcc = g ? accuracyOn(g.cases) : null;

  const timeSnap: MLPSnapshot = timeNet.snapshot();
  const daySnap: MLPSnapshot = dayNet.snapshot();

  const X = corrections.map(c => shapeVector(c.text, vocab));
  const timeY = corrections.map(c => TIME_SHAPES.indexOf(c.time));
  const dayY = corrections.map(c => DAY_SHAPES.indexOf(c.day));

  let afterAcc = beforeAcc;

  for (const round of ROUNDS) {
    timeNet.fineTune(X, timeY, round);
    dayNet.fineTune(X, dayY, round);

    afterAcc = g ? accuracyOn(g.cases) : null;
    if (g && beforeAcc && afterAcc && (afterAcc.time < beforeAcc.time || afterAcc.day < beforeAcc.day)) {
      timeNet.restore(timeSnap);
      dayNet.restore(daySnap);
      return { applied: false, damaged: true, beforeAcc, afterAcc, guardCases: g.cases.length };
    }

    if (success()) {
      // The baseline moves with the model, so the next update is judged against
      // where we actually are rather than against freeze time.
      if (g && afterAcc) { g.baselineTime = afterAcc.time; g.baselineDay = afterAcc.day; }
      return { applied: true, damaged: false, beforeAcc, afterAcc, guardCases: g?.cases.length ?? 0 };
    }
  }

  timeNet.restore(timeSnap);
  dayNet.restore(daySnap);
  return { applied: false, damaged: false, beforeAcc, afterAcc, guardCases: g?.cases.length ?? 0 };
}

/**
 * Teaches the shape heads one confirmed correction.
 *
 * @param text  The phrasing the user was looking at.
 * @param time  Confirmed time shape, or undefined to keep the model's reading.
 * @param day   Confirmed day shape, or undefined to keep the model's reading.
 */
export function learnShape(
  text: string,
  time: TimeShape | undefined,
  day: DayShape | undefined,
  who?: string,
): LearnResult {
  const s = load();
  const clean = String(text || '').trim();
  if (!clean) return { applied: false, reason: 'Nothing to learn from — the text was empty.', correctionCount: s.shape.length };

  const current = classifyShape(clean);
  const wantTime = time ?? current.time;
  const wantDay = day ?? current.day;
  const before = `${current.time}/${current.day}`;

  // Already right: nothing to do, and a gradient step here would only add noise.
  if (current.time === wantTime && current.day === wantDay) {
    if (!s.shape.some(c => c.text === clean)) {
      s.shape.push({ text: clean, time: wantTime, day: wantDay, at: new Date().toISOString(), who });
      save();
    }
    return {
      applied: false,
      reason: 'The model already reads it that way, so there was nothing to change. Recorded as confirmed.',
      before, after: before,
      correctionCount: s.shape.length,
    };
  }

  const { timeNet, dayNet, vocab } = scheduleNets();
  const vec = shapeVector(clean, vocab);
  let active = 0;
  for (let i = 0; i < vec.length; i++) if (vec[i] !== 0) active++;
  if (active < MIN_ACTIVE_FEATURES) {
    s.refused.push({ text: clean, reason: `only ${active} known features`, at: new Date().toISOString() });
    s.stats.refused++;
    save();
    return {
      applied: false,
      reason: `I cannot learn this one. The wording uses ${active} term${active === 1 ? '' : 's'} I was trained on, which is not enough to adjust anything — the vocabulary is fixed once the model is built. Rephrasing it in more familiar terms would work.`,
      before,
      correctionCount: s.shape.length,
    };
  }

  // Accumulate first, so the fine-tune sees every correction and not just this one.
  const next: ShapeCorrection[] = [
    ...s.shape.filter(c => c.text !== clean),
    { text: clean, time: wantTime, day: wantDay, at: new Date().toISOString(), who },
  ].slice(-MAX_SHAPE_CORRECTIONS);

  // Success is defined as the requested reading actually arriving. An update that
  // held the guard but changed no behaviour gets rolled back: keeping it would
  // leave the weights perturbed for no gain, store a correction that is replayed
  // on every restart for ever, and tell the user something was learned when the
  // next identical question will be answered exactly as before.
  const outcome = applyCorrections(next, () => {
    const p = classifyShape(clean);
    return p.time === wantTime && p.day === wantDay;
  });

  const { beforeAcc, afterAcc } = outcome;
  const guardReport = beforeAcc && afterAcc && outcome.guardCases ? {
    timeBefore: beforeAcc.time, timeAfter: afterAcc.time,
    dayBefore: beforeAcc.day, dayAfter: afterAcc.day,
    cases: outcome.guardCases,
  } : undefined;

  if (!outcome.applied) {
    const why = outcome.damaged
      ? `rolled back: guard accuracy fell (time ${(beforeAcc!.time * 100).toFixed(1)}%→${(afterAcc!.time * 100).toFixed(1)}%, day ${(beforeAcc!.day * 100).toFixed(1)}%→${(afterAcc!.day * 100).toFixed(1)}%)`
      : 'rolled back: could not reach the requested reading without risking other schedules';
    s.refused.push({ text: clean, reason: why, at: new Date().toISOString() });
    s.stats.rolledBack++;
    s.stats.refused++;
    save();
    log.warn('Online update rolled back', { text: clean.slice(0, 80), damaged: outcome.damaged, beforeAcc, afterAcc });

    return {
      applied: false,
      reason: outcome.damaged
        ? 'I could not learn that without getting other schedules wrong, so I have put my weights back exactly as they were. The correction is logged for review instead.'
        : 'I could not make that reading stick without putting other schedules at risk, so nothing has changed. I have logged it — it may need a rule rather than a nudge.',
      before, after: before,
      guard: guardReport,
      correctionCount: s.shape.length,
    };
  }

  const afterPred = classifyShape(clean);
  const after = `${afterPred.time}/${afterPred.day}`;

  s.shape = next;
  s.stats.applied++;
  save();

  log.info('Online update applied', {
    text: clean.slice(0, 80), before, after, corrections: s.shape.length,
  });

  return {
    applied: true,
    reason: `Learned — I read that as ${after.replace('/', ', ')} now. I re-checked ${outcome.guardCases} schedules I already had right to make sure nothing else moved.`,
    before, after,
    guard: guardReport,
    correctionCount: s.shape.length,
  };
}

// ── Intent exemplars ─────────────────────────────────────────────────────────

/** Cached exemplar vectors, rebuilt when the store changes. */
let exemplarCache: { text: string; intent: Intent; vec: Float64Array }[] | null = null;
let exemplarVocab: Vocabulary | null = null;

function exemplars(): { text: string; intent: Intent; vec: Float64Array }[] {
  const s = load();
  if (exemplarCache && exemplarCache.length === s.intent.length) return exemplarCache;
  // A vocabulary of its own: exemplar matching is similarity between two pieces
  // of user text, so it does not need to share the classifier's index space.
  const vocab = new Vocabulary();
  const bags = s.intent.map(e => features(e.text, INTENT_FEATURES));
  for (const b of bags) for (const k of b.keys()) vocab.add(k);
  exemplarVocab = vocab;
  exemplarCache = s.intent.map((e, i) => ({
    text: e.text, intent: e.intent, vec: normalise(vectorise(bags[i], vocab)),
  }));
  return exemplarCache;
}

/**
 * Nearest confirmed correction, if one is close enough to trust.
 *
 * Only near-identical phrasings qualify. The floor is high because this
 * overrides a trained model on the strength of a single person's say-so, and a
 * loose match would let one correction capture a whole neighbourhood of
 * unrelated questions.
 */
export function exemplarIntent(text: string): { intent: Intent; similarity: number; matched: string } | null {
  const ex = exemplars();
  if (ex.length === 0 || !exemplarVocab) return null;
  const q = normalise(vectorise(features(text, INTENT_FEATURES), exemplarVocab));
  let best: { intent: Intent; similarity: number; matched: string } | null = null;
  for (const e of ex) {
    const sim = cosine(q, e.vec);
    if (sim >= EXEMPLAR_FLOOR && (!best || sim > best.similarity)) {
      best = { intent: e.intent, similarity: sim, matched: e.text };
    }
  }
  return best;
}

export function learnIntent(text: string, intent: Intent, who?: string): LearnResult {
  const s = load();
  const clean = String(text || '').trim();
  if (!clean) return { applied: false, reason: 'Nothing to learn from — the text was empty.', correctionCount: s.intent.length };
  if (!INTENT_LABELS.includes(intent)) {
    return { applied: false, reason: `"${intent}" is not something I can be routed to.`, correctionCount: s.intent.length };
  }

  s.intent = [
    ...s.intent.filter(e => e.text !== clean),
    { text: clean, intent, at: new Date().toISOString(), who },
  ].slice(-MAX_INTENT_EXEMPLARS);
  exemplarCache = null;
  s.stats.applied++;
  save();

  return {
    applied: true,
    reason: `Noted — I will treat that phrasing as ${intent} from now on. Held as a remembered example rather than a weight change, because the router is a counting model with no gradient to nudge.`,
    correctionCount: s.intent.length,
  };
}

// ── Replay across restarts ───────────────────────────────────────────────────

/**
 * Re-applies persisted corrections to freshly loaded weights.
 *
 * Necessary because the gradient steps live in memory: the artifact on disk is
 * the frozen base model, and reloading it would otherwise forget everything
 * learned since. The same guard applies — a correction set that no longer fits
 * the base model is dropped rather than forced in.
 */
export function replayOnline(): { corrections: number; satisfied: number; applied: boolean; reason: string } {
  const s = load();
  if (s.shape.length === 0) return { corrections: 0, satisfied: 0, applied: true, reason: 'nothing to replay' };

  // Start from the shipped weights, every time. Replay used to train on whatever
  // was already in memory, which made it non-idempotent: calling it twice applied
  // the corrections twice and drifted the model further each time.
  resetSchedulePattern();
  guard = null;

  const { vocab } = scheduleNets();
  const usable = s.shape.filter(c => {
    const v = shapeVector(c.text, vocab);
    let active = 0;
    for (let i = 0; i < v.length; i++) if (v[i] !== 0) active++;
    return active >= MIN_ACTIVE_FEATURES;
  });
  if (usable.length === 0) {
    return { corrections: 0, satisfied: 0, applied: false, reason: 'no persisted correction uses known vocabulary' };
  }

  const satisfiedCount = () => usable.filter(c => {
    const p = classifyShape(c.text);
    return p.time === c.time && p.day === c.day;
  }).length;

  const baseline = satisfiedCount();
  // Success here is weaker than for a single interactive correction. The stored set
  // may not be simultaneously satisfiable — corrections can genuinely conflict —
  // and discarding all of them because one is stubborn would lose the rest. So any
  // net improvement counts, and the guard still governs the damage.
  const outcome = applyCorrections(usable, () => satisfiedCount() > baseline);
  const satisfied = satisfiedCount();

  if (!outcome.applied) {
    log.warn('Online replay restored nothing', { corrections: usable.length, damaged: outcome.damaged });
    return {
      corrections: usable.length,
      satisfied,
      applied: false,
      reason: outcome.damaged
        ? 'replay rejected: it would have reduced accuracy on the guard set'
        : 'replay rolled back: the stored corrections no longer fit the shipped weights',
    };
  }

  s.stats.replays++;
  save();
  log.info('Replayed online corrections', { corrections: usable.length, satisfied });
  return {
    corrections: usable.length,
    satisfied,
    applied: true,
    reason: satisfied === usable.length
      ? 'replayed onto the shipped weights'
      : `replayed ${satisfied} of ${usable.length}; the rest could not be restored without risking accuracy`,
  };
}

// ── Reporting ────────────────────────────────────────────────────────────────

export function onlineStatus() {
  const s = load();
  const g = guard;
  return {
    mechanism: 'gradient fine-tuning of the two schedule heads, guarded by rollback; intent corrections held as exemplars',
    shapeCorrections: s.shape.length,
    intentExemplars: s.intent.length,
    refused: s.refused.length,
    stats: s.stats,
    guardCases: g?.cases.length ?? 0,
    guardAccuracy: g ? { time: g.baselineTime, day: g.baselineDay } : null,
    persistedAt: s.updatedAt,
    recentRefusals: s.refused.slice(-3).reverse(),
    note: 'Every update is applied to a snapshot first and rolled back if it costs accuracy on cases the model already handled.',
  };
}

/**
 * Forgets everything learned at runtime and returns to the shipped weights.
 *
 * Clearing the store is not enough on its own: the gradient steps were applied to
 * the networks in memory, so the weights are already changed. Dropping the cached
 * models forces them to be rebuilt from the artifact, which is what actually
 * undoes the learning.
 */
export function forgetOnline(): { cleared: number } {
  const s = load();
  const n = s.shape.length + s.intent.length;
  store = empty();
  exemplarCache = null;
  exemplarVocab = null;
  guard = null;
  save();
  resetSchedulePattern();
  log.info('Online learning reset — weights rebuilt from the artifact', { cleared: n });
  return { cleared: n };
}

export const ONLINE_STORE_FILE = STORE_FILE;
