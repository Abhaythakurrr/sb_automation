'use client';
/**
 * AI Operations Copilot — full-canvas overlay.
 *
 * Layout: three zones (Claude / Grok model)
 *   ┌─ sidebar ──┬─────── canvas ──────────┬─ panel ─┐
 *   │ Nav + hist │  greeting / messages    │ guide / │
 *   │            │  ──────────────────     │ wizard  │
 *   │            │  input bar              │         │
 *   └────────────┴─────────────────────────┴─────────┘
 *
 * The overlay fills 100vw × 100vh with a translucent backdrop that blurs the
 * application behind it, preserving context. The orb launcher stays visible
 * when the overlay is closed.
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useCopilotStore, sortFindings } from '@/store/useCopilotStore';
import { useConnectionStore } from '@/store/useConnectionStore';
import { useWorkspaceStore, AutomationId } from '@/store/useWorkspaceStore';
import { CopilotFinding, CopilotMessage, QuickAction } from '@/types/copilot';
import {
  playClick, playHover, playWhoosh, playTick, playWarning,
  setSoundEnabled, isSoundEnabled,
} from '@/utils/soundEffects';
import CopilotMarkdown from './CopilotMarkdown';
import InlineAssistant from './InlineAssistant';
import MessageFeedback from './MessageFeedback';

// ── Constants ─────────────────────────────────────────────────────────────────

type RightPanel = 'guidance' | 'wizard' | null;

const spring = { type: 'spring' as const, damping: 28, stiffness: 300 };

const SEV: Record<string, { color: string; bg: string; ring: string; label: string }> = {
  error:   { color: '#fca5a5', bg: 'rgba(239,68,68,0.10)',  ring: 'rgba(239,68,68,0.26)',  label: 'ERROR' },
  warning: { color: '#fcd34d', bg: 'rgba(245,158,11,0.10)', ring: 'rgba(245,158,11,0.24)', label: 'WARN'  },
  info:    { color: '#7dd3fc', bg: 'rgba(56,189,248,0.08)', ring: 'rgba(56,189,248,0.20)', label: 'INFO'  },
  success: { color: '#6ee7b7', bg: 'rgba(16,185,129,0.10)', ring: 'rgba(16,185,129,0.24)', label: 'OK'    },
};

const PAGE_TO_TAB: Partial<Record<string, { id: AutomationId; title: string }>> = {
  'job-creation': { id: 'job-creation', title: 'Job Creation' },
  upload:         { id: 'job-creation', title: 'Job Creation' },
  preview:        { id: 'job-creation', title: 'Job Creation' },
  execution:      { id: 'job-creation', title: 'Job Creation' },
  monitoring:     { id: 'monitoring',   title: 'Monitoring'   },
  'job-deletion': { id: 'job-deletion', title: 'Job Deletion' },
  recovery:       { id: 'job-recovery', title: 'Job Recovery' },
  search:         { id: 'search',       title: 'Search & Edit'},
  'adhoc-launch': { id: 'adhoc-launch', title: 'Ad-hoc Launch'},
  'agent-control':{ id: 'agent-control',title: 'Agent Control'},
  home:           { id: 'home',         title: 'Home'         },
};

// ── Small shared atoms ────────────────────────────────────────────────────────

function SparkIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
    </svg>
  );
}

function BetaBadge() {
  return (
    <span className="text-[8px] font-black px-1.5 py-[2px] rounded-md uppercase tracking-[0.12em] shrink-0"
      style={{ background: 'linear-gradient(135deg,rgba(245,158,11,0.20),rgba(251,191,36,0.10))',
               border: '1px solid rgba(245,158,11,0.36)', color: '#fcd34d' }}>
      Beta
    </span>
  );
}

function ActionChips({ actions, onRun }: { actions: QuickAction[]; onRun: (a: QuickAction) => void }) {
  if (!actions?.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {actions.map((a, i) => (
        <motion.button key={`${a.action}-${i}`}
          initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }}
          transition={{ ...spring, delay: i * 0.04 }}
          onMouseEnter={playHover} onClick={() => onRun(a)}
          className="lq-btn px-2.5 py-1.5 rounded-xl text-[10px] font-bold text-left">
          {a.label}
        </motion.button>
      ))}
    </div>
  );
}

function FindingChip({ f, onExplain }: { f: CopilotFinding; onExplain: (f: CopilotFinding) => void }) {
  const s = SEV[f.severity] || SEV.info;
  return (
    <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={spring}
      className="lq-find rounded-xl px-3 py-2 space-y-1"
      style={{ background: s.bg, border: `1px solid ${s.ring}` }}>
      <div className="flex items-center gap-2">
        <span className="text-[8px] font-black tracking-wider" style={{ color: s.color }}>{s.label}</span>
        <span className="text-[10px] font-semibold text-slate-200 truncate">{f.subject}</span>
        {f.row !== undefined && <span className="text-[9px] font-mono text-slate-600 ml-auto shrink-0">row {f.row}</span>}
      </div>
      <p className="text-[10px] text-slate-400 leading-relaxed">{f.message}</p>
      {f.fix && <p className="text-[10px] text-slate-500">Fix: {f.fix}</p>}
      <button onMouseEnter={playHover} onClick={() => onExplain(f)}
        className="text-[9px] text-cyan-400/70 hover:text-cyan-200 transition-colors font-mono">
        {f.rule} — explain
      </button>
    </motion.div>
  );
}

// ── Message bubble ────────────────────────────────────────────────────────────

function Message({ msg, onRun, onExplainFinding }: {
  msg: CopilotMessage;
  onRun: (a: QuickAction) => void;
  onExplainFinding: (f: CopilotFinding) => void;
}) {
  if (msg.role === 'user') {
    return (
      <motion.div initial={{ opacity: 0, y: 6, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={spring} className="flex justify-end px-2 md:px-0">
        <div className="lq-bubble lq-bubble-user max-w-[72%] px-4 py-2.5 rounded-2xl rounded-br-md
          text-[13px] leading-relaxed text-cyan-50">
          {msg.content}
        </div>
      </motion.div>
    );
  }

  if (msg.pending) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-3 px-2 md:px-0">
        <span className="lq-orb flex items-center justify-center w-7 h-7 rounded-full shrink-0">
          <SparkIcon className="w-3.5 h-3.5 text-white/90" />
        </span>
        <div className="flex items-center gap-1.5">
          {[0, 1, 2].map(i => (
            <motion.span key={i} className="w-2 h-2 rounded-full"
              style={{ background: 'linear-gradient(135deg,#22d3ee,#a78bfa)' }}
              animate={{ y: [0, -5, 0], opacity: [0.35, 1, 0.35] }}
              transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.18, ease: 'easeInOut' }} />
          ))}
          <span className="lq-shimmer text-[11px] font-medium ml-1">Thinking…</span>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 12, filter: 'blur(5px)' }}
      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
      className="flex gap-3 items-start px-2 md:px-0">
      {/* Copilot avatar */}
      <span className="lq-orb flex items-center justify-center w-7 h-7 rounded-full shrink-0 mt-0.5">
        <SparkIcon className="w-3.5 h-3.5 text-white/90" />
      </span>
      <div className="flex-1 min-w-0">
        <div className="lq-bubble rounded-2xl rounded-tl-md px-4 py-3">
          <CopilotMarkdown text={msg.content} />
          {msg.findings && msg.findings.length > 0 && (
            <div className="mt-3 space-y-1.5">
              {sortFindings(msg.findings).slice(0, 6).map(f => (
                <FindingChip key={f.id} f={f} onExplain={onExplainFinding} />
              ))}
              {msg.findings.length > 6 && (
                <p className="text-[9px] text-slate-600">+{msg.findings.length - 6} more in Guidance</p>
              )}
            </div>
          )}
          {msg.actions && <ActionChips actions={msg.actions} onRun={onRun} />}
          {/* Source tag */}
          <div className="flex items-center gap-1.5 flex-wrap mt-2.5 pt-1.5"
            style={{ borderTop: '1px solid rgba(148,163,184,0.08)' }}>
            <span className="text-[8px] font-mono uppercase tracking-[0.1em]"
              style={{ color: msg.outOfScope ? '#94a3b8' : '#6ee7b7' }}>
              {msg.outOfScope ? 'not in knowledge base' : 'app knowledge · on-device ML'}
            </span>
            {msg.citations?.slice(0, 3).map(c => (
              <span key={c.id} className="text-[8px] font-mono text-slate-700" title={c.source || c.id}>{c.id}</span>
            ))}
          </div>
          {!msg.outOfScope && <MessageFeedback msg={msg} />}
        </div>
      </div>
    </motion.div>
  );
}

