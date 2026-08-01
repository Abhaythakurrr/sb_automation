/**
 * Feedback ledger — what the Copilot was told, and what it did about it.
 *
 * TWO CHANNELS, ONE LEDGER
 *
 *   user   thumbs up / down from the dock, optionally with a correction.
 *   self   the Copilot recording its own uncertainty. The rule parser and the
 *          schedule nets cross-check each other, and a confident disagreement
 *          used to be shown to the user and then forgotten. Recording it turns
 *          the disagreement detector into a source of real examples: those are
 *          exactly the phrasings sitting on the boundary of what the models
 *          understand, which is where the next improvement is.
 *
 * WHAT THIS FILE IS AND IS NOT
 *
 * It is the record, not the mechanism. Corrections that name a checkable label are
 * applied to the live model by ml/online.ts at the moment they arrive; this ledger
 * says what came in, whether it was learned, and why not when it was refused.
 *
 * That separation is worth keeping. A model that adapts needs an audit trail more
 * than a static one does — when somebody asks why an answer changed, the answer
 * has to be findable, and "it learned something at 14:32 from a correction that
 * passed the guard" is a usable answer in a way that a shifted weight matrix is
 * not.
 *
 * A down-vote with no correction is still worth recording. It teaches the model
 * nothing, because it says an answer was wrong without saying what right looks
 * like, but the aggregate points at which specialism to go and look at.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const STORE_FILE = path.join(process.cwd(), 'copilot_feedback.json');
/** Entries retained. Refused corrections are never dropped — see save(). */
const MAX_ENTRIES = 5000;

export type FeedbackSource = 'user' | 'self';
export type Verdict = 'up' | 'down' | 'disagreement';

/** What happened when the Copilot tried to learn from an entry. */
export type LearnOutcome = 'learned' | 'refused' | 'not-applicable';

export interface FeedbackEntry {
  id: string;
  at: string;
  source: FeedbackSource;
  verdict: Verdict;
  /** The text the Copilot was reasoning about. */
  text: string;
  /** Answer mode / specialism that produced the response, when known. */
  mode?: string;
  intent?: string;
  page?: string;
  /** Free-text correction from the user, or a machine description for 'self'. */
  correction?: string;
  /** Structured label, when the correction is a schedule shape or an intent. */
  expected?: { kind: 'timeShape' | 'dayShape' | 'intent'; value: string }[];
  /** What the model said before the correction. */
  predicted?: string;
  /** Truncated hash of the session key — groups one person's feedback without storing the id. */
  who?: string;
  /** Whether the model actually changed, and the reason it gave. */
  outcome?: LearnOutcome;
  outcomeReason?: string;
}

interface Store {
  version: 1;
  entries: FeedbackEntry[];
}

const empty = (): Store => ({ version: 1, entries: [] });

function load(): Store {
  try {
    if (fs.existsSync(STORE_FILE)) {
      const raw = JSON.parse(fs.readFileSync(STORE_FILE, 'utf-8'));
      if (raw && Array.isArray(raw.entries)) return { version: 1, entries: raw.entries };
    }
  } catch { /* a corrupt ledger must not take the Copilot down */ }
  return empty();
}

function save(store: Store): void {
  try {
    // Trim oldest first, but keep every refused correction. Those are the entries
    // with work left in them: a correction the model could not absorb is the
    // clearest signal available about where it needs a rule rather than a nudge,
    // and it would be the first thing lost to a simple ring buffer.
    if (store.entries.length > MAX_ENTRIES) {
      const keep = store.entries.filter(e => e.outcome === 'refused');
      const rest = store.entries.filter(e => e.outcome !== 'refused');
      store.entries = [...keep, ...rest.slice(-Math.max(0, MAX_ENTRIES - keep.length))];
    }
    fs.writeFileSync(STORE_FILE, JSON.stringify(store, null, 2));
  } catch { /* ignore — feedback is not worth failing a request over */ }
}

/** Short, stable, non-reversible identifier for a session. */
export function whoHash(sessionKey: string): string {
  return crypto.createHash('sha256').update(String(sessionKey)).digest('hex').slice(0, 12);
}

export interface RecordInput {
  source: FeedbackSource;
  verdict: Verdict;
  text: string;
  mode?: string;
  intent?: string;
  page?: string;
  correction?: string;
  expected?: FeedbackEntry['expected'];
  predicted?: string;
  sessionKey?: string;
}

