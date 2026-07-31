/**
 * The three learners the Copilot uses. All pure TypeScript, all trained
 * in-process from repo-local corpora, all deterministic.
 *
 *   MultinomialNB  — intent classification. Fast, needs little data, and its
 *                    per-feature log-ratios are directly inspectable, which
 *                    matters because the Copilot has to be able to say why it
 *                    read a question the way it did.
 *   MLP            — schedule-pattern classification. A genuine neural net
 *                    (one hidden layer, ReLU, softmax, cross-entropy, SGD with
 *                    momentum) trained on generated phrase variants. Used as a
 *                    cross-check on the rule parser, never as its replacement.
 *   LSA            — latent semantic indexing over the knowledge base. Gives
 *                    the retriever a dense semantic channel that BM25 cannot
 *                    provide, learned by truncated SVD of the TF-IDF matrix.
 */
import { Vocabulary, prng, gaussian, softmax, cosine, normalise } from './core';

// ═══════════════════════════════════════════════════════════════════════════
// Multinomial Naive Bayes
// ═══════════════════════════════════════════════════════════════════════════

export interface NBExplanation {
  label: string;
  /** Features that pushed hardest toward the predicted label. */
  evidence: { feature: string; weight: number }[];
}

export class MultinomialNB {
  private vocab = new Vocabulary();
  private labels: string[] = [];
  /** log P(feature | label), indexed [labelIdx][featureIdx]. */
  private logLik: Float64Array[] = [];
  private logPrior: number[] = [];
  private alpha: number;

  constructor(alpha = 0.35) {
    // Laplace/Lidstone smoothing. Below 1 because the corpus is small and
    // heavy smoothing washes out the discriminative rare terms.
    this.alpha = alpha;
  }

  train(samples: { bag: Map<string, number>; label: string }[]): void {
    const labelSet: string[] = [];
    for (const s of samples) if (!labelSet.includes(s.label)) labelSet.push(s.label);
    this.labels = labelSet;

    for (const s of samples) for (const f of s.bag.keys()) this.vocab.add(f);

    const V = this.vocab.size;
    const counts = this.labels.map(() => new Float64Array(V));
    const totals = new Float64Array(this.labels.length);
    const docs = new Float64Array(this.labels.length);

    for (const s of samples) {
      const li = this.labels.indexOf(s.label);
      docs[li]++;
      for (const [f, c] of s.bag) {
        const fi = this.vocab.get(f);
        if (fi < 0) continue;
        counts[li][fi] += c;
        totals[li] += c;
      }
    }

    this.logPrior = this.labels.map((_, li) => Math.log(docs[li] / samples.length));
    this.logLik = this.labels.map((_, li) => {
      const row = new Float64Array(V);
      const denom = totals[li] + this.alpha * V;
      for (let fi = 0; fi < V; fi++) row[fi] = Math.log((counts[li][fi] + this.alpha) / denom);
      return row;
    });
  }

  /** Returns per-label posterior probabilities. */
  scores(bag: Map<string, number>): { label: string; p: number }[] {
    const raw = this.labels.map((_, li) => {
      let s = this.logPrior[li];
      for (const [f, c] of bag) {
        const fi = this.vocab.get(f);
        if (fi >= 0) s += c * this.logLik[li][fi];
      }
      return s;
    });
    const probs = softmax(raw);
    return this.labels.map((label, i) => ({ label, p: probs[i] }))
      .sort((a, b) => b.p - a.p);
  }

  predict(bag: Map<string, number>): { label: string; confidence: number } {
    const s = this.scores(bag);
    return { label: s[0].label, confidence: s[0].p };
  }

  /**
   * Why the model chose this label: the features whose log-likelihood under the
   * winner most exceeds their average under the alternatives.
   */
  explain(bag: Map<string, number>, top = 5): NBExplanation {
    const best = this.scores(bag)[0].label;
    const li = this.labels.indexOf(best);
    const evidence: { feature: string; weight: number }[] = [];

    for (const [f, c] of bag) {
      const fi = this.vocab.get(f);
      if (fi < 0) continue;
      let others = 0;
      for (let l = 0; l < this.labels.length; l++) if (l !== li) others += this.logLik[l][fi];
      const avgOther = others / Math.max(1, this.labels.length - 1);
      evidence.push({ feature: f, weight: c * (this.logLik[li][fi] - avgOther) });
    }

    evidence.sort((a, b) => b.weight - a.weight);
    return { label: best, evidence: evidence.slice(0, top) };
  }

