'use client';
/**
 * Inline Assistant Mode — the conversational job builder.
 *
 * One field at a time instead of a large form. Optional fields are labelled and
 * skippable; suggestions come from what the user already entered this session.
 *
 * The last step commits: it creates the task and its trigger in the connected
 * UAC environment through the same execution endpoint bulk creation uses. That
 * write is gated on three things — an explicit click, zero validation errors,
 * and a visible statement of which environment is about to be written to.
 */
import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useCopilotStore } from '@/store/useCopilotStore';
import { useConnectionStore } from '@/store/useConnectionStore';
import { CopilotFinding, WizardField } from '@/types/copilot';
import { playClick, playHover } from '@/utils/soundEffects';
import CopilotMarkdown from './CopilotMarkdown';

const SEV: Record<string, { color: string; bg: string; ring: string; label: string }> = {
  error:   { color: '#fca5a5', bg: 'rgba(239,68,68,0.10)',  ring: 'rgba(239,68,68,0.26)',  label: 'MUST FIX' },
  warning: { color: '#fcd34d', bg: 'rgba(245,158,11,0.10)', ring: 'rgba(245,158,11,0.24)', label: 'CHECK' },
  info:    { color: '#7dd3fc', bg: 'rgba(56,189,248,0.08)', ring: 'rgba(56,189,248,0.20)', label: 'FYI' },
  success: { color: '#6ee7b7', bg: 'rgba(16,185,129,0.10)', ring: 'rgba(16,185,129,0.24)', label: 'OK' },
};

const spring = { type: 'spring' as const, damping: 24, stiffness: 320 };

function FindingRow({ f }: { f: CopilotFinding }) {
  const s = SEV[f.severity] || SEV.info;
  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={spring}
      className="lq-find flex gap-2 items-start text-[10px] px-2.5 py-2 rounded-lg"
      style={{ background: s.bg, border: `1px solid ${s.ring}` }}
    >
      <span className="font-black shrink-0 tracking-wider" style={{ color: s.color }}>{s.label}</span>
      <span className="text-slate-400 leading-relaxed">
        {f.message}
        {f.fix && <span className="text-slate-500"> → {f.fix}</span>}
      </span>
    </motion.div>
  );
}

