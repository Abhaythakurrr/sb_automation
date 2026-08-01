/**
 * AI Operations Copilot (Beta) routes.
 *
 * Everything except /health requires a session, because the Copilot's answers
 * are scoped to the caller's own session context. The Copilot never receives
 * the UAC token and never calls UAC — it reasons over the trusted knowledge
 * base plus what the frontend has shared about the current session.
 */
import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { AuthRequest, sessionMiddleware } from '../middleware/session';
import { createModuleLogger } from '../config/logger';
import { ask, guidanceFor, detectIntent } from '../copilot/answer';
import {
  getMemory,
  setContext,
  setUpload,
  setPayloads,
  setExecutions,
  setFindings,
  clearWorkContext,
  knownRows,
  memoryHints,
  memoryCount,
  describeMemory,
  setWizard,
  resetWizard,
} from '../copilot/memory';
import { analyzeUpload, buildPayloadSnapshots, analyzeCreationImpact, analyzeDeletionImpact } from '../copilot/analyzers';
import { explainField, explainPayload, explainError, explainFinding, explainDestination } from '../copilot/explainer';
import { interpretSchedule, describeTriggerPayload, scheduleExamples } from '../copilot/scheduleAssistant';
import { advanceWizard, WizardAction } from '../copilot/wizard';
import { mlStatus, warmUp } from '../copilot/ml';
import { weightsStatus } from '../copilot/ml/weights';
import { KNOWLEDGE_STATS } from '../copilot/knowledge';
import { retrieverStats } from '../copilot/retriever';
import {
  record as recordFeedback,
  recordOutcome,
  summary as feedbackSummary,
  FeedbackEntry,
} from '../copilot/feedback';
import {
  learnShape, learnIntent, onlineStatus, forgetOnline, LearnResult,
} from '../copilot/ml/online';
import { TimeShape, DayShape, TIME_SHAPES, DAY_SHAPES } from '../copilot/ml/schedulePattern';
import { Intent, INTENT_LABELS } from '../copilot/ml/intent';
import {
  PageId,
  CopilotContext,
  PayloadSnapshot,
  ExecutionSnapshot,
  Finding,
  JobRowLike,
} from '../copilot/types';

const router = Router();
const log = createModuleLogger('copilot');

/** The Copilot can be switched off entirely without removing the routes. */
function copilotEnabled(): boolean {
  return (process.env.COPILOT_ENABLED ?? 'true').toLowerCase() !== 'false';
}

const PAGE_IDS = [
  'home', 'job-creation', 'upload', 'preview', 'validation', 'execution',
  'monitoring', 'recovery', 'job-deletion', 'search', 'adhoc-launch',
  'agent-control', 'scheduling', 'configuration', 'logs', 'dashboard',
] as const;

const PageSchema = z.enum(PAGE_IDS);

const ContextSchema = z.object({
  page: PageSchema,
  step: z.string().max(80).optional(),
  focus: z.string().max(200).optional(),
  detail: z.record(z.unknown()).optional(),
});

/** Rows are free-form by design (extra spreadsheet columns pass through). */
const RowSchema = z.record(z.any());

/**
 * Normalises a validated context object into CopilotContext.
 *
 * The backend compiles with `strict: false`, which stops zod inferring required
 * properties as required, so the shape is rebuilt explicitly here rather than
 * trusting the inferred type.
 */
function toContext(raw: { page?: string; step?: string; focus?: string; detail?: Record<string, unknown> } | undefined): CopilotContext | undefined {
  if (!raw?.page) return undefined;
  return {
    page: raw.page as PageId,
    step: raw.step,
    focus: raw.focus,
    detail: raw.detail,
  };
}

/** Guard against a session id being required but missing. */
function sessionKey(req: AuthRequest): string {
  // sessionMiddleware guarantees a token; sessionId is absent only on the
  // legacy Bearer-token path, where the token itself keys the memory.
  return req.sessionId || `bearer:${(req.token || '').slice(-12)}`;
}

function guardEnabled(res: Response): boolean {
  if (copilotEnabled()) return true;
  res.status(503).json({
    success: false,
    error: 'The AI Operations Copilot is disabled in this environment (COPILOT_ENABLED=false).',
  });
  return false;
}

