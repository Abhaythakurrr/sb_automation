/**
 * Extractive answer composition.
 *
 * This is what replaced the external language model. Instead of asking a model
 * to paraphrase retrieved text — which costs a network call, leaks context and
 * can hallucinate — the Copilot selects the sentences from its own knowledge
 * base that actually answer the question, and presents them.
 *
 * The selection uses Maximal Marginal Relevance (Carbonell & Goldstein, 1998):
 * repeatedly pick the sentence that is most relevant to the query while being
 * least redundant against what has already been picked. Without the redundancy
 * term, answers to broad questions become three restatements of the same fact.
 *
 * Everything it emits is verbatim from the knowledge base, so an answer cannot
 * contain a claim the repository does not make.
 */
import { features, cosine, Vocabulary, vectorise, FeatureOptions } from './core';

const FEATS: FeatureOptions = { wordNGrams: [1], charNGrams: [], dropStop: true };

export interface Sentence {
  text: string;
  /** Which chunk it came from, for citation. */
  sourceId: string;
  sourceTitle: string;
  /** Position within its chunk; earlier sentences tend to be definitional. */
  position: number;
}

/**
 * Splits chunk bodies into sentences.
 *
 * Kept conservative: the knowledge base contains field names with dots
 * (`payloadMapper.ts`), decimals and abbreviations, so a naive split on "." is
 * wrong. Bullet lines are treated as whole sentences because they already are.
 */
export function sentences(body: string, sourceId: string, sourceTitle: string): Sentence[] {
  const out: Sentence[] = [];
  const lines = body.split('\n');
  let pos = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Bullets, key=value documentation lines and short headings stay intact.
    if (/^[-*•]\s/.test(trimmed) || /^\w[\w .\/()-]{0,40}:$/.test(trimmed) || trimmed.length < 60) {
      out.push({ text: trimmed.replace(/^[-*•]\s*/, ''), sourceId, sourceTitle, position: pos++ });
      continue;
    }

    // Split on sentence-final punctuation followed by a capital or a digit,
    // which avoids breaking on "0.35" or "utils/payloadMapper.ts builds".
    const parts = trimmed.split(/(?<=[.!?])\s+(?=[A-Z0-9"'])/);
    for (const p of parts) {
      const s = p.trim();
      if (s.length >= 12) out.push({ text: s, sourceId, sourceTitle, position: pos++ });
    }
  }
  return out;
}

export interface ComposeOptions {
  /** Sentences to select. */
  limit?: number;
  /** 0 = pure diversity, 1 = pure relevance. */
  lambda?: number;
  /** Minimum cosine relevance to be eligible at all. */
  floor?: number;
}

export interface Composed {
  picked: Sentence[];
  /** Relevance of each pick, aligned with `picked`. */
  scores: number[];
  /** Distinct chunks the answer drew from. */
  sources: { id: string; title: string }[];
}

/**
 * Selects the sentences that best answer `query` from `pool`.
 *
 * A shared vocabulary is built over the query and pool so cosine similarity is
 * computed in one space; the vocabulary is local to the call, which keeps this
 * function pure and free of cross-request state.
 */
export function compose(query: string, pool: Sentence[], opts: ComposeOptions = {}): Composed {
  const { limit = 5, lambda = 0.72, floor = 0.04 } = opts;
  if (pool.length === 0) return { picked: [], scores: [], sources: [] };

  const vocab = new Vocabulary();
  const qBag = features(query, FEATS);
  for (const f of qBag.keys()) vocab.add(f);
  const bags = pool.map(s => features(s.text, FEATS));
  for (const b of bags) for (const f of b.keys()) vocab.add(f);

  const qv = vectorise(qBag, vocab);
  const vecs = bags.map(b => vectorise(b, vocab));

  // Relevance, with a mild bonus for sentences early in their chunk — those
  // are usually the definitional ones rather than caveats.
  const relevance = vecs.map((v, i) => {
    const base = cosine(qv, v);
    const positional = 1 + Math.max(0, 0.10 - 0.015 * pool[i].position);
    return base * positional;
  });

  const chosen: number[] = [];
  const scores: number[] = [];
  const eligible = new Set(relevance.map((r, i) => (r >= floor ? i : -1)).filter(i => i >= 0));

  while (chosen.length < limit && eligible.size > 0) {
    let bestIdx = -1, bestVal = -Infinity;

    for (const i of eligible) {
      let maxSim = 0;
      for (const j of chosen) maxSim = Math.max(maxSim, cosine(vecs[i], vecs[j]));
      const mmr = lambda * relevance[i] - (1 - lambda) * maxSim;
      if (mmr > bestVal) { bestVal = mmr; bestIdx = i; }
    }

    if (bestIdx < 0) break;
    chosen.push(bestIdx);
    scores.push(relevance[bestIdx]);
    eligible.delete(bestIdx);
  }

  // Restore reading order within each source so the prose flows.
  const ordered = chosen
    .map((i, k) => ({ i, score: scores[k] }))
    .sort((a, b) => {
      const sa = pool[a.i], sb = pool[b.i];
      if (sa.sourceId !== sb.sourceId) return 0;
      return sa.position - sb.position;
    });

  const picked = ordered.map(o => pool[o.i]);
  const sources: { id: string; title: string }[] = [];
  for (const p of picked) {
    if (!sources.some(s => s.id === p.sourceId)) sources.push({ id: p.sourceId, title: p.sourceTitle });
  }

  return { picked, scores: ordered.map(o => o.score), sources };
}
