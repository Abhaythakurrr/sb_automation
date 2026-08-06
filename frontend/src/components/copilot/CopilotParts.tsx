'use client';
/**
 * Shared building blocks for the Copilot surfaces.
 *
 * Extracted because the Copilot now has two homes: a full workspace tab
 * (CopilotCanvas) and a compact quick-ask launcher (CopilotDock). Both render the
 * same messages, the same findings and the same activity trace, and duplicating
 * them would guarantee they drift.
 *
 * Iconography is SVG throughout. The earlier build used emoji for navigation,
 * which renders at a different weight and baseline on every operating system and
 * sits badly next to a hand-drawn icon set.
 */
import { ReactNode, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { sortFindings } from '@/store/useCopilotStore';
import { AskStage, CopilotFinding, CopilotMessage, QuickAction } from '@/types/copilot';
import { playHover } from '@/utils/soundEffects';
import CopilotMarkdown from './CopilotMarkdown';
import MessageFeedback from './MessageFeedback';

export const spring = { type: 'spring' as const, damping: 28, stiffness: 300 };

export const SEV: Record<string, { color: string; bg: string; ring: string; label: string }> = {
  error:   { color: '#fca5a5', bg: 'rgba(239,68,68,0.10)',  ring: 'rgba(239,68,68,0.26)',  label: 'ERROR' },
  warning: { color: '#fcd34d', bg: 'rgba(245,158,11,0.10)', ring: 'rgba(245,158,11,0.24)', label: 'WARN'  },
  info:    { color: '#7dd3fc', bg: 'rgba(56,189,248,0.08)', ring: 'rgba(56,189,248,0.20)', label: 'INFO'  },
  success: { color: '#6ee7b7', bg: 'rgba(16,185,129,0.10)', ring: 'rgba(16,185,129,0.24)', label: 'OK'    },
};

// ── Icons ─────────────────────────────────────────────────────────────────────

type IconProps = { className?: string };
const svg = (d: string) => ({ className = 'w-4 h-4' }: IconProps) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d={d} />
  </svg>
);

export const SparkIcon = svg('M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z');
export const ChatIcon  = svg('M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.86 9.86 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z');
export const ShieldIcon = svg('M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-.34-.014-.677-.041-1.012z');
export const BuildIcon = svg('M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z');
export const CloseIcon = svg('M6 18L18 6M6 6l12 12');
export const SoundOnIcon = svg('M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z');
export const SoundOffIcon = svg('M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15zM17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2');
export const TrashIcon = svg('M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16');
export const SendIcon  = svg('M12 19l9 2-9-18-9 18 9-2zm0 0v-8');
export const ChevronIcon = svg('M19 9l-7 7-7-7');

// ── Badges and chips ──────────────────────────────────────────────────────────

export function BetaBadge() {
  return (
    <span className="text-[10px] font-bold px-1.5 py-[2px] rounded uppercase tracking-wider shrink-0"
      style={{ background: 'rgba(245,158,11,0.14)', border: '1px solid rgba(245,158,11,0.32)', color: '#fcd34d' }}>
      Beta
    </span>
  );
}

export function ActionChips({ actions, onRun }: { actions: QuickAction[]; onRun: (a: QuickAction) => void }) {
  if (!actions?.length) return null;
  return (
    <div className="flex flex-wrap gap-2 mt-3">
      {actions.map((a, i) => (
        <motion.button key={`${a.action}-${i}`}
          initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}
          transition={{ ...spring, delay: i * 0.04 }}
          onMouseEnter={playHover} onClick={() => onRun(a)}
          className="lq-btn px-3 py-1.5 rounded-lg text-xs font-semibold text-left">
          {a.label}
        </motion.button>
      ))}
    </div>
  );
}

