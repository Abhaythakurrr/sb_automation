/**
 * Retrieval over the trusted knowledge base.
 *
 * Deliberately not a vector store. The knowledge base is a few hundred curated
 * chunks of our own documentation, it never changes at runtime, and the
 * vocabulary is domain-specific (field names, endpoint paths, UAC terms). A
 * BM25 index with domain synonym expansion beats embeddings here and, more
 * importantly, keeps the whole thing in-process: no model download, no network
 * call, no data leaving the server, and identical answers every time.
 */
import { KNOWLEDGE } from './knowledge';
import { KnowledgeChunk, PageId } from './types';

// ── Tokenisation ─────────────────────────────────────────────────────────────

/**
 * Words that carry no signal in this domain. "job", "task" and "trigger" are
 * deliberately NOT stopwords even though they are everywhere — they are the
 * subject matter.
 */
const STOPWORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'am',
  'do', 'does', 'did', 'doing', 'done', 'have', 'has', 'had', 'having',
  'i', 'me', 'my', 'we', 'our', 'you', 'your', 'it', 'its', 'they', 'them',
  'who', 'whom', 'whose', 'what', 'when', 'where', 'why', 'which', 'how',
  'this', 'that', 'these', 'those', 'there', 'here',
  'and', 'or', 'but', 'if', 'then', 'else', 'so', 'than', 'as', 'of', 'at',
  'by', 'for', 'with', 'about', 'into', 'to', 'from', 'in', 'on', 'up', 'out',
  'can', 'could', 'will', 'would', 'shall', 'should', 'may', 'might', 'must',
  'please', 'tell', 'want', 'need', 'know', 'let', 'get', 'give', 'show',
  'some', 'any', 'all', 'more', 'most', 'other', 'very', 'just', 'also',
  'thing', 'things', 'stuff', 'ok', 'okay', 'hi', 'hello', 'thanks',
]);

/**
 * Light suffix stemmer. Enough to make "scheduling" match "schedule" and
 * "triggers" match "trigger" without pulling in a stemmer dependency.
 */
function stem(word: string): string {
  let w = word;
  if (w.length > 4 && w.endsWith('ies')) return w.slice(0, -3) + 'y';
  if (w.length > 4 && w.endsWith('sses')) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith('es') && !/[aeiou]es$/.test(w)) w = w.slice(0, -2);
  else if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) w = w.slice(0, -1);
  if (w.length > 5 && w.endsWith('ing')) w = w.slice(0, -3);
  else if (w.length > 4 && w.endsWith('ed')) w = w.slice(0, -2);
  return w;
}

export function tokenize(text: string): string[] {
  const out: string[] = [];
  // Split on anything that is not a letter, digit, underscore, slash, dot or
  // hyphen so identifiers survive: task_name, /api/upload, -TR001, HH:MM.
  const raw = text.toLowerCase().split(/[^a-z0-9_/.\-]+/);
  for (const piece of raw) {
    if (!piece) continue;
    const clean = piece.replace(/^[.\-/]+|[.\-/]+$/g, '');
    if (!clean || clean.length < 2) continue;
    if (!STOPWORDS.has(clean)) out.push(stem(clean));
    // Also index the sub-parts of compound identifiers so "name" hits
    // "task_name" and "upload" hits "/api/upload".
    if (/[_/.\-]/.test(clean)) {
      for (const sub of clean.split(/[_/.\-]+/)) {
        if (sub.length >= 2 && !STOPWORDS.has(sub)) out.push(stem(sub));
      }
    }
  }
  return out;
}

// ── Domain synonyms ──────────────────────────────────────────────────────────

/**
 * Maps the words users actually type onto the vocabulary the knowledge base
 * uses. Expansion is one-directional and additive: the original term is always
 * kept, the synonyms are added at a reduced weight by the scorer.
 */