export function record(input: RecordInput): FeedbackEntry {
  const store = load();
  const entry: FeedbackEntry = {
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    source: input.source,
    verdict: input.verdict,
    text: String(input.text || '').slice(0, 2000),
    mode: input.mode,
    intent: input.intent,
    page: input.page,
    correction: input.correction ? String(input.correction).slice(0, 2000) : undefined,
    expected: input.expected,
    predicted: input.predicted,
    who: input.sessionKey ? whoHash(input.sessionKey) : undefined,
  };
  store.entries.push(entry);
  save(store);
  return entry;
}

/**
 * Records what the online learner did with an entry.
 *
 * Separate from `record` because learning happens after the entry exists, and
 * because the outcome is the interesting half: a ledger of corrections with no
 * record of which ones took is not much better than no ledger.
 */
export function recordOutcome(id: string, outcome: LearnOutcome, reason?: string): void {
  const store = load();
  const entry = store.entries.find(e => e.id === id);
  if (!entry) return;
  entry.outcome = outcome;
  entry.outcomeReason = reason ? reason.slice(0, 400) : undefined;
  save(store);
}

/**
 * Records a rule-vs-model disagreement.
 *
 * De-duplicated on the exact text: someone re-reading the same phrasing five times
 * is one data point, not five, and without this the ledger fills up with whatever
 * phrase happens to be on a screen.
 */
export function recordDisagreement(input: {
  text: string;
  ruleShape: string;
  modelShape: string;
  confidence: number;
  page?: string;
}): FeedbackEntry | null {
  const store = load();
  const seen = store.entries.some(e => e.source === 'self' && e.text === input.text);
  if (seen) return null;
  return record({
    source: 'self',
    verdict: 'disagreement',
    text: input.text,
    correction: `rule parse said ${input.ruleShape}; the shape classifier said ${input.modelShape} at ${(input.confidence * 100).toFixed(1)}% confidence`,
    predicted: input.modelShape,
    page: input.page,
  });
}

export function allEntries(): FeedbackEntry[] {
  return load().entries;
}

export interface FeedbackSummary {
  total: number;
  up: number;
  down: number;
  disagreements: number;
  /** up / (up + down), or null when nobody has voted. */
  approval: number | null;
  learned: number;
  refused: number;
  /** Intents attracting the most down-votes — where to look next. */
  weakestIntents: { intent: string; down: number; up: number }[];
  recentDisagreements: { text: string; note: string; at: string }[];
  /** Corrections the model could not absorb; these need a rule, not a nudge. */
  recentRefusals: { text: string; reason: string; at: string }[];
}

export function summary(): FeedbackSummary {
  const entries = load().entries;
  const up = entries.filter(e => e.verdict === 'up').length;
  const down = entries.filter(e => e.verdict === 'down').length;
  const dis = entries.filter(e => e.verdict === 'disagreement');

  const byIntent = new Map<string, { up: number; down: number }>();
  for (const e of entries) {
    if (!e.intent || e.verdict === 'disagreement') continue;
    const cur = byIntent.get(e.intent) || { up: 0, down: 0 };
    if (e.verdict === 'up') cur.up++; else cur.down++;
    byIntent.set(e.intent, cur);
  }

  return {
    total: entries.length,
    up,
    down,
    disagreements: dis.length,
    approval: up + down > 0 ? Number((up / (up + down)).toFixed(4)) : null,
    learned: entries.filter(e => e.outcome === 'learned').length,
    refused: entries.filter(e => e.outcome === 'refused').length,
    weakestIntents: [...byIntent.entries()]
      .map(([intent, v]) => ({ intent, ...v }))
      .filter(v => v.down > 0)
      .sort((a, b) => b.down - a.down)
      .slice(0, 5),
    recentDisagreements: dis.slice(-5).reverse().map(e => ({
      text: e.text,
      note: e.correction || '',
      at: e.at,
    })),
    recentRefusals: entries.filter(e => e.outcome === 'refused').slice(-5).reverse().map(e => ({
      text: e.text,
      reason: e.outcomeReason || '',
      at: e.at,
    })),
  };
}

export const FEEDBACK_STORE_FILE = STORE_FILE;