export function FindingChip({ f, onExplain }: {
  f: CopilotFinding; onExplain: (f: CopilotFinding) => void;
}) {
  const s = SEV[f.severity] || SEV.info;
  return (
    <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={spring}
      className="lq-find rounded-lg px-3 py-2.5 space-y-1"
      style={{ background: s.bg, border: `1px solid ${s.ring}` }}>
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-bold tracking-wider" style={{ color: s.color }}>{s.label}</span>
        <span className="text-xs font-semibold text-slate-200 truncate">{f.subject}</span>
        {f.row !== undefined && (
          <span className="text-[11px] font-mono text-slate-500 ml-auto shrink-0">row {f.row}</span>
        )}
      </div>
      <p className="text-xs text-slate-400 leading-relaxed">{f.message}</p>
      {f.fix && <p className="text-xs text-slate-500 leading-relaxed">Fix: {f.fix}</p>}
      <button onMouseEnter={playHover} onClick={() => onExplain(f)}
        className="text-[11px] text-cyan-400/80 hover:text-cyan-200 transition-colors font-mono">
        {f.rule} — explain
      </button>
    </motion.div>
  );
}

// ── Activity trace ────────────────────────────────────────────────────────────

const STEP_ICON: Record<AskStage['step'], string> = {
  retrieve:   'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z',
  classify:   'M7 7h.01M7 3h5a1.99 1.99 0 011.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.99 1.99 0 013 12V7a4 4 0 014-4z',
  scope:      'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-.34-.014-.677-.041-1.012z',
  specialist: 'M13 10V3L4 14h7v7l9-11h-7z',
  compose:    'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z',
  done:       'M5 13l4 4L19 7',
};

/**
 * What the Copilot is doing, or did.
 *
 * While a question is in flight this is the live feed — stages arrive over SSE as
 * each one finishes, so the timings are real rather than a scripted animation.
 * Once the answer lands it collapses to a single summary line that expands on
 * click, because the reasoning matters when an answer looks wrong and is noise
 * when it looks right.
 */
export function ActivityTrace({ stages, live }: { stages: AskStage[]; live: boolean }) {
  const [open, setOpen] = useState(false);
  if (!stages.length) return null;

  const total = stages[stages.length - 1]?.ms ?? 0;
  const expanded = live || open;

  return (
    <div className={live ? '' : 'mt-2'}>
      {!live && (
        <button onMouseEnter={playHover} onClick={() => setOpen(v => !v)}
          aria-expanded={expanded}
          className="flex items-center gap-1.5 text-[11px] text-slate-600 hover:text-slate-400 transition-colors">
          <motion.span animate={{ rotate: expanded ? 0 : -90 }} transition={{ duration: 0.18 }}
            className="inline-flex">
            <ChevronIcon className="w-3 h-3" />
          </motion.span>
          How I got there · {stages.length} steps · {total} ms
        </button>
      )}

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.ol
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden space-y-1.5 mt-2">
            {stages.filter(s => s.step !== 'done').map((s, i) => (
              <motion.li key={`${s.step}-${i}`}
                initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.24, delay: live ? 0 : i * 0.03 }}
                className="flex items-start gap-2.5">
                <span className="mt-[3px] shrink-0" style={{ color: '#22d3ee' }}>
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={STEP_ICON[s.step]} />
                  </svg>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="text-xs text-slate-300">{s.label}</span>
                  {s.detail && <span className="text-xs text-slate-500"> — {s.detail}</span>}
                </span>
                <span className="text-[11px] font-mono text-slate-600 shrink-0 tabular-nums">{s.ms} ms</span>
              </motion.li>
            ))}
          </motion.ol>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Messages ──────────────────────────────────────────────────────────────────

