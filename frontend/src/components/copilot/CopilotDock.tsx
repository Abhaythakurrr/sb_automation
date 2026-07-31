'use client';
/**
 * AI Operations Copilot (Beta) — the dock.
 *
 * Mounted once at the root so it is present on every page. Collapsed to a small
 * orb by default; it badges itself when the current work has blocking problems
 * rather than interrupting.
 *
 * The surface language lives in globals.css under the `lq-` prefix: translucent
 * saturated glass, an inset specular edge, a slowly rotating conic rim and soft
 * drifting aurora. Motion is spring-based and every control has audio feedback,
 * both of which can be turned off — the sound toggle is in the header and the
 * animation respects prefers-reduced-motion.
 */
import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useCopilotStore, sortFindings } from '@/store/useCopilotStore';
import { useConnectionStore } from '@/store/useConnectionStore';
import { useWorkspaceStore, AutomationId } from '@/store/useWorkspaceStore';
import { CopilotFinding, CopilotMessage, QuickAction } from '@/types/copilot';
import { playClick, playHover, playWhoosh, setSoundEnabled, isSoundEnabled } from '@/utils/soundEffects';
import CopilotMarkdown from './CopilotMarkdown';
import InlineAssistant from './InlineAssistant';

type Tab = 'chat' | 'guidance' | 'wizard';

const spring = { type: 'spring' as const, damping: 26, stiffness: 320 };

const SEV: Record<string, { color: string; bg: string; ring: string; label: string }> = {
  error:   { color: '#fca5a5', bg: 'rgba(239,68,68,0.10)',  ring: 'rgba(239,68,68,0.26)',  label: 'ERROR' },
  warning: { color: '#fcd34d', bg: 'rgba(245,158,11,0.10)', ring: 'rgba(245,158,11,0.24)', label: 'WARN' },
  info:    { color: '#7dd3fc', bg: 'rgba(56,189,248,0.08)', ring: 'rgba(56,189,248,0.20)', label: 'INFO' },
  success: { color: '#6ee7b7', bg: 'rgba(16,185,129,0.10)', ring: 'rgba(16,185,129,0.24)', label: 'OK' },
};

/** Maps Copilot page ids onto workspace tabs for the open-page action. */
const PAGE_TO_TAB: Partial<Record<string, { id: AutomationId; title: string }>> = {
  'job-creation': { id: 'job-creation', title: 'Job Creation' },
  upload: { id: 'job-creation', title: 'Job Creation' },
  preview: { id: 'job-creation', title: 'Job Creation' },
  execution: { id: 'job-creation', title: 'Job Creation' },
  monitoring: { id: 'monitoring', title: 'Monitoring' },
  'job-deletion': { id: 'job-deletion', title: 'Job Deletion' },
  recovery: { id: 'job-recovery', title: 'Job Recovery' },
  search: { id: 'search', title: 'Search & Edit' },
  'adhoc-launch': { id: 'adhoc-launch', title: 'Ad-hoc Launch' },
  'agent-control': { id: 'agent-control', title: 'Agent Control' },
  home: { id: 'home', title: 'Home' },
};

// ── Small parts ──────────────────────────────────────────────────────────────

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
    <span
      className="text-[8px] font-black px-1.5 py-[2px] rounded-md uppercase tracking-[0.12em] shrink-0"
      style={{
        background: 'linear-gradient(135deg, rgba(245,158,11,0.20), rgba(251,191,36,0.10))',
        border: '1px solid rgba(245,158,11,0.36)',
        color: '#fcd34d',
      }}
    >
      Beta
    </span>
  );
}

function FindingCard({ f, onExplain }: { f: CopilotFinding; onExplain: (f: CopilotFinding) => void }) {
  const s = SEV[f.severity] || SEV.info;
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={spring}
      className="lq-find rounded-xl px-2.5 py-2 space-y-1"
      style={{ background: s.bg, border: `1px solid ${s.ring}` }}
    >
      <div className="flex items-center gap-1.5">
        <span className="text-[8px] font-black tracking-[0.12em]" style={{ color: s.color }}>{s.label}</span>
        <span className="text-[10px] font-bold text-slate-300 truncate">{f.subject}</span>
        {f.row !== undefined && <span className="text-[9px] font-mono text-slate-600">row {f.row}</span>}
      </div>
      <p className="text-[10px] text-slate-400 leading-relaxed">{f.message}</p>
      {f.fix && <p className="text-[10px] text-slate-500 leading-relaxed">Fix: {f.fix}</p>}
      <button
        onMouseEnter={playHover}
        onClick={() => onExplain(f)}
        className="text-[9px] text-cyan-400/70 hover:text-cyan-200 transition-colors font-mono"
      >
        rule: {f.rule} — explain
      </button>
    </motion.div>
  );
}

