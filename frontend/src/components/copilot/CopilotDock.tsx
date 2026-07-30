'use client';
/**
 * AI Operations Copilot (Beta) — the dock.
 *
 * Mounted once at the workspace level, so it is available on every page. It is
 * deliberately non-intrusive: a small launcher in the corner, collapsed by
 * default, that badges itself when the current work has blocking problems
 * rather than interrupting.
 */
import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useCopilotStore, sortFindings } from '@/store/useCopilotStore';
import { useConnectionStore } from '@/store/useConnectionStore';
import { useWorkspaceStore, AutomationId } from '@/store/useWorkspaceStore';
import { CopilotFinding, CopilotMessage, QuickAction } from '@/types/copilot';
import CopilotMarkdown from './CopilotMarkdown';
import InlineAssistant from './InlineAssistant';

type Tab = 'chat' | 'guidance' | 'wizard';

const SEVERITY: Record<string, { color: string; bg: string; border: string; label: string }> = {
  error: { color: '#f87171', bg: 'rgba(239,68,68,0.07)', border: 'rgba(239,68,68,0.2)', label: 'ERROR' },
  warning: { color: '#fbbf24', bg: 'rgba(245,158,11,0.07)', border: 'rgba(245,158,11,0.2)', label: 'WARN' },
  info: { color: '#67e8f9', bg: 'rgba(6,182,212,0.05)', border: 'rgba(6,182,212,0.15)', label: 'INFO' },
  success: { color: '#4ade80', bg: 'rgba(34,197,94,0.07)', border: 'rgba(34,197,94,0.2)', label: 'OK' },
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

// ── Pieces ───────────────────────────────────────────────────────────────────

function BetaBadge() {
  return (
    <span
      className="text-[8px] font-black px-1.5 py-[2px] rounded uppercase tracking-widest shrink-0"
      style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)', color: '#fbbf24' }}
    >
      Beta
    </span>
  );
}

function FindingCard({ f, onExplain }: { f: CopilotFinding; onExplain: (f: CopilotFinding) => void }) {
  const s = SEVERITY[f.severity] || SEVERITY.info;
  return (
    <div className="rounded-md px-2.5 py-2 space-y-1" style={{ background: s.bg, border: `1px solid ${s.border}` }}>
      <div className="flex items-center gap-1.5">
        <span className="text-[8px] font-black tracking-wider" style={{ color: s.color }}>{s.label}</span>
        <span className="text-[10px] font-bold text-slate-300 truncate">{f.subject}</span>
        {f.row !== undefined && <span className="text-[9px] font-mono text-slate-600">row {f.row}</span>}
      </div>
      <p className="text-[10px] text-slate-400 leading-relaxed">{f.message}</p>
      {f.fix && <p className="text-[10px] text-slate-500 leading-relaxed">Fix: {f.fix}</p>}
      <button
        onClick={() => onExplain(f)}
        className="text-[9px] text-cyan-500/70 hover:text-cyan-300 transition-colors font-mono"
      >
        rule: {f.rule} — explain
      </button>
    </div>
  );
}