  get vocabSize(): number { return this.vocab.size; }
  get labelCount(): number { return this.labels.length; }
}

// ═══════════════════════════════════════════════════════════════════════════
// Multi-layer perceptron
// ═══════════════════════════════════════════════════════════════════════════

/** Negative slope of the leaky ReLU. */
const LEAK = 0.01;

export interface MLPConfig {
  inputSize: number;
  hiddenSize: number;
  outputSize: number;
  learningRate?: number;
  momentum?: number;
  l2?: number;
  epochs?: number;
  seed?: number;
}

/**
 * One hidden layer, ReLU activation, softmax output, cross-entropy loss,
 * mini-batch SGD with momentum and L2 weight decay.
 *
 * Small on purpose: the task is a 7-way classification of short phrases, and a
 * deeper net would overfit a few hundred generated examples while costing boot
 * time. Kept as a real trained network rather than more hand-written rules
 * because it generalises to phrasings the corpus does not contain.
 */
export class MLP {
  private w1: Float64Array; private b1: Float64Array;
  private w2: Float64Array; private b2: Float64Array;
  private vw1: Float64Array; private vb1: Float64Array;
  private vw2: Float64Array; private vb2: Float64Array;
  private cfg: Required<MLPConfig>;
  public lossHistory: number[] = [];

  constructor(cfg: MLPConfig) {
    this.cfg = {
      learningRate: 0.08, momentum: 0.9, l2: 1e-5, epochs: 240, seed: 20260731,
      ...cfg,
    } as Required<MLPConfig>;

    const { inputSize: I, hiddenSize: H, outputSize: O, seed } = this.cfg;
    const rand = prng(seed);

    // He initialisation for the ReLU layer, Xavier for the softmax layer.
    this.w1 = new Float64Array(I * H);
    for (let i = 0; i < this.w1.length; i++) this.w1[i] = gaussian(rand) * Math.sqrt(2 / I);
    this.w2 = new Float64Array(H * O);
    for (let i = 0; i < this.w2.length; i++) this.w2[i] = gaussian(rand) * Math.sqrt(1 / H);

    // Small positive hidden bias. Starting at zero puts roughly half the units
    // on the flat side of the ReLU, and a single large early step can then push
    // them permanently negative.
    this.b1 = new Float64Array(H).fill(0.01);
    this.b2 = new Float64Array(O);
    this.vw1 = new Float64Array(this.w1.length);
    this.vb1 = new Float64Array(H);
    this.vw2 = new Float64Array(this.w2.length);
    this.vb2 = new Float64Array(O);
  }

  /**
   * Non-zero indices of a feature vector.
   *
   * Text features are extremely sparse — around 40 active of several thousand —
   * so iterating the full input width per hidden unit wastes ~98% of the work.
   * Precomputing the active set turns training from minutes into seconds.
   */
  private static nonZero(x: Float64Array): Int32Array {
    let n = 0;
    for (let i = 0; i < x.length; i++) if (x[i] !== 0) n++;
    const out = new Int32Array(n);
    let k = 0;
    for (let i = 0; i < x.length; i++) if (x[i] !== 0) out[k++] = i;
    return out;
  }

  private forward(x: Float64Array, nz: Int32Array) {
    const { hiddenSize: H, outputSize: O } = this.cfg;
    const h = new Float64Array(H);
    const pre = new Float64Array(H);
    for (let j = 0; j < H; j++) {
      let s = this.b1[j];
      for (let t = 0; t < nz.length; t++) {
        const i = nz[t];
        s += x[i] * this.w1[i * H + j];
      }
      pre[j] = s;
      // Leaky ReLU. A plain ReLU can die permanently: once a unit's
      // pre-activation is negative for every input its gradient is zero for
      // ever, and if that happens to all units the network collapses to
      // predicting class priors. The small negative slope keeps a recovery
      // path open.
      h[j] = s > 0 ? s : LEAK * s;
    }
    const z = new Array<number>(O);
    for (let k = 0; k < O; k++) {
      let s = this.b2[k];
      for (let j = 0; j < H; j++) s += h[j] * this.w2[j * O + k];
      z[k] = s;
    }
    return { h, pre, p: softmax(z) };
  }

