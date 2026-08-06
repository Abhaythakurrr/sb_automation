'use client';
/**
 * Copilot — the workspace canvas.
 *
 * This is a tab, not a dialog. It gets the same real estate as Job Creation or
 * Monitoring, stays mounted when you switch away, and never covers what you were
 * reading. The earlier build was a full-screen modal with a backdrop, which meant
 * the Copilot could not be consulted *while* working — the one thing an assistant
 * has to be able to do.
 *
 *   ┌── rail ──┬──────────── conversation ─────────────┬── work ──┐
 *   │ Ask      │  greeting → messages → live trace     │ findings │
 *   │ Checks   │                                       │ or the   │
 *   │ Build    │  ─────────────────────────────────    │ job      │
 *   │          │  composer                             │ builder  │
 *   └──────────┴───────────────────────────────────────┴──────────┘
 *
 * The right column is only opened when there is something in it, so a plain
 * conversation gets the full width.
 */
import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useCopilotStore, sortFindings } from '@/store/useCopilotStore';
import { useConnectionStore } from '@/store/useConnectionStore';
import { useWorkspaceStore, AutomationId } from '@/store/useWorkspaceStore';
import { CopilotFinding, QuickAction } from '@/types/copilot';
import { playHover, playWhoosh, setSoundEnabled, isSoundEnabled } from '@/utils/soundEffects';
import CopilotMarkdown from './CopilotMarkdown';
import InlineAssistant from './InlineAssistant';
import {
  ActionChips, BetaBadge, BuildIcon, ChatIcon, CloseIcon, FindingChip, Greeting,
  InputBar, Message, NotConnected, ShieldIcon, SoundOffIcon, SoundOnIcon,
  SparkIcon, TrashIcon, spring,
} from './CopilotParts';

type Panel = 'checks' | 'build' | null;

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

// ── Left rail ─────────────────────────────────────────────────────────────────

function RailButton({ icon, label, active, count, onClick }: {
  icon: React.ReactNode; label: string; active: boolean;
  count?: number; onClick: () => void;
}) {
  return (
    <button onMouseEnter={playHover} onClick={onClick}
      aria-pressed={active}
      className="relative flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-[13px] font-medium text-left transition-colors"
      style={active
        ? { background: 'rgba(34,211,238,0.10)', border: '1px solid rgba(34,211,238,0.26)', color: '#cffafe' }
        : { background: 'transparent', border: '1px solid transparent', color: '#8fa0b8' }}>
      <span className={active ? 'text-cyan-300' : 'text-slate-500'}>{icon}</span>
      <span className="truncate flex-1">{label}</span>
      {count !== undefined && count > 0 && (
        <span className="text-[11px] font-bold px-1.5 py-[1px] rounded-full shrink-0"
          style={{ background: 'rgba(239,68,68,0.18)', color: '#fca5a5' }}>
          {count}
        </span>
      )}
    </button>
  );
}

