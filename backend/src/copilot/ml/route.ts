/**
 * Intent routing — the trained classifier plus whatever it has been corrected on.
 *
 * WHY THIS IS NOT INSIDE intent.ts
 *
 * Two reasons, both about keeping honest numbers.
 *
 * First, measurement. Held-out accuracy has to describe the shipped model, not
 * the shipped model plus a memo of everything a user has told it since. If
 * `classifyIntent` consulted runtime corrections, every accuracy figure the
 * Copilot reports about itself would quietly include them, and a model that had
 * been corrected a hundred times would look like a model that was right all along.
 *
 * Second, layering. Overriding a trained prediction on one person's say-so is a
 * policy decision, not a modelling one. Keeping it at the routing site means the
 * override is visible where routing happens, and the classifier underneath stays
 * something you can reason about on its own.
 *
 * It also happens to break an import cycle — online.ts needs the intent model's
 * feature options and label set — but that is a consequence of the layering, not
 * the reason for it.
 */
import { classifyIntent, IntentPrediction } from './intent';
import { exemplarIntent } from './online';

/**
 * Routes a question, letting a close-matching runtime correction win.
 *
 * The similarity floor for an exemplar match is deliberately high (see
 * EXEMPLAR_FLOOR): this overrides a model trained on a curated corpus because one
 * person said so once, so it should only fire on phrasings that are all but
 * identical to the one that was corrected.
 */
export function routeIntent(text: string): IntentPrediction {
  const base = classifyIntent(text);

  // A guardrail rule is an unambiguous phrasing where a wrong answer is actively
  // unhelpful. Those stay above runtime corrections.
  if (base.source === 'rule') return base;

  const ex = exemplarIntent(text);
  if (!ex || ex.intent === base.intent) return base;

  return {
    ...base,
    intent: ex.intent,
    source: 'exemplar',
    exemplar: { matched: ex.matched, similarity: ex.similarity, overrode: base.intent },
  };
}