// ── Health ───────────────────────────────────────────────────────────────────
// Public: the UI needs to know whether to render the dock before connecting.
router.get('/health', (_req: Request, res: Response): void => {
  res.json({
    success: true,
    data: {
      feature: 'AI Operations Copilot',
      status: copilotEnabled() ? 'operational' : 'disabled',
      beta: true,
      betaNote: 'A future release will add Microsoft Teams integration, so the Copilot can be reached directly from Teams with the same contextual guidance and operational assistance available here.',
      knowledge: KNOWLEDGE_STATS,
      retrieval: retrieverStats(),
      // Training happens on the first health probe, so the first real question
      // does not pay for it.
      warmUpMs: warmUp().ms,
      ml: mlStatus(),
      activeSessions: memoryCount(),
      timestamp: new Date().toISOString(),
    },
  });
});

// Everything below this line requires a session. Declared after /health so the
// health probe stays public — the UI needs it before the user connects.
router.use(sessionMiddleware);

// ── Context sharing ──────────────────────────────────────────────────────────
// The frontend calls this as the user moves around and as state changes, so the
// Copilot is upload-aware and page-aware without being asked.
router.post('/context', (req: AuthRequest, res: Response, next: NextFunction): void => {
  if (!guardEnabled(res)) return;
  try {
    const schema = z.object({
      context: ContextSchema.optional(),
      upload: z.object({
        filename: z.string().max(300),
        rows: z.array(RowSchema).max(500),
      }).nullable().optional(),
      payloads: z.array(z.object({
        name: z.string(),
        task: z.record(z.any()),
        trigger: z.record(z.any()),
        summary: z.string().optional(),
      })).max(200).optional(),
      executions: z.array(z.object({
        name: z.string(),
        type: z.enum(['task', 'trigger']),
        status: z.enum(['pending', 'success', 'failed']),
        message: z.string().optional(),
        at: z.string().optional(),
      })).max(400).optional(),
      /** Clear everything the Copilot remembers about the current work. */
      reset: z.boolean().optional(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: 'Invalid context', details: parsed.error.flatten().fieldErrors });
      return;
    }

    const key = sessionKey(req);
    const { context, upload, payloads, executions, reset } = parsed.data;
    const ctx = toContext(context);

    if (reset) clearWorkContext(key);
    if (ctx) setContext(key, ctx);

    if (upload === null) {
      clearWorkContext(key);
      if (ctx) setContext(key, ctx);
    } else if (upload) {
      setUpload(key, upload.filename, upload.rows as JobRowLike[]);
      // Validate immediately so findings are ready before the user asks.
      const analysis = analyzeUpload(upload.rows as JobRowLike[]);
      setFindings(key, analysis.findings);
    }

    if (payloads) {
      setPayloads(key, payloads.map<PayloadSnapshot>(p => ({
        name: p.name || String(p.task?.name || 'payload'),
        task: p.task || {},
        trigger: p.trigger || {},
        summary: p.summary,
      })));
    }

    if (executions) {
      setExecutions(key, executions.map<ExecutionSnapshot>(e => ({
        name: e.name || '(unnamed)',
        type: e.type || 'task',
        status: e.status || 'pending',
        message: e.message,
        at: e.at,
      })));
    }

    const mem = getMemory(key);
    res.json({
      success: true,
      data: {
        page: mem.context.page,
        knowsUpload: !!mem.upload,
        rowCount: mem.upload?.rowCount ?? 0,
        payloadCount: mem.payloads.length,
        findingCount: mem.findings.length,
        errorCount: mem.findings.filter(f => f.severity === 'error').length,
      },
    });
  } catch (e) { next(e); }
});

// ── Ask ──────────────────────────────────────────────────────────────────────
router.post('/ask', async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  if (!guardEnabled(res)) return;
  try {
    const schema = z.object({
      question: z.string().min(1).max(2000),
      context: ContextSchema.optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: 'A question is required (max 2000 characters).' });
      return;
    }

    const key = sessionKey(req);
    const ctx = toContext(parsed.data.context);
    if (ctx) setContext(key, ctx);

    const question = parsed.data.question.trim();
    const started = Date.now();
    const answer = await ask({ sessionId: key, question, page: ctx?.page });

    log.info('Copilot answered', {
      page: getMemory(key).context.page,
      intent: detectIntent(question),
      mode: answer.mode,
      outOfScope: answer.outOfScope,
      chars: answer.answer.length,
      ms: Date.now() - started,
    });

    res.json({ success: true, data: answer });
  } catch (e) { next(e); }
});