export function Message({ msg, onRun, onExplainFinding, liveStages }: {
  msg: CopilotMessage;
  onRun: (a: QuickAction) => void;
  onExplainFinding: (f: CopilotFinding) => void;
  /** Stages streaming in for this reply, while it is still pending. */
  liveStages?: AskStage[];
}) {
  if (msg.role === 'user') {
    return (
      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={spring}
        className="flex justify-end">
        <div className="lq-bubble lq-bubble-user max-w-[75%] px-4 py-2.5 rounded-2xl rounded-br-sm
          text-sm leading-relaxed text-cyan-50">
          {msg.content}
        </div>
      </motion.div>
    );
  }

  // Pending: show the live trace instead of an opaque spinner. The user can watch
  // retrieval finish, see which specialist took the question, and read the
  // router's confidence before the prose arrives.
  if (msg.pending) {
    const stages = liveStages ?? [];
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-3 items-start">
        <span className="lq-orb flex items-center justify-center w-8 h-8 rounded-lg shrink-0 mt-0.5">
          <SparkIcon className="w-4 h-4 text-white/90" />
        </span>
        <div className="flex-1 min-w-0 pt-1">
          {stages.length === 0 ? (
            <div className="flex items-center gap-2">
              {[0, 1, 2].map(i => (
                <motion.span key={i} className="w-2 h-2 rounded-full"
                  style={{ background: 'linear-gradient(135deg,#22d3ee,#a78bfa)' }}
                  animate={{ y: [0, -5, 0], opacity: [0.35, 1, 0.35] }}
                  transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.18, ease: 'easeInOut' }} />
              ))}
              <span className="lq-shimmer text-xs font-medium ml-1">Working on it…</span>
            </div>
          ) : (
            <ActivityTrace stages={stages} live />
          )}
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 10, filter: 'blur(4px)' }}
      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
      className="flex gap-3 items-start">
      <span className="lq-orb flex items-center justify-center w-8 h-8 rounded-lg shrink-0 mt-0.5">
        <SparkIcon className="w-4 h-4 text-white/90" />
      </span>
      <div className="flex-1 min-w-0">
        <div className="lq-bubble rounded-2xl rounded-tl-sm px-4 py-3.5">
          <CopilotMarkdown text={msg.content} />

          {msg.findings && msg.findings.length > 0 && (
            <div className="mt-3 space-y-2">
              {sortFindings(msg.findings).slice(0, 6).map(f => (
                <FindingChip key={f.id} f={f} onExplain={onExplainFinding} />
              ))}
              {msg.findings.length > 6 && (
                <p className="text-[11px] text-slate-500">
                  {msg.findings.length - 6} more in the Validation panel
                </p>
              )}
            </div>
          )}

          {msg.actions && <ActionChips actions={msg.actions} onRun={onRun} />}

          {/* Provenance. Every answer states where it came from, because an
              assistant that cites nothing is indistinguishable from one guessing. */}
          <div className="flex items-center gap-2 flex-wrap mt-3 pt-2"
            style={{ borderTop: '1px solid rgba(148,163,184,0.10)' }}>
            <span className="text-[10px] font-mono uppercase tracking-wider"
              style={{ color: msg.outOfScope ? '#94a3b8' : '#6ee7b7' }}>
              {msg.outOfScope ? 'not in knowledge base' : 'app knowledge · on-device ML'}
            </span>
            {msg.citations?.slice(0, 3).map(c => (
              <span key={c.id} className="text-[10px] font-mono text-slate-600" title={c.source || c.id}>
                {c.id}
              </span>
            ))}
          </div>

          {msg.trace && msg.trace.length > 0 && <ActivityTrace stages={msg.trace} live={false} />}
          {!msg.outOfScope && <MessageFeedback msg={msg} />}
        </div>
      </div>
    </motion.div>
  );
}

// ── Composer ──────────────────────────────────────────────────────────────────

export function InputBar({ value, onChange, onSubmit, thinking, autoFocus, placeholder }: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  thinking: boolean;
  autoFocus?: boolean;
  placeholder?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  // Grow with the content, to a ceiling. Past that it scrolls, so a long paste
  // cannot push the send button off screen.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 168)}px`;
  }, [value]);

  useEffect(() => { if (autoFocus) ref.current?.focus(); }, [autoFocus]);

  return (
    <div className="w-full">
      <div className="lq-glass lq-rim flex items-end gap-3 px-4 py-3 rounded-2xl"
        style={{ background: 'rgba(2,8,18,0.6)' }}>
        <textarea
          ref={ref}
          value={value}
          onChange={e => onChange(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSubmit(); } }}
          placeholder={placeholder || 'Ask about a schedule, a field, an error, or what a change would do…'}
          rows={1}
          aria-label="Ask the Copilot"
          className="flex-1 bg-transparent border-none outline-none resize-none text-sm text-slate-200
            placeholder:text-slate-500 leading-relaxed"
          style={{ minHeight: 26, maxHeight: 168, overflowY: 'auto' }}
        />
        <button onMouseEnter={playHover} onClick={onSubmit}
          disabled={thinking || !value.trim()}
          aria-label="Send"
          className="lq-btn shrink-0 w-9 h-9 rounded-xl flex items-center justify-center">
          {thinking
            ? <motion.span className="w-2 h-2 rounded-full" style={{ background: '#22d3ee' }}
                animate={{ opacity: [0.35, 1, 0.35] }} transition={{ duration: 1, repeat: Infinity }} />
            : <SendIcon className="w-4 h-4" />}
        </button>
      </div>
      <p className="text-center text-[11px] text-slate-600 mt-2">
        Enter to send · Shift+Enter for a new line · answers come only from this tool and your session
      </p>
    </div>
  );
}

