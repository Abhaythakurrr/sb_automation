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
  CopilotAnswer,
  CopilotContext,
  CopilotFinding,
  CopilotHealth,
  CopilotMessage,
  CopilotPageId,
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

  // ── Context ──
  context: CopilotContext;
  guidance: PageGuidance | null;
  guidanceLoading: boolean;

  // ── Analysis ──
  analysis: UploadAnalysis | null;

  // ── Inline Assistant ──
  wizardOpen: boolean;
  wizardStep: WizardStep | null;
  wizardBusy: boolean;

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

  wizard: (action: string, answer?: string) => Promise<void>;
  closeWizard: () => void;

  reset: () => void;
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

  context: { page: 'home' },
  guidance: null,
  guidanceLoading: false,

  analysis: null,

  wizardOpen: false,
  wizardStep: null,
  wizardBusy: false,

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
    set({ open, badge: open ? 0 : get().badge });
    if (open) get().loadGuidance();
  },

  setOpen: (v) => {
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
  ask: async (question) => {
    const q = question.trim();
    if (!q || get().thinking) return;

    const userMsg: CopilotMessage = { id: nextId(), role: 'user', content: q, at: new Date().toISOString() };
    const pendingId = nextId();
    set({
      open: true,
      thinking: true,
      messages: [
        ...get().messages,
        userMsg,
        { id: pendingId, role: 'assistant', content: '', at: new Date().toISOString(), pending: true },
      ],
    });

    try {
      const { page, step, focus } = get().context;
      const res = await globalApi.copilotAsk(q, { page, step, focus });
      const answer: CopilotAnswer = res.data?.data;
      set({
        thinking: false,
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
          }
          : m),
      });
    } catch (e) {
      set({
        thinking: false,
        messages: get().messages.map(m => m.id === pendingId
          ? { ...m, pending: false, content: errText(e) }
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

  // ── Inline Assistant ───────────────────────────────────────────────────────
  wizard: async (action, answer) => {
    if (!globalApi.hasSession()) return;
    set({ wizardBusy: true, open: true, wizardOpen: action !== 'cancel' });
    try {
      const res = await globalApi.copilotWizard(action, answer);
      const step: WizardStep = res.data?.data;
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

  closeWizard: () => set({ wizardOpen: false, wizardStep: null }),

  reset: () => {
    lastContextKey = '';
    set({
      messages: [], thinking: false, analysis: null, guidance: null,
      wizardOpen: false, wizardStep: null, badge: 0,
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