/** The question card for the current field. */
function FieldPrompt({ field, error }: { field: WizardField; error?: string }) {
  const [showHelp, setShowHelp] = useState(false);
  const pct = (field.index / field.total) * 100;

  return (
    <div className="space-y-3">
      {/* Progress */}
      <div className="flex items-center gap-2.5">
        <div className="lq-rail flex-1 h-[4px] rounded-full relative">
          <motion.div
            className="lq-rail-fill h-full rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ type: 'spring', damping: 26, stiffness: 180 }}
          />
        </div>
        <span className="text-[9px] font-mono text-slate-500 tabular-nums shrink-0">
          {field.index}<span className="text-slate-700">/{field.total}</span>
        </span>
      </div>

      {/* Question */}
      <motion.div
        key={field.key}
        initial={{ opacity: 0, y: 10, filter: 'blur(4px)' }}
        animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
        transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
        className="space-y-2"
      >
        <div className="flex items-start gap-2">
          <p className="flex-1 text-[13px] font-bold leading-snug lq-title">{field.question}</p>
          <span
            className="shrink-0 text-[8px] font-black px-1.5 py-0.5 rounded-md uppercase tracking-widest"
            style={field.required
              ? { background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.28)', color: '#fca5a5' }
              : { background: 'rgba(148,163,184,0.10)', border: '1px solid rgba(148,163,184,0.20)', color: '#94a3b8' }}
          >
            {field.required ? 'Required' : 'Optional'}
          </span>
        </div>

        {/* Inline documentation for every field */}
        <button
          onMouseEnter={playHover}
          onClick={() => { playClick(); setShowHelp(v => !v); }}
          className="flex items-center gap-1 text-[9px] text-slate-600 hover:text-cyan-300 transition-colors"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {showHelp ? 'Hide' : 'What is this?'}
        </button>

        <AnimatePresence initial={false}>
          {showHelp && (
            <motion.p
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
              className="text-[10px] text-slate-500 leading-relaxed overflow-hidden"
            >
              {field.help}
            </motion.p>
          )}
        </AnimatePresence>

        {field.examples && field.examples.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {field.examples.slice(0, 4).map(ex => (
              <span key={ex} className="text-[9px] font-mono px-1.5 py-0.5 rounded text-slate-500"
                style={{ background: 'rgba(148,163,184,0.06)', border: '1px solid rgba(148,163,184,0.10)' }}>
                {ex}
              </span>
            ))}
          </div>
        )}
      </motion.div>

      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="lq-find text-[10px] px-2.5 py-2 rounded-lg"
            style={{ background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.26)', color: '#fca5a5' }}
          >
            {error}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Live progress while the job is being written to UAC. */
function CreateProgress() {
  const { createSteps, creating, createResult, verifyChecks, verifying, verifyCreatedJob } = useCopilotStore();

  return (
    <div className="space-y-2.5">
      {creating && (
        <div className="lq-rail lq-rail-live relative h-[4px] rounded-full overflow-hidden">
          <div className="lq-rail-fill h-full w-full rounded-full opacity-60" />
        </div>
      )}

      <div className="space-y-1">
        {createSteps.map((s, i) => (
          <motion.div
            key={`${s.step}-${i}`}
            initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={spring}
            className="flex items-start gap-2 text-[10px] font-mono"
          >
            {s.status === 'success' ? (
              <span className="mt-[3px] w-3 h-3 rounded-full flex items-center justify-center shrink-0"
                style={{ background: 'rgba(16,185,129,0.18)' }}>
                <svg className="w-2 h-2 text-emerald-300" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </span>
            ) : s.status === 'error' ? (
              <span className="mt-[3px] w-3 h-3 rounded-full flex items-center justify-center shrink-0"
                style={{ background: 'rgba(239,68,68,0.18)' }}>
                <svg className="w-2 h-2 text-red-300" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </span>
            ) : (
              <motion.span
                className="mt-[3px] w-3 h-3 rounded-full border shrink-0"
                style={{ borderColor: 'rgba(34,211,238,0.6)', borderTopColor: 'transparent' }}
                animate={{ rotate: 360 }}
                transition={{ duration: 0.7, repeat: Infinity, ease: 'linear' }}
              />
            )}
            <span className="flex-1" style={{
              color: s.status === 'success' ? '#6ee7b7' : s.status === 'error' ? '#fca5a5' : '#7dd3fc',
            }}>
              {s.step}
              {s.message && <span className="block text-slate-500 mt-0.5 break-all">{s.message}</span>}
            </span>
          </motion.div>
        ))}
      </div>

      {/* Result */}
      <AnimatePresence>
        {createResult && (
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={spring}
            className="lq-find rounded-xl px-3 py-2.5 space-y-2"
            style={createResult.failed === 0
              ? { background: 'rgba(16,185,129,0.09)', border: '1px solid rgba(16,185,129,0.28)' }
              : { background: 'rgba(245,158,11,0.09)', border: '1px solid rgba(245,158,11,0.28)' }}
          >
            <p className="text-[11px] font-bold" style={{ color: createResult.failed === 0 ? '#6ee7b7' : '#fcd34d' }}>
              {createResult.failed === 0
                ? `${createResult.taskName} created in UAC.`
                : `Partly created — ${createResult.successful} succeeded, ${createResult.failed} failed.`}
            </p>
            <p className="text-[10px] text-slate-400 leading-relaxed">
              The trigger was created <b>disabled</b>, so nothing runs on a schedule yet. Verify it, check the
              qualifying times on the Job Creation page, then enable it there.
            </p>

            <div className="flex gap-2">
              <button
                onMouseEnter={playHover}
                onClick={verifyCreatedJob}
                disabled={verifying}
                className="lq-btn lq-btn-ghost px-2.5 py-1.5 rounded-lg text-[10px] font-bold"
              >
                {verifying ? 'Verifying…' : 'Verify in UAC'}
              </button>
            </div>

            {verifyChecks && (
              <div className="space-y-1 pt-1">
                {verifyChecks.map((c, i) => (
                  <div key={i} className="flex items-center gap-2 text-[10px]">
                    <span style={{ color: c.status === 'pass' ? '#6ee7b7' : c.status === 'fail' ? '#fca5a5' : '#fcd34d' }}>
                      {c.status === 'pass' ? '✓' : c.status === 'fail' ? '✕' : '!'}
                    </span>
                    <span className="text-slate-500 w-28 shrink-0">{c.field}</span>
                    <span className="text-slate-300 font-mono truncate">{c.actual ?? '—'}</span>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function InlineAssistant() {
  const {
    wizardStep, wizardBusy, wizard, closeWizard,
    creating, createResult, createError, createJob, resetCreate, createSteps,
  } = useCopilotStore();
  const { environment, username } = useConnectionStore();

  const [value, setValue] = useState('');
  const [confirmArmed, setConfirmArmed] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const field = wizardStep?.field ?? null;

  useEffect(() => {
    setValue('');
    if (field) setTimeout(() => inputRef.current?.focus(), 80);
  }, [field?.key, field?.index]);

  // Re-arming has to be explicit each time the summary changes.
  useEffect(() => { setConfirmArmed(false); }, [wizardStep?.done]);

  if (!wizardStep) {
    return (
      <div className="p-6 flex flex-col items-center justify-center gap-3 text-center">
        <p className="text-[11px] text-slate-400 leading-relaxed">
          I&apos;ll ask for one field at a time, remember everything you tell me, and create the job for you at the end.
        </p>
        <button onMouseEnter={playHover} onClick={() => wizard('start')} disabled={wizardBusy}
          className="lq-btn px-4 py-2 rounded-xl text-[11px] font-bold">
          Start the Inline Assistant
        </button>
      </div>
    );
  }

  const submit = () => { if (!wizardBusy) wizard('answer', value); };

  const done = wizardStep.done;
  const summary = wizardStep.summary;
  const errors = summary?.findings.filter(f => f.severity === 'error') ?? [];
  const warnings = summary?.findings.filter(f => f.severity === 'warning') ?? [];
  const canCreate = !!summary && errors.length === 0 && !creating && !createResult;
  const isProd = /prod/i.test(environment || '');

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-2.5 flex items-center gap-2 shrink-0"
        style={{ borderBottom: '1px solid rgba(148,163,184,0.10)' }}>
        <span className="text-[9px] font-black text-slate-500 tracking-[0.15em] uppercase">Inline Assistant</span>
        <span className="flex-1" />
        {!done && (
          <button onMouseEnter={playHover} onClick={() => wizard('back')} disabled={wizardBusy}
            className="text-[9px] text-slate-600 hover:text-slate-300 transition-colors disabled:opacity-40">
            Back
          </button>
        )}
        <button onMouseEnter={playHover} onClick={() => { wizard('cancel'); closeWizard(); }}
          className="text-[9px] text-red-400/60 hover:text-red-300 transition-colors">
          Cancel
        </button>
      </div>

      <div className="flex-1 overflow-auto lq-scroll px-4 py-3.5 space-y-3.5 relative z-10">
        {wizardStep.message && !done && (
          <div className="text-[11px] text-slate-400 leading-relaxed">
            <CopilotMarkdown text={wizardStep.message} />
          </div>
        )}

        {field && <FieldPrompt field={field} error={wizardStep.error} />}

        {/* ── Confirmation + commit ──────────────────────────────────────── */}
        {done && summary && (
          <motion.div
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={spring}
            className="space-y-3"
          >
            <div className="text-[11px] text-slate-400 leading-relaxed">
              <CopilotMarkdown text={wizardStep.message} />
            </div>

            {/* Summary table */}
            <div className="lq-glass rounded-xl overflow-hidden">
              <div className="px-3 py-2 text-[9px] font-black text-slate-500 uppercase tracking-[0.15em]"
                style={{ borderBottom: '1px solid rgba(148,163,184,0.10)' }}>
                Job summary
              </div>
              <div>
                {summary.lines.map((l, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    transition={{ delay: Math.min(i * 0.025, 0.3) }}
                    className="px-3 py-1.5 flex gap-3 items-start text-[10px]"
                    style={{ borderTop: i ? '1px solid rgba(148,163,184,0.06)' : 'none' }}
                  >
                    <span className="w-32 shrink-0 text-slate-600">{l.label}</span>
                    <span className={`flex-1 font-mono break-all ${l.value === '(skipped)' ? 'text-slate-700 italic' : 'text-slate-300'}`}>
                      {l.value}
                    </span>
                  </motion.div>
                ))}
              </div>
            </div>

            {/* Schedule read-back */}
            <div className="lq-find rounded-xl px-3 py-2.5 text-[10px]"
              style={{ background: 'rgba(56,189,248,0.07)', border: '1px solid rgba(56,189,248,0.20)' }}>
              <span className="text-slate-500">Schedule: </span>
              <span className="text-cyan-200">{summary.scheduleSummary}</span>
            </div>

            {summary.findings.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[9px] font-black text-slate-600 uppercase tracking-[0.15em]">
                  Before you create
                </p>
                {summary.findings.map(f => <FindingRow key={f.id} f={f} />)}
              </div>
            )}

            {/* ── The commit control ──────────────────────────────────────── */}
            {!createResult && (
              <div className="space-y-2">
                {errors.length > 0 ? (
                  <div className="lq-find rounded-xl px-3 py-2.5 text-[10px] leading-relaxed"
                    style={{ background: 'rgba(239,68,68,0.09)', border: '1px solid rgba(239,68,68,0.26)', color: '#fca5a5' }}>
                    {errors.length} problem(s) would make this fail in UAC, so I will not create it. Go back and fix
                    them, or cancel and start again.
                  </div>
                ) : (
                  <>
                    {/* Writing to production is stated plainly, not implied. */}
                    <div className="lq-find rounded-xl px-3 py-2.5 text-[10px] leading-relaxed"
                      style={isProd
                        ? { background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.30)', color: '#fcd34d' }
                        : { background: 'rgba(148,163,184,0.07)', border: '1px solid rgba(148,163,184,0.16)', color: '#94a3b8' }}>
                      This creates a real task and trigger in <b>{environment || 'the connected environment'}</b>
                      {username ? <> as <b>{username}</b></> : null}.
                      {isProd && <> That is a production environment.</>} The trigger is created disabled, so nothing
                      will run until you enable it.
                      {warnings.length > 0 && <> {warnings.length} warning(s) above will not block it.</>}
                    </div>

                    {!confirmArmed ? (
                      <button
                        onMouseEnter={playHover}
                        onClick={() => { playClick(); setConfirmArmed(true); }}
                        disabled={!canCreate}
                        className="lq-btn lq-btn-commit w-full px-4 py-2.5 rounded-xl text-[11px] font-bold"
                      >
                        Create this job in {environment || 'UAC'}
                      </button>
                    ) : (
                      <motion.div
                        initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                        className="flex gap-2"
                      >
                        <button
                          onMouseEnter={playHover}
                          onClick={createJob}
                          disabled={!canCreate}
                          className="lq-btn lq-btn-commit flex-1 px-3 py-2.5 rounded-xl text-[11px] font-bold"
                        >
                          {creating ? 'Creating…' : 'Yes — create it now'}
                        </button>
                        <button
                          onMouseEnter={playHover}
                          onClick={() => { playClick(); setConfirmArmed(false); }}
                          disabled={creating}
                          className="lq-btn lq-btn-ghost px-3 py-2.5 rounded-xl text-[11px] font-bold"
                        >
                          Not yet
                        </button>
                      </motion.div>
                    )}
                  </>
                )}
              </div>
            )}

            {createError && (
              <div className="lq-find rounded-xl px-3 py-2.5 text-[10px] leading-relaxed"
                style={{ background: 'rgba(239,68,68,0.09)', border: '1px solid rgba(239,68,68,0.26)', color: '#fca5a5' }}>
                {createError}
              </div>
            )}

            {(creating || createSteps.length > 0) && <CreateProgress />}

            {/* Payload remains inspectable, just no longer the only option. */}
            <details className="text-[10px] group">
              <summary className="cursor-pointer text-slate-600 hover:text-cyan-300 transition-colors list-none flex items-center gap-1">
                <svg className="w-3 h-3 transition-transform group-open:rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                Inspect the generated row and payloads
              </summary>
              <pre className="mt-2 p-2.5 rounded-lg font-mono text-[9px] text-slate-400 overflow-auto max-h-64 lq-scroll"
                style={{ background: 'rgba(2,8,18,0.7)', border: '1px solid rgba(148,163,184,0.12)' }}>
{JSON.stringify({ row: summary.row, task: summary.task, trigger: summary.trigger }, null, 2)}
              </pre>
            </details>

            <div className="flex gap-2 pt-1">
              <button onMouseEnter={playHover} onClick={() => { resetCreate(); wizard('start'); }}
                className="lq-btn flex-1 px-3 py-2 rounded-xl text-[10px] font-bold">
                Build another
              </button>
              <button onMouseEnter={playHover} onClick={closeWizard}
                className="lq-btn lq-btn-ghost px-3 py-2 rounded-xl text-[10px] font-bold">
                Done
              </button>
            </div>
          </motion.div>
        )}
      </div>

      {/* Answer input */}
      {!done && field && (
        <div className="px-4 py-3 shrink-0 space-y-2 relative z-10"
          style={{ borderTop: '1px solid rgba(148,163,184,0.10)' }}>
          {field.type === 'choice' && field.options ? (
            <div className="flex flex-wrap gap-1.5">
              {field.options.map(o => (
                <button
                  key={o.value}
                  onMouseEnter={playHover}
                  onClick={() => wizard('answer', o.value)}
                  disabled={wizardBusy}
                  className={`lq-btn ${o.value === field.suggestion ? '' : 'lq-btn-ghost'} px-2.5 py-1.5 rounded-lg text-[10px] font-bold`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          ) : (
            <div className="flex gap-2">
              <input
                ref={inputRef}
                value={value}
                onChange={e => setValue(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); submit(); } }}
                placeholder={field.suggestion
                  ? `${field.suggestion} — press Enter to accept`
                  : field.required ? 'Your answer…' : 'Press Enter to skip'}
                disabled={wizardBusy}
                className="lq-input flex-1 px-3 py-2 rounded-lg text-[11px] disabled:opacity-40"
              />
              <button onMouseEnter={playHover} onClick={submit} disabled={wizardBusy}
                className="lq-btn px-3.5 py-2 rounded-lg text-[10px] font-bold">
                {wizardBusy ? '…' : 'Next'}
              </button>
            </div>
          )}

          <div className="flex items-center gap-2">
            {field.suggestion && field.type !== 'choice' && (
              <button onMouseEnter={playHover} onClick={() => wizard('answer', field.suggestion)} disabled={wizardBusy}
                className="text-[9px] text-cyan-400/70 hover:text-cyan-200 transition-colors">
                Use “{field.suggestion}”
              </button>
            )}
            <span className="flex-1" />
            {!field.required && (
              <button onMouseEnter={playHover} onClick={() => wizard('skip')} disabled={wizardBusy}
                className="text-[9px] text-slate-600 hover:text-slate-300 transition-colors disabled:opacity-40">
                Skip
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
