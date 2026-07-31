/**
 * The Copilot's self-contained ML layer.
 *
 * Nothing here reaches the network. Every model is trained in-process from a
 * corpus that lives in this repository, using a seeded PRNG, so a given build
 * always produces identical weights and therefore identical answers.
 *
 *   intent          Multinomial Naive Bayes  — routes a question to a specialism
 *   schedulePattern Multi-layer perceptron    — second opinion on schedule shape
 *   semantic        Latent Semantic Analysis  — dense retrieval channel
 *   summarize       Maximal Marginal Relevance — composes answers from our own text
 *   stats           Median/MAD + Dice          — batch anomaly detection
 *
 * Training is lazy: the first call that needs a model builds it. That keeps
 * boot fast for deployments that never touch the Copilot, and the cost is paid
 * once per process.
 */
import { KNOWLEDGE } from '../knowledge';
import { LSA } from './models';
import { features } from './core';
import { intentModelStats } from './intent';
import { schedulePatternStats } from './schedulePattern';
import { createModuleLogger } from '../../config/logger';

const log = createModuleLogger('copilot:ml');

export * from './core';
export * from './models';
export * from './intent';
export * from './schedulePattern';
export * from './summarize';
export * from './stats';

// ── Semantic index over the knowledge base ───────────────────────────────────

/**
 * LSA needs the same feature space at index and query time, and the corpus is
 * the knowledge base itself. Title and keywords are repeated so a concept named
 * in the title weighs more than one mentioned once in prose.
 */
const chunkText = (c: typeof KNOWLEDGE[number]) =>
  `${c.title} ${c.title} ${(c.keywords || []).join(' ')} ${c.body}`;

let lsa: LSA | null = null;
let lsaMs = 0;

export function semanticIndex(): LSA {
  if (lsa) return lsa;
  const t0 = Date.now();
  const model = new LSA(48);
  model.train(KNOWLEDGE.map(c => features(chunkText(c), { wordNGrams: [1], dropStop: true })));
  lsaMs = Date.now() - t0;
  lsa = model;
  log.info('Trained LSA semantic index', {
    documents: model.documentCount,
    vocabulary: model.vocabSize,
    dimensions: model.dimensions,
    ms: lsaMs,
  });
  return model;
}

/** Cosine similarity of a query against every knowledge chunk, in KNOWLEDGE order. */
export function semanticSimilarities(query: string): number[] {
  const model = semanticIndex();
  return model.similarities(model.embed(features(query, { wordNGrams: [1], dropStop: true })));
}

// ── Warm-up and reporting ────────────────────────────────────────────────────

let warmed = false;

/**
 * Trains every model up front. Called from the Copilot health endpoint and
 * usable at boot; safe to call repeatedly.
 */
export function warmUp(): { ms: number } {
  if (warmed) return { ms: 0 };
  const t0 = Date.now();
  semanticIndex();
  intentModelStats();
  schedulePatternStats();
  const ms = Date.now() - t0;
  warmed = true;
  log.info('Copilot ML layer ready', { ms });
  return { ms };
}

/** Everything the health endpoint reports about the ML layer. */
export function mlStatus() {
  const sem = semanticIndex();
  return {
    selfContained: true,
    externalCalls: 'none — no model download, no inference API, no telemetry',
    deterministic: 'seeded PRNG; identical weights and answers on every boot',
    models: {
      intent: intentModelStats(),
      schedulePattern: schedulePatternStats(),
      semanticIndex: {
        algorithm: 'Latent Semantic Analysis (TF-IDF + truncated SVD via block power iteration)',
        documents: sem.documentCount,
        vocabulary: sem.vocabSize,
        dimensions: sem.dimensions,
        trainMs: lsaMs,
      },
      answerComposer: {
        algorithm: 'Maximal Marginal Relevance over knowledge-base sentences',
        note: 'answers are assembled from repository text verbatim, never generated',
      },
      anomalyDetection: {
        algorithm: 'robust z-score (median / scaled MAD) + Dice bigram similarity',
        note: 'flags rows that are individually valid but unlike the rest of the batch',
      },
    },
  };
}
