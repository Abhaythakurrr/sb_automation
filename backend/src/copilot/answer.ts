/**
 * Copilot orchestrator.
 *
 * Routes a question to the right specialist, gathers grounding material, then
 * either hands it to a language model for phrasing or composes the answer
 * deterministically. Both paths read the same material, so turning a model on
 * or off changes the prose, never the facts.
 */
import {
  CopilotAnswer,
  Citation,
  Finding,
  PageId,
  QuickAction,
} from './types';
import { retrieve, buildContextBlock, isOutOfScope, ScoredChunk } from './retriever';
import {
  getMemory,
  describeMemory,
  recentTurns,
  addTurn,
  memoryHints,
  knownRows,
  setFindings,
  rememberFact,
} from './memory';
import { classifyIntent, Intent as MlIntent } from './ml/intent';
import { routeIntent } from './ml/route';
import { sentences, compose, Sentence } from './ml/summarize';
import { analyzeUpload, buildPayloadSnapshots, analyzeCreationImpact, analyzeDeletionImpact } from './analyzers';
import { explainField, explainPayload, explainError, explainFinding } from './explainer';
import { interpretSchedule, scheduleExamples, describeTriggerPayload } from './scheduleAssistant';
import { KNOWLEDGE_STATS } from './knowledge';

// ── Intent detection ─────────────────────────────────────────────────────────

export type Intent = MlIntent;

/**
 * Confidence a predicted specialism must reach before it is dispatched to.
 *
 * Higher than the classifier's own floor because a specialist commits to a
 * shape of answer — "here is your payload", "here is your schedule" — and being
 * wrong about that is worse than answering generically from retrieved knowledge.
 */
const SPECIALIST_FLOOR = 0.45;

/**
 * Routes a question to a specialism using the trained classifier.
 *
 * This was a regex chain. It became a model because paraphrases nobody wrote a
 * pattern for were falling through to the generic path — "look over my sheet
 * and tell me if anything is broken" is obviously an upload check to a human
 * and matched nothing. The classifier keeps a small set of high-precision
 * regexes as guardrails for phrasings where being wrong is costly; see
 * ml/intent.ts.
 */