// ── Sidebar ───────────────────────────────────────────────────────────────────

function Sidebar({ rightPanel, setRightPanel, errorCount, learnedCount, score, onClose, onClear, muted, onToggleMute }: {
  rightPanel: RightPanel;
  setRightPanel: (p: RightPanel) => void;
  errorCount: number;
  learnedCount: number;
  score: any;
  onClose: () => void;
  onClear: () => void;
  muted: boolean;
  onToggleMute: () => void;
}) {
  return (
    <div className="flex flex-col h-full py-4 px-3 gap-2 shrink-0"
      style={{ width: 220, borderRight: '1px solid rgba(148,163,184,0.10)' }}>
      {/* Brand */}
      <div className="flex items-center gap-2.5 px-1 mb-2">
        <span className="lq-orb flex items-center justify-center w-8 h-8 rounded-xl shrink-0">
          <SparkIcon className="w-4 h-4 text-white/95" />
          <span className="lq-halo" />
        </span>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[13px] font-bold lq-title leading-none">Copilot</span>
            <BetaBadge />
          </div>
          <p className="text-[9px] text-slate-600 font-mono mt-0.5">on-device ML · no telemetry</p>
        </div>
      </div>

      {/* Nav items */}
      <NavItem icon="💬" label="Ask anything"
        active={rightPanel === null} onClick={() => { playWhoosh(); setRightPanel(null); }} />
      <NavItem icon="🔍" label={errorCount > 0 ? `Guidance · ${errorCount} issues` : 'Guidance'}
        active={rightPanel === 'guidance'} onClick={() => { playWhoosh(); setRightPanel(rightPanel === 'guidance' ? null : 'guidance'); }}
        badge={errorCount > 0 ? String(errorCount) : undefined} badgeColor="#fca5a5" />
      <NavItem icon="🏗️" label="Build a job"
        active={rightPanel === 'wizard'} onClick={() => { playWhoosh(); setRightPanel(rightPanel === 'wizard' ? null : 'wizard'); }} />

      <div className="mt-auto space-y-1">
        {learnedCount > 0 && (
          <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-xl"
            style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.18)' }}>
            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: '#6ee7b7' }} />
            <span className="text-[9px] font-bold" style={{ color: '#6ee7b7' }}>
              {learnedCount} correction{learnedCount > 1 ? 's' : ''} learned
            </span>
          </div>
        )}
        {score?.runtimeLearning?.guardCases > 0 && (
          <p className="text-[8px] text-slate-700 px-2">
            Guard: {score.runtimeLearning.guardCases} cases · {((score.runtimeLearning.guardAccuracy?.day ?? 1) * 100).toFixed(0)}% accuracy
          </p>
        )}
        <div className="flex items-center gap-1 pt-1">
          <button onMouseEnter={playHover} onClick={onToggleMute} title={muted ? 'Sound on' : 'Sound off'}
            className="p-2 rounded-lg text-slate-600 hover:text-cyan-300 transition-colors text-[10px]">
            {muted ? '🔇' : '🔊'}
          </button>
          <button onMouseEnter={playHover} onClick={onClear}
            className="p-2 rounded-lg text-slate-600 hover:text-slate-300 transition-colors text-[10px]">
            Clear
          </button>
          <button onMouseEnter={playHover} onClick={onClose} aria-label="Close Copilot"
            className="ml-auto p-2 rounded-lg text-slate-600 hover:text-slate-200 transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