function ActionChips({ actions, onRun }: { actions: QuickAction[]; onRun: (a: QuickAction) => void }) {
  if (!actions?.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {actions.map((a, i) => (
        <button
          key={`${a.action}-${i}`}
          onClick={() => onRun(a)}
          className="px-2 py-1 rounded-md text-[9px] font-bold transition-all text-left"
          style={{ background: 'rgba(6,182,212,0.06)', border: '1px solid rgba(6,182,212,0.18)', color: '#67e8f9' }}
        >
          {a.label}
        </button>
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
      <div className="flex justify-end">
        <div className="max-w-[85%] px-2.5 py-1.5 rounded-lg rounded-br-sm text-[11px] text-slate-200"
          style={{ background: 'rgba(6,182,212,0.1)', border: '1px solid rgba(6,182,212,0.2)' }}>
          {msg.content}
        </div>
      </div>
    );
  }

  if (msg.pending) {
    return (
      <div className="flex items-center gap-1.5 text-[10px] text-slate-600">
        {[0, 1, 2].map(i => (
          <motion.span
            key={i}
            className="w-1.5 h-1.5 rounded-full"
            style={{ background: '#06b6d4' }}
            animate={{ opacity: [0.25, 1, 0.25] }}
            transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.18 }}
          />
        ))}
        <span className="ml-1">Thinking…</span>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="rounded-lg rounded-bl-sm px-2.5 py-2"
        style={{ background: 'rgba(6,15,30,0.55)', border: '1px solid rgba(51,65,85,0.15)' }}>
        <CopilotMarkdown text={msg.content} />

        {msg.findings && msg.findings.length > 0 && (
          <div className="mt-2 space-y-1.5">
            {sortFindings(msg.findings).slice(0, 6).map(f => (
              <FindingCard key={f.id} f={f} onExplain={onExplainFinding} />
            ))}
            {msg.findings.length > 6 && (
              <p className="text-[9px] text-slate-600">+{msg.findings.length - 6} more in the Guidance tab</p>
            )}
          </div>
        )}

        {msg.actions && <ActionChips actions={msg.actions} onRun={onRun} />}

        {/* Provenance — every answer says where it came from. */}
        <div className="flex items-center gap-1.5 flex-wrap mt-2 pt-1.5" style={{ borderTop: '1px solid rgba(51,65,85,0.1)' }}>
          <span className="text-[8px] font-mono uppercase tracking-wider"
            style={{ color: msg.outOfScope ? '#94a3b8' : msg.mode === 'llm' ? '#a78bfa' : '#4ade80' }}>
            {msg.outOfScope ? 'not in knowledge base' : msg.mode === 'llm' ? 'model-phrased, app-grounded' : 'app knowledge'}
          </span>
          {msg.citations?.slice(0, 3).map(c => (
            <span key={c.id} className="text-[8px] font-mono text-slate-700" title={c.source || c.id}>
              {c.id}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Dock ─────────────────────────────────────────────────────────────────────

export default function CopilotDock() {
  const {
    enabled, health, checkHealth, open, setOpen, toggle, badge,
    messages, thinking, ask, runAction, guidance, loadGuidance, guidanceLoading,
    context, wizardOpen, wizard, closeWizard, explainField, reset,
  } = useCopilotStore();
  const { connected } = useConnectionStore();
  const { openTab } = useWorkspaceStore();

  const [tab, setTab] = useState<Tab>('chat');
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { checkHealth(); }, [checkHealth]);

  // Follow the wizard when it starts from a quick action elsewhere.
  useEffect(() => { if (wizardOpen) setTab('wizard'); }, [wizardOpen]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, thinking]);

  useEffect(() => {
    if (open && connected) loadGuidance();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, connected, context.page]);

  // The Copilot appears in the automation catalogue with route '#copilot'.
  // Intercept that link anywhere in the app and open the dock instead of
  // navigating, since the Copilot is a dock rather than a page.
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

  // Keyboard: Ctrl/Cmd+K opens the Copilot, Escape closes it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(!open);
        if (!open) setTimeout(() => inputRef.current?.focus(), 120);
      }
      if (e.key === 'Escape' && open) setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, setOpen]);

  if (!enabled) return null;

  const handleRun = (a: QuickAction) => {
    if (a.action === 'open-page') {
      const target = PAGE_TO_TAB[String(a.arg || '')];
      if (target) { openTab(target.id, target.title); return; }
    }
    if (a.action === 'start-wizard') { setTab('wizard'); }
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

  return (
    <>
      {/* ── Launcher ───────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {!open && (
          <motion.button
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.85 }}
            onClick={toggle}
            title="AI Operations Copilot (Beta) — Ctrl+K"
            className="fixed bottom-5 right-5 z-[70] flex items-center gap-2 pl-2.5 pr-3 py-2 rounded-full group"
            style={{
              background: 'rgba(6,15,30,0.92)',
              backdropFilter: 'blur(12px)',
              border: '1px solid rgba(6,182,212,0.25)',
              boxShadow: '0 8px 32px rgba(0,0,0,0.5), 0 0 24px rgba(6,182,212,0.08)',
            }}
          >
            <span className="relative flex items-center justify-center w-6 h-6 rounded-full shrink-0"
              style={{ background: 'linear-gradient(135deg, rgba(6,182,212,0.2), rgba(139,92,246,0.2))' }}>
              <svg className="w-3.5 h-3.5 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
              <motion.span
                className="absolute inset-0 rounded-full"
                style={{ border: '1px solid rgba(6,182,212,0.35)' }}
                animate={{ scale: [1, 1.35], opacity: [0.6, 0] }}
                transition={{ duration: 2.2, repeat: Infinity, ease: 'easeOut' }}
              />
            </span>
            <span className="text-[10px] font-bold text-slate-300 group-hover:text-cyan-300 transition-colors">
              Copilot
            </span>
            <BetaBadge />
            {badge > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full flex items-center justify-center text-[9px] font-black text-white"
                style={{ background: '#ef4444', boxShadow: '0 0 10px rgba(239,68,68,0.5)' }}>
                {badge > 9 ? '9+' : badge}
              </span>
            )}
          </motion.button>
        )}
      </AnimatePresence>

      {/* ── Panel ──────────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {open && (
          <motion.aside
            initial={{ opacity: 0, x: 24, scale: 0.98 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 24, scale: 0.98 }}
            transition={{ type: 'spring', damping: 26, stiffness: 300 }}
            className="fixed bottom-5 right-5 z-[70] flex flex-col rounded-xl overflow-hidden"
            style={{
              width: 'min(420px, calc(100vw - 2.5rem))',
              height: 'min(640px, calc(100vh - 6rem))',
              background: 'rgba(2,8,18,0.97)',
              backdropFilter: 'blur(20px)',
              border: '1px solid rgba(6,182,212,0.18)',
              boxShadow: '0 24px 64px rgba(0,0,0,0.65)',
            }}
          >
            {/* Header */}
            <div className="px-3.5 py-2.5 flex items-center gap-2 shrink-0"
              style={{ borderBottom: '1px solid rgba(51,65,85,0.15)', background: 'rgba(6,15,30,0.5)' }}>
              <svg className="w-4 h-4 text-cyan-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-bold text-slate-200 truncate">AI Operations Copilot</span>
                  <BetaBadge />
                </div>
                <p className="text-[9px] text-slate-600 font-mono truncate">
                  {context.page}{context.step ? ` · ${context.step}` : ''}
                  {health?.model.mode === 'llm' ? ` · ${health.model.provider}` : ' · app knowledge'}
                </p>
              </div>
              <button onClick={reset} title="Clear the conversation"
                className="text-[9px] text-slate-700 hover:text-slate-400 transition-colors">
                Clear
              </button>
              <button onClick={() => setOpen(false)} className="text-slate-600 hover:text-slate-300 transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Tabs */}
            <div className="flex items-center gap-0.5 px-2 pt-2 shrink-0">
              {([
                ['chat', 'Ask'],
                ['guidance', errorCount > 0 ? `Guidance (${errorCount})` : 'Guidance'],
                ['wizard', 'Build a job'],
              ] as [Tab, string][]).map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => { setTab(id); if (id === 'wizard' && !wizardOpen) wizard('start'); }}
                  className="px-2.5 py-1.5 rounded-t-md text-[10px] font-bold transition-all"
                  style={tab === id
                    ? { background: 'rgba(6,182,212,0.08)', color: '#67e8f9', borderBottom: '1px solid #06b6d4' }
                    : { color: '#475569' }}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Not connected */}
            {!connected ? (
              <div className="flex-1 flex flex-col items-center justify-center px-6 text-center gap-3">
                <svg className="w-8 h-8 text-slate-800" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  Connect to a UAC environment and I will pick up your session context — the file you upload, the payloads
                  you generate and the results you get.
                </p>
                <p className="text-[9px] text-slate-700">
                  I never see your token. It stays server-side.
                </p>
              </div>
            ) : (
              <>
                {/* ── Ask ──────────────────────────────────────────────────── */}
                {tab === 'chat' && (
                  <>
                    <div ref={scrollRef} className="flex-1 overflow-auto custom-scroll px-3.5 py-3 space-y-2.5">
                      {messages.length === 0 ? (
                        <div className="space-y-3">
                          <p className="text-[11px] text-slate-400 leading-relaxed">
                            {guidance?.headline || 'Ask me anything about this application or what you are working on.'}
                          </p>
                          <div className="space-y-1.5">
                            <p className="text-[9px] font-bold text-slate-600 uppercase tracking-widest">Try asking</p>
                            {(guidance?.prompts || ['What can you do?', 'What columns are required?', 'How do I create jobs from a spreadsheet?']).map(p => (
                              <button key={p} onClick={() => ask(p)}
                                className="block w-full text-left px-2.5 py-1.5 rounded-md text-[10px] text-slate-400 hover:text-cyan-300 transition-all"
                                style={{ background: 'rgba(6,15,30,0.5)', border: '1px solid rgba(51,65,85,0.15)' }}>
                                {p}
                              </button>
                            ))}
                          </div>
                          <p className="text-[9px] text-slate-700 leading-relaxed pt-1">
                            I answer only from this application&apos;s knowledge and your current session. If something is
                            outside that, I will say so rather than guess.
                          </p>
                        </div>
                      ) : (
                        messages.map(m => (
                          <Message key={m.id} msg={m} onRun={handleRun} onExplainFinding={handleExplainFinding} />
                        ))
                      )}
                    </div>

                    <div className="px-3 py-2.5 shrink-0" style={{ borderTop: '1px solid rgba(51,65,85,0.15)' }}>
                      <div className="flex gap-2">
                        <input
                          ref={inputRef}
                          value={input}
                          onChange={e => setInput(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); submit(); } }}
                          placeholder="Ask about a field, a schedule, an error…"
                          disabled={thinking}
                          className="flex-1 px-2.5 py-2 rounded-md text-[11px] text-slate-200 outline-none disabled:opacity-50"
                          style={{ background: 'rgba(2,8,18,0.7)', border: '1px solid rgba(51,65,85,0.25)' }}
                        />
                        <button onClick={submit} disabled={thinking || !input.trim()}
                          className="btn-primary px-3 py-2 rounded-md text-[10px] disabled:opacity-40">
                          Ask
                        </button>
                      </div>
                    </div>
                  </>
                )}

                {/* ── Guidance ─────────────────────────────────────────────── */}
                {tab === 'guidance' && (
                  <div className="flex-1 overflow-auto custom-scroll px-3.5 py-3 space-y-3">
                    {guidanceLoading && !guidance ? (
                      <p className="text-[10px] text-slate-600">Reading your session…</p>
                    ) : (
                      <>
                        <p className="text-[11px] text-slate-300 leading-relaxed">{guidance?.headline}</p>

                        {guidance?.tips && guidance.tips.length > 0 && (
                          <div className="space-y-1.5">
                            <p className="text-[9px] font-bold text-slate-600 uppercase tracking-widest">
                              For what you are doing now
                            </p>
                            {guidance.tips.map((t, i) => (
                              <div key={i} className="text-[10px] text-slate-400 leading-relaxed pl-2"
                                style={{ borderLeft: '2px solid rgba(6,182,212,0.2)' }}>
                                <CopilotMarkdown text={t} />
                              </div>
                            ))}
                          </div>
                        )}

                        {findings.length > 0 && (
                          <div className="space-y-1.5">
                            <p className="text-[9px] font-bold text-slate-600 uppercase tracking-widest">
                              Findings in your current work ({findings.length})
                            </p>
                            {findings.slice(0, 25).map(f => (
                              <FindingCard key={f.id} f={f} onExplain={handleExplainFinding} />
                            ))}
                          </div>
                        )}

                        <ActionChips actions={guidance?.actions || []} onRun={handleRun} />

                        <button onClick={() => loadGuidance()}
                          className="text-[9px] text-slate-600 hover:text-cyan-400 transition-colors">
                          Refresh
                        </button>
                      </>
                    )}
                  </div>
                )}

                {/* ── Inline Assistant ─────────────────────────────────────── */}
                {tab === 'wizard' && (
                  <div className="flex-1 min-h-0">
                    <InlineAssistant />
                  </div>
                )}
              </>
            )}

            {/* Beta footer — states the roadmap commitment explicitly. */}
            <div className="px-3.5 py-2 shrink-0 flex items-start gap-1.5"
              style={{ borderTop: '1px solid rgba(51,65,85,0.15)', background: 'rgba(245,158,11,0.03)' }}>
              <svg className="w-3 h-3 shrink-0 mt-[1px]" style={{ color: '#fbbf24' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-[8.5px] text-slate-600 leading-snug">
                <span className="font-bold text-amber-500/80">Beta.</span> A future release adds Microsoft Teams
                integration, so the Copilot can be reached from Teams with the same contextual guidance available here.
              </p>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
    </>
  );
}