  train(X: Float64Array[], Y: number[]): void {
    const { hiddenSize: H, outputSize: O, epochs, learningRate, momentum, l2 } = this.cfg;
    const rand = prng(this.cfg.seed ^ 0x9e3779b9);
    const order = X.map((_, i) => i);
    const NZ = X.map(x => MLP.nonZero(x));

    for (let ep = 0; ep < epochs; ep++) {
      // Deterministic Fisher–Yates shuffle from the seeded PRNG.
      for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [order[i], order[j]] = [order[j], order[i]];
      }

      let loss = 0;
      // Decay the step size so late epochs settle instead of oscillating.
      const lr = learningRate / (1 + 0.004 * ep);

      for (const idx of order) {
        const x = X[idx], y = Y[idx], nz = NZ[idx];
        const { h, pre, p } = this.forward(x, nz);
        loss -= Math.log(Math.max(1e-12, p[y]));

        // Output layer gradient: softmax + cross-entropy collapses to (p - onehot).
        const dz = new Float64Array(O);
        for (let k = 0; k < O; k++) dz[k] = p[k] - (k === y ? 1 : 0);

        // Hidden layer gradient, scaled by the leaky-ReLU derivative.
        const dh = new Float64Array(H);
        for (let j = 0; j < H; j++) {
          let s = 0;
          for (let k = 0; k < O; k++) s += dz[k] * this.w2[j * O + k];
          dh[j] = s * (pre[j] > 0 ? 1 : LEAK);
        }

        for (let j = 0; j < H; j++) {
          for (let k = 0; k < O; k++) {
            const g = h[j] * dz[k] + l2 * this.w2[j * O + k];
            const vi = j * O + k;
            this.vw2[vi] = momentum * this.vw2[vi] - lr * g;
            this.w2[vi] += this.vw2[vi];
          }
        }
        for (let k = 0; k < O; k++) {
          this.vb2[k] = momentum * this.vb2[k] - lr * dz[k];
          this.b2[k] += this.vb2[k];
        }
        // Only active input rows contribute a gradient.
        for (let t = 0; t < nz.length; t++) {
          const i = nz[t];
          for (let j = 0; j < H; j++) {
            const g = x[i] * dh[j] + l2 * this.w1[i * H + j];
            const vi = i * H + j;
            this.vw1[vi] = momentum * this.vw1[vi] - lr * g;
            this.w1[vi] += this.vw1[vi];
          }
        }
        for (let j = 0; j < H; j++) {
          this.vb1[j] = momentum * this.vb1[j] - lr * dh[j];
          this.b1[j] += this.vb1[j];
        }
      }
      this.lossHistory.push(loss / X.length);
    }
  }

  predict(x: Float64Array): { index: number; confidence: number; probs: number[] } {
    const { p } = this.forward(x, MLP.nonZero(x));
    let best = 0;
    for (let i = 1; i < p.length; i++) if (p[i] > p[best]) best = i;
    return { index: best, confidence: p[best], probs: p };
  }

  get finalLoss(): number { return this.lossHistory[this.lossHistory.length - 1] ?? NaN; }
  get parameterCount(): number { return this.w1.length + this.b1.length + this.w2.length + this.b2.length; }
}

// ═══════════════════════════════════════════════════════════════════════════
// Latent Semantic Analysis
// ═══════════════════════════════════════════════════════════════════════════

/**
 * TF-IDF followed by truncated SVD, giving each knowledge chunk a dense vector
 * in a low-dimensional "concept" space.
 *
 * This is the piece BM25 cannot do. BM25 needs a shared term: ask "how do I
 * stop a job from stacking up on itself" and it will not find the chunk that
 * says "skipCondition Active By Trigger" unless a word literally overlaps. LSA
 * places both near each other because the terms co-occur across the corpus.
 *
 * SVD is computed by orthogonal (block power) iteration on the Gram matrix,
 * which is exact enough at this size and needs no linear-algebra dependency.
 */