function ActionChips({ actions, onRun }: { actions: QuickAction[]; onRun: (a: QuickAction) => void }) {
  if (!actions?.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {actions.map((a, i) => (
        <motion.button
          key={`${a.action}-${i}`}
          initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }}
          transition={{ ...spring, delay: i * 0.04 }}
          onMouseEnter={playHover}
          onClick={() => onRun(a)}
          className="lq-btn px-2 py-1 rounded-lg text-[9px] font-bold text-left"
        >
          {a.label}
        </motion.button>
      ))}
    </div>
  );
}

function Message({ msg, onRun, onExplainFinding }: {
  msg: CopilotMessage;
  onRun: (a: QuickAction) => void;
  onExplainFinding: (f: CopilotFinding) => void;
}) {
  if (msg.role === 'user') {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={spring}
        className="flex justify-end"
      >
        <div className="lq-bubble lq-bubble-user max-w-[86%] px-3 py-2 rounded-2xl rounded-br-md text-[11px] text-cyan-50">
          {msg.content}
        </div>
      </motion.div>
    );
  }

  if (msg.pending) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-2">
        <div className="flex items-center gap-1">
          {[0, 1, 2].map(i => (
            <motion.span
              key={i}
              className="w-1.5 h-1.5 rounded-full"
              style={{ background: 'linear-gradient(135deg,#22d3ee,#a78bfa)' }}
              animate={{ y: [0, -4, 0], opacity: [0.4, 1, 0.4] }}
              transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.16, ease: 'easeInOut' }}
            />
          ))}
        </div>
        <span className="lq-shimmer text-[10px] font-medium">Thinking…</span>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, filter: 'blur(5px)' }}
      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      transition={{ duration: 0.36, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="lq-bubble rounded-2xl rounded-bl-md px-3 py-2.5">
        <CopilotMarkdown text={msg.content} />

        {msg.findings && msg.findings.length > 0 && (
          <div className="mt-2 space-y-1.5">
            {sortFindings(msg.findings).slice(0, 6).map(f => (
              <FindingCard key={f.id} f={f} onExplain={onExplainFinding} />
            ))}
            {msg.findings.length > 6 && (
              <p className="text-[9px] text-slate-600">+{msg.findings.length - 6} more in Guidance</p>
            )}
          </div>
        )}

        {msg.actions && <ActionChips actions={msg.actions} onRun={onRun} />}

        {/* Provenance — every answer says where it came from. */}
        <div className="flex items-center gap-1.5 flex-wrap mt-2 pt-1.5"
          style={{ borderTop: '1px solid rgba(148,163,184,0.08)' }}>
          <span className="text-[8px] font-mono uppercase tracking-[0.1em]"
            style={{ color: msg.outOfScope ? '#94a3b8' : '#6ee7b7' }}>
            {msg.outOfScope ? 'not in knowledge base' : 'app knowledge · on-device ML'}
          </span>
          {msg.citations?.slice(0, 3).map(c => (
            <span key={c.id} className="text-[8px] font-mono text-slate-700" title={c.source || c.id}>
              {c.id}
            </span>
          ))}
        </div>
      </div>
    </motion.div>
  );
}

// ── Dock ─────────────────────────────────────────────────────────────────────

