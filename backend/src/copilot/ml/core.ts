/**
 * Numerical and feature-extraction core for the Copilot's self-contained ML.
 *
 * Design constraints that shape everything here:
 *
 *  1. NO external model, NO download, NO network. Every model in this folder is
 *     trained in-process at first use from a corpus that lives in the repo.
 *  2. DETERMINISTIC. All randomness comes from a seeded PRNG, so two boots of
 *     the same build produce byte-identical weights and therefore identical
 *     answers. That is a requirement for an operations tool: the same question
 *     must not get a different answer after a restart.
 *  3. Small enough to train in milliseconds — this runs on every backend boot,
 *     not on a GPU.
 */

// ── Deterministic PRNG ───────────────────────────────────────────────────────

/**
 * mulberry32 — a small, fast, well-distributed 32-bit PRNG.
 * Used instead of Math.random() so weight initialisation is reproducible.
 */
export function prng(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Box–Muller normal sample from a uniform generator. */
export function gaussian(rand: () => number): number {
  let u = 0, v = 0;
  while (u === 0) u = rand();
  while (v === 0) v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// ── Vector helpers ───────────────────────────────────────────────────────────

export function dot(a: Float64Array, b: Float64Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

export function norm(a: Float64Array): number {
  return Math.sqrt(dot(a, a));
}

export function normalise(a: Float64Array): Float64Array {
  const n = norm(a);
  if (n === 0) return a;
  const out = new Float64Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = a[i] / n;
  return out;
}

export function cosine(a: Float64Array, b: Float64Array): number {
  const na = norm(a), nb = norm(b);
  if (na === 0 || nb === 0) return 0;
  return dot(a, b) / (na * nb);
}

export function softmax(z: number[]): number[] {
  const m = Math.max(...z);
  const e = z.map(v => Math.exp(v - m));
  const s = e.reduce((x, y) => x + y, 0) || 1;
  return e.map(v => v / s);
}

// ── Text features ────────────────────────────────────────────────────────────

/**
 * Words that carry no class signal. Deliberately short: domain words like
 * "job", "task", "trigger", "every" and "minute" are exactly what the models
 * need, so the aggressive stoplist used for retrieval is wrong here.
 */
const STOP = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'be', 'been', 'am', 'of', 'to', 'in',
  'on', 'at', 'for', 'with', 'and', 'or', 'it', 'its', 'this', 'that', 'these',
  'those', 'as', 'by', 'from', 'i', 'we', 'you', 'my', 'our', 'your',
]);

/** Lowercase, keep identifier characters, split on everything else. */
export function words(text: string): string[] {
  return String(text)
    .toLowerCase()
    .split(/[^a-z0-9_/.:\-]+/)
    .map(w => w.replace(/^[.\-/:]+|[.\-/:]+$/g, ''))
    .filter(w => w.length > 0);
}

/** Light suffix stripping, enough to tie "scheduling"→"schedul", "jobs"→"job". */
export function stem(w: string): string {
  let s = w;
  if (s.length > 4 && s.endsWith('ies')) return s.slice(0, -3) + 'y';
  if (s.length > 3 && s.endsWith('sses')) return s.slice(0, -2);
  if (s.length > 3 && s.endsWith('s') && !s.endsWith('ss')) s = s.slice(0, -1);
  if (s.length > 5 && s.endsWith('ing')) s = s.slice(0, -3);
  else if (s.length > 4 && s.endsWith('ed')) s = s.slice(0, -2);
  return s;
}

export interface FeatureOptions {
  /** Word n-gram sizes to emit, e.g. [1,2]. */
  wordNGrams?: number[];
  /** Character n-gram sizes, e.g. [3,4]. Robust to typos and morphology. */
  charNGrams?: number[];
  /** Drop stopwords from unigrams. */
  dropStop?: boolean;
  /** Emit shape features (has-number, has-colon-time, …). */
  shape?: boolean;
}

/**
 * Turns text into a sparse feature bag.
 *
 * Character n-grams matter more than they might seem: they let the intent model
 * generalise across "sched", "schedule", "scheduling" and typos like
 * "shcedule" without any of those appearing in the training corpus.
 */
export function features(text: string, opts: FeatureOptions = {}): Map<string, number> {
  const {
    wordNGrams = [1, 2],
    charNGrams = [],
    dropStop = true,
    shape = false,
  } = opts;

  const bag = new Map<string, number>();
  const bump = (k: string, by = 1) => bag.set(k, (bag.get(k) || 0) + by);

  const raw = words(text);
  const toks = raw.map(stem);

  for (const n of wordNGrams) {
    for (let i = 0; i + n <= toks.length; i++) {
      const gram = toks.slice(i, i + n);
      if (n === 1 && dropStop && STOP.has(gram[0])) continue;
      bump(`w${n}:${gram.join('_')}`);
    }
  }

  if (charNGrams.length) {
    // Pad with spaces so word-initial and word-final grams are distinguishable.
    const flat = ' ' + raw.join(' ') + ' ';
    for (const n of charNGrams) {
      for (let i = 0; i + n <= flat.length; i++) bump(`c${n}:${flat.slice(i, i + n)}`);
    }
  }

  if (shape) {
    if (/\d/.test(text)) bump('s:has_digit');
    if (/\b\d{1,2}[:.]\d{2}\b/.test(text)) bump('s:has_clock');
    if (/\b\d{1,2}\s*(am|pm)\b/i.test(text)) bump('s:has_ampm');
    if (/\b\d{1,2}(st|nd|rd|th)\b/i.test(text)) bump('s:has_ordinal');
    if (/\?/.test(text)) bump('s:question');
    if (/[A-Za-z]+\/[A-Za-z_]+/.test(text)) bump('s:has_tz');
    if (/\b(mon|tue|wed|thu|fri|sat|sun)/i.test(text)) bump('s:has_day');
    bump('s:len_bucket_' + Math.min(6, Math.floor(raw.length / 4)));
    // Weighted above the n-grams on purpose. Inputs are unit-normalised, so a
    // single count-1 term among sixty carries almost none of the vector's norm —
    // which left the exact day set losing to lexical coincidence: "Monday,
    // Thursday, Friday only at 11:15" read as business days because "monday…
    // friday" and "only" are both strong business-day cues in the hand-written
    // corpus. These features are computed facts about the text, not statistical
    // proxies for it, so they should outweigh the proxies.
    for (const f of weekdaySetFeatures(text)) bump(f, DAY_SET_FEATURE_WEIGHT);
  }

  return bag;
}

// ── Weekday-set features ─────────────────────────────────────────────────────

/** How much a computed day-set feature counts for, relative to one n-gram. */
export const DAY_SET_FEATURE_WEIGHT = 4;

/** Full day names, kept separate because only these are safe to de-pluralise. */
const FULL_DAY_INDEX: Record<string, number> = {
  monday: 0, tuesday: 1, wednesday: 2, thursday: 3, friday: 4, saturday: 5, sunday: 6,
};

/**
 * Day names and abbreviations.
 *
 * Two-letter codes (mo, tu, we, th, fr, sa, su) are deliberately absent. They
 * collide with ordinary text in ways that actively mislead: the tokeniser splits
 * "the 15th of every month" into a bare "th", which would have registered
 * Thursday on a monthly phrase. UAC's own vocabulary is three-letter, so nothing
 * is lost.
 */
const DAY_INDEX: Record<string, number> = {
  ...FULL_DAY_INDEX,
  mon: 0,
  tues: 1, tue: 1,
  weds: 2, wed: 2,
  thurs: 3, thur: 3, thu: 3,
  fri: 4,
  sat: 5,
  sun: 6,
};

/**
 * Resolves a token to a day index, allowing the plural forms people actually
 * write — "on tuesdays and thursdays". Only full names are de-pluralised:
 * stripping the 's' from short forms would map "thus" to Thursday.
 */
function dayOf(token: string): number | undefined {
  const direct = DAY_INDEX[token];
  if (direct !== undefined) return direct;
  if (token.length > 4 && token.endsWith('s')) return FULL_DAY_INDEX[token.slice(0, -1)];
  return undefined;
}

/** "mon-fri", "monday to friday", "mondays through fridays" — a range, not two days. */
const WEEKDAY_RANGE = /\b(?:mon|mondays?)\s*(?:-|–|—|to|thru|through|till|until)\s*(?:fri|fridays?)\b/i;
/** "sat-sun", "saturday to sunday". */
const WEEKEND_RANGE = /\b(?:sat|saturdays?)\s*(?:-|–|—|to|thru|through|till|until)\s*(?:sun|sundays?)\b/i;

/**
 * Which weekdays a phrase names, expressed so a linear model can use it.
 *
 * WHY THIS IS NOT SOMETHING MORE DATA COULD FIX
 *
 * "monday,tuesday,wednesday,thursday,friday" means business days.
 * "monday,thursday,friday" means those three days.
 *
 * Those two strings share almost every word and character n-gram, and the only
 * thing that separates them is whether the set of days named is complete. A bag
 * of n-grams has no notion of set completeness, so no quantity of training
 * examples can teach the distinction — the training loop demonstrated that
 * directly: it drove business-day recognition from 76% to 100% and, in doing so,
 * started misreading three-day lists as business days, because from the model's
 * point of view they look the same.
 *
 * So the discriminator is computed here and handed over as a feature. The count
 * is emitted as a distinct term per size rather than as a magnitude, because the
 * relationship is categorical: five weekdays means something qualitatively
 * different from four, not "more of the same".
 */
export function weekdaySetFeatures(text: string): string[] {
  const out: string[] = [];
  const lower = String(text).toLowerCase();
  const days = new Set<number>();

  // Ranges first: "monday to friday" names two tokens but five days.
  let ranged = false;
  if (WEEKDAY_RANGE.test(lower)) { [0, 1, 2, 3, 4].forEach(d => days.add(d)); ranged = true; }
  if (WEEKEND_RANGE.test(lower)) { [5, 6].forEach(d => days.add(d)); ranged = true; }

  // Whole tokens only. Substring matching would find "thu" inside "thursday"
  // and "sat" inside "saturate", inflating the count.
  for (const tok of lower.split(/[^a-z]+/)) {
    const d = dayOf(tok);
    if (d !== undefined) days.add(d);
  }

  // Named collective terms carry a set without naming any day.
  if (/\b(weekday|weekdays|business\s*day|business\s*days|working\s*day|working\s*days)\b/.test(lower)) {
    [0, 1, 2, 3, 4].forEach(d => days.add(d));
    out.push('s:days_named_collective');
  }
  if (/\b(weekend|weekends)\b/.test(lower)) {
    [5, 6].forEach(d => days.add(d));
    out.push('s:days_weekend_word');
  }

  if (days.size === 0) return out;

  const weekdays = [0, 1, 2, 3, 4].filter(d => days.has(d));
  const weekend = [5, 6].filter(d => days.has(d));

  out.push(`s:days_count_${days.size}`);
  if (ranged) out.push('s:days_range');
  if (weekend.length) out.push('s:days_has_weekend');
  if (weekdays.length === 5 && weekend.length === 0) out.push('s:days_all_weekdays_exactly');
  if (weekdays.length > 0 && weekdays.length < 5 && weekend.length === 0) {
    out.push('s:days_weekday_subset');
    out.push(`s:days_weekday_subset_${weekdays.length}`);
  }
  if (days.size === 7) out.push('s:days_every_day');

  return out;
}

// ── Vocabulary / vectoriser ──────────────────────────────────────────────────

/**
 * Maps feature strings to stable integer indices.
 *
 * Built by insertion order over the training corpus, which is itself fixed in
 * the repo — so the index assignment is part of the deterministic contract.
 */
export class Vocabulary {
  private index = new Map<string, number>();
  private terms: string[] = [];

  /** Adds a term if unseen and returns its index. */
  add(term: string): number {
    let i = this.index.get(term);
    if (i === undefined) {
      i = this.terms.length;
      this.index.set(term, i);
      this.terms.push(term);
    }
    return i;
  }

  /** Returns the index of a known term, or -1. Never grows the vocabulary. */
  get(term: string): number {
    const i = this.index.get(term);
    return i === undefined ? -1 : i;
  }

  term(i: number): string { return this.terms[i]; }
  get size(): number { return this.terms.length; }

  /** Terms in index order. Round-trips through fromTerms without reindexing. */
  toTerms(): string[] { return [...this.terms]; }

  /**
   * Rebuilds a vocabulary from a saved term list.
   *
   * Index order is preserved, which is the whole point: the weight matrices are
   * addressed by index, so a vocabulary that renumbered its terms on load would
   * silently permute every learned weight.
   */
  static fromTerms(terms: string[]): Vocabulary {
    const v = new Vocabulary();
    for (const t of terms) v.add(t);
    return v;
  }
}

/** Dense vector from a feature bag, using only terms already in the vocabulary. */
export function vectorise(bag: Map<string, number>, vocab: Vocabulary): Float64Array {
  const v = new Float64Array(vocab.size);
  for (const [term, count] of bag) {
    const i = vocab.get(term);
    if (i >= 0) v[i] = count;
  }
  return v;
}

// ── Evaluation ───────────────────────────────────────────────────────────────

export interface EvalResult {
  total: number;
  correct: number;
  accuracy: number;
  /** actual label -> predicted label -> count, for the misses only. */
  confusions: { actual: string; predicted: string; text: string }[];
}

export function evaluate<T>(
  samples: { text: string; label: T }[],
  predict: (text: string) => T,
): EvalResult {
  let correct = 0;
  const confusions: EvalResult['confusions'] = [];
  for (const s of samples) {
    const p = predict(s.text);
    if (p === s.label) correct++;
    else confusions.push({ actual: String(s.label), predicted: String(p), text: s.text });
  }
  return {
    total: samples.length,
    correct,
    accuracy: samples.length ? correct / samples.length : 0,
    confusions,
  };
}