function NavItem({ icon, label, active, onClick, badge, badgeColor }: {
  icon: string; label: string; active: boolean;
  onClick: () => void; badge?: string; badgeColor?: string;
}) {
  return (
    <button onMouseEnter={playHover} onClick={onClick}
      className="relative flex items-center gap-2.5 w-full px-3 py-2 rounded-xl text-[11px] font-semibold text-left transition-all"
      style={active ? {
        background: 'linear-gradient(135deg,rgba(34,211,238,0.14),rgba(139,92,246,0.10))',
        border: '1px solid rgba(34,211,238,0.28)', color: '#cffafe',
      } : {
        background: 'transparent', border: '1px solid transparent', color: '#64748b',
      }}>
      <span className="text-base leading-none">{icon}</span>
      <span className="truncate">{label}</span>
      {badge && (
        <span className="ml-auto text-[9px] font-black px-1.5 py-[1px] rounded-full"
          style={{ background: 'rgba(239,68,68,0.18)', color: badgeColor }}>
          {badge}
        </span>
      )}
    </button>
  );
}

// ── Empty state / greeting ────────────────────────────────────────────────────

function Greeting({ username, guidance, score, onAsk }: {
  username: string;
  guidance: any;
  score: any;
  onAsk: (q: string) => void;
}) {
  const first = username ? username.split(/[\s@]/)[0] : '';
  const hour = new Date().getHours();
  const tod = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
  const greeting = first ? `Good ${tod}, ${first}.` : `Good ${tod}.`;

  const prompts: string[] = guidance?.prompts?.length
    ? guidance.prompts.slice(0, 4)
    : [
        'What columns are required for a job upload?',
        'How do I schedule a job to run every weekday at 6 AM?',
        'Explain what maxRuntime does.',
        'What will happen if I delete this job?',
      ];

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className="flex flex-col items-center justify-center flex-1 px-8 max-w-2xl mx-auto w-full gap-8 py-12">

      {/* Orb + greeting */}
      <div className="flex flex-col items-center gap-4 text-center">
        <motion.span className="lq-orb flex items-center justify-center w-16 h-16 rounded-2xl"
          animate={{ scale: [1, 1.04, 1] }}
          transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}>
          <SparkIcon className="w-8 h-8 text-white/95" />
          <span className="lq-halo" />
        </motion.span>
        <div>
          <h2 className="text-2xl font-bold lq-title">{greeting}</h2>
          <p className="text-slate-500 text-sm mt-1">
            {guidance?.headline || 'Ask me anything about your UAC jobs, schedules, or this tool.'}
          </p>
        </div>
      </div>

      {/* Prompt suggestions */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full">
        {prompts.map((p, i) => (
          <motion.button key={p}
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            transition={{ ...spring, delay: 0.08 + i * 0.06 }}
            onMouseEnter={playHover} onClick={() => onAsk(p)}
            className="lq-bubble text-left px-4 py-3 rounded-2xl text-[12px] text-slate-400
              hover:text-slate-100 hover:border-cyan-400/30 transition-all duration-200">
            {p}
          </motion.button>
        ))}
      </div>

      {/* Capability note */}
      <div className="text-center space-y-1">
        <p className="text-[10px] text-slate-700">
          Answers come only from this tool&apos;s knowledge base and your current session.
          Outside that scope, I say so rather than guess.
        </p>
        {score?.runtimeLearning?.shapeCorrections > 0 && (
          <p className="text-[10px]" style={{ color: '#6ee7b7' }}>
            {score.runtimeLearning.shapeCorrections} schedule correction{score.runtimeLearning.shapeCorrections > 1 ? 's' : ''} learned
            from this team — corrections are checked against {score.runtimeLearning.guardCases} guard cases before being kept.
          </p>
        )}
      </div>
    </motion.div>
  );
}