export function detectIntent(question: string): Intent {
  return classifyIntent(question).intent;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function citationsFrom(hits: ScoredChunk[], limit = 4): Citation[] {
  return hits.slice(0, limit).map(h => ({
    id: h.chunk.id,
    title: h.chunk.title,
    source: h.chunk.source,
  }));
}

/** Extracts a likely field name from a question about a field. */
function extractFieldName(question: string): string | undefined {
  const backtick = question.match(/`([^`]+)`/);
  if (backtick) return backtick[1];
  const quoted = question.match(/["']([^"']+)["']/);
  if (quoted) return quoted[1];
  // camelCase or snake_case identifier.
  const ident = question.match(/\b([a-z][a-z0-9]*(?:_[a-z0-9]+)+|[a-z]+[A-Z][A-Za-z0-9]*)\b/);
  return ident ? ident[1] : undefined;
}

/** Extracts a job name mentioned in the question, if it matches something known. */
function extractKnownName(question: string, names: string[]): string | undefined {
  const upper = question.toUpperCase();
  return names.find(n => n && upper.includes(n.toUpperCase()));
}

// ── Specialist answers (deterministic, no model needed) ──────────────────────

interface Composed {
  answer: string;
  findings: Finding[];
  actions: QuickAction[];
  /** When true, the model is not consulted — the answer is already exact. */
  final: boolean;
}

function answerCapability(): Composed {
  return {
    final: true,
    findings: [],
    actions: [
      { action: 'start-wizard', label: 'Build a job step by step' },
      { action: 'analyze-upload', label: 'Check my uploaded file' },
      { action: 'ask', label: 'How do I create jobs from a spreadsheet?', arg: 'How do I create jobs from a spreadsheet?' },
      { action: 'ask', label: 'What scheduling options are supported?', arg: 'What scheduling options are supported?' },
    ],
    answer: `I'm the AI Operations Copilot for this Stonebranch portal. I know this application — not Stonebranch in general — and I answer from its own knowledge base plus whatever you're working on right now.

**What I can do**
- Walk you through any workflow: job creation, upload, preview, execution, verification, deletion, recovery, search, ad-hoc launch, agent control, monitoring.
- Read your uploaded file: I'll flag missing fields, invalid values, duplicate job names and schedule conflicts before you execute anything.
- Translate plain English into a real schedule. Say "every weekday at 8 PM" and I'll produce the trigger configuration and read it back to you. There are no cron expressions in UAC time triggers.
- Explain any generated payload field by field — what each field means, why it got that value, which endpoint receives it, and what will happen when you execute.
- Explain an error message in terms of what this application actually does.
- Run the Inline Assistant: I'll collect one field at a time and summarise everything before you confirm.

**What I won't do**
Act on your behalf, or guess at behaviour that isn't implemented here. If something is outside this application's knowledge base I'll say so rather than invent an answer.

I hold ${KNOWLEDGE_STATS.chunks} pieces of application knowledge covering ${KNOWLEDGE_STATS.endpoints} endpoints. I never see your UAC token.`,
  };
}

function answerSchedule(question: string, sessionId: string): Composed {
  const mem = getMemory(sessionId);
  const hints = memoryHints(sessionId);
  const fallbackTz = mem.facts.timezone || hints.timezones[0];

  const parsed = interpretSchedule(question, fallbackTz);

  if (parsed.timezone) rememberFact(sessionId, 'timezone', parsed.timezone);

  if (!parsed.understood) {
    return {
      final: true,
      findings: [],
      actions: scheduleExamples().slice(0, 4).map(s => ({
        action: 'suggest-schedule' as const, label: s, arg: s,
      })),
      answer: `I couldn't turn that into a schedule I'd trust, so I'd rather ask than guess.

Try phrasing it like one of these:
${scheduleExamples().slice(0, 6).map(s => `- "${s}"`).join('\n')}

You never need a cron expression — UAC time triggers don't use them.`,
    };
  }

  const lines = [
    `**${parsed.summary}**`,
    '',
    'How I read it:',
    ...parsed.reasoning.map(r => `- ${r}`),
    '',
    'What goes in the spreadsheet:',
    `- \`frequency_type\` = \`${parsed.frequency}\``,
    parsed.scheduleString ? `- \`start_time\` / \`schedule_string\` = \`${parsed.scheduleString}\`` : '',
    parsed.endTime ? `- \`end_time\` = \`${parsed.endTime}\`` : '',
    parsed.timezone ? `- \`timezone\` = \`${parsed.timezone}\`` : '',
    '',
    'Trigger fields this produces:',
    ...Object.entries(parsed.fields)
      .filter(([, v]) => v !== undefined && v !== '')
      .map(([k, v]) => `- \`${k}\` = \`${typeof v === 'object' ? JSON.stringify(v) : v}\``),
  ].filter(Boolean);

  if (parsed.caveat) {
    lines.push('', `**One limitation:** ${parsed.caveat}`);
  }

  if (parsed.questions.length) {
    lines.push('', ...parsed.questions.map(q => `_${q}_`));
  }

  lines.push('', 'Once created, check the qualifying times before enabling the trigger — that\'s UAC\'s own forecast and the only authoritative confirmation.');

  const confidenceNote = parsed.confidence < 0.75
    ? '\n\nI\'m only moderately confident in that reading, so please check the summary above matches what you meant.'
    : '';

  return {
    final: true,
    findings: [],
    actions: [
      { action: 'start-wizard', label: 'Build a job with this schedule' },
      { action: 'ask', label: 'How do I confirm the schedule is right?', arg: 'How do I confirm a schedule is correct after creating a job?' },
    ],
    answer: lines.join('\n') + confidenceNote,
  };
}

function answerAnalyzeUpload(sessionId: string): Composed {
  const mem = getMemory(sessionId);
  const rows = knownRows(sessionId);

  if (!mem.upload || rows.length === 0) {
    return {
      final: true,
      findings: [],
      actions: [{ action: 'open-page', label: 'Go to Job Creation', arg: 'job-creation' }],
      answer: `No file is loaded in this session, so there's nothing for me to check yet.

Upload a spreadsheet on the Job Creation page and I'll pick it up automatically — I'll then flag missing required fields, invalid values, duplicate job names and schedule conflicts before you execute anything.`,
    };
  }

  const analysis = analyzeUpload(rows);
  setFindings(sessionId, analysis.findings);

  const group = (sev: Finding['severity']) => analysis.findings.filter(f => f.severity === sev);
  const errors = group('error');
  const warnings = group('warning');
  const infos = group('info');

  const headline = analysis.readyToExecute
    ? `**${mem.upload.filename}** — ${analysis.rowCount} job(s), nothing blocking execution.`
    : `**${mem.upload.filename}** — ${analysis.rowCount} job(s), and ${errors.length} problem(s) would fail on execution.`;

  const render = (list: Finding[], heading: string) => list.length
    ? [`**${heading}**`, ...list.slice(0, 12).map(f =>
      `- ${f.subject}${f.row ? ` (row ${f.row})` : ''}: ${f.message}${f.fix ? ` → ${f.fix}` : ''}`),
    list.length > 12 ? `- …and ${list.length - 12} more` : ''].filter(Boolean).join('\n')
    : '';

  const schedules = analysis.schedules.length
    ? ['**Schedules as I read them**', ...analysis.schedules.slice(0, 10).map(s => `- ${s.name}: ${s.summary}`)].join('\n')
    : '';

  const answer = [
    headline,
    render(errors, `Must fix (${errors.length})`),
    render(warnings, `Worth fixing (${warnings.length})`),
    render(infos, `For information (${infos.length})`),
    schedules,
    analysis.readyToExecute
      ? 'Preview the payloads next, then execute. Triggers are created disabled, so nothing runs until you verify and enable them.'
      : `Fix the blocking items first. The affected jobs are: ${analysis.blockedJobs.slice(0, 8).join(', ')}.`,
  ].filter(Boolean).join('\n\n');

  return {
    final: true,
    findings: analysis.findings,
    actions: [
      { action: 'explain-payload', label: 'Explain the generated payloads' },
      { action: 'ask', label: 'What happens if I execute this?', arg: 'What will happen if I execute these jobs?' },
    ],
    answer,
  };
}