export class LSA {
  private vocab = new Vocabulary();
  private idf: Float64Array = new Float64Array(0);
  /** Document vectors in concept space, unit length. */
  private docVecs: Float64Array[] = [];
  /** Term-to-concept projection, [k][vocabSize]. */
  private components: Float64Array[] = [];
  private k: number;
  private seed: number;

  constructor(k = 48, seed = 20260731) {
    this.k = k;
    this.seed = seed;
  }

  /** @param docs Feature bags, one per knowledge chunk. */
  train(docs: Map<string, number>[]): void {
    for (const d of docs) for (const t of d.keys()) this.vocab.add(t);
    const V = this.vocab.size, D = docs.length;

    // Document frequency -> smoothed IDF.
    const df = new Float64Array(V);
    for (const d of docs) for (const t of d.keys()) {
      const i = this.vocab.get(t);
      if (i >= 0) df[i]++;
    }
    this.idf = new Float64Array(V);
    for (let i = 0; i < V; i++) this.idf[i] = Math.log((1 + D) / (1 + df[i])) + 1;

    // Row-normalised TF-IDF matrix.
    const A: Float64Array[] = docs.map(d => {
      const row = new Float64Array(V);
      for (const [t, c] of d) {
        const i = this.vocab.get(t);
        if (i >= 0) row[i] = (1 + Math.log(c)) * this.idf[i];
      }
      return normalise(row);
    });

    const k = Math.min(this.k, D, V);
    const rand = prng(this.seed);

    // Block power iteration: repeatedly apply AᵀA to a random basis and
    // re-orthonormalise. Converges to the top-k right singular vectors.
    let Q: Float64Array[] = [];
    for (let c = 0; c < k; c++) {
      const v = new Float64Array(V);
      for (let i = 0; i < V; i++) v[i] = gaussian(rand);
      Q.push(normalise(v));
    }

    for (let iter = 0; iter < 24; iter++) {
      const Z: Float64Array[] = Q.map(q => {
        // y = Aq  (length D), then z = Aᵀy  (length V)
        const y = new Float64Array(A.length);
        for (let d = 0; d < A.length; d++) {
          const row = A[d];
          let s = 0;
          for (let i = 0; i < V; i++) s += row[i] * q[i];
          y[d] = s;
        }
        const z = new Float64Array(V);
        for (let d = 0; d < A.length; d++) {
          const row = A[d], yd = y[d];
          if (yd === 0) continue;
          for (let i = 0; i < V; i++) z[i] += row[i] * yd;
        }
        return z;
      });
      // Modified Gram–Schmidt.
      Q = [];
      for (const z of Z) {
        const v = Float64Array.from(z);
        for (const q of Q) {
          let p = 0;
          for (let i = 0; i < V; i++) p += v[i] * q[i];
          for (let i = 0; i < V; i++) v[i] -= p * q[i];
        }
        const n = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
        if (n > 1e-9) {
          for (let i = 0; i < V; i++) v[i] /= n;
          Q.push(v);
        }
      }
      if (Q.length === 0) break;
    }

    this.components = Q;
    this.docVecs = A.map(row => this.project(row));
  }

  /** Projects a TF-IDF row into concept space. */
  private project(row: Float64Array): Float64Array {
    const out = new Float64Array(this.components.length);
    for (let c = 0; c < this.components.length; c++) {
      const comp = this.components[c];
      let s = 0;
      for (let i = 0; i < row.length && i < comp.length; i++) s += row[i] * comp[i];
      out[c] = s;
    }
    return normalise(out);
  }

  /** Embeds arbitrary text using the learned vocabulary and IDF. */
  embed(bag: Map<string, number>): Float64Array {
    const row = new Float64Array(this.vocab.size);
    for (const [t, c] of bag) {
      const i = this.vocab.get(t);
      if (i >= 0) row[i] = (1 + Math.log(c)) * this.idf[i];
    }
    return this.project(normalise(row));
  }

  /** Cosine similarity of a query embedding against every document, in order. */
  similarities(q: Float64Array): number[] {
    return this.docVecs.map(d => cosine(q, d));
  }

  get dimensions(): number { return this.components.length; }
  get vocabSize(): number { return this.vocab.size; }
  get documentCount(): number { return this.docVecs.length; }
}