// ── Suggestions / proactive guidance ─────────────────────────────────────────
router.get('/suggestions', (req: AuthRequest, res: Response, next: NextFunction): void => {
  if (!guardEnabled(res)) return;
  try {
    const key = sessionKey(req);
    const requested = req.query.page as string | undefined;
    const page: PageId = PageSchema.safeParse(requested).success
      ? (requested as PageId)
      : getMemory(key).context.page;

    res.json({ success: true, data: guidanceFor(key, page) });
  } catch (e) { next(e); }
});

// ── Smart validation ─────────────────────────────────────────────────────────
router.post('/analyze', (req: AuthRequest, res: Response, next: NextFunction): void => {
  if (!guardEnabled(res)) return;
  try {
    const schema = z.object({ rows: z.array(RowSchema).max(500).optional() });
    const parsed = schema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ success: false, error: 'Invalid rows' });
      return;
    }

    const key = sessionKey(req);
    const rows = parsed.data.rows ?? knownRows(key);

    if (rows.length === 0) {
      res.json({
        success: true,
        data: {
          rowCount: 0,
          findings: [],
          counts: { error: 0, warning: 0, info: 0 },
          readyToExecute: false,
          schedules: [],
          blockedJobs: [],
          message: 'No rows to analyse. Upload a file first, or pass rows in the request.',
        },
      });
      return;
    }

    const analysis = analyzeUpload(rows);
    setFindings(key, analysis.findings);

    res.json({
      success: true,
      data: {
        ...analysis,
        impact: analyzeCreationImpact(rows),
      },
    });
  } catch (e) { next(e); }
});

// ── Explain anything ─────────────────────────────────────────────────────────
router.post('/explain', (req: AuthRequest, res: Response, next: NextFunction): void => {
  if (!guardEnabled(res)) return;
  try {
    const schema = z.object({
      subject: z.enum(['field', 'payload', 'error', 'finding', 'destination', 'schedule']),
      /** Job name for 'payload', field name for 'field'. */
      name: z.string().max(300).optional(),
      scope: z.enum(['input', 'task', 'trigger']).optional(),
      error: z.string().max(4000).optional(),
      payload: z.object({
        name: z.string().optional(),
        task: z.record(z.any()).optional(),
        trigger: z.record(z.any()).optional(),
      }).optional(),
      finding: z.object({
        id: z.string(),
        severity: z.enum(['error', 'warning', 'info', 'success']),
        subject: z.string(),
        message: z.string(),
        rule: z.string(),
        fix: z.string().optional(),
        row: z.number().optional(),
        field: z.string().optional(),
      }).optional(),
      destination: z.enum(['task', 'trigger', 'enable']).optional(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: 'Invalid explain request', details: parsed.error.flatten().fieldErrors });
      return;
    }

    const key = sessionKey(req);
    const mem = getMemory(key);
    const { subject, name, scope, error, payload, finding, destination } = parsed.data;

    switch (subject) {
      case 'field': {
        if (!name) { res.status(400).json({ success: false, error: 'A field name is required.' }); return; }
        const inPayload = payload?.task && Object.prototype.hasOwnProperty.call(payload.task, name)
          ? payload.task
          : payload?.trigger && Object.prototype.hasOwnProperty.call(payload.trigger, name)
            ? payload.trigger
            : undefined;
        res.json({ success: true, data: explainField(name, { scope, payload: inPayload }) });
        return;
      }

      case 'payload': {
        // Prefer a payload sent with the request. Otherwise resolve from the
        // session: the payloads the UI shared, falling back to building them
        // from the uploaded rows so a question can be answered before the
        // preview step has run.
        let snapshot: PayloadSnapshot | undefined;

        if (payload?.task || payload?.trigger) {
          snapshot = {
            name: payload.name || String(payload.task?.name || 'payload'),
            task: payload.task || {},
            trigger: payload.trigger || {},
          };
        } else {
          const available = mem.payloads.length
            ? mem.payloads
            : buildPayloadSnapshots(knownRows(key));
          snapshot = name
            ? available.find(p => p.name === name) ?? available[0]
            : available[0];
        }

        if (!snapshot) {
          res.status(404).json({ success: false, error: 'No payload available to explain. Upload a file or send a payload with the request.' });
          return;
        }
        res.json({ success: true, data: explainPayload(snapshot) });
        return;
      }

      case 'error': {
        const message = error || name || '';
        if (!message) { res.status(400).json({ success: false, error: 'An error message is required.' }); return; }
        res.json({ success: true, data: explainError(message) });
        return;
      }

      case 'finding': {
        if (!finding?.rule) { res.status(400).json({ success: false, error: 'A finding with a rule id is required.' }); return; }
        const normalised: Finding = {
          id: finding.id || 'ad-hoc',
          severity: finding.severity || 'info',
          subject: finding.subject || '(unspecified)',
          message: finding.message || '',
          rule: finding.rule,
          fix: finding.fix,
          row: finding.row,
          field: finding.field,
        };
        res.json({ success: true, data: { text: explainFinding(normalised) } });
        return;
      }

      case 'destination': {
        res.json({ success: true, data: { text: explainDestination(destination || 'task') } });
        return;
      }

      case 'schedule': {
        const trigger = payload?.trigger;
        if (!trigger) { res.status(400).json({ success: false, error: 'A trigger payload is required.' }); return; }
        res.json({ success: true, data: { text: describeTriggerPayload(trigger) } });
        return;
      }
    }
  } catch (e) { next(e); }
});