// ── Greeting ──────────────────────────────────────────────────────────────────

/**
 * Opening screen.
 *
 * Addressed to the person by name, because the tool already knows who connected
 * and an assistant that greets you generically reads like a form. The name comes
 * from the UAC login on the connection, so it is whoever the controller thinks is
 * acting — which is the right identity to show next to actions that write to it.
 */
export function Greeting({ username, environment, headline, prompts, onAsk }: {
  username: string;
  environment?: string;
  headline?: string;
  prompts: string[];
  onAsk: (q: string) => void;
}) {
  const first = username ? username.split(/[\s@._-]/).filter(Boolean)[0] : '';
  const name = first ? first.charAt(0).toUpperCase() + first.slice(1) : '';
  const hour = new Date().getHours();
  const tod = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';

  return (
    <div className="flex flex-col items-center justify-center w-full gap-9 py-10">
      <div className="flex flex-col items-center gap-4 text-center">
        <motion.span
          initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
          transition={{ ...spring, delay: 0.05 }}
          className="lq-orb relative flex items-center justify-center w-16 h-16 rounded-2xl">
          <SparkIcon className="w-7 h-7 text-white/95" />
          <span className="lq-halo" />
        </motion.span>

        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          transition={{ ...spring, delay: 0.1 }}>
          <h2 className="text-3xl font-semibold lq-title tracking-tight">
            Good {tod}{name ? `, ${name}` : ''}
          </h2>
          <p className="text-slate-400 text-sm mt-2 max-w-md">
            {headline || 'Ask me about your jobs, schedules, or anything this tool does.'}
          </p>
          {environment && (
            <p className="text-xs text-slate-600 mt-2 font-mono">
              connected to {environment}
            </p>
          )}
        </motion.div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-2xl">
        {prompts.slice(0, 4).map((p, i) => (
          <motion.button key={p}
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            transition={{ ...spring, delay: 0.16 + i * 0.05 }}
            onMouseEnter={playHover} onClick={() => onAsk(p)}
            className="lq-bubble text-left px-4 py-3.5 rounded-xl text-[13px] text-slate-300
              hover:text-white transition-colors duration-200 leading-relaxed">
            {p}
          </motion.button>
        ))}
      </div>
    </div>
  );
}

// ── Not connected ─────────────────────────────────────────────────────────────

export function NotConnected({ compact }: { compact?: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center flex-1 px-8 text-center gap-4 py-10">
      <motion.span className="lq-orb flex items-center justify-center w-14 h-14 rounded-2xl"
        animate={{ scale: [1, 1.04, 1] }}
        transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut' }}>
        <SparkIcon className="w-6 h-6 text-white/90" />
      </motion.span>
      <div className="max-w-sm">
        <p className={compact ? 'text-sm font-semibold text-slate-200' : 'text-lg font-semibold text-slate-200'}>
          Connect to get started
        </p>
        <p className="text-[13px] text-slate-400 mt-2 leading-relaxed">
          Once you connect to a controller I pick up your session — the file you upload, the
          payloads built from it, and what came back.
        </p>
        <p className="text-xs text-slate-600 mt-3">
          Your access token stays on the server. I never receive it.
        </p>
      </div>
    </div>
  );
}

export type { AskStage };