function answerExplainPayload(question: string, sessionId: string): Composed {
  const mem = getMemory(sessionId);
  let payloads = mem.payloads;

  // Nothing shared by the UI yet — build them from the upload so the question
  // can still be answered without a round trip through preview.
  if (payloads.length === 0 && knownRows(sessionId).length > 0) {
    payloads = buildPayloadSnapshots(knownRows(sessionId));
  }

  if (payloads.length === 0) {
    return {
      final: true,
      findings: [],
      actions: [{ action: 'start-wizard', label: 'Build a job step by step' }],
      answer: `There's no generated payload in this session yet.

Payloads appear once you've uploaded a file or built a job — then I can break one down field by field: what each field means, why it holds that value, which endpoint receives it, and exactly what executing it will do.`,
    };
  }

  const named = extractKnownName(question, payloads.map(p => p.name));
  const target = payloads.find(p => p.name === named)
    || (mem.context.focus ? payloads.find(p => p.name === mem.context.focus) : undefined)
    || payloads[0];

  const explanation = explainPayload(target);
  const others = payloads.filter(p => p.name !== target.name);

  const answer = [
    explanation.text,
    others.length
      ? `_Also loaded: ${others.slice(0, 8).map(p => p.name).join(', ')}${others.length > 8 ? `, +${others.length - 8} more` : ''}. Ask me about any of them by name._`
      : '',
  ].filter(Boolean).join('\n\n');

  return {
    final: true,
    findings: [],
    actions: [
      { action: 'ask', label: 'Which API receives this?', arg: `Which API will receive the payload for ${target.name}?` },
      { action: 'analyze-upload', label: 'Validate before executing' },
    ],
    answer,
  };
}

