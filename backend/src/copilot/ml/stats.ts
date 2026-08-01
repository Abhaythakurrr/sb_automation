/**
 * Robust statistics for batch anomaly detection.
 *
 * Used by the upload analyzer to answer a question the rule checks cannot:
 * "this row is individually valid, but is it unlike the rest of the batch?"
 *
 * Median and MAD rather than mean and standard deviation, because a single
 * extreme outlier — which is exactly what we are hunting — drags the mean and
 * inflates the deviation enough to hide itself.
 */

export function median(xs: number[]): number {
  if (xs.length === 0) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Median absolute deviation, scaled to be comparable with a standard deviation. */
export function mad(xs: number[]): number {
  if (xs.length === 0) return NaN;
  const med = median(xs);
  return 1.4826 * median(xs.map(x => Math.abs(x - med)));
}

export interface Outlier {
  index: number;
  value: number;
  /** Robust z-score: how many scaled MADs from the median. */
  z: number;
  direction: 'high' | 'low';
}

/**
 * Flags values whose robust z-score exceeds `threshold`.
 *
 * Requires at least 4 samples: below that "unlike the others" is not a
 * meaningful claim and would produce noise on every small upload.
 */
export function outliers(values: number[], threshold = 3.5): Outlier[] {
  if (values.length < 4) return [];
  const med = median(values);
  const dev = mad(values);
  // A zero MAD means most values are identical; compare against the spread of
  // the few that differ instead of dividing by zero.
  const scale = dev > 1e-9 ? dev : (Math.max(...values) - Math.min(...values)) / 2 || 1;

  const out: Outlier[] = [];
  values.forEach((v, index) => {
    const z = (v - med) / scale;
    if (Math.abs(z) >= threshold) {
      out.push({ index, value: v, z: Number(z.toFixed(2)), direction: z > 0 ? 'high' : 'low' });
    }
  });
  return out;
}

/** Character-level bigram similarity, for near-duplicate name detection. */
export function dice(a: string, b: string): number {
  const grams = (s: string) => {
    const t = s.toLowerCase().replace(/[^a-z0-9]/g, '');
    const g = new Set<string>();
    for (let i = 0; i + 2 <= t.length; i++) g.add(t.slice(i, i + 2));
    return g;
  };
  const ga = grams(a), gb = grams(b);
  if (ga.size === 0 || gb.size === 0) return a === b ? 1 : 0;
  let inter = 0;
  for (const g of ga) if (gb.has(g)) inter++;
  return (2 * inter) / (ga.size + gb.size);
}

/** Trailing digit run, e.g. "PAY_JOB_007" -> "007". */
function trailingDigits(name: string): string {
  const m = name.match(/(\d+)\s*$/);
  return m ? m[1] : '';
}

/** The name with its trailing number removed, lowercased. */
function stem(name: string): string {
  return name.replace(/\d+\s*$/, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * True when two names look like members of a deliberate numbered series rather
 * than a typo.
 *
 * This matters more than it sounds. Sequential names are the norm in job
 * estates — PAY_LOAD_001 through PAY_LOAD_120 — and by character bigrams they
 * are 90%+ similar to each other, so a naive check reported tens of thousands of
 * "near duplicates" on a single upload. A series is identified by both names
 * carrying a trailing number of the same width; a typo is one name carrying a
 * suffix the other lacks, which is still reported.
 */
function isNumberedSeries(a: string, b: string): boolean {
  const da = trailingDigits(a), db = trailingDigits(b);
  if (!da || !db) return false;             // one has no number: not a series
  if (da.length !== db.length) return false; // 001 vs 1: inconsistent, suspicious
  return stem(a) === stem(b);
}

/**
 * Groups names that are suspiciously similar without being identical.
 *
 * Catches PAY_DAILY_LOAD vs PAY_DAILY_LOAD2 and PAY-DAILY-LOAD, which the exact
 * duplicate check misses and which is usually a copy/paste slip. Deliberate
 * numbered series are excluded.
 *
 * Candidates are bucketed by stem first. A Dice score above the threshold
 * effectively requires a shared stem, so comparing across buckets is wasted
 * work — and the all-pairs version was the slowest part of a bulk analysis.
 */
export function nearDuplicates(names: string[], threshold = 0.86): { a: string; b: string; score: number }[] {
  const buckets = new Map<string, string[]>();
  for (const n of names) {
    const key = stem(n).slice(0, 12);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(n);
  }

  const out: { a: string; b: string; score: number }[] = [];
  const seen = new Set<string>();

  for (const group of buckets.values()) {
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i], b = group[j];
        if (a.toLowerCase() === b.toLowerCase()) continue;  // exact dupes handled elsewhere
        if (isNumberedSeries(a, b)) continue;
        const key = a < b ? `${a}|${b}` : `${b}|${a}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const s = dice(a, b);
        if (s >= threshold) out.push({ a, b, score: Number(s.toFixed(3)) });
      }
    }
  }
  return out.sort((x, y) => y.score - x.score);
}
