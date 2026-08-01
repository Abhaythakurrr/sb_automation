/**
 * Learned corpus — the training data the shipped weights were fitted to, beyond
 * the hand-written corpora.
 *
 * WHERE IT CAME FROM
 *
 * The corpora in intent.ts and schedulePattern.ts cover the phrasings we thought
 * of. These are the ones we did not. They were mined by generating job rows in the
 * real intake format, keeping the schedule shape the generator chose as ground
 * truth, and collecting the cases the models of the time got wrong. Adding them
 * took day-shape recognition on unseen rows from 94% to 100%, and the intake
 * syntax entries — "FREQ=INTERVAL;interval=10;units=MINUTES;byday=..." — are why
 * the schedule cross-check works on uploads and not only on typed English.
 *
 * WHY IT IS STILL HERE NOW THAT WEIGHTS ARE FROZEN
 *
 * Because otherwise weights.generated.json would be an unreproducible binary blob.
 * This file plus the hand-written corpora plus freeze.ts is the recipe: anyone can
 * rebuild the artifact and get the same model. Deleting it would leave 1.5 MB of
 * base64 that nobody could ever regenerate or audit, which is exactly the property
 * that made shipping a self-contained model attractive in the first place.
 *
 * It also serves as the fallback: if the artifact is missing or its feature
 * fingerprint no longer matches, the models retrain from here rather than failing.
 *
 * WHAT DOES NOT COME THROUGH HERE
 *
 * Anything learned from a user at runtime. That path is ml/online.ts, which
 * fine-tunes the live network under a rollback guard and persists corrections
 * separately. This file is build-time data; that one is deployment state. Mixing
 * them would make it impossible to say which model a given answer came from.
 */
import type { TimeShape, DayShape } from './schedulePattern';
import type { Intent } from './intent';
import learned from './corpus.learned.json';

/** A schedule phrase with both of its dimensions labelled. */
export interface LearnedScheduleSample {
  text: string;
  time: TimeShape;
  day: DayShape;
  /** How the sample was obtained. */
  source: string;
  /** Mining round it came from, which is also roughly how hard it was to learn. */
  iteration: number;
  /** What the model predicted before this sample existed, i.e. the failure mode. */
  was?: string;
}

export interface LearnedIntentSample {
  text: string;
  intent: Intent;
  source: string;
  iteration: number;
  was?: string;
}

export interface LearnedCorpus {
  version: number;
  generatedAt: string;
  generator: string;
  note: string;
  schedule: LearnedScheduleSample[];
  intent: LearnedIntentSample[];
}

const CORPUS = learned as unknown as LearnedCorpus;

/**
 * Mined samples, appended to the hand-written schedule corpus.
 *
 * Sorted by text, which matters more than it looks: the vocabulary is indexed by
 * insertion order and weight initialisation is seeded by index, so ordering by
 * content rather than by the order things happened to be mined in is what makes
 * a rebuild from this file reproduce the same weights.
 */
export function learnedScheduleSamples(): LearnedScheduleSample[] {
  return [...(CORPUS.schedule || [])].sort((a, b) => (a.text < b.text ? -1 : a.text > b.text ? 1 : 0));
}

export function learnedIntentSamples(): LearnedIntentSample[] {
  return [...(CORPUS.intent || [])].sort((a, b) => (a.text < b.text ? -1 : a.text > b.text ? 1 : 0));
}

/** What the health endpoint reports about the build-time training data. */
export function learnedCorpusStats() {
  return {
    version: CORPUS.version || 0,
    generatedAt: CORPUS.generatedAt || null,
    scheduleSamples: (CORPUS.schedule || []).length,
    intentSamples: (CORPUS.intent || []).length,
    sources: [...new Set([
      ...(CORPUS.schedule || []).map(s => s.source),
      ...(CORPUS.intent || []).map(s => s.source),
    ])].sort(),
    role: 'build-time training data; the recipe that makes the shipped weights reproducible',
  };
}

export const LEARNED_CORPUS_PATH = 'src/copilot/ml/corpus.learned.json';
