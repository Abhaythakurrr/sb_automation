'use client';
/**
 * Inline Assistant Mode — one field at a time instead of a large form.
 *
 * Optional fields are labelled and skippable with Enter or the Skip button.
 * Suggestions come from what the user already entered earlier in the session,
 * so pressing Enter on a suggested value accepts it. The final step is a
 * summary for confirmation before anything is created.
 */
import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useCopilotStore } from '@/store/useCopilotStore';
import { CopilotFinding, WizardField } from '@/types/copilot';
import CopilotMarkdown from './CopilotMarkdown';

const SEVERITY_STYLE: Record<string, { color: string; bg: string; label: string }> = {
  error: { color: '#f87171', bg: 'rgba(239,68,68,0.08)', label: 'MUST FIX' },
  warning: { color: '#fbbf24', bg: 'rgba(245,158,11,0.08)', label: 'CHECK' },
  info: { color: '#67e8f9', bg: 'rgba(6,182,212,0.06)', label: 'FYI' },
  success: { color: '#4ade80', bg: 'rgba(34,197,94,0.08)', label: 'OK' },
};

function FindingRow({ f }: { f: CopilotFinding }) {
  const s = SEVERITY_STYLE[f.severity] || SEVERITY_STYLE.info;
  return (
    <div className="flex gap-2 items-start text-[10px] px-2 py-1.5 rounded" style={{ background: s.bg }}>
      <span className="font-bold shrink-0" style={{ color: s.color }}>{s.label}</span>
      <span className="text-slate-400">
        {f.message}
        {f.fix && <span className="text-slate-500"> → {f.fix}</span>}
      </span>
    </div>
  );
}