const SYNONYMS: Record<string, string[]> = {
  // Objects
  job: ['task', 'trigger'],
  schedule: ['trigger', 'frequency', 'timestyle', 'daystyle', 'cron'],
  cron: ['schedule', 'frequency', 'trigger', 'timestyle'],
  workstation: ['agent', 'cluster'],
  machine: ['agent', 'cluster'],
  server: ['agent', 'cluster'],
  script: ['command'],
  runtime: ['maxruntime', 'duration'],
  ticket: ['servicenow', 'customfield2', 'change'],
  snow: ['servicenow'],
  inc: ['servicenow', 'incident'],
  group: ['opswisegroups', 'businessservices'],
  login: ['credential', 'credentials'],
  account: ['credential', 'credentials'],
  password: ['credential', 'credentials'],
  doc: ['notes', 'documentation', 'jobdoc'],
  note: ['notes', 'documentation'],
  timezone: ['tz', 'timezone'],
  tz: ['timezone'],

  // Actions
  create: ['creation', 'build', 'new', 'execute'],
  make: ['create', 'creation'],
  add: ['create', 'creation'],
  upload: ['file', 'excel', 'csv', 'parse'],
  delete: ['deletion', 'remove', 'decommission'],
  remove: ['deletion', 'delete'],
  restore: ['recovery', 'recover', 'undelete'],
  undo: ['recovery', 'recover'],
  rollback: ['recovery', 'recover'],
  edit: ['update', 'change', 'modify', 'search'],
  change: ['update', 'edit', 'modify'],
  modify: ['update', 'edit'],
  run: ['launch', 'execute', 'adhoc'],
  start: ['launch', 'execute', 'enable'],
  stop: ['cancel', 'halt', 'suspend', 'disable'],
  pause: ['suspend', 'hold'],
  suspend: ['pause', 'agent'],
  kill: ['cancel', 'halt', 'forcefinish'],
  stuck: ['forcefinish', 'halt', 'active', 'instance'],
  hung: ['forcefinish', 'lateFinish', 'maxruntime'],
  retry: ['rerun', 'retrymaximum'],
  rerun: ['retry', 'relaunch'],

  // Problems
  error: ['failure', 'failed', 'validation', 'rejected'],
  fail: ['failure', 'failed', 'error'],
  failed: ['failure', 'error'],
  broken: ['error', 'failure'],
  problem: ['error', 'failure', 'issue'],
  issue: ['error', 'failure', 'problem'],
  wrong: ['error', 'invalid', 'mismatch'],
  invalid: ['validation', 'error', 'rejected'],
  missing: ['required', 'validation', 'empty'],
  duplicate: ['unique', 'exists', 'conflict'],
  conflict: ['overlap', 'duplicate', 'collision'],
  overlap: ['conflict', 'collision'],
  offline: ['agent', 'monitoring', 'alert'],
  expired: ['session', 'reconnect', 'timeout'],
  unauthorized: ['session', 'auth', 'token', '401'],

  // Concepts
  alert: ['monitoring', 'teams', 'notification'],
  notification: ['alert', 'teams', 'webhook'],
  teams: ['webhook', 'adaptivecard', 'alert'],
  api: ['endpoint', 'route'],
  endpoint: ['api', 'route'],
  payload: ['task', 'trigger', 'json', 'body'],
  json: ['payload'],
  field: ['column', 'property'],
  column: ['field', 'header'],
  header: ['column', 'field'],
  spreadsheet: ['excel', 'csv', 'ods', 'file'],
  excel: ['spreadsheet', 'xlsx', 'file'],
  permission: ['auth', 'session', 'credential'],
  security: ['auth', 'session', 'encryption', 'validation'],
  config: ['configuration', 'environment', 'env'],
  setting: ['configuration', 'environment'],
  log: ['logs', 'audit', 'logging'],
  history: ['audit', 'logs'],
  weekday: ['businessdays', 'specificdays'],
  weekend: ['saturday', 'sunday', 'sat', 'sun'],
  monthly: ['complex', 'dateadjective', 'datenouns'],
  weekly: ['specificdays', 'dayflags'],
  interval: ['timeinterval', 'every', 'repeat'],
  repeat: ['interval', 'timeinterval'],
  copilot: ['assistant', 'ai'],
  assistant: ['copilot', 'ai'],
};

