/**
 * Intent classification.
 *
 * Replaces a hand-written regex chain. The regexes are kept as a high-precision
 * guardrail (see rules below), but the model decides in every ambiguous case,
 * which is what lets the Copilot handle paraphrases nobody wrote a pattern for.
 *
 * The corpus below IS the training data. It lives in the repo, is reviewable in
 * a diff, and is the only thing that determines behaviour — there is no external
 * model and nothing is learned from user traffic at runtime.
 */
import { MultinomialNB } from './models';
import { features, FeatureOptions, evaluate, EvalResult } from './core';

export type Intent =
  | 'schedule'
  | 'explain-field'
  | 'explain-payload'
  | 'explain-error'
  | 'analyze-upload'
  | 'impact'
  | 'howto'
  | 'capability'
  | 'general';

/** Word 1–2 grams plus character 3–5 grams: robust to morphology and typos. */
const FEATS: FeatureOptions = {
  wordNGrams: [1, 2],
  charNGrams: [3, 4, 5],
  dropStop: true,
  shape: true,
};

/**
 * Labelled utterances. Phrasings were chosen to cover how operations engineers
 * actually ask — including terse fragments, which is the case a regex chain
 * handles worst.
 */
const CORPUS: { text: string; label: Intent }[] = [
  // ── schedule ────────────────────────────────────────────────────────────
  { text: 'i want this to run every monday', label: 'schedule' },
  { text: 'run every weekday at 8 pm', label: 'schedule' },
  { text: 'every 15 minutes', label: 'schedule' },
  { text: 'every 5 minutes of monday tuesday and wednesday', label: 'schedule' },
  { text: 'only on business days', label: 'schedule' },
  { text: 'run on the last friday of every month', label: 'schedule' },
  { text: 'schedule it daily at 3am', label: 'schedule' },
  { text: 'how do i say every other day', label: 'schedule' },
  { text: 'i need it hourly between 6 and 10', label: 'schedule' },
  { text: 'set the frequency to weekdays only', label: 'schedule' },
  { text: 'make this job run twice a day', label: 'schedule' },
  { text: 'what cron expression do i need', label: 'schedule' },
  { text: 'change the schedule to monthly on the 24th', label: 'schedule' },
  { text: 'every 30 mins from 0600 until 2200 asia/kolkata', label: 'schedule' },
  { text: 'run it at midnight every night', label: 'schedule' },
  { text: 'first business day of the month', label: 'schedule' },
  { text: 'fire the trigger every two hours', label: 'schedule' },
  { text: 'i want a weekly job on friday evening', label: 'schedule' },

  // ── analyze-upload ──────────────────────────────────────────────────────
  { text: 'check my file', label: 'analyze-upload' },
  { text: 'check my uploaded file for problems', label: 'analyze-upload' },
  { text: 'validate the spreadsheet', label: 'analyze-upload' },
  { text: 'is my upload ok', label: 'analyze-upload' },
  { text: 'any issues with these rows', label: 'analyze-upload' },
  { text: 'review the jobs i uploaded', label: 'analyze-upload' },
  { text: 'whats wrong with my excel', label: 'analyze-upload' },
  { text: 'run validation on the file', label: 'analyze-upload' },
  { text: 'are there duplicates in my sheet', label: 'analyze-upload' },
  { text: 'scan my rows for missing fields', label: 'analyze-upload' },
  { text: 'do i have any schedule conflicts', label: 'analyze-upload' },
  { text: 'analyse the uploaded jobs before i execute', label: 'analyze-upload' },
  { text: 'go through the sheet and find problems', label: 'analyze-upload' },
  { text: 'look at my rows and tell me whats wrong', label: 'analyze-upload' },
  { text: 'inspect what i loaded and flag anything broken', label: 'analyze-upload' },
  { text: 'tell me if my file is good to run', label: 'analyze-upload' },

  // ── explain-payload ─────────────────────────────────────────────────────
  { text: 'explain this payload', label: 'explain-payload' },
  { text: 'explain the payload for pay daily load', label: 'explain-payload' },
  { text: 'walk me through the generated json', label: 'explain-payload' },
  { text: 'what does this task payload contain', label: 'explain-payload' },
  { text: 'break down the trigger json', label: 'explain-payload' },
  { text: 'which api receives this payload', label: 'explain-payload' },
  { text: 'show me what will be sent to uac', label: 'explain-payload' },
  { text: 'explain the json for this job', label: 'explain-payload' },

  // ── explain-field ───────────────────────────────────────────────────────
  { text: 'what does maxruntime mean', label: 'explain-field' },
  { text: 'what is lfduration', label: 'explain-field' },
  { text: 'what does the field skipcondition do', label: 'explain-field' },
  { text: 'meaning of opswisegroups', label: 'explain-field' },
  { text: 'what is task_name for', label: 'explain-field' },
  { text: 'explain the agentcluster field', label: 'explain-field' },
  { text: 'what does resolvenameimmediately control', label: 'explain-field' },
  { text: 'tell me about the first_run_date column', label: 'explain-field' },
  { text: 'what is customfield2 used for', label: 'explain-field' },
  { text: 'define exitcodeprocessing', label: 'explain-field' },

  // ── explain-error ───────────────────────────────────────────────────────
  { text: 'why did this fail', label: 'explain-error' },
  { text: 'explain this error', label: 'explain-error' },
  { text: 'what went wrong with the creation', label: 'explain-error' },
  { text: 'i got time is required field for timestyle absolute', label: 'explain-error' },
  { text: 'the job failed with a 401', label: 'explain-error' },
  { text: 'session expired what does that mean', label: 'explain-error' },
  { text: 'why was my trigger rejected', label: 'explain-error' },
  { text: 'getting an error about duplicate name', label: 'explain-error' },
  { text: 'deletion was blocked what happened', label: 'explain-error' },
  { text: 'why is it saying agent not found', label: 'explain-error' },

  // ── impact ──────────────────────────────────────────────────────────────
  { text: 'what will happen if i execute this', label: 'impact' },
  { text: 'what happens if i delete this job', label: 'impact' },
  { text: 'what is the impact of running this batch', label: 'impact' },
  { text: 'if i enable the trigger what changes', label: 'impact' },
  { text: 'blast radius of this deletion', label: 'impact' },
  { text: 'how many objects will this create', label: 'impact' },
  { text: 'what does executing this actually do', label: 'impact' },
  { text: 'will this affect anything else', label: 'impact' },

  // ── howto ───────────────────────────────────────────────────────────────
  { text: 'how do i create jobs from a spreadsheet', label: 'howto' },
  { text: 'how do i delete a job safely', label: 'howto' },
  { text: 'how to restore a deleted job', label: 'howto' },
  { text: 'what are the steps to enable triggers', label: 'howto' },
  { text: 'where do i change an existing job', label: 'howto' },
  { text: 'how can i test a job without enabling it', label: 'howto' },
  { text: 'procedure for suspending an agent', label: 'howto' },
  { text: 'walk me through the deletion sequence', label: 'howto' },
  { text: 'how do i push job documentation', label: 'howto' },
  { text: 'how do i connect to a different environment', label: 'howto' },
  { text: 'steps to verify what was created', label: 'howto' },
  { text: 'how do i triage a failed job', label: 'howto' },

  // ── capability ──────────────────────────────────────────────────────────
  { text: 'what can you do', label: 'capability' },
  { text: 'who are you', label: 'capability' },
  { text: 'what do you know about', label: 'capability' },
  { text: 'help', label: 'capability' },
  { text: 'what are your capabilities', label: 'capability' },
  { text: 'can you help me', label: 'capability' },
  { text: 'what features do you support', label: 'capability' },

  // ── general ─────────────────────────────────────────────────────────────
  { text: 'what is a trigger', label: 'general' },
  { text: 'difference between a task and a trigger', label: 'general' },
  { text: 'tell me about monitoring', label: 'general' },
  { text: 'what is ref_job inheritance', label: 'general' },
  { text: 'how does the session timeout work', label: 'general' },
  { text: 'what integrations are available', label: 'general' },
  { text: 'which environment variables control alerts', label: 'general' },
  { text: 'what does the execution queue limit', label: 'general' },
  { text: 'are logs rotated', label: 'general' },
  { text: 'does this application have a database', label: 'general' },
  { text: 'what is business services used for in uac', label: 'general' },
  { text: 'explain agent clusters', label: 'general' },
  // Questions about runtime behaviour that mention scheduling words but are not
  // requests to build a schedule. Without these the schedule specialist grabs
  // them and replies "I could not turn that into a schedule".
  { text: 'stop a slow job running twice at once', label: 'general' },
  { text: 'how do i prevent overlapping runs', label: 'general' },
  { text: 'what stops a job stacking up on itself', label: 'general' },
  { text: 'what happens on a holiday', label: 'general' },
  { text: 'does it skip a run if the previous one is still going', label: 'general' },
  { text: 'why is my trigger disabled after creation', label: 'general' },
  { text: 'when is the next run calculated', label: 'general' },
];

