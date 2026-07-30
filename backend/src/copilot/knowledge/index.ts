/**
 * The trusted knowledge base.
 *
 * This is the ONLY body of application knowledge the Copilot is allowed to
 * answer from, alongside the caller's own session context. Nothing here is
 * fetched at runtime and nothing leaves the process.
 */
import { KnowledgeChunk, PageId } from '../types';
import { FEATURE_CHUNKS } from './features';
import { API_CHUNKS, API_SPECS } from './apis';
import { FIELD_CHUNKS } from './fields';
import { VALIDATION_CHUNKS } from './validation';
import { SCHEDULING_CHUNKS } from './scheduling';

export const KNOWLEDGE: KnowledgeChunk[] = [
  ...FEATURE_CHUNKS,
  ...API_CHUNKS,
  ...FIELD_CHUNKS,
  ...VALIDATION_CHUNKS,
  ...SCHEDULING_CHUNKS,
];

/** Guards against a copy/paste duplicate id silently shadowing a chunk. */
const seen = new Set<string>();
for (const c of KNOWLEDGE) {
  if (seen.has(c.id)) throw new Error(`Duplicate knowledge chunk id: ${c.id}`);
  seen.add(c.id);
}

export const KNOWLEDGE_BY_ID = new Map(KNOWLEDGE.map(c => [c.id, c]));

export function chunksForPage(page: PageId): KnowledgeChunk[] {
  return KNOWLEDGE.filter(c => c.pages.includes(page));
}

export const KNOWLEDGE_STATS = {
  chunks: KNOWLEDGE.length,
  endpoints: API_SPECS.length,
  byKind: KNOWLEDGE.reduce<Record<string, number>>((acc, c) => {
    acc[c.kind] = (acc[c.kind] || 0) + 1;
    return acc;
  }, {}),
};

export * from './features';
export * from './apis';
export * from './fields';
export * from './validation';
export * from './scheduling';