function expand(tokens: string[]): { token: string; weight: number }[] {
  const out: { token: string; weight: number }[] = [];
  const seen = new Set<string>();
  const push = (t: string, w: number) => {
    const key = `${t}:${w}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ token: t, weight: w });
  };
  for (const t of tokens) push(t, 1);
  for (const t of tokens) {
    for (const syn of SYNONYMS[t] || []) push(stem(syn), 0.45);
  }
  return out;
}

// ── Index ────────────────────────────────────────────────────────────────────

interface IndexedChunk {
  chunk: KnowledgeChunk;
  /** Term frequency per token. */
  tf: Map<string, number>;
  length: number;
  /** Lowercased title+keywords, for phrase and exact-identifier boosts. */
  titleTokens: Set<string>;
  keywordText: string;
}

const K1 = 1.4;   // term-frequency saturation
const B = 0.7;    // length normalisation

class KnowledgeIndex {
  private docs: IndexedChunk[] = [];
  private df = new Map<string, number>();
  private avgLength = 0;

  constructor(chunks: KnowledgeChunk[]) {
    for (const chunk of chunks) {
      // Title and keywords are repeated so a match there outweighs a match
      // buried in prose.
      const kw = (chunk.keywords || []).join(' ');
      const text = `${chunk.title} ${chunk.title} ${kw} ${kw} ${chunk.body}`;
      const tokens = tokenize(text);
      const tf = new Map<string, number>();
      for (const t of tokens) tf.set(t, (tf.get(t) || 0) + 1);
      for (const t of tf.keys()) this.df.set(t, (this.df.get(t) || 0) + 1);
      this.docs.push({
        chunk,
        tf,
        length: tokens.length,
        titleTokens: new Set(tokenize(`${chunk.title} ${kw}`)),
        keywordText: `${chunk.title} ${kw}`.toLowerCase(),
      });
    }
    this.avgLength = this.docs.reduce((s, d) => s + d.length, 0) / (this.docs.length || 1);
  }

  private idf(token: string): number {
    const n = this.docs.length;
    const df = this.df.get(token) || 0;
    if (df === 0) return 0;
    // BM25 idf, floored so a term present in most docs still counts a little.
    return Math.max(0.05, Math.log(1 + (n - df + 0.5) / (df + 0.5)));
  }

  search(query: string, opts: RetrieveOptions): ScoredChunk[] {
    const queryTokens = tokenize(query);
    if (queryTokens.length === 0 && !opts.page) return [];

    const terms = expand(queryTokens);
    const lowerQuery = query.toLowerCase();
    const results: ScoredChunk[] = [];
    // Distinct query terms, used to measure how much of the question a chunk
    // actually addresses. Score alone is not enough: a long chunk can score
    // respectably off one incidental word.
    const distinctQueryTerms = new Set(queryTokens);

    for (const doc of this.docs) {
      if (opts.kinds && !opts.kinds.includes(doc.chunk.kind)) continue;

      let score = 0;
      const matchedSet = new Set<string>();

      for (const { token, weight } of terms) {
        const f = doc.tf.get(token);
        if (!f) continue;
        const idf = this.idf(token);
        const norm = f * (K1 + 1) / (f + K1 * (1 - B + B * (doc.length / this.avgLength)));
        score += idf * norm * weight;
        if (weight === 1) matchedSet.add(token);
        // Extra credit when the term hits the title or keywords.
        if (doc.titleTokens.has(token)) score += 1.1 * weight;
      }

      if (score === 0) continue;

      const matched = Array.from(matchedSet);
      const coverage = distinctQueryTerms.size === 0
        ? 0
        : matched.length / distinctQueryTerms.size;

      // Whole-phrase hit in the title or keywords — strong signal for things
      // like "qualifying times" or "ref_job".
      if (lowerQuery.length > 4 && doc.keywordText.includes(lowerQuery)) score += 4;

      // The page the user is on biases retrieval toward relevant chunks
      // without ever excluding an off-page answer.
      if (opts.page && doc.chunk.pages.includes(opts.page)) score *= 1.35;

      results.push({ chunk: doc.chunk, score, matched, coverage });
    }

    results.sort((a, b) => b.score - a.score);
    return results;
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

export interface ScoredChunk {
  chunk: KnowledgeChunk;
  score: number;
  /** Query terms (excluding synonym expansions) that hit this chunk. */
  matched: string[];
  /** Fraction of the query's own terms this chunk matched, 0–1. */
  coverage: number;
}

export interface RetrieveOptions {
  page?: PageId;
  kinds?: KnowledgeChunk['kind'][];
  limit?: number;
  /** Chunks scoring below this are treated as noise. */
  minScore?: number;
}

const index = new KnowledgeIndex(KNOWLEDGE);

/**
 * Minimum score for a chunk to count as a real hit. Tuned so a genuine
 * question about the app clears it while "what's the weather" does not.
 */
export const RELEVANCE_FLOOR = 2.2;

export function retrieve(query: string, opts: RetrieveOptions = {}): ScoredChunk[] {
  const limit = opts.limit ?? 6;
  const minScore = opts.minScore ?? 0;
  const hits = index.search(query, opts).filter(h => h.score >= minScore);

  if (hits.length > 0) return hits.slice(0, limit);

  // Nothing matched. Fall back to the current page's own chunks so a vague
  // question ("what now?") still gets grounded, page-relevant material.
  if (opts.page) {
    return KNOWLEDGE
      .filter(c => c.pages.includes(opts.page!))
      .slice(0, limit)
      .map(chunk => ({ chunk, score: 0, matched: [], coverage: 0 }));
  }
  return [];
}

/**
 * Minimum share of the question's own terms the best chunk must address.
 * Without this, an off-topic question ("who won the world cup in 1998")
 * still clears the score floor off one incidental word and gets answered
 * from an unrelated chunk — the worst possible failure mode for this
 * assistant, since a confident irrelevant answer reads as a correct one.
 */
export const COVERAGE_FLOOR = 0.34;

/** True when the question found nothing solid in the trusted knowledge base. */
export function isOutOfScope(hits: ScoredChunk[]): boolean {
  const best = hits[0];
  if (!best) return true;
  if (best.score < RELEVANCE_FLOOR) return true;
  return best.coverage < COVERAGE_FLOOR;
}

/** Renders hits as the grounding block handed to the language model. */
export function buildContextBlock(hits: ScoredChunk[], maxChars = 9000): string {
  const parts: string[] = [];
  let used = 0;
  for (const hit of hits) {
    const block = `### ${hit.chunk.title}  [${hit.chunk.id}]\n${hit.chunk.body}${hit.chunk.source ? `\n(implementation: ${hit.chunk.source})` : ''}`;
    if (used + block.length > maxChars) break;
    parts.push(block);
    used += block.length;
  }
  return parts.join('\n\n');
}

export const retrieverStats = () => ({
  documents: KNOWLEDGE.length,
  strategy: 'BM25 + domain synonym expansion + page-context boost',
});
