/**
 * AI Operations Copilot (Beta) — client store.
 *
 * Owns the dock's open/closed state, the conversation, the current page
 * context, and the Inline Assistant. Context sharing is deduplicated and
 * debounced here so pages can call `setContext` freely on every render without
 * generating a request storm.
 */
import { create } from 'zustand';
import { globalApi } from '@/store/useConnectionStore';
import {
  playClick, playSuccess, playError, playTick, playComplete, playWhoosh, playWarning,
} from '@/utils/soundEffects';
import {
  AskStage,
  CopilotAnswer,
  CopilotContext,
  CopilotFinding,
  CopilotHealth,
  CopilotMessage,
  CopilotPageId,
  CopilotScore,
  ExpectedLabel,
  FeedbackResult,
  PageGuidance,
  QuickAction,
  ScheduleInterpretation,
  UploadAnalysis,
  WizardStep,
} from '@/types/copilot';

let messageSeq = 0;
const nextId = () => `m${++messageSeq}-${Date.now()}`;

interface CopilotState {
  // ── Availability ──
  enabled: boolean;
  health: CopilotHealth | null;
  healthChecked: boolean;

  // ── Dock ──
  open: boolean;
  /** Unread proactive findings badge count. */
  badge: number;

  // ── Conversation ──
  messages: CopilotMessage[];
  thinking: boolean;
  /** Stages arriving for the reply currently in flight. Cleared when it lands. */
  liveStages: AskStage[];

  // ── Context ──
  context: CopilotContext;
  guidance: PageGuidance | null;
  guidanceLoading: boolean;

  // ── Analysis ──
  analysis: UploadAnalysis | null;

  // ── Self-assessment ──
  score: CopilotScore | null;

  // ── Inline Assistant ──
  wizardOpen: boolean;
  wizardStep: WizardStep | null;
  wizardBusy: boolean;

  // ── Job creation (the wizard's commit step) ──
  creating: boolean;
  createSteps: CreateStep[];
  createResult: { successful: number; failed: number; taskName: string } | null;
  createError: string | null;
  verifyChecks: VerifyCheck[] | null;
  verifying: boolean;

  // ── Actions ──
  checkHealth: () => Promise<void>;
  toggle: () => void;
  setOpen: (v: boolean) => void;

  setContext: (ctx: CopilotContext) => void;
  shareUpload: (filename: string, rows: any[]) => Promise<void>;
  clearUpload: () => Promise<void>;
  sharePayloads: (payloads: { name: string; task: any; trigger: any; summary?: string }[]) => Promise<void>;
  shareExecutions: (executions: { name: string; type: 'task' | 'trigger'; status: 'pending' | 'success' | 'failed'; message?: string }[]) => Promise<void>;

  loadGuidance: (page?: CopilotPageId) => Promise<void>;
  ask: (question: string) => Promise<void>;
  runAction: (action: QuickAction) => Promise<void>;
  analyze: (rows?: any[]) => Promise<UploadAnalysis | null>;
  explainError: (message: string) => Promise<void>;
  explainField: (field: string, payload?: { task?: any; trigger?: any }) => Promise<void>;
  explainPayload: (name?: string, payload?: { name?: string; task?: any; trigger?: any }) => Promise<void>;
  suggestSchedule: (input: string) => Promise<ScheduleInterpretation | null>;

  /** Records a verdict, and where a checkable label is given, teaches the model. */
  sendFeedback: (messageId: string, verdict: 'up' | 'down', opts?: {
    correction?: string;
    expected?: ExpectedLabel[];
  }) => Promise<void>;
  loadScore: () => Promise<void>;

  wizard: (action: string, answer?: string) => Promise<void>;
  closeWizard: () => void;

  /** Creates the job the wizard assembled, in the connected UAC environment. */
  createJob: () => Promise<void>;
  verifyCreatedJob: () => Promise<void>;
  resetCreate: () => void;

  reset: () => void;
}

export interface CreateStep {
  step: string;
  status: 'processing' | 'success' | 'error';
  message?: string;
}

export interface VerifyCheck {
  field: string;
  actual?: string;
  expected?: string;
  status: 'pass' | 'fail' | 'warn';
}

/** Last context payload sent, so identical updates are not re-sent. */
let lastContextKey = '';
let contextTimer: ReturnType<typeof setTimeout> | null = null;

/** Pulls the readable message out of an axios error. */
function errText(e: any): string {
  const data = e?.response?.data;
  if (typeof data?.error === 'string') return data.error;
  if (e?.response?.status === 401) return 'Your session expired. Reconnect and I will pick up where we left off.';
  return e?.message || 'Something went wrong talking to the Copilot.';
}