/**
 * High-precision rules. These are unambiguous phrasings where a wrong answer
 * would be actively unhelpful, so they override the model. Everything else is
 * the model's decision.
 */
const RULES: { re: RegExp; intent: Intent }[] = [
  { re: /^\s*(help|what can you do|who are you)\s*\??\s*$/i, intent: 'capability' },
  { re: /\bwhat (will|would) happen\b|\bblast radius\b/i, intent: 'impact' },
  { re: /\bexplain (this|the) (payload|json)\b/i, intent: 'explain-payload' },
  { re: /\bcheck (my|the) (file|upload|sheet|spreadsheet|rows)\b/i, intent: 'analyze-upload' },
];

let model: MultinomialNB | null = null;

function ensure(): MultinomialNB {
  if (model) return model;
  const m = new MultinomialNB(0.35);
  m.train(CORPUS.map(s => ({ bag: features(s.text, FEATS), label: s.label })));
  model = m;
  return m;
}

export interface IntentPrediction {
  intent: Intent;
  confidence: number;
  /** 'rule' when a guardrail fired, 'model' otherwise. */
  source: 'rule' | 'model';
  /** Features that drove a model decision, for explainability. */
  evidence: { feature: string; weight: number }[];
  runnerUp?: { intent: Intent; confidence: number };
}