// ── Input bar ─────────────────────────────────────────────────────────────────

function InputBar({ value, onChange, onSubmit, disabled, thinking }: {
  value: string; onChange: (v: string) => void;
  onSubmit: () => void; disabled: boolean; thinking: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  // Auto-resize up to ~6 lines
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, [value]);

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSubmit(); }
  };

  return (
    <div className="px-4 pb-4 pt-2 shrink-0"
      style={{ borderTop: '1px solid rgba(148,163,184,0.08)' }}>
      <div className="lq-glass lq-rim flex items-end gap-3 px-4 py-3 rounded-2xl"
        style={{ background: 'rgba(2,8,18,0.55)' }}>
        <textarea
          ref={ref}
          value={value}
          onChange={e => onChange(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Ask about a schedule, a field, an error… (Enter to send, Shift+Enter for newline)"
          disabled={disabled}
          rows={1}
          aria-label="Ask the Copilot"
          className="flex-1 bg-transparent border-none outline-none resize-none text-[13px] text-slate-200
            placeholder:text-slate-600 leading-relaxed disabled:opacity-50"
          style={{ minHeight: 24, maxHeight: 140, overflowY: 'auto' }}
        />
        <button onMouseEnter={playHover} onClick={onSubmit}
          disabled={disabled || !value.trim()}
          className="lq-btn shrink-0 px-4 py-2 rounded-xl text-[11px] font-bold">
          {thinking ? (
            <span className="flex items-center gap-1.5">
              <motion.span className="w-1.5 h-1.5 rounded-full"
                style={{ background: '#22d3ee' }}
                animate={{ opacity: [0.4, 1, 0.4] }}
                transition={{ duration: 1, repeat: Infinity }} />
              …
            </span>
          ) : 'Send'}
        </button>
      </div>
      <p className="text-center text-[8.5px] text-slate-700 mt-1.5">
        Ctrl+K to toggle · Esc to close · Shift+Enter for newline
      </p>
    </div>
  );
}

// ── Right panel (Guidance / Wizard) ──────────────────────────────────────────

function RightPanelContent({ panel, findings, guidance, onExplainFinding, onRun, onRefresh }: {
  panel: RightPanel;
  findings: CopilotFinding[];
  guidance: any;
  onExplainFinding: (f: CopilotFinding) => void;
  onRun: (a: QuickAction) => void;
  onRefresh: () => void;
}) {
  if (panel === 'wizard') {
    return (
      <div className="flex-1 min-h-0 overflow-auto lq-scroll">
        <InlineAssistant />
      </div>
    );
  }

  if (panel === 'guidance') {
    return (
      <div className="flex-1 min-h-0 overflow-auto lq-scroll px-4 py-4 space-y-4">
        {guidance?.headline && (
          <p className="text-[11px] text-slate-300 leading-relaxed">{guidance.headline}</p>
        )}
        {guidance?.tips?.length > 0 && (
          <div className="space-y-2">
            <p className="text-[8px] font-black text-slate-600 uppercase tracking-[0.15em]">For this page</p>
            {guidance.tips.map((t: string, i: number) => (
              <div key={i} className="text-[10px] text-slate-400 leading-relaxed pl-3"
                style={{ borderLeft: '2px solid rgba(34,211,238,0.28)' }}>
                <CopilotMarkdown text={t} />
              </div>
            ))}
          </div>
        )}
        {findings.length > 0 && (
          <div className="space-y-2">
            <p className="text-[8px] font-black text-slate-600 uppercase tracking-[0.15em]">
              Findings ({findings.length})
            </p>
            {findings.slice(0, 30).map(f => (
              <FindingChip key={f.id} f={f} onExplain={onExplainFinding} />
            ))}
          </div>
        )}
        {guidance?.actions?.length > 0 && (
          <ActionChips actions={guidance.actions} onRun={onRun} />
        )}
        <button onMouseEnter={playHover} onClick={onRefresh}
          className="text-[9px] text-slate-600 hover:text-cyan-300 transition-colors">
          Refresh guidance
        </button>
      </div>
    );
  }

  return null;
}

// ── Not-connected placeholder ─────────────────────────────────────────────────

function NotConnected() {
  return (
    <div className="flex flex-col items-center justify-center flex-1 px-8 text-center gap-4">
      <motion.span className="lq-orb flex items-center justify-center w-14 h-14 rounded-2xl"
        animate={{ scale: [1, 1.05, 1] }}
        transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut' }}>
        <SparkIcon className="w-6 h-6 text-white/90" />
      </motion.span>
      <div>
        <p className="text-[14px] font-semibold text-slate-300">Connect first</p>
        <p className="text-[11px] text-slate-500 mt-1 max-w-xs mx-auto leading-relaxed">
          Connect to a UAC environment and I&apos;ll pick up your session — the file you upload,
          the payloads generated, and the results you get.
        </p>
        <p className="text-[9px] text-slate-600 mt-2">I never see your token. It stays server-side.</p>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function CopilotDock() {
  const {
    enabled, health, checkHealth, open, setOpen, toggle, badge,
    messages, thinking, ask, runAction,
    guidance, loadGuidance, guidanceLoading,
    context, wizardOpen, wizard, explainField, reset,
    score, loadScore,
  } = useCopilotStore();
  const { connected, environment, username } = useConnectionStore();
  const { openTab } = useWorkspaceStore();

  const [rightPanel, setRightPanel] = useState<RightPanel>(null);
  const [input, setInput] = useState('');
  const [muted, setMuted] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputFocusTrigger = useRef(false);

  useEffect(() => { checkHealth(); }, [checkHealth]);
  useEffect(() => { setMuted(!isSoundEnabled()); }, []);
  useEffect(() => { if (wizardOpen) setRightPanel('wizard'); }, [wizardOpen]);

  // Auto-scroll to the bottom of the conversation
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [messages, thinking]);

  useEffect(() => {
    if (open && connected) {
      loadGuidance();
      loadScore();
    }
  }, [open, connected, context.page]); // eslint-disable-line react-hooks/exhaustive-deps

  // #copilot deep-link
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const link = (e.target as HTMLElement)?.closest?.('a[href="#copilot"]');
      if (!link) return;
      e.preventDefault();
      e.stopPropagation();
      setOpen(true);
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [setOpen]);

  // Keyboard: Ctrl/Cmd+K toggle, Escape close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(!open);
        if (!open) inputFocusTrigger.current = true;
      }
      if (e.key === 'Escape' && open) setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, setOpen]);

  if (!enabled) return null;

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    setSoundEnabled(!next);
    if (!next) playClick();
  };

  const handleRun = (a: QuickAction) => {
    if (a.action === 'open-page') {
      const target = PAGE_TO_TAB[String(a.arg || '')];
      if (target) { openTab(target.id, target.title); return; }
    }
    if (a.action === 'start-wizard') setRightPanel('wizard');
    runAction(a);
  };

  const handleExplainFinding = (f: CopilotFinding) => {
    if (f.field) explainField(f.field);
    else ask(`Explain the validation rule ${f.rule}`);
    setRightPanel(null);
  };

  const submit = () => {
    const q = input.trim();
    if (!q) return;
    setInput('');
    setRightPanel(null);
    ask(q);
  };

  const findings = guidance?.findings ? sortFindings(guidance.findings) : [];
  const errorCount = findings.filter(f => f.severity === 'error').length;
  const learnedCount = (score?.runtimeLearning?.shapeCorrections ?? 0)
    + (score?.runtimeLearning?.intentExemplars ?? 0);

  return (
    <>
      {/* ── Launcher orb — only visible when the overlay is closed ─────────── */}
      <AnimatePresence>
        {!open && (
          <motion.button
            initial={{ opacity: 0, scale: 0.6, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.6, y: 20 }}
            transition={{ type: 'spring', damping: 18, stiffness: 300 }}
            whileHover={{ scale: 1.07 }} whileTap={{ scale: 0.94 }}
            onMouseEnter={playHover} onClick={toggle}
            title="AI Operations Copilot (Beta) — Ctrl+K"
            aria-label="Open the AI Operations Copilot"
            className="lq-glass lq-rim fixed bottom-5 right-5 z-[70] flex items-center gap-2.5 pl-2 pr-3.5 py-2 rounded-full">
            <span className="lq-orb relative flex items-center justify-center w-7 h-7 rounded-full shrink-0">
              <SparkIcon className="w-3.5 h-3.5 text-white/95" />
              <span className="lq-halo" />
            </span>
            <span className="text-[11px] font-bold lq-title">Copilot</span>
            <BetaBadge />
            {badge > 0 && (
              <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }}
                transition={{ type: 'spring', damping: 12, stiffness: 400 }}
                className="absolute -top-1 -right-1 min-w-[17px] h-[17px] px-1 rounded-full
                  flex items-center justify-center text-[9px] font-black text-white"
                style={{ background: 'linear-gradient(135deg,#f87171,#ef4444)', boxShadow: '0 0 12px rgba(239,68,68,0.6)' }}>
                {badge > 9 ? '9+' : badge}
              </motion.span>
            )}
          </motion.button>
        )}
      </AnimatePresence>

      {/* ── Full-canvas overlay ─────────────────────────────────────────────── */}
      <AnimatePresence>
        {open && (
          <>
            {/* Backdrop — blurs the app behind, but doesn't block reading it */}
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.22 }}
              className="fixed inset-0 z-[68]"
              style={{ background: 'rgba(1,4,10,0.72)', backdropFilter: 'blur(6px)' }}
              onClick={() => setOpen(false)}
            />

            {/* Canvas — takes the full viewport, layered above the backdrop */}
            <motion.div
              initial={{ opacity: 0, scale: 0.97, y: 14 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: 8 }}
              transition={{ type: 'spring', damping: 32, stiffness: 260 }}
              className="fixed inset-4 z-[69] lq-glass lq-rim lq-specular flex overflow-hidden"
              style={{ borderRadius: 24 }}
              role="dialog" aria-label="AI Operations Copilot" aria-modal="true">

              {/* ── Sidebar ─────────────────────────────────────────────────── */}
              <div className="hidden md:flex">
                <Sidebar
                  rightPanel={rightPanel} setRightPanel={setRightPanel}
                  errorCount={errorCount} learnedCount={learnedCount}
                  score={score} onClose={() => setOpen(false)}
                  onClear={reset} muted={muted} onToggleMute={toggleMute}
                />
              </div>

              {/* ── Main canvas ─────────────────────────────────────────────── */}
              <div className="lq-aurora flex flex-col flex-1 min-w-0 min-h-0">
                {/* Mobile header (replaces sidebar on small screens) */}
                <div className="flex md:hidden items-center gap-2.5 px-4 py-3 shrink-0"
                  style={{ borderBottom: '1px solid rgba(148,163,184,0.10)' }}>
                  <span className="lq-orb flex items-center justify-center w-7 h-7 rounded-xl shrink-0">
                    <SparkIcon className="w-3.5 h-3.5 text-white/95" />
                  </span>
                  <span className="text-[12px] font-bold lq-title flex-1">Copilot</span>
                  <BetaBadge />
                  <button onMouseEnter={playHover} onClick={() => setOpen(false)} aria-label="Close"
                    className="text-slate-500 hover:text-slate-200 transition-colors p-1">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                {!connected ? (
                  <NotConnected />
                ) : (
                  <>
                    {/* Message area */}
                    <div ref={scrollRef} className="flex-1 min-h-0 overflow-auto lq-scroll relative z-10">
                      <div className="max-w-3xl mx-auto w-full px-4 py-6 space-y-6">
                        {messages.length === 0 ? (
                          <Greeting username={username} guidance={guidance} score={score} onAsk={(q) => { setInput(''); ask(q); }} />
                        ) : (
                          messages.map(m => (
                            <Message key={m.id} msg={m} onRun={handleRun} onExplainFinding={handleExplainFinding} />
                          ))
                        )}
                      </div>
                    </div>

                    {/* Input bar — always at the bottom of the canvas */}
                    <div className="max-w-3xl mx-auto w-full relative z-10">
                      <InputBar value={input} onChange={setInput} onSubmit={submit}
                        disabled={thinking} thinking={thinking} />
                    </div>
                  </>
                )}
              </div>

              {/* ── Right panel (Guidance / Wizard) ──────────────────────────── */}
              <AnimatePresence>
                {rightPanel && (
                  <motion.div
                    initial={{ width: 0, opacity: 0 }} animate={{ width: 320, opacity: 1 }}
                    exit={{ width: 0, opacity: 0 }}
                    transition={{ type: 'spring', damping: 30, stiffness: 280 }}
                    className="flex flex-col shrink-0 overflow-hidden"
                    style={{ borderLeft: '1px solid rgba(148,163,184,0.10)' }}>
                    {/* Panel header */}
                    <div className="px-4 py-3 flex items-center gap-2 shrink-0"
                      style={{ borderBottom: '1px solid rgba(148,163,184,0.08)' }}>
                      <span className="text-[11px] font-bold text-slate-300 flex-1 capitalize">
                        {rightPanel === 'wizard' ? '🏗️ Build a job' : '🔍 Guidance'}
                      </span>
                      {rightPanel === 'guidance' && (
                        <button onMouseEnter={playHover} onClick={() => loadGuidance()}
                          className="text-[9px] text-slate-600 hover:text-cyan-300 transition-colors mr-1">
                          {guidanceLoading ? '…' : 'Refresh'}
                        </button>
                      )}
                      <button onMouseEnter={playHover} onClick={() => setRightPanel(null)}
                        aria-label="Close panel" className="text-slate-600 hover:text-slate-200 transition-colors">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                    <RightPanelContent
                      panel={rightPanel} findings={findings} guidance={guidance}
                      onExplainFinding={handleExplainFinding} onRun={handleRun}
                      onRefresh={() => loadGuidance()} />
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