// ── Scheduling assistant ─────────────────────────────────────────────────────
router.post('/schedule', (req: AuthRequest, res: Response, next: NextFunction): void => {
  if (!guardEnabled(res)) return;
  try {
    const schema = z.object({
      input: z.string().min(1).max(500),
      timezone: z.string().max(80).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: 'Describe the schedule in plain English, up to 500 characters.',
        examples: scheduleExamples(),
      });
      return;
    }

    const key = sessionKey(req);
    const hints = memoryHints(key);
    const fallbackTz = parsed.data.timezone
      || getMemory(key).facts.timezone
      || hints.timezones[0];

    const interpretation = interpretSchedule(parsed.data.input, fallbackTz);
    res.json({
      success: true,
      data: {
        ...interpretation,
        examples: interpretation.understood ? undefined : scheduleExamples(),
      },
    });
  } catch (e) { next(e); }
});

// ── Inline Assistant (wizard) ────────────────────────────────────────────────
router.post('/wizard', (req: AuthRequest, res: Response, next: NextFunction): void => {
  if (!guardEnabled(res)) return;
  try {
    const schema = z.object({
      action: z.enum(['start', 'answer', 'skip', 'back', 'cancel', 'status']),
      answer: z.string().max(4000).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: 'action must be one of start, answer, skip, back, cancel, status.' });
      return;
    }

    const key = sessionKey(req);
    const mem = getMemory(key);
    const action = parsed.data.action as WizardAction;

    const { state, step } = advanceWizard(
      mem.wizard,
      { action, answer: parsed.data.answer },
      memoryHints(key),
    );

    if (action === 'cancel') resetWizard(key);
    else setWizard(key, state);

    res.json({ success: true, data: step });
  } catch (e) { next(e); }
});

// ── Impact analysis ──────────────────────────────────────────────────────────
router.post('/impact', (req: AuthRequest, res: Response, next: NextFunction): void => {
  if (!guardEnabled(res)) return;
  try {
    const schema = z.object({
      operation: z.enum(['create', 'delete']),
      taskName: z.string().max(200).optional(),
      rows: z.array(RowSchema).max(500).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: 'operation must be "create" or "delete".' });
      return;
    }

    const key = sessionKey(req);
    if (parsed.data.operation === 'delete') {
      const name = parsed.data.taskName || getMemory(key).context.focus;
      if (!name) { res.status(400).json({ success: false, error: 'A task name is required for deletion impact.' }); return; }
      res.json({ success: true, data: analyzeDeletionImpact(name) });
      return;
    }

    const rows = parsed.data.rows ?? knownRows(key);
    if (rows.length === 0) {
      res.status(400).json({ success: false, error: 'No rows available. Upload a file or send rows with the request.' });
      return;
    }
    res.json({ success: true, data: analyzeCreationImpact(rows) });
  } catch (e) { next(e); }
});