export const useCopilotStore = create<CopilotState>((set, get) => ({
  enabled: false,
  health: null,
  healthChecked: false,

  open: false,
  badge: 0,

  messages: [],
  thinking: false,
  liveStages: [],

  context: { page: 'home' },
  guidance: null,
  guidanceLoading: false,

  analysis: null,
  score: null,

  wizardOpen: false,
  wizardStep: null,
  wizardBusy: false,

  creating: false,
  createSteps: [],
  createResult: null,
  createError: null,
  verifyChecks: null,
  verifying: false,

  // ── Availability ───────────────────────────────────────────────────────────
  checkHealth: async () => {
    if (get().healthChecked) return;
    try {
      const res = await globalApi.copilotHealth();
      const health: CopilotHealth | undefined = res.data?.data;
      set({
        health: health ?? null,
        enabled: health?.status === 'operational',
        healthChecked: true,
      });
    } catch {
      // Backend unreachable or Copilot removed — hide the dock rather than
      // showing a feature that cannot answer.
      set({ enabled: false, healthChecked: true });
    }
  },

  toggle: () => {
    const open = !get().open;
    playWhoosh();
    set({ open, badge: open ? 0 : get().badge });
    if (open) get().loadGuidance();
  },

  setOpen: (v) => {
    if (v !== get().open) playWhoosh();
    set({ open: v, badge: v ? 0 : get().badge });
    if (v) get().loadGuidance();
  },

  // ── Context ────────────────────────────────────────────────────────────────
  setContext: (ctx) => {
    const key = JSON.stringify(ctx);
    if (key === lastContextKey) return;
    lastContextKey = key;
    set({ context: ctx });

    // Debounce: page components often update step and focus in quick succession.
    if (contextTimer) clearTimeout(contextTimer);
    contextTimer = setTimeout(() => {
      if (!globalApi.hasSession()) return;
      globalApi.copilotContext({ context: ctx })
        .then(() => { if (get().open) get().loadGuidance(ctx.page); })
        .catch(() => { /* context sharing is best-effort */ });
    }, 350);
  },

  shareUpload: async (filename, rows) => {
    if (!globalApi.hasSession()) return;
    try {
      const res = await globalApi.copilotContext({
        context: get().context,
        upload: { filename, rows },
      });
      const errors = res.data?.data?.errorCount ?? 0;
      // Badge the dock when the upload has blocking problems, so the user is
      // told without the panel stealing focus.
      set({ badge: errors > 0 && !get().open ? errors : get().badge });
      if (get().open) await get().loadGuidance();
    } catch { /* best-effort */ }
  },

  clearUpload: async () => {
    if (!globalApi.hasSession()) return;
    try {
      await globalApi.copilotContext({ context: get().context, upload: null });
      set({ analysis: null, badge: 0 });
    } catch { /* best-effort */ }
  },

  sharePayloads: async (payloads) => {
    if (!globalApi.hasSession() || payloads.length === 0) return;
    try { await globalApi.copilotContext({ payloads }); } catch { /* best-effort */ }
  },

  shareExecutions: async (executions) => {
    if (!globalApi.hasSession() || executions.length === 0) return;
    try { await globalApi.copilotContext({ executions }); } catch { /* best-effort */ }
  },

  // ── Guidance ───────────────────────────────────────────────────────────────
  loadGuidance: async (page) => {
    if (!globalApi.hasSession()) return;
    const target = page || get().context.page;
    set({ guidanceLoading: true });
    try {
      const res = await globalApi.copilotSuggestions(target);
      set({ guidance: res.data?.data ?? null, guidanceLoading: false });
    } catch {
      set({ guidanceLoading: false });
    }
  },

  // ── Conversation ───────────────────────────────────────────────────────────
  //
  // Streams by default. The pipeline has several stages that each take long enough
  // to notice, and showing them turns waiting into reading — as well as making the
  // routing decision visible, which is what you need when an answer comes back
  // wrong. Falls back to the plain request if streaming is unavailable, so a
  // proxy that mangles SSE degrades to the old behaviour rather than breaking.
  ask: async (question) => {
    const q = question.trim();
    if (!q || get().thinking) return;

    playClick();
    const userMsg: CopilotMessage = { id: nextId(), role: 'user', content: q, at: new Date().toISOString() };
    const pendingId = nextId();
    set({
      open: true,
      thinking: true,
      liveStages: [],
      messages: [
        ...get().messages,
        userMsg,
        { id: pendingId, role: 'assistant', content: '', at: new Date().toISOString(), pending: true },
      ],
    });

    const { page, step, focus } = get().context;

    const settle = (answer: CopilotAnswer) => {
      answer?.findings?.some(f => f.severity === 'error') ? playWarning() : playTick();
      set({
        thinking: false,
        liveStages: [],
        messages: get().messages.map(m => m.id === pendingId
          ? {
            ...m,
            pending: false,
            content: answer?.answer || 'I did not get an answer back.',
            citations: answer?.citations,
            findings: answer?.findings,
            actions: answer?.actions,
            mode: answer?.mode,
            outOfScope: answer?.outOfScope,
            trace: answer?.trace,
            question: q,
          }
          : m),
      });
    };

    const streamed = await globalApi.copilotAskStream(
      q, { page, step, focus },
      stage => set({ liveStages: [...get().liveStages, stage] }),
    ).catch(() => null);

    if (streamed) { settle(streamed); return; }

    // ── Fallback: plain request ──────────────────────────────────────────────
    try {
      const res = await globalApi.copilotAsk(q, { page, step, focus });
      settle(res.data?.data as CopilotAnswer);
    } catch (e) {
      set({
        thinking: false,
        liveStages: [],
        messages: get().messages.map(m => m.id === pendingId
          ? { ...m, pending: false, content: errText(e), question: q }
          : m),
      });
    }
  },

  runAction: async (action) => {
    switch (action.action) {
      case 'ask':
        await get().ask(typeof action.arg === 'string' ? action.arg : action.label);
        return;
      case 'analyze-upload':
        await get().ask('Check my uploaded file for problems');
        return;
      case 'explain-payload':
        await get().explainPayload(typeof action.arg === 'string' ? action.arg : undefined);
        return;
      case 'suggest-schedule':
        await get().ask(typeof action.arg === 'string' ? action.arg : 'Help me build a schedule');
        return;
      case 'start-wizard':
        await get().wizard('start');
        return;
      case 'open-page':
        // Navigation is owned by the workspace store; the dock handles this.
        return;
      default:
        return;
    }
  },

  // ── Analysis ───────────────────────────────────────────────────────────────
  analyze: async (rows) => {
    if (!globalApi.hasSession()) return null;
    try {
      const res = await globalApi.copilotAnalyze(rows);
      const analysis: UploadAnalysis = res.data?.data;
      set({ analysis: analysis ?? null });
      return analysis ?? null;
    } catch {
      return null;
    }
  },

  // ── One-click explanations ─────────────────────────────────────────────────
  explainError: async (message) => {
    const userMsg: CopilotMessage = {
      id: nextId(), role: 'user', at: new Date().toISOString(),
      content: `Explain this error: ${message}`,
    };
    const pendingId = nextId();
    set({
      open: true, thinking: true,
      messages: [...get().messages, userMsg, { id: pendingId, role: 'assistant', content: '', at: new Date().toISOString(), pending: true }],
    });
    try {
      const res = await globalApi.copilotExplain({ subject: 'error', error: message });
      const text = res.data?.data?.text || 'No explanation available.';
      set({
        thinking: false,
        messages: get().messages.map(m => m.id === pendingId ? { ...m, pending: false, content: text, mode: 'grounded' } : m),
      });
    } catch (e) {
      set({
        thinking: false,
        messages: get().messages.map(m => m.id === pendingId ? { ...m, pending: false, content: errText(e) } : m),
      });
    }
  },

  explainField: async (field, payload) => {
    const pendingId = nextId();
    set({
      open: true, thinking: true,
      messages: [
        ...get().messages,
        { id: nextId(), role: 'user', content: `What does \`${field}\` mean?`, at: new Date().toISOString() },
        { id: pendingId, role: 'assistant', content: '', at: new Date().toISOString(), pending: true },
      ],
    });
    try {
      const res = await globalApi.copilotExplain({ subject: 'field', name: field, payload });
      const text = res.data?.data?.text || 'No explanation available.';
      set({
        thinking: false,
        messages: get().messages.map(m => m.id === pendingId ? { ...m, pending: false, content: text, mode: 'grounded' } : m),
      });
    } catch (e) {
      set({
        thinking: false,
        messages: get().messages.map(m => m.id === pendingId ? { ...m, pending: false, content: errText(e) } : m),
      });
    }
  },

  explainPayload: async (name, payload) => {
    const pendingId = nextId();
    set({
      open: true, thinking: true,
      messages: [
        ...get().messages,
        { id: nextId(), role: 'user', content: name ? `Explain the payload for ${name}` : 'Explain this payload', at: new Date().toISOString() },
        { id: pendingId, role: 'assistant', content: '', at: new Date().toISOString(), pending: true },
      ],
    });
    try {
      const res = await globalApi.copilotExplain({ subject: 'payload', name, payload });
      const text = res.data?.data?.text || 'No payload available to explain.';
      set({
        thinking: false,
        messages: get().messages.map(m => m.id === pendingId ? { ...m, pending: false, content: text, mode: 'grounded' } : m),
      });
    } catch (e) {
      set({
        thinking: false,
        messages: get().messages.map(m => m.id === pendingId ? { ...m, pending: false, content: errText(e) } : m),
      });
    }
  },

  suggestSchedule: async (input) => {
    if (!globalApi.hasSession()) return null;
    try {
      const res = await globalApi.copilotSchedule(input);
      return (res.data?.data as ScheduleInterpretation) ?? null;
    } catch {
      return null;
    }
  },

  // ── Feedback ───────────────────────────────────────────────────────────────
  // A thumbs-up or a bare thumbs-down is recorded and nothing more. A correction
  // that names a shape is applied to the live model straight away, under a guard
  // that rolls it back if it would break schedules the Copilot already reads
  // correctly — so the acknowledgement it returns is the truth about what
  // happened, and it gets shown verbatim rather than replaced with "thanks!".
  sendFeedback: async (messageId, verdict, opts = {}) => {
    const msg = get().messages.find(m => m.id === messageId);
    if (!msg || msg.role !== 'assistant') return;

    // The question is what the model was reasoning about; fall back to the reply
    // only if it was not captured.
    const subject = msg.question || msg.content.slice(0, 500);

    // Optimistic, because the vote is the user's own action and should not appear
    // to hesitate. The acknowledgement arrives separately.
    set({
      messages: get().messages.map(m => m.id === messageId ? { ...m, vote: verdict } : m),
    });
    verdict === 'up' ? playSuccess() : playClick();

    if (!globalApi.hasSession()) return;
    try {
      const res = await globalApi.copilotFeedback({
        verdict,
        text: subject,
        mode: msg.mode,
        page: get().context.page,
        correction: opts.correction,
        expected: opts.expected,
        predicted: msg.mode,
      });
      const data: FeedbackResult = res.data?.data;
      set({
        messages: get().messages.map(m => m.id === messageId
          ? { ...m, feedbackNote: data?.acknowledgement, didLearn: !!data?.learned }
          : m),
      });
      if (data?.learned) {
        playComplete();
        // The counters on the header are now stale.
        get().loadScore().catch(() => {});
      }
    } catch (e) {
      set({
        messages: get().messages.map(m => m.id === messageId
          ? { ...m, feedbackNote: errText(e) }
          : m),
      });
    }
  },

  loadScore: async () => {
    if (!globalApi.hasSession()) return;
    try {
      const res = await globalApi.copilotScore();
      set({ score: (res.data?.data as CopilotScore) ?? null });
    } catch { /* the badge is optional; never block on it */ }
  },

  // ── Inline Assistant ───────────────────────────────────────────────────────
  wizard: async (action, answer) => {
    if (!globalApi.hasSession()) return;
    set({ wizardBusy: true, open: true, wizardOpen: action !== 'cancel' });
    if (action === 'start') { set({ createSteps: [], createResult: null, createError: null, verifyChecks: null }); }
    try {
      const res = await globalApi.copilotWizard(action, answer);
      const step: WizardStep = res.data?.data;
      // Distinct feedback for "question rejected" vs "moved on" vs "finished".
      if (step?.error) playWarning();
      else if (step?.done) playSuccess();
      else playTick();
      set({
        wizardStep: step ?? null,
        wizardBusy: false,
        wizardOpen: action !== 'cancel',
      });
    } catch (e) {
      set({
        wizardBusy: false,
        messages: [...get().messages, {
          id: nextId(), role: 'assistant', at: new Date().toISOString(),
          content: errText(e),
        }],
      });
    }
  },

  closeWizard: () => set({
    wizardOpen: false, wizardStep: null,
    creating: false, createSteps: [], createResult: null, createError: null,
    verifyChecks: null, verifying: false,
  }),

  resetCreate: () => set({
    creating: false, createSteps: [], createResult: null, createError: null,
    verifyChecks: null, verifying: false,
  }),

  // ── Create the job for real ────────────────────────────────────────────────
  // Routed through /api/execution/stream, the same endpoint bulk creation uses,
  // so the Copilot inherits agent resolution, the enforced task-before-trigger
  // order, the paced execution queue and the audit trail. No separate creation
  // path exists to drift from the tested one.
  createJob: async () => {
    const summary = get().wizardStep?.summary;
    if (!summary) return;
    if (get().creating) return;

    if (!globalApi.hasSession()) {
      set({ createError: 'Not connected. Reconnect to a UAC environment and try again.' });
      playError();
      return;
    }

    // Hard gate: never write a job that validation says will fail.
    const blocking = summary.findings.filter(f => f.severity === 'error');
    if (blocking.length > 0) {
      set({ createError: `${blocking.length} validation error(s) must be fixed first: ${blocking.map(f => f.message).join(' ')}` });
      playWarning();
      return;
    }

    const taskName = String(summary.row.task_name || '');
    set({
      creating: true, createError: null, createResult: null,
      verifyChecks: null, createSteps: [{ step: 'Sending to UAC', status: 'processing' }],
    });
    playWhoosh();

    const row = { ...summary.row };
    const wantsTrigger = Object.keys(summary.trigger || {}).length > 0;

    // ── Task only ────────────────────────────────────────────────────────────
    // The batch and stream endpoints always build a trigger from the row, so a
    // deliberately unscheduled task must go through the single-task endpoint or
    // the user would silently get a trigger they declined.
    if (!wantsTrigger) {
      set({ createSteps: [{ step: 'Creating task (no trigger requested)', status: 'processing' }] });
      try {
        await globalApi.createTask(summary.task);
        set({
          creating: false,
          createSteps: [{ step: 'Task created', status: 'success' }],
          createResult: { successful: 1, failed: 0, taskName },
        });
        playComplete();
      } catch (e) {
        set({
          creating: false,
          createSteps: [{ step: 'Task failed', status: 'error', message: errText(e) }],
          createError: errText(e),
        });
        playError();
      }
      return;
    }

    await new Promise<void>(resolve => {
      let settled = false;
      const finish = () => { if (!settled) { settled = true; resolve(); } };

      globalApi.executeStream(
        [row],
        {},
        (event, data) => {
          if (event === 'step') {
            const status: CreateStep['status'] =
              data.status === 'success' ? 'success' : data.status === 'error' ? 'error' : 'processing';
            if (status === 'success') playTick();
            if (status === 'error') playError();
            set(s => {
              // Collapse the placeholder and any earlier "processing" row for
              // the same step so the list reads as a checklist, not a log.
              const steps = s.createSteps.filter(
                x => x.step !== 'Sending to UAC' && !(x.status === 'processing'),
              );
              return { createSteps: [...steps, { step: data.step, status, message: data.message }] };
            });
          } else if (event === 'complete') {
            const successful = data.successful ?? 0;
            const failed = data.failed ?? 0;
            set({ createResult: { successful, failed, taskName } });
            if (failed === 0) playComplete(); else playError();
          }
        },
        () => { set({ creating: false }); finish(); },
        (err) => {
          set({ creating: false, createError: err || 'Creation failed.' });
          playError();
          finish();
        },
      );
    });

    // Refresh the Copilot's own awareness of what now exists.
    const result = get().createResult;
    if (result) {
      get().shareExecutions([
        { name: taskName, type: 'task', status: result.failed === 0 ? 'success' : 'failed' },
      ]).catch(() => {});
    }
  },

  // Read-only confirmation: re-reads the created objects back out of UAC.
  verifyCreatedJob: async () => {
    const taskName = get().createResult?.taskName;
    if (!taskName || get().verifying) return;
    set({ verifying: true });
    playClick();
    try {
      const res = await globalApi.verifyJob(taskName);
      const checks: VerifyCheck[] = res.data?.data?.checks ?? [];
      set({ verifyChecks: checks, verifying: false });
      checks.some(c => c.status === 'fail') ? playWarning() : playSuccess();
    } catch (e) {
      set({ verifying: false, createError: errText(e) });
      playError();
    }
  },

  reset: () => {
    lastContextKey = '';
    set({
      messages: [], thinking: false, analysis: null, guidance: null,
      wizardOpen: false, wizardStep: null, badge: 0,
      creating: false, createSteps: [], createResult: null, createError: null,
      verifyChecks: null, verifying: false,
    });
  },
}));

/** Findings sorted worst-first, for consistent display. */
export function sortFindings(findings: CopilotFinding[]): CopilotFinding[] {
  const rank: Record<string, number> = { error: 0, warning: 1, info: 2, success: 3 };
  return [...findings].sort((a, b) => (rank[a.severity] ?? 9) - (rank[b.severity] ?? 9));
}

// Drop the conversation when the UAC session ends — the server-side memory is
// gone at that point, so keeping the transcript would be misleading.
if (typeof window !== 'undefined') {
  window.addEventListener('session-expired', () => {
    useCopilotStore.getState().reset();
  });
}
