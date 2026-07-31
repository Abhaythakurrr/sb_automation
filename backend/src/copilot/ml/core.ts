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
  }

  return bag;
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