// ── Feedback ─────────────────────────────────────────────────────────────────
// Everything is recorded. A correction that names a checkable label is also
// LEARNED — applied to the live network by gradient descent, then rolled back if
// it costs accuracy on the cases the model already handled. See ml/online.ts for
// why the rollback is the part that makes this safe to enable at all.
//
// A bare thumbs-down cannot be learned from: it says an answer was wrong without
// saying what right looks like. Those are kept as a signal about where to look.
router.post('/feedback', (req: AuthRequest, res: Response, next: NextFunction): void => {
  if (!guardEnabled(res)) return;
  try {
    const schema = z.object({
      verdict: z.enum(['up', 'down']),
      /** What the Copilot was asked or shown. */
      text: z.string().min(1).max(2000),
      mode: z.string().max(60).optional(),
      intent: z.string().max(60).optional(),
      page: PageSchema.optional(),
      /** Free text: what the right answer would have been. */
      correction: z.string().max(2000).optional(),
      /** Structured label, when the user can name what was wrong. */
      expected: z.array(z.object({
        kind: z.enum(['timeShape', 'dayShape', 'intent']),
        value: z.string().max(40),
      })).max(4).optional(),
      predicted: z.string().max(200).optional(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: 'Feedback needs a verdict ("up" or "down") and the text it refers to.',
        details: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const key = sessionKey(req);
    const d = parsed.data;
    const entry: FeedbackEntry = recordFeedback({
      source: 'user',
      verdict: d.verdict,
      text: d.text,
      mode: d.mode,
      intent: d.intent,
      page: d.page,
      correction: d.correction,
      expected: d.expected as FeedbackEntry['expected'],
      predicted: d.predicted,
      sessionKey: key,
    });

    // ── Learn from it, where the correction is checkable ─────────────────────
    const labels = new Map<string, string>();
    for (const x of d.expected || []) labels.set(x.kind, x.value);

    const timeLabel = labels.get('timeShape');
    const dayLabel = labels.get('dayShape');
    const intentLabel = labels.get('intent');

    const learned: LearnResult[] = [];
    const rejectedLabels: string[] = [];

    if (timeLabel || dayLabel) {
      // Validate against the model's own label sets. An unknown label would
      // otherwise be turned into an index of -1 and train the net on nothing.
      if (timeLabel && !TIME_SHAPES.includes(timeLabel as TimeShape)) rejectedLabels.push(`timeShape "${timeLabel}"`);
      if (dayLabel && !DAY_SHAPES.includes(dayLabel as DayShape)) rejectedLabels.push(`dayShape "${dayLabel}"`);
      if (rejectedLabels.length === 0) {
        learned.push(learnShape(
          d.text,
          timeLabel as TimeShape | undefined,
          dayLabel as DayShape | undefined,
          key,
        ));
      }
    }

    if (intentLabel) {
      if (!INTENT_LABELS.includes(intentLabel as Intent)) rejectedLabels.push(`intent "${intentLabel}"`);
      else learned.push(learnIntent(d.text, intentLabel as Intent, key));
    }

    const applied = learned.filter(l => l.applied);

    // Close the loop on the ledger entry: a record of corrections with no record
    // of which ones took is barely better than no record.
    if (rejectedLabels.length) {
      recordOutcome(entry.id, 'refused', `unrecognised label: ${rejectedLabels.join(', ')}`);
    } else if (learned.length === 0) {
      recordOutcome(entry.id, 'not-applicable', 'no checkable label supplied');
    } else {
      recordOutcome(
        entry.id,
        applied.length > 0 ? 'learned' : 'refused',
        learned.map(l => l.reason).join(' '),
      );
    }

    log.info('Copilot feedback recorded', {
      verdict: entry.verdict,
      intent: entry.intent,
      page: entry.page,
      hasCorrection: !!entry.correction,
      hasLabel: !!entry.expected?.length,
      learnedNow: applied.length,
      rejectedLabels: rejectedLabels.length,
    });

    // The acknowledgement says what actually happened, including when nothing
    // did. Claiming to have learned something and then behaving identically is
    // worse than admitting the update was refused.
    let acknowledgement: string;
    if (rejectedLabels.length) {
      acknowledgement = `I do not recognise ${rejectedLabels.join(' or ')}, so I have recorded the feedback without changing anything.`;
    } else if (learned.length === 0) {
      acknowledgement = d.verdict === 'up'
        ? 'Noted, thanks.'
        : 'Recorded. Tell me what the right answer was and I can actually learn from it.';
    } else {
      acknowledgement = learned.map(l => l.reason).join(' ');
    }

    res.json({
      success: true,
      data: {
        recorded: true,
        id: entry.id,
        acknowledgement,
        learned: applied.length > 0,
        changes: learned.map(l => ({
          applied: l.applied,
          before: l.before,
          after: l.after,
          reason: l.reason,
          guard: l.guard,
        })),
        note: 'Corrections are applied to the live model and kept across restarts. Any update that would reduce accuracy on cases already handled correctly is rolled back.',
      },
    });
  } catch (e) { next(e); }
});

// ── Score ────────────────────────────────────────────────────────────────────
// What the models were measured at, and what has changed since through use.
router.get('/score', (_req: AuthRequest, res: Response, next: NextFunction): void => {
  if (!guardEnabled(res)) return;
  try {
    const w = weightsStatus();
    res.json({
      success: true,
      data: {
        // Frozen at build time from the artifact, so these are the numbers the
        // shipped weights were signed off against rather than something
        // recomputed per request.
        measured: !!w.metrics,
        weights: w,
        metrics: w.metrics,
        runtimeLearning: onlineStatus(),
        feedback: feedbackSummary(),
        note: w.metrics
          ? 'Accuracy figures describe the shipped weights. Runtime corrections are reported separately and are not folded into them.'
          : 'No frozen metrics in this build — the models trained from their corpora at boot.',
      },
    });
  } catch (e) { next(e); }
});

// ── Session memory introspection ─────────────────────────────────────────────
// Lets a user see exactly what the Copilot knows about them. Deliberately
// exposed: an assistant that remembers things should be able to show its work.
router.get('/memory', (req: AuthRequest, res: Response, next: NextFunction): void => {
  if (!guardEnabled(res)) return;
  try {
    const key = sessionKey(req);
    const mem = getMemory(key);
    res.json({
      success: true,
      data: {
        digest: describeMemory(key),
        context: mem.context,
        upload: mem.upload
          ? { filename: mem.upload.filename, rowCount: mem.upload.rowCount, columns: mem.upload.columns, uploadedAt: mem.upload.uploadedAt }
          : null,
        payloadNames: mem.payloads.map(p => p.name),
        findingCount: mem.findings.length,
        executionCount: mem.executions.length,
        turnCount: mem.turns.length,
        facts: mem.facts,
        hints: memoryHints(key),
        wizardActive: mem.wizard.active,
      },
    });
  } catch (e) { next(e); }
});

router.delete('/memory', (req: AuthRequest, res: Response, next: NextFunction): void => {
  if (!guardEnabled(res)) return;
  try {
    clearWorkContext(sessionKey(req));
    res.json({ success: true, data: { cleared: true } });
  } catch (e) { next(e); }
});

// ── Reset runtime learning ───────────────────────────────────────────────────
// Discards every correction and returns to the shipped weights.
//
// Deliberately available. Runtime learning is guarded, but a guard bounds the
// damage rather than eliminating it — corrections can still accumulate into a
// model nobody intended. Being able to say "go back to the version that was
// tested" is what makes enabling the feature defensible.
router.delete('/learning', (_req: AuthRequest, res: Response, next: NextFunction): void => {
  if (!guardEnabled(res)) return;
  try {
    const { cleared } = forgetOnline();
    log.warn('Runtime learning reset', { cleared });
    res.json({
      success: true,
      data: {
        cleared,
        note: 'Back to the shipped weights. This takes effect for new predictions immediately; corrections already applied in this process are dropped at the next restart.',
      },
    });
  } catch (e) { next(e); }
});

export { router as copilotRouter };