export default function CopilotDock() {
  const {
    enabled, health, checkHealth, open, setOpen, toggle, badge,
    messages, thinking, ask, runAction, guidance, loadGuidance, guidanceLoading,
    context, wizardOpen, wizard, explainField, reset,
  } = useCopilotStore();
  const { connected, environment } = useConnectionStore();
  const { openTab } = useWorkspaceStore();

  const [tab, setTab] = useState<Tab>('chat');
  const [input, setInput] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [muted, setMuted] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { checkHealth(); }, [checkHealth]);
  useEffect(() => { setMuted(!isSoundEnabled()); }, []);
  useEffect(() => { if (wizardOpen) setTab('wizard'); }, [wizardOpen]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [messages, thinking]);

  useEffect(() => {
    if (open && connected) loadGuidance();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, connected, context.page]);

  // The Copilot appears in the automation catalogue with route '#copilot'.
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

  // Ctrl/Cmd+K toggles, Escape closes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(!open);
        if (!open) setTimeout(() => inputRef.current?.focus(), 160);
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
    if (!next) playClick(); // audible confirmation only when turning sound on
  };

  const handleRun = (a: QuickAction) => {
    if (a.action === 'open-page') {
      const target = PAGE_TO_TAB[String(a.arg || '')];
      if (target) { openTab(target.id, target.title); return; }
    }
    if (a.action === 'start-wizard') setTab('wizard');
    runAction(a);
  };

  const handleExplainFinding = (f: CopilotFinding) => {
    if (f.field) explainField(f.field);
    else ask(`Explain the validation rule ${f.rule}`);
    setTab('chat');
  };

  const submit = () => {
    const q = input.trim();
    if (!q) return;
    setInput('');
    setTab('chat');
    ask(q);
  };

  const findings = guidance?.findings ? sortFindings(guidance.findings) : [];
  const errorCount = findings.filter(f => f.severity === 'error').length;

  const TABS: [Tab, string][] = [
    ['chat', 'Ask'],
    ['guidance', errorCount > 0 ? `Guidance · ${errorCount}` : 'Guidance'],
    ['wizard', 'Build a job'],
  ];

  return (
    <>
      {/* ── Launcher orb ───────────────────────────────────────────────────── */}
      <AnimatePresence>
        {!open && (
          <motion.button
            initial={{ opacity: 0, scale: 0.6, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.6, y: 20 }}
            transition={{ type: 'spring', damping: 18, stiffness: 300 }}
            whileHover={{ scale: 1.06 }}
            whileTap={{ scale: 0.94 }}
            onMouseEnter={playHover}
            onClick={toggle}
            title="AI Operations Copilot (Beta) — Ctrl+K"
            aria-label="Open the AI Operations Copilot"
            className="lq-glass lq-rim fixed bottom-5 right-5 z-[70] flex items-center gap-2.5 pl-2 pr-3.5 py-2 rounded-full"
          >
            <span className="lq-orb relative flex items-center justify-center w-7 h-7 rounded-full shrink-0">
              <SparkIcon className="w-3.5 h-3.5 text-white/95" />
              <span className="lq-halo" />
            </span>
            <span className="text-[11px] font-bold lq-title">Copilot</span>
            <BetaBadge />
            {badge > 0 && (
              <motion.span
                initial={{ scale: 0 }} animate={{ scale: 1 }}
                transition={{ type: 'spring', damping: 12, stiffness: 400 }}
                className="absolute -top-1 -right-1 min-w-[17px] h-[17px] px-1 rounded-full flex items-center justify-center text-[9px] font-black text-white"
                style={{ background: 'linear-gradient(135deg,#f87171,#ef4444)', boxShadow: '0 0 12px rgba(239,68,68,0.6)' }}
              >
                {badge > 9 ? '9+' : badge}
              </motion.span>
            )}
          </motion.button>
        )}
      </AnimatePresence>

      {/* ── Panel ──────────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {open && (
          <motion.aside
            initial={{ opacity: 0, y: 28, scale: 0.94, filter: 'blur(8px)' }}
            animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: 20, scale: 0.96, filter: 'blur(6px)' }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            className="lq-glass lq-rim lq-specular fixed bottom-5 right-5 z-[70] flex flex-col rounded-2xl overflow-hidden"
            style={{
              width: expanded ? 'min(720px, calc(100vw - 2.5rem))' : 'min(430px, calc(100vw - 2.5rem))',
              height: expanded ? 'min(820px, calc(100vh - 4rem))' : 'min(660px, calc(100vh - 6rem))',
              transition: 'width 0.4s cubic-bezier(0.22,1,0.36,1), height 0.4s cubic-bezier(0.22,1,0.36,1)',
            }}
            role="dialog"
            aria-label="AI Operations Copilot"
          >
            {/* Header */}
            <div className="px-3.5 py-3 flex items-center gap-2.5 shrink-0 relative z-10"
              style={{ borderBottom: '1px solid rgba(148,163,184,0.10)' }}>
              <span className="lq-orb relative flex items-center justify-center w-7 h-7 rounded-full shrink-0">
                <SparkIcon className="w-3.5 h-3.5 text-white/95" />
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-[12px] font-bold lq-title truncate">AI Operations Copilot</span>
                  <BetaBadge />
                </div>
                <p className="text-[9px] text-slate-500 font-mono truncate">
                  {context.page}{context.step ? ` · ${context.step}` : ''}
                  {connected && environment ? ` · ${environment}` : ''}
                  {health?.ml?.selfContained ? ' · self-contained ML' : ' · app knowledge'}
                </p>
              </div>

              {/* Sound toggle — audio is a preference, not a decision made for you. */}
              <button onMouseEnter={playHover} onClick={toggleMute}
                title={muted ? 'Turn sound on' : 'Turn sound off'}
                aria-label={muted ? 'Turn sound on' : 'Turn sound off'}
                className="text-slate-600 hover:text-cyan-300 transition-colors">
                {muted ? (
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15zM17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                  </svg>
                ) : (
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                  </svg>
                )}
              </button>

              <button onMouseEnter={playHover} onClick={() => { playWhoosh(); setExpanded(v => !v); }}
                title={expanded ? 'Shrink' : 'Expand'} aria-label={expanded ? 'Shrink panel' : 'Expand panel'}
                className="text-slate-600 hover:text-cyan-300 transition-colors hidden sm:block">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d={expanded ? 'M9 9h6v6H9z M4 4l5 5m11-5l-5 5M4 20l5-5m11 5l-5-5' : 'M4 8V4m0 0h4M4 4l5 5m11-5h-4m4 0v4m0-4l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5v-4m0 4h-4m4 0l-5-5'} />
                </svg>
              </button>

              <button onMouseEnter={playHover} onClick={reset} title="Clear the conversation"
                className="text-[9px] text-slate-600 hover:text-slate-300 transition-colors">
                Clear
              </button>
              <button onMouseEnter={playHover} onClick={() => setOpen(false)} aria-label="Close"
                className="text-slate-500 hover:text-slate-200 transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Tabs — the active pill slides between positions. */}
            <div className="flex items-center gap-1 px-3 pt-2.5 shrink-0 relative z-10">
              {TABS.map(([id, label]) => (
                <button
                  key={id}
                  onMouseEnter={playHover}
                  onClick={() => {
                    playWhoosh();
                    setTab(id);
                    if (id === 'wizard' && !wizardOpen) wizard('start');
                  }}
                  className="relative px-3 py-1.5 rounded-lg text-[10px] font-bold transition-colors"
                  style={{ color: tab === id ? '#cffafe' : '#64748b' }}
                >
                  {tab === id && (
                    <motion.span
                      layoutId="lq-tab-pill"
                      transition={spring}
                      className="absolute inset-0 rounded-lg"
                      style={{
                        background: 'linear-gradient(135deg, rgba(34,211,238,0.16), rgba(139,92,246,0.12))',
                        border: '1px solid rgba(34,211,238,0.30)',
                        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.12)',
                      }}
                    />
                  )}
                  <span className="relative">{label}</span>
                </button>
              ))}
            </div>

            {/* Body */}
            <div className="lq-aurora flex-1 min-h-0 flex flex-col">
              {!connected ? (
                <div className="flex-1 flex flex-col items-center justify-center px-8 text-center gap-3 relative z-10">
                  <motion.span
                    className="lq-orb flex items-center justify-center w-12 h-12 rounded-full"
                    animate={{ scale: [1, 1.05, 1] }}
                    transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                  >
                    <SparkIcon className="w-5 h-5 text-white/90" />
                  </motion.span>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Connect to a UAC environment and I&apos;ll pick up your session context — the file you upload, the
                    payloads generated from it, and the results you get.
                  </p>
                  <p className="text-[9px] text-slate-600">I never see your token. It stays server-side.</p>
                </div>
              ) : (
                <>
                  {/* ── Ask ──────────────────────────────────────────────── */}
                  {tab === 'chat' && (
                    <>
                      <div ref={scrollRef} className="flex-1 overflow-auto lq-scroll px-3.5 py-3.5 space-y-3 relative z-10">
                        {messages.length === 0 ? (
                          <motion.div
                            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={spring}
                            className="space-y-3.5"
                          >
                            <p className="text-[11px] text-slate-300 leading-relaxed">
                              {guidance?.headline || 'Ask me anything about this application or what you are working on.'}
                            </p>
                            <div className="space-y-1.5">
                              <p className="text-[9px] font-black text-slate-600 uppercase tracking-[0.15em]">Try asking</p>
                              {(guidance?.prompts || [
                                'What can you do?',
                                'What columns are required?',
                                'How do I create jobs from a spreadsheet?',
                              ]).map((p, i) => (
                                <motion.button
                                  key={p}
                                  initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
                                  transition={{ ...spring, delay: 0.06 + i * 0.05 }}
                                  onMouseEnter={playHover}
                                  onClick={() => ask(p)}
                                  className="lq-bubble block w-full text-left px-3 py-2 rounded-xl text-[10px] text-slate-400 hover:text-cyan-200 transition-colors"
                                >
                                  {p}
                                </motion.button>
                              ))}
                            </div>
                            <p className="text-[9px] text-slate-600 leading-relaxed pt-1">
                              I answer only from this application&apos;s knowledge and your current session. If something
                              is outside that, I&apos;ll say so rather than guess.
                            </p>
                          </motion.div>
                        ) : (
                          messages.map(m => (
                            <Message key={m.id} msg={m} onRun={handleRun} onExplainFinding={handleExplainFinding} />
                          ))
                        )}
                      </div>

                      <div className="px-3 py-3 shrink-0 relative z-10"
                        style={{ borderTop: '1px solid rgba(148,163,184,0.10)' }}>
                        <div className="flex gap-2">
                          <input
                            ref={inputRef}
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); submit(); } }}
                            placeholder="Ask about a field, a schedule, an error…"
                            disabled={thinking}
                            aria-label="Ask the Copilot"
                            className="lq-input flex-1 px-3 py-2.5 rounded-xl text-[11px] disabled:opacity-50"
                          />
                          <button onMouseEnter={playHover} onClick={submit} disabled={thinking || !input.trim()}
                            className="lq-btn px-3.5 py-2.5 rounded-xl text-[10px] font-bold">
                            Ask
                          </button>
                        </div>
                      </div>
                    </>
                  )}

                  {/* ── Guidance ─────────────────────────────────────────── */}
                  {tab === 'guidance' && (
                    <div className="flex-1 overflow-auto lq-scroll px-3.5 py-3.5 space-y-3.5 relative z-10">
                      {guidanceLoading && !guidance ? (
                        <p className="lq-shimmer text-[10px]">Reading your session…</p>
                      ) : (
                        <>
                          <p className="text-[11px] text-slate-300 leading-relaxed">{guidance?.headline}</p>

                          {guidance?.tips && guidance.tips.length > 0 && (
                            <div className="space-y-2">
                              <p className="text-[9px] font-black text-slate-600 uppercase tracking-[0.15em]">
                                For what you are doing now
                              </p>
                              {guidance.tips.map((t, i) => (
                                <motion.div
                                  key={i}
                                  initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }}
                                  transition={{ ...spring, delay: i * 0.04 }}
                                  className="text-[10px] text-slate-400 leading-relaxed pl-2.5"
                                  style={{ borderLeft: '2px solid rgba(34,211,238,0.28)' }}
                                >
                                  <CopilotMarkdown text={t} />
                                </motion.div>
                              ))}
                            </div>
                          )}

                          {findings.length > 0 && (
                            <div className="space-y-1.5">
                              <p className="text-[9px] font-black text-slate-600 uppercase tracking-[0.15em]">
                                Findings in your current work ({findings.length})
                              </p>
                              {findings.slice(0, 25).map(f => (
                                <FindingCard key={f.id} f={f} onExplain={handleExplainFinding} />
                              ))}
                            </div>
                          )}

                          <ActionChips actions={guidance?.actions || []} onRun={handleRun} />

                          <button onMouseEnter={playHover} onClick={() => loadGuidance()}
                            className="text-[9px] text-slate-600 hover:text-cyan-300 transition-colors">
                            Refresh
                          </button>
                        </>
                      )}
                    </div>
                  )}

                  {/* ── Inline Assistant ─────────────────────────────────── */}
                  {tab === 'wizard' && (
                    <div className="flex-1 min-h-0 relative z-10">
                      <InlineAssistant />
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Beta footer */}
            <div className="px-3.5 py-2 shrink-0 flex items-start gap-1.5 relative z-10"
              style={{ borderTop: '1px solid rgba(148,163,184,0.10)', background: 'rgba(245,158,11,0.035)' }}>
              <svg className="w-3 h-3 shrink-0 mt-[1px]" style={{ color: '#fcd34d' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-[8.5px] text-slate-500 leading-snug">
                <span className="font-bold text-amber-400/80">Beta.</span> A future release adds Microsoft Teams
                integration, so the Copilot can be reached from Teams with the same contextual guidance available here.
              </p>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
    </>
  );
}