function answerExplainError(question: string, sessionId: string): Composed {
  const mem = getMemory(sessionId);

  // Prefer an actual failure recorded in the session over the question text.
  const failed = mem.executions.filter(e => e.status === 'failed');
  const quoted = question.match(/["'`]([^"'`]{8,})["'`]/);
  const subject = quoted?.[1]
    || (failed.length ? `${failed[0].message || ''}` : '')
    || question;

  const explanation = explainError(subject);

  const context = failed.length
    ? `\n\n**Failures recorded in this session**\n${failed.slice(0, 6).map(e => `- ${e.type} \`${e.name}\`: ${e.message || 'no message'}`).join('\n')}`
    : '';

  // Related findings from the last validation run often explain the failure.
  const related = mem.findings.filter(f => f.severity === 'error').slice(0, 4);
  const findingText = related.length
    ? `\n\n**Validation findings that may be the cause**\n${related.map(f => `- ${f.subject}: ${f.message} (rule \`${f.rule}\`)`).join('\n')}`
    : '';

  return {
    final: true,
    findings: related,
    actions: [
      { action: 'analyze-upload', label: 'Re-check the file' },
      { action: 'ask', label: 'How do I recover from this?', arg: 'What should I do after a job creation failure?' },
    ],
    answer: explanation.text + context + findingText,
  };
}

function answerExplainField(question: string, sessionId: string): Composed {
  const name = extractFieldName(question);
  if (!name) return { final: false, findings: [], actions: [], answer: '' };

  const mem = getMemory(sessionId);
  const payload = mem.payloads[0];

  // Try the field in whichever payload actually carries it, so the real value
  // can be quoted.
  const inTask = payload && Object.prototype.hasOwnProperty.call(payload.task, name);
  const inTrigger = payload && Object.prototype.hasOwnProperty.call(payload.trigger, name);

  const explanation = explainField(name, {
    payload: inTask ? payload.task : inTrigger ? payload.trigger : undefined,
    scope: inTask ? 'task' : inTrigger ? 'trigger' : undefined,
  });

  if (!explanation.found) {
    // Let the general path try — the user may have meant a concept, not a field.
    return { final: false, findings: [], actions: [], answer: '' };
  }

  return {
    final: true,
    findings: [],
    actions: [
      { action: 'explain-payload', label: 'Explain the whole payload' },
    ],
    answer: explanation.text,
  };
}

function answerImpact(question: string, sessionId: string): Composed {
  const mem = getMemory(sessionId);
  const rows = knownRows(sessionId);
  const lower = question.toLowerCase();

  if (/\bdelet/.test(lower)) {
    const name = mem.context.focus
      || extractKnownName(question, rows.map(r => String(r.task_name || '')))
      || 'the selected job';
    const impact = analyzeDeletionImpact(name);
    return {
      final: true,
      findings: [],
      actions: [{ action: 'ask', label: 'What is the safe deletion sequence?', arg: 'What is the safe sequence for deleting a job?' }],
      answer: [`**Deleting ${impact.subject}**`, ...impact.lines.map(l => `- ${l}`)].join('\n'),
    };
  }

  if (rows.length === 0) {
    return { final: false, findings: [], actions: [], answer: '' };
  }

  const impact = analyzeCreationImpact(rows);
  const analysis = analyzeUpload(rows);
  const blocking = analysis.counts.error > 0
    ? `\n\n${analysis.counts.error} validation error(s) would fail on execution, affecting: ${analysis.blockedJobs.slice(0, 6).join(', ')}. Fix those first.`
    : '\n\nNothing in the current file blocks execution.';

  return {
    final: true,
    findings: analysis.findings,
    actions: [
      { action: 'analyze-upload', label: 'Show the full validation report' },
      { action: 'explain-payload', label: 'Explain a payload' },
    ],
    answer: [`**Executing ${impact.subject}**`, ...impact.lines.map(l => `- ${l}`)].join('\n') + blocking,
  };
}

// ── Deterministic composer for general / how-to questions ────────────────────

/**
 * Builds an answer from retrieved chunks without a model. Used when no provider
 * is configured, and as the fallback whenever a model call fails.
 */
/**
 * Assembles an answer by selecting the most relevant, least redundant sentences
 * from the retrieved chunks.
 *
 * This is what stands in for a language model. Because every sentence is lifted
 * verbatim from the knowledge base, the answer cannot contain a claim the
 * repository does not make — which is a stronger guarantee than prompting a
 * model to stay grounded and hoping it complies.
 */
function composeExtractive(question: string, hits: ScoredChunk[], sessionId: string): string | null {
  const pool: Sentence[] = [];
  for (const h of hits.slice(0, 5)) {
    pool.push(...sentences(h.chunk.body, h.chunk.id, h.chunk.title));
  }
  if (pool.length === 0) return null;

  const { picked, sources } = compose(question, pool, { limit: 6, lambda: 0.72 });
  // Too thin a selection means the sentences did not really address the
  // question; the whole-chunk fallback reads better than three fragments.
  if (picked.length < 2) return composeGrounded(question, hits, sessionId);

  const parts: string[] = [];
  const lead = hits[0];
  parts.push(`**${lead.chunk.title}**`);

  // Group by source so the answer does not jump between topics mid-paragraph.
  const bySource = new Map<string, Sentence[]>();
  for (const s of picked) {
    if (!bySource.has(s.sourceId)) bySource.set(s.sourceId, []);
    bySource.get(s.sourceId)!.push(s);
  }

  for (const [id, group] of bySource) {
    if (id !== lead.chunk.id) {
      const title = group[0].sourceTitle;
      parts.push(`**${title}**`);
    }
    parts.push(group.map(s => (s.text.endsWith('.') || s.text.endsWith(':') ? s.text : s.text + '.')).join(' '));
  }

  const situational = situationalNote(sessionId);
  if (situational) parts.push(situational);

  if (sources.length > 1) {
    parts.push(`_Drawn from ${sources.length} knowledge entries. Ask about any of them directly for the full detail._`);
  }

  return parts.join('\n\n');
}

/** Ties a general answer back to what the user is actually working on. */
function situationalNote(sessionId: string): string {
  const mem = getMemory(sessionId);
  const bits: string[] = [];
  if (mem.upload) {
    bits.push(`You have **${mem.upload.filename}** loaded with ${mem.upload.rowCount} job(s), so I can apply this to your actual rows — just ask.`);
  }
  const errors = mem.findings.filter(f => f.severity === 'error').length;
  if (errors) bits.push(`Note that ${errors} validation error(s) are outstanding on the current file.`);
  return bits.join(' ');
}

function composeGrounded(question: string, hits: ScoredChunk[], sessionId: string): string {
  if (hits.length === 0) {
    return outOfScopeText(question);
  }

  const mem = getMemory(sessionId);
  const top = hits[0];
  const supporting = hits.slice(1, 3);

  const parts: string[] = [];

  parts.push(`**${top.chunk.title}**`);
  parts.push(top.chunk.body.trim());

  if (supporting.length) {
    parts.push('**Related**');
    parts.push(supporting.map(h => `- **${h.chunk.title}** — ${firstSentences(h.chunk.body, 2)}`).join('\n'));
  }

  // Tie the answer back to what the user is actually doing.
  const situational: string[] = [];
  if (mem.upload) {
    situational.push(`You have **${mem.upload.filename}** loaded with ${mem.upload.rowCount} job(s), so I can apply this to your actual rows — just ask.`);
  }
  if (mem.findings.some(f => f.severity === 'error')) {
    const n = mem.findings.filter(f => f.severity === 'error').length;
    situational.push(`Note that ${n} validation error(s) are outstanding on the current file.`);
  }
  if (situational.length) parts.push(situational.join(' '));

  return parts.join('\n\n');
}

function firstSentences(text: string, count: number): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  const parts = flat.split(/(?<=[.!?])\s+/).slice(0, count);
  return parts.join(' ');
}

function outOfScopeText(question: string): string {
  return `That isn't something this application's knowledge base covers, so I won't guess at it — a wrong answer about a production scheduler is worse than no answer.

I can help with anything in this portal: job creation from a spreadsheet, uploads and validation, payload previews, execution and verification, scheduling, monitoring and alerts, job deletion and recovery, search and edit, ad-hoc launch, and agent control.

If you meant something in here and I've misread it, rephrase with the feature or field name and I'll find it.`;
}

// ── Public entry point ───────────────────────────────────────────────────────

/**
 * A step the Copilot took, reported as it happens.
 *
 * The pipeline is several distinct stages and each one can be slow enough to
 * notice — retrieval scans the whole knowledge base, the first classification in
 * a process pays for model load. Reporting them turns dead waiting time into
 * something a user can read, and it makes the routing decision visible rather
 * than hidden: if the Copilot sends a question to the wrong specialist, the trace
 * is where that becomes obvious.
 */
export interface AskStage {
  /** Machine-readable step id. */
  step: 'retrieve' | 'classify' | 'scope' | 'specialist' | 'compose' | 'done';
  /** One line, written for the person waiting. */
  label: string;
  /** Facts worth surfacing: hit counts, intent, confidence. */
  detail?: string;
  ms: number;
}

export interface AskOptions {
  sessionId: string;
  question: string;
  page?: PageId;
  /** Called as each stage completes. Optional — the plain path ignores it. */
  onStage?: (s: AskStage) => void;
}

export async function ask({ sessionId, question, page, onStage }: AskOptions): Promise<CopilotAnswer> {
  const mem = getMemory(sessionId);
  const activePage = page || mem.context.page;
  const t0 = Date.now();

  /** Reports a stage and records it on the answer, so the trace survives. */
  const trace: AskStage[] = [];
  const stage = (step: AskStage['step'], label: string, detail?: string) => {
    const s: AskStage = { step, label, detail, ms: Date.now() - t0 };
    trace.push(s);
    try { onStage?.(s); } catch { /* a listener must never break the answer */ }
  };

  addTurn(sessionId, { role: 'user', content: question });

  const hits = retrieve(question, { page: activePage, limit: 6 });
  stage('retrieve', 'Searched the knowledge base',
    `${hits.length} relevant ${hits.length === 1 ? 'section' : 'sections'}`);
  // routeIntent, not classifyIntent: this is the live routing decision, so it
  // honours corrections made at runtime. classifyIntent stays the base model, so
  // the accuracy the Copilot reports about itself is not inflated by them.
  const prediction = routeIntent(question);
  stage('classify', 'Worked out what you are asking for',
    `${prediction.intent} · ${Math.round(prediction.confidence * 100)}% confident`
    + (prediction.source === 'exemplar' ? ' · from a correction someone made' : '')
    + (prediction.source === 'rule' ? ' · matched a guardrail' : ''));

  // ── Scope gate, before any specialist runs ────────────────────────────────
  // This ordering matters. A classifier can misroute an off-topic question to a
  // specialist, and a specialist answers confidently from session data — so
  // "who won the world cup in 1998" came back as a statement about payloads.
  // Checking scope first means an off-topic question can never reach a
  // specialist, whatever the classifier thought.
  const capabilityAsk = prediction.intent === 'capability';
  if (isOutOfScope(hits) && !capabilityAsk) {
    stage('scope', 'Checked this against what I know', 'outside the knowledge base — saying so rather than guessing');
    const text = outOfScopeText(question);
    addTurn(sessionId, { role: 'assistant', content: text });
    stage('done', 'Done');
    return {
      answer: text, citations: [], findings: [], actions: [],
      mode: 'grounded', outOfScope: true, trace,
    };
  }
  stage('scope', 'Checked this against what I know', 'in scope');

  // A weakly-predicted specialism is not worth acting on: the generic
  // retrieval-grounded answer is more useful than a confident wrong specialist.
  // An exemplar match is exempt from the floor — someone stated outright that this
  // phrasing routes here, which is stronger evidence than the model's own score.
  const intent: Intent = (prediction.source === 'rule'
    || prediction.source === 'exemplar'
    || prediction.confidence >= SPECIALIST_FLOOR)
    ? prediction.intent
    : 'general';

  // Specialists — these produce exact answers from real data.
  let composed: Composed = { final: false, findings: [], actions: [], answer: '' };
  switch (intent) {
    case 'capability':      composed = answerCapability(); break;
    case 'schedule':        composed = answerSchedule(question, sessionId); break;
    case 'analyze-upload':  composed = answerAnalyzeUpload(sessionId); break;
    case 'explain-payload': composed = answerExplainPayload(question, sessionId); break;
    case 'explain-error':   composed = answerExplainError(question, sessionId); break;
    case 'explain-field':   composed = answerExplainField(question, sessionId); break;
    case 'impact':          composed = answerImpact(question, sessionId); break;
    default: break;
  }

  if (intent !== 'general' && intent !== 'howto') {
    stage('specialist', `Handed it to the ${SPECIALIST_LABEL[intent] || intent} specialist`,
      composed.final
        ? `answered from ${composed.findings.length > 0 ? 'your session data' : 'exact field data'}`
        : 'no exact answer available — falling back to the knowledge base');
  }

  const outOfScope = false;   // already handled by the gate above

  if (composed.final) {
    stage('done', 'Done');
    addTurn(sessionId, { role: 'assistant', content: composed.answer });
    return {
      answer: composed.answer,
      citations: citationsFrom(hits, 3),
      findings: composed.findings,
      actions: composed.actions,
      mode: 'grounded',
      outOfScope: false,
      trace,
    };
  }

  // General / how-to: assemble the answer from the retrieved knowledge itself.
  let answerText: string | null = null;
  const mode: CopilotAnswer['mode'] = 'grounded';

  if (!outOfScope) {
    answerText = composeExtractive(question, hits, sessionId);
  }

  if (!answerText) {
    answerText = outOfScope
      ? outOfScopeText(question)
      : composeGrounded(question, hits, sessionId);
  }

  stage('compose', 'Wrote the answer from what I found',
    'sentences taken verbatim from the knowledge base, never generated');

  const actions = suggestFollowUps(activePage, sessionId);
  addTurn(sessionId, { role: 'assistant', content: answerText });
  stage('done', 'Done');

  return {
    answer: answerText,
    citations: outOfScope ? [] : citationsFrom(hits),
    findings: [],
    actions,
    mode,
    outOfScope,
    trace,
  };
}

/** Human names for the specialists, for the activity trace. */
const SPECIALIST_LABEL: Record<string, string> = {
  schedule: 'scheduling',
  'analyze-upload': 'file validation',
  'explain-payload': 'payload',
  'explain-error': 'error',
  'explain-field': 'field reference',
  impact: 'impact analysis',
  capability: 'capability',
};

// ── Context-aware proactive guidance ─────────────────────────────────────────

export interface PageGuidance {
  page: PageId;
  /** One-line statement of what this page is for. */
  headline: string;
  /** Proactive recommendations for what the user is doing right now. */
  tips: string[];
  /** Questions worth asking here. */
  prompts: string[];
  actions: QuickAction[];
  findings: Finding[];
}

const PAGE_BASE: Record<string, { headline: string; tips: string[]; prompts: string[] }> = {
  home: {
    headline: 'Pick an automation, or ask me what any of them does.',
    tips: [
      'Connect to a UAC environment first — every automation needs a live session.',
      'Automations open as tabs and stay mounted, so switching away never loses your work.',
    ],
    prompts: ['What can you do?', 'Which automation should I use to change an existing job?', 'How do sessions and timeouts work?'],
  },
  'job-creation': {
    headline: 'Upload a spreadsheet, preview the payloads, execute, verify, then enable.',
    tips: [
      'Every trigger is created disabled. Verify the qualifying times before enabling anything.',
      'A run is capped at 100 jobs, with 2 concurrent UAC calls.',
      'Set max_runtime on every job — it is what switches on the Late Finish monitor.',
    ],
    prompts: ['Check my uploaded file', 'What columns are required?', 'How does ref_job inheritance work?'],
  },
  upload: {
    headline: 'Drop in an .xlsx, .xls, .ods or .csv file and I will read it with you.',
    tips: [
      'Column headers are normalised, so job-document labels like "Job Script" map onto the right column automatically.',
      'Any column that is not recognised and not a UAC field is dropped silently — check the preview if a value goes missing.',
    ],
    prompts: ['What columns are required?', 'Check my uploaded file for problems', 'Why was a column ignored?'],
  },
  preview: {
    headline: 'This is a true dry run — nothing has been sent to UAC yet.',
    tips: [
      'The payload here is byte-for-byte what execution will send.',
      'Empty and unknown fields are already stripped, so what you see is the whole request.',
    ],
    prompts: ['Explain this payload', 'Why was this value generated?', 'Which API receives this?'],
  },
  validation: {
    headline: 'Fix the errors, review the warnings, then execute.',
    tips: [
      'Errors will fail on execution. Warnings will succeed but leave the job harder to operate.',
      'Ask me about any finding and I will show the exact rule behind it.',
    ],
    prompts: ['Which validation rule failed?', 'Check my uploaded file', 'What happens if I execute anyway?'],
  },
  execution: {
    headline: 'Tasks are created first, then their triggers, streamed one job at a time.',
    tips: [
      'Verify after execution — it re-reads the objects back out of UAC.',
      'Qualifying times are UAC\'s own forecast and the only authoritative schedule check.',
      'Enable triggers last, and only for jobs whose forecast looks right.',
    ],
    prompts: ['A job failed — what went wrong?', 'How do I verify what was created?', 'When should I enable the triggers?'],
  },
  monitoring: {
    headline: 'Polls UAC for offline agents and failed jobs, and pushes Adaptive Cards to Teams.',
    tips: [
      'Monitoring belongs to the session that started it, because it needs a live token.',
      'Clearing state makes previously seen alerts eligible to fire again.',
      'If an agent is offline, job failures on it are a symptom — fix the agent first.',
    ],
    prompts: ['How do I triage a job failure?', 'Why am I not getting Teams alerts?', 'What does alert deduplication do?'],
  },
  recovery: {
    headline: 'Restore deleted jobs from a server backup or an uploaded Excel file.',
    tips: [
      'The server store is per environment and keeps entries for 7 days.',
      'Restored triggers need verifying and enabling, exactly like new ones.',
    ],
    prompts: ['How do I restore a job deleted last week?', 'What does recovery actually recreate?'],
  },
  'job-deletion': {
    headline: 'Inspect, back up, then delete — triggers before the task.',
    tips: [
      'Take the backup every time. It is the only thing Job Recovery can restore from.',
      'Active instances block deletion. Only force-finish an instance you have confirmed is stuck.',
      'Deletion is audited with the session that performed it.',
    ],
    prompts: ['What happens if I delete this job?', 'What is the safe deletion sequence?', 'Why is deletion blocked?'],
  },
  search: {
    headline: 'Exact-name lookup for a task or trigger, with inline editing.',
    tips: [
      'Lookup is by exact name. For partial-name searching use Ad-hoc Launch.',
      'UAC-managed fields are read-only and will be refused.',
      'Edits go straight to UAC and are audited — there is no staging step.',
    ],
    prompts: ['What does this field mean?', 'Which fields can I not edit?', 'How do I change a job\'s schedule?'],
  },
  'adhoc-launch': {
    headline: 'Search anything, launch it on demand, and control the running instance.',
    tips: [
      'Launching here runs the object once and does not touch its schedule — the safe way to test a new job before enabling its trigger.',
      'Cancel, force-finish, halt, rerun, hold and release are all available on a live instance.',
    ],
    prompts: ['How do I test a job without enabling it?', 'What is the difference between halt and cancel?'],
  },
  'agent-control': {
    headline: 'Suspend and resume agents and clusters, now or on a schedule.',
    tips: [
      'Schedule the resume at the same time you schedule the suspend. A forgotten resume silently queues work.',
      'Scheduled actions survive a backend restart — the token is persisted encrypted.',
      'Suspending queues work rather than failing it.',
    ],
    prompts: ['What happens to jobs on a suspended agent?', 'How do I schedule a maintenance window?'],
  },
  scheduling: {
    headline: 'Describe the schedule in plain English and I will build the trigger.',
    tips: [
      'UAC time triggers have no cron expressions. You never need to write one.',
      'Always set a timezone — without one UAC uses the controller default.',
      'Confirm with the qualifying times, not the summary text.',
    ],
    prompts: ['Run every weekday at 8 PM', 'Every 15 minutes between 6am and 10pm', 'On the last Friday of every month'],
  },
  configuration: {
    headline: 'Behaviour is driven by environment variables on the backend.',
    tips: [
      'ENCRYPTION_KEY is required and must be at least 32 characters.',
      'ALLOW_ENV_TOKEN_FALLBACK is an auth bypass outside a trusted single-tenant deployment — leave it false.',
      'CORS_ORIGINS is an explicit allow-list, deliberately not a wildcard.',
    ],
    prompts: ['Which environment variables control alerts?', 'How do I point this at a different UAC environment?'],
  },
  logs: {
    headline: 'Winston with daily rotation: application, api, error, audit and startup streams.',
    tips: [
      'The audit log records every state-changing operation and is exposed over the API.',
      'Secrets are never logged — only whether they are configured.',
    ],
    prompts: ['Where do I find who deleted a job?', 'How long are logs kept?'],
  },
  dashboard: {
    headline: 'Ask me anything about this application or what you are working on.',
    tips: ['I keep the context of your session, so you never have to repeat yourself.'],
    prompts: ['What can you do?', 'What am I working on?'],
  },
};

/** Proactive, page-specific guidance including live findings. */
export function guidanceFor(sessionId: string, page: PageId): PageGuidance {
  const mem = getMemory(sessionId);
  const base = PAGE_BASE[page] || PAGE_BASE.dashboard;

  const tips = [...base.tips];
  const actions: QuickAction[] = [];
  let findings: Finding[] = mem.findings;

  // Situational guidance — this is what makes it feel aware rather than static.
  if (page === 'job-creation' || page === 'upload' || page === 'validation' || page === 'preview') {
    if (!mem.upload) {
      tips.unshift('No file loaded yet. Upload one and I will validate it automatically, or start the Inline Assistant to build a single job by hand.');
      actions.push({ action: 'start-wizard', label: 'Build a job step by step' });
    } else {
      if (findings.length === 0) {
        const analysis = analyzeUpload(mem.upload.rows);
        setFindings(sessionId, analysis.findings);
        findings = analysis.findings;
      }
      const errors = findings.filter(f => f.severity === 'error').length;
      const warnings = findings.filter(f => f.severity === 'warning').length;
      tips.unshift(errors > 0
        ? `**${mem.upload.filename}**: ${errors} error(s) would fail on execution. Fix those before you run anything.`
        : `**${mem.upload.filename}**: ${mem.upload.rowCount} job(s) parsed, nothing blocking${warnings ? `, ${warnings} warning(s) worth a look` : ''}.`);
      actions.push({ action: 'analyze-upload', label: errors > 0 ? `Show ${errors} error(s)` : 'Show the validation report' });
      actions.push({ action: 'explain-payload', label: 'Explain a generated payload' });
    }
  }

  if (page === 'execution' && mem.executions.length) {
    const failed = mem.executions.filter(e => e.status === 'failed');
    if (failed.length) {
      tips.unshift(`${failed.length} object(s) failed to create. Ask me about any of them and I will explain the cause.`);
      actions.push({ action: 'ask', label: 'Why did these fail?', arg: 'Why did these jobs fail to create?' });
    } else {
      tips.unshift(`${mem.executions.length} object(s) created successfully. Verify them, check the qualifying times, then enable the triggers.`);
    }
  }

  if (page === 'job-deletion' && mem.context.focus) {
    actions.push({ action: 'ask', label: `What happens if I delete ${mem.context.focus}?`, arg: `What will happen if I delete ${mem.context.focus}?` });
  }

  if (page === 'scheduling' || page === 'job-creation') {
    actions.push({ action: 'suggest-schedule', label: 'Translate a schedule from plain English', arg: 'every weekday at 8 PM' });
  }

  // Never leave the panel with nothing to click.
  if (actions.length === 0) {
    actions.push(...base.prompts.slice(0, 2).map(p => ({ action: 'ask' as const, label: p, arg: p })));
  }

  return {
    page,
    headline: base.headline,
    tips,
    prompts: base.prompts,
    actions,
    findings,
  };
}

/** Follow-up quick actions after a general answer. */
function suggestFollowUps(page: PageId, sessionId: string): QuickAction[] {
  const guidance = guidanceFor(sessionId, page);
  return [
    ...guidance.actions.slice(0, 2),
    ...guidance.prompts.slice(0, 2).map(p => ({ action: 'ask' as const, label: p, arg: p })),
  ];
}

/** Re-export so routes can answer "what does this schedule mean". */
export { describeTriggerPayload, explainFinding };