/** Below this the question is treated as open-ended rather than a specialism. */
export const INTENT_FLOOR = 0.34;

export function classifyIntent(text: string): IntentPrediction {
  for (const r of RULES) {
    if (r.re.test(text)) {
      return { intent: r.intent, confidence: 1, source: 'rule', evidence: [] };
    }
  }

  const m = ensure();
  const bag = features(text, FEATS);
  const ranked = m.scores(bag);
  const top = ranked[0];
  const explained = m.explain(bag, 4);

  // A weak winner means the phrasing does not clearly belong to a specialism;
  // routing it to 'general' produces a retrieval-grounded answer instead of a
  // confidently wrong specialist one.
  const intent = (top.p >= INTENT_FLOOR ? top.label : 'general') as Intent;

  return {
    intent,
    confidence: top.p,
    source: 'model',
    evidence: explained.evidence,
    runnerUp: ranked[1] ? { intent: ranked[1].label as Intent, confidence: ranked[1].p } : undefined,
  };
}

/** Held-out phrasings, none of which appear in the corpus. Used by the tests. */
export const HELD_OUT: { text: string; label: Intent }[] = [
  { text: 'i need this executing every tuesday morning at 7', label: 'schedule' },
  { text: 'make it fire every ten minutes during office hours', label: 'schedule' },
  { text: 'put it on a monthly cycle on the 15th', label: 'schedule' },
  { text: 'look over my sheet and tell me if anything is broken', label: 'analyze-upload' },
  { text: 'are the rows i loaded valid', label: 'analyze-upload' },
  { text: 'describe the json that gets posted', label: 'explain-payload' },
  { text: 'what is the purpose of the credentials field', label: 'explain-field' },
  { text: 'what does lsenabled do', label: 'explain-field' },
  { text: 'the creation blew up with an exception, why', label: 'explain-error' },
  { text: 'my upload was rejected, whats the reason', label: 'explain-error' },
  { text: 'if i run this batch how many things get created', label: 'impact' },
  { text: 'whats the procedure for taking an agent offline', label: 'howto' },
  { text: 'show me how to roll back a deleted task', label: 'howto' },
  { text: 'what sort of things are you able to help with', label: 'capability' },
  { text: 'is there a database behind this tool', label: 'general' },
  { text: 'tell me how alert deduplication behaves', label: 'general' },
];

export function evaluateIntent(): { train: EvalResult; heldOut: EvalResult } {
  const predict = (t: string) => classifyIntent(t).intent;
  return {
    train: evaluate(CORPUS, predict),
    heldOut: evaluate(HELD_OUT, predict),
  };
}

export function intentModelStats() {
  const m = ensure();
  return {
    algorithm: 'Multinomial Naive Bayes',
    features: 'word 1-2 grams + char 3-5 grams + shape',
    trainingExamples: CORPUS.length,
    classes: m.labelCount,
    vocabulary: m.vocabSize,
    guardrailRules: RULES.length,
  };
}