function Rail({ panel, setPanel, errorCount, learned, guardCases, muted, onToggleMute, onClear, hasMessages }: {
  panel: Panel;
  setPanel: (p: Panel) => void;
  errorCount: number;
  learned: number;
  guardCases: number;
  muted: boolean;
  onToggleMute: () => void;
  onClear: () => void;
  hasMessages: boolean;
}) {
  return (
    <aside className="hidden lg:flex flex-col shrink-0 py-5 px-3 gap-1.5"
      style={{ width: 232, borderRight: '1px solid rgba(148,163,184,0.10)' }}>
      <div className="flex items-center gap-3 px-2 mb-4">
        <span className="lq-orb relative flex items-center justify-center w-9 h-9 rounded-xl shrink-0">
          <SparkIcon className="w-4.5 h-4.5 text-white/95" />
        </span>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[15px] font-semibold lq-title leading-tight">Copilot</span>
            <BetaBadge />
          </div>
          <p className="text-[11px] text-slate-500 mt-0.5">runs on this server</p>
        </div>
      </div>

      <RailButton icon={<ChatIcon className="w-4 h-4" />} label="Ask"
        active={panel === null} onClick={() => { playWhoosh(); setPanel(null); }} />
      <RailButton icon={<ShieldIcon className="w-4 h-4" />} label="Checks" count={errorCount}
        active={panel === 'checks'} onClick={() => { playWhoosh(); setPanel(panel === 'checks' ? null : 'checks'); }} />
      <RailButton icon={<BuildIcon className="w-4 h-4" />} label="Build a job"
        active={panel === 'build'} onClick={() => { playWhoosh(); setPanel(panel === 'build' ? null : 'build'); }} />

      <div className="mt-auto space-y-2.5">
        {learned > 0 && (
          <div className="px-3 py-2.5 rounded-xl"
            style={{ background: 'rgba(16,185,129,0.07)', border: '1px solid rgba(16,185,129,0.18)' }}>
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: '#6ee7b7' }} />
              <span className="text-xs font-semibold" style={{ color: '#6ee7b7' }}>
                {learned} correction{learned === 1 ? '' : 's'} learned
              </span>
            </div>
            {guardCases > 0 && (
              <p className="text-[11px] text-slate-500 mt-1 leading-snug">
                Each one checked against {guardCases} schedules it already reads correctly.
              </p>
            )}
          </div>
        )}

        <div className="flex items-center gap-1">
          <button onMouseEnter={playHover} onClick={onToggleMute}
            title={muted ? 'Turn sound on' : 'Turn sound off'}
            aria-label={muted ? 'Turn sound on' : 'Turn sound off'}
            className="p-2 rounded-lg text-slate-500 hover:text-cyan-300 transition-colors">
            {muted ? <SoundOffIcon className="w-4 h-4" /> : <SoundOnIcon className="w-4 h-4" />}
          </button>
          {hasMessages && (
            <button onMouseEnter={playHover} onClick={onClear}
              title="Clear the conversation" aria-label="Clear the conversation"
              className="p-2 rounded-lg text-slate-500 hover:text-slate-300 transition-colors flex items-center gap-1.5">
              <TrashIcon className="w-4 h-4" />
              <span className="text-xs">Clear</span>
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}

// ── Right column ──────────────────────────────────────────────────────────────

function WorkPanel({ panel, findings, guidance, onClose, onExplainFinding, onRun, onRefresh, loading }: {
  panel: Panel;
  findings: CopilotFinding[];
  guidance: any;
  onClose: () => void;
  onExplainFinding: (f: CopilotFinding) => void;
  onRun: (a: QuickAction) => void;
  onRefresh: () => void;
  loading: boolean;
}) {
  const title = panel === 'build' ? 'Build a job' : 'Checks on your work';

  return (
    <motion.section
      initial={{ width: 0, opacity: 0 }}
      animate={{ width: panel === 'build' ? 460 : 380, opacity: 1 }}
      exit={{ width: 0, opacity: 0 }}
      transition={{ type: 'spring', damping: 30, stiffness: 260 }}
      className="flex flex-col shrink-0 overflow-hidden"
      style={{ borderLeft: '1px solid rgba(148,163,184,0.10)' }}
      aria-label={title}>
      <header className="flex items-center gap-2 px-4 py-3.5 shrink-0"
        style={{ borderBottom: '1px solid rgba(148,163,184,0.08)' }}>
        <span className="text-[13px] font-semibold text-slate-200 flex-1">{title}</span>
        {panel === 'checks' && (
          <button onMouseEnter={playHover} onClick={onRefresh}
            className="text-[11px] text-slate-500 hover:text-cyan-300 transition-colors">
            {loading ? 'Checking…' : 'Re-check'}
          </button>
        )}
        <button onMouseEnter={playHover} onClick={onClose}
          aria-label="Close panel"
          className="text-slate-500 hover:text-slate-200 transition-colors p-1">
          <CloseIcon className="w-4 h-4" />
        </button>
      </header>

      {panel === 'build' ? (
        <div className="flex-1 min-h-0 overflow-auto lq-scroll">
          <InlineAssistant />
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-auto lq-scroll px-4 py-4 space-y-5">
          {guidance?.headline && (
            <p className="text-[13px] text-slate-300 leading-relaxed">{guidance.headline}</p>
          )}

          {guidance?.tips?.length > 0 && (
            <div className="space-y-2.5">
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                Where you are now
              </p>
              {guidance.tips.map((t: string, i: number) => (
                <div key={i} className="text-xs text-slate-400 leading-relaxed pl-3"
                  style={{ borderLeft: '2px solid rgba(34,211,238,0.28)' }}>
                  <CopilotMarkdown text={t} />
                </div>
              ))}
            </div>
          )}

          {findings.length > 0 ? (
            <div className="space-y-2.5">
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                {findings.length} finding{findings.length === 1 ? '' : 's'}
              </p>
              {findings.slice(0, 40).map(f => (
                <FindingChip key={f.id} f={f} onExplain={onExplainFinding} />
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-500 leading-relaxed">
              Nothing flagged in what you are working on right now. Upload a file or build a job
              and I will check it as you go.
            </p>
          )}

          {guidance?.actions?.length > 0 && <ActionChips actions={guidance.actions} onRun={onRun} />}
        </div>
      )}
    </motion.section>
  );
}

// ── Canvas ────────────────────────────────────────────────────────────────────

export default function CopilotCanvas() {
  const {
    enabled, checkHealth, messages, thinking, liveStages, ask, runAction,
    guidance, loadGuidance, guidanceLoading, context, wizardOpen, wizard,
    explainField, reset, score, loadScore,
  } = useCopilotStore();
  const { connected, environment, username } = useConnectionStore();
  const { openTab } = useWorkspaceStore();

  const [panel, setPanel] = useState<Panel>(null);
  const [input, setInput] = useState('');
  const [muted, setMuted] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => { checkHealth(); }, [checkHealth]);
  useEffect(() => { setMuted(!isSoundEnabled()); }, []);
  useEffect(() => { if (wizardOpen) setPanel('build'); }, [wizardOpen]);

  useEffect(() => {
    if (connected) { loadGuidance(); loadScore(); }
  }, [connected, context.page]); // eslint-disable-line react-hooks/exhaustive-deps

  // Follow the conversation as it grows, including while stages stream in.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, liveStages]);

  if (!enabled) return null;

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    setSoundEnabled(!next);
  };

  const handleRun = (a: QuickAction) => {
    if (a.action === 'open-page') {
      const target = PAGE_TO_TAB[String(a.arg || '')];
      if (target) { openTab(target.id, target.title); return; }
    }
    if (a.action === 'start-wizard') setPanel('build');
    runAction(a);
  };

  const handleExplainFinding = (f: CopilotFinding) => {
    if (f.field) explainField(f.field);
    else ask(`Explain the validation rule ${f.rule}`);
  };

  const submit = () => {
    const q = input.trim();
    if (!q) return;
    setInput('');
    ask(q);
  };

  const findings = guidance?.findings ? sortFindings(guidance.findings) : [];
  const errorCount = findings.filter(f => f.severity === 'error').length;
  const learned = (score?.runtimeLearning?.shapeCorrections ?? 0)
    + (score?.runtimeLearning?.intentExemplars ?? 0);
  const prompts = guidance?.prompts?.length ? guidance.prompts : [
    'What columns does a job upload need?',
    'Make this run every weekday at 6 am',
    'What does maxRuntime actually do?',
    'What happens if I delete this job?',
  ];

  return (
    <div className="flex" style={{ height: 'calc(100vh - 36px)', background: '#020812' }}>
      <Rail
        panel={panel} setPanel={setPanel} errorCount={errorCount}
        learned={learned} guardCases={score?.runtimeLearning?.guardCases ?? 0}
        muted={muted} onToggleMute={toggleMute} onClear={reset}
        hasMessages={messages.length > 0}
      />

      {/* Conversation */}
      <main className="lq-aurora flex flex-col flex-1 min-w-0 min-h-0">
        {!connected ? (
          <NotConnected />
        ) : (
          <>
            <div ref={scrollRef} className="flex-1 min-h-0 overflow-auto lq-scroll relative z-10">
              <div className="max-w-3xl mx-auto w-full px-6 py-8 space-y-7">
                {messages.length === 0 ? (
                  <Greeting
                    username={username} environment={environment}
                    headline={guidance?.headline} prompts={prompts}
                    onAsk={q => ask(q)}
                  />
                ) : (
                  messages.map(m => (
                    <Message key={m.id} msg={m} onRun={handleRun}
                      onExplainFinding={handleExplainFinding}
                      liveStages={m.pending ? liveStages : undefined} />
                  ))
                )}
              </div>
            </div>

            <div className="shrink-0 relative z-10 px-6 pb-6 pt-3"
              style={{ borderTop: '1px solid rgba(148,163,184,0.08)' }}>
              <div className="max-w-3xl mx-auto w-full">
                <InputBar value={input} onChange={setInput} onSubmit={submit}
                  thinking={thinking} autoFocus />
              </div>
            </div>
          </>
        )}
      </main>

      <AnimatePresence>
        {panel && (
          <WorkPanel
            panel={panel} findings={findings} guidance={guidance}
            onClose={() => setPanel(null)} onExplainFinding={handleExplainFinding}
            onRun={handleRun} onRefresh={() => loadGuidance()} loading={guidanceLoading}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