/** The question card for the current field. */
function FieldPrompt({ field, error }: { field: WizardField; error?: string }) {
  const [showHelp, setShowHelp] = useState(false);

  return (
    <div className="space-y-2">
      {/* Progress */}
      <div className="flex items-center gap-2">
        <div className="flex-1 h-[3px] rounded-full overflow-hidden" style={{ background: 'rgba(51,65,85,0.25)' }}>
          <motion.div
            className="h-full rounded-full"
            style={{ background: 'linear-gradient(90deg, #06b6d4, #3b82f6)' }}
            initial={{ width: 0 }}
            animate={{ width: `${(field.index / field.total) * 100}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>
        <span className="text-[9px] font-mono text-slate-600 tabular-nums shrink-0">
          {field.index}/{field.total}
        </span>
      </div>

      {/* Question */}
      <div className="flex items-start gap-2">
        <p className="flex-1 text-xs font-bold text-slate-200 leading-snug">{field.question}</p>
        <span
          className="shrink-0 text-[8px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider"
          style={field.required
            ? { background: 'rgba(239,68,68,0.1)', color: '#f87171' }
            : { background: 'rgba(148,163,184,0.08)', color: '#94a3b8' }}
        >
          {field.required ? 'Required' : 'Optional'}
        </span>
      </div>

      {/* Inline documentation — available for every field, collapsed by default */}
      <button
        onClick={() => setShowHelp(v => !v)}
        className="flex items-center gap-1 text-[9px] text-slate-600 hover:text-cyan-400 transition-colors"
      >
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        {showHelp ? 'Hide' : 'What is this?'}
      </button>

      <AnimatePresence>
        {showHelp && (
          <motion.p
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="text-[10px] text-slate-500 leading-relaxed overflow-hidden"
          >
            {field.help}
          </motion.p>
        )}
      </AnimatePresence>

      {field.examples && field.examples.length > 0 && (
        <p className="text-[9px] text-slate-600 font-mono">
          e.g. {field.examples.slice(0, 3).join('  ·  ')}
        </p>
      )}

      {error && (
        <div className="text-[10px] px-2 py-1.5 rounded"
          style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171' }}>
          {error}
        </div>
      )}
    </div>
  );
}

export default function InlineAssistant() {
  const { wizardStep, wizardBusy, wizard, closeWizard } = useCopilotStore();
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const field = wizardStep?.field ?? null;

  // Reset the input and prefill the suggestion each time the question changes.
  useEffect(() => {
    setValue('');
    if (field) setTimeout(() => inputRef.current?.focus(), 60);
  }, [field?.key, field?.index]);

  if (!wizardStep) {
    return (
      <div className="p-4 text-center">
        <button onClick={() => wizard('start')} disabled={wizardBusy} className="btn-primary px-4 py-2 rounded-lg text-[10px]">
          Start the Inline Assistant
        </button>
      </div>
    );
  }

  const submit = () => {
    if (wizardBusy) return;
    // Empty on an optional field is a skip; on a required field with a
    // suggestion, Enter accepts the suggestion (handled server-side).
    wizard('answer', value);
  };

  const done = wizardStep.done;
  const summary = wizardStep.summary;
  const errors = summary?.findings.filter(f => f.severity === 'error') ?? [];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-2.5 flex items-center gap-2 shrink-0"
        style={{ borderBottom: '1px solid rgba(51,65,85,0.12)' }}>
        <span className="text-[10px] font-bold text-slate-400 tracking-wider uppercase">Inline Assistant</span>
        <span className="flex-1" />
        {!done && (
          <button onClick={() => wizard('back')} disabled={wizardBusy}
            className="text-[9px] text-slate-600 hover:text-slate-300 transition-colors disabled:opacity-40">
            Back
          </button>
        )}
        <button onClick={() => { wizard('cancel'); closeWizard(); }}
          className="text-[9px] text-red-500/60 hover:text-red-400 transition-colors">
          Cancel
        </button>
      </div>

      <div className="flex-1 overflow-auto custom-scroll px-4 py-3 space-y-3">
        {wizardStep.message && (
          <div className="text-[11px] text-slate-400 leading-relaxed">
            <CopilotMarkdown text={wizardStep.message} />
          </div>
        )}

        {field && <FieldPrompt field={field} error={wizardStep.error} />}

        {/* Final summary for confirmation */}
        {done && summary && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
            <div className="rounded-lg overflow-hidden" style={{ border: '1px solid rgba(51,65,85,0.2)' }}>
              <div className="px-3 py-2 text-[9px] font-bold text-slate-500 uppercase tracking-widest"
                style={{ background: 'rgba(6,15,30,0.6)' }}>
                Job summary
              </div>
              <div className="divide-y" style={{ borderColor: 'rgba(51,65,85,0.1)' }}>
                {summary.lines.map((l, i) => (
                  <div key={i} className="px-3 py-1.5 flex gap-3 items-start text-[10px]">
                    <span className="w-32 shrink-0 text-slate-600">{l.label}</span>
                    <span className={`flex-1 font-mono break-all ${l.value === '(skipped)' ? 'text-slate-700 italic' : 'text-slate-300'}`}>
                      {l.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-lg px-3 py-2 text-[10px]"
              style={{ background: 'rgba(6,182,212,0.05)', border: '1px solid rgba(6,182,212,0.15)' }}>
              <span className="text-slate-500">Schedule: </span>
              <span className="text-cyan-300">{summary.scheduleSummary}</span>
            </div>

            {summary.findings.length > 0 && (
              <div className="space-y-1">
                <p className="text-[9px] font-bold text-slate-600 uppercase tracking-widest">
                  Before you confirm
                </p>
                {summary.findings.map(f => <FindingRow key={f.id} f={f} />)}
              </div>
            )}

            {/* The wizard produces a row and payloads; creating them stays an
                explicit user action on the Job Creation page. */}
            <div className="rounded-lg px-3 py-2.5 text-[10px] text-slate-400 leading-relaxed"
              style={{ background: 'rgba(245,158,11,0.05)', border: '1px solid rgba(245,158,11,0.15)' }}>
              {errors.length > 0
                ? `${errors.length} problem(s) would stop this being created. Fix them and run the assistant again.`
                : 'Copy this row into your spreadsheet, or paste the generated payload into the Job Creation preview to create it. I do not create anything myself — that stays your click.'}
            </div>

            <details className="text-[10px]">
              <summary className="cursor-pointer text-slate-600 hover:text-cyan-400 transition-colors">
                Show the generated row and payloads
              </summary>
              <pre className="mt-2 p-2.5 rounded font-mono text-[9px] text-slate-400 overflow-auto max-h-64 custom-scroll"
                style={{ background: 'rgba(2,8,18,0.6)', border: '1px solid rgba(51,65,85,0.15)' }}>
{JSON.stringify({ row: summary.row, task: summary.task, trigger: summary.trigger }, null, 2)}
              </pre>
            </details>

            <div className="flex gap-2">
              <button onClick={() => wizard('start')} className="btn-primary px-3 py-2 rounded-lg text-[10px] flex-1">
                Build another
              </button>
              <button onClick={closeWizard}
                className="px-3 py-2 rounded-lg text-[10px] font-bold transition-all"
                style={{ background: 'rgba(148,163,184,0.06)', border: '1px solid rgba(148,163,184,0.15)', color: '#94a3b8' }}>
                Done
              </button>
            </div>
          </motion.div>
        )}
      </div>

      {/* Answer input */}
      {!done && field && (
        <div className="px-4 py-3 shrink-0 space-y-2" style={{ borderTop: '1px solid rgba(51,65,85,0.12)' }}>
          {field.type === 'choice' && field.options ? (
            <div className="flex flex-wrap gap-1.5">
              {field.options.map(o => (
                <button
                  key={o.value}
                  onClick={() => wizard('answer', o.value)}
                  disabled={wizardBusy}
                  className="px-2.5 py-1.5 rounded-md text-[10px] font-bold transition-all disabled:opacity-40"
                  style={o.value === field.suggestion
                    ? { background: 'rgba(6,182,212,0.12)', border: '1px solid rgba(6,182,212,0.3)', color: '#67e8f9' }
                    : { background: 'rgba(148,163,184,0.05)', border: '1px solid rgba(51,65,85,0.2)', color: '#94a3b8' }}
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
                className="flex-1 px-2.5 py-2 rounded-md text-[11px] text-slate-200 outline-none transition-colors disabled:opacity-40"
                style={{ background: 'rgba(2,8,18,0.6)', border: '1px solid rgba(51,65,85,0.25)' }}
              />
              <button onClick={submit} disabled={wizardBusy}
                className="btn-primary px-3 py-2 rounded-md text-[10px] disabled:opacity-40">
                {wizardBusy ? '…' : 'Next'}
              </button>
            </div>
          )}

          <div className="flex items-center gap-2">
            {field.suggestion && field.type !== 'choice' && (
              <button onClick={() => wizard('answer', field.suggestion)} disabled={wizardBusy}
                className="text-[9px] text-cyan-500/70 hover:text-cyan-300 transition-colors">
                Use “{field.suggestion}”
              </button>
            )}
            <span className="flex-1" />
            {!field.required && (
              <button onClick={() => wizard('skip')} disabled={wizardBusy}
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
