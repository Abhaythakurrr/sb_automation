'use client';
import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import GlobalHeader from '@/components/GlobalHeader';
import { useConnectionStore, globalApi } from '@/store/useConnectionStore';

// ── Types ─────────────────────────────────────────────────────────────────────
type StepStatus = 'checking' | 'ok' | 'warn' | 'error';

interface Step {
  label:  string;
  status: StepStatus;
  detail?: string;
  ts:     string;
}

interface InspectData {
  task:               any;
  triggers:           any[];
  parents:            any[];
  activeInstances:    any[];
  hasActiveInstances: boolean;
  steps:              Step[];
}

type JobPhase =
  | 'idle'
  | 'inspecting'
  | 'inspected'
  | 'prompt_force_finish'   // has active instances — ask user
  | 'force_finishing'
  | 'ready_to_delete'
  | 'deleting'
  | 'done';

interface JobState {
  name:    string;
  phase:   JobPhase;
  inspect: InspectData | null;
  steps:   Step[];
  success: boolean | null;
}

// ── Step indicator ────────────────────────────────────────────────────────────
function StepRow({ step, live }: { step: Step; live?: boolean }) {
  const colors: Record<StepStatus, string> = {
    checking: '#67e8f9',
    ok:       '#4ade80',
    warn:     '#fb923c',
    error:    '#f87171',
  };
  const icons: Record<StepStatus, React.ReactNode> = {
    checking: (
      <motion.div className="w-3 h-3 rounded-full border-2 border-cyan-400 border-t-transparent"
        animate={{ rotate: 360 }} transition={{ duration: 0.7, repeat: Infinity, ease: 'linear' }} />
    ),
    ok:    <svg className="w-3 h-3" fill="none" stroke="#4ade80" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>,
    warn:  <svg className="w-3 h-3" fill="none" stroke="#fb923c" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
    error: <svg className="w-3 h-3" fill="none" stroke="#f87171" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>,
  };

  return (
    <motion.div initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
      className="flex items-start gap-2.5 py-1">
      <div className="w-3 h-3 mt-0.5 shrink-0 flex items-center justify-center">
        {icons[step.status]}
      </div>
      <div className="min-w-0">
        <span className="text-xs font-mono" style={{ color: colors[step.status] }}>{step.label}</span>
        {step.detail && (
          <p className="text-[10px] text-slate-600 font-mono mt-0.5 truncate max-w-md">{step.detail}</p>
        )}
      </div>
    </motion.div>
  );
}

// ── Job card ──────────────────────────────────────────────────────────────────
function JobCard({
  job,
  onForceFinish,
  onDelete,
  onSkip,
}: {
  job: JobState;
  onForceFinish: (name: string) => void;
  onDelete:      (name: string) => void;
  onSkip:        (name: string) => void;
}) {
  const phaseColor: Record<JobPhase, string> = {
    idle:                 '#475569',
    inspecting:           '#67e8f9',
    inspected:            '#67e8f9',
    prompt_force_finish:  '#fb923c',
    force_finishing:      '#fb923c',
    ready_to_delete:      '#4ade80',
    deleting:             '#f87171',
    done:                 job.success ? '#4ade80' : '#f87171',
  };

  const phaseLabel: Record<JobPhase, string> = {
    idle:                 'Queued',
    inspecting:           'Inspecting...',
    inspected:            'Inspected',
    prompt_force_finish:  'Action Required',
    force_finishing:      'Force Finishing...',
    ready_to_delete:      'Ready',
    deleting:             'Deleting...',
    done:                 job.success ? 'Deleted' : 'Failed',
  };

  const isActive = ['inspecting','force_finishing','deleting'].includes(job.phase);

  return (
    <motion.div layout initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border overflow-hidden"
      style={{
        background: 'rgba(10,18,36,0.8)',
        borderColor: job.phase === 'prompt_force_finish'
          ? 'rgba(251,146,60,0.4)'
          : job.phase === 'done' && job.success
          ? 'rgba(34,197,94,0.25)'
          : job.phase === 'done' && !job.success
          ? 'rgba(248,113,113,0.25)'
          : 'rgba(51,65,85,0.4)',
      }}>

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'rgba(51,65,85,0.3)' }}>
        <div className="flex items-center gap-2.5 min-w-0">
          {isActive ? (
            <motion.div className="w-2 h-2 rounded-full shrink-0"
              style={{ background: phaseColor[job.phase] }}
              animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 1, repeat: Infinity }} />
          ) : (
            <div className="w-2 h-2 rounded-full shrink-0" style={{ background: phaseColor[job.phase] }} />
          )}
          <span className="text-sm font-mono font-semibold text-slate-200 truncate">{job.name}</span>
        </div>
        <span className="text-[10px] font-semibold uppercase tracking-wider shrink-0 ml-3"
          style={{ color: phaseColor[job.phase] }}>
          {phaseLabel[job.phase]}
        </span>
      </div>

      {/* Steps feed */}
      {job.steps.length > 0 && (
        <div className="px-4 py-3 space-y-0.5 max-h-48 overflow-auto">
          {job.steps.map((s, i) => (
            <StepRow key={i} step={s} live={i === job.steps.length - 1 && isActive} />
          ))}
        </div>
      )}

      {/* Inspect summary badges */}
      {job.inspect && job.phase !== 'done' && (
        <div className="px-4 pb-3 flex flex-wrap gap-2">
          <span className="text-[10px] px-2 py-0.5 rounded font-medium"
            style={{ background: 'rgba(6,182,212,0.1)', color: '#67e8f9', border: '1px solid rgba(6,182,212,0.2)' }}>
            {job.inspect.triggers.length} trigger{job.inspect.triggers.length !== 1 ? 's' : ''}
          </span>
          {job.inspect.parents.length > 0 && (
            <span className="text-[10px] px-2 py-0.5 rounded font-medium"
              style={{ background: 'rgba(251,146,60,0.1)', color: '#fb923c', border: '1px solid rgba(251,146,60,0.2)' }}>
              {job.inspect.parents.length} workflow parent{job.inspect.parents.length !== 1 ? 's' : ''}
            </span>
          )}
          {job.inspect.activeInstances.length > 0 && (
            <span className="text-[10px] px-2 py-0.5 rounded font-medium"
              style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' }}>
              {job.inspect.activeInstances.length} active instance{job.inspect.activeInstances.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      )}

      {/* Prompt — force finish required */}
      {job.phase === 'prompt_force_finish' && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
          className="px-4 pb-4 border-t" style={{ borderColor: 'rgba(251,146,60,0.2)' }}>
          <div className="mt-3 rounded-lg p-3" style={{ background: 'rgba(251,146,60,0.07)', border: '1px solid rgba(251,146,60,0.2)' }}>
            <p className="text-xs text-orange-300 font-medium mb-1">
              {job.inspect?.activeInstances.length} active instance{(job.inspect?.activeInstances.length ?? 0) > 1 ? 's' : ''} detected
            </p>
            <p className="text-[10px] text-slate-500 mb-3">
              Force finish all active instances before deletion can proceed?
            </p>
            <div className="flex gap-2">
              <button onClick={() => onForceFinish(job.name)}
                className="flex-1 rounded-lg py-2 text-xs font-semibold transition-all"
                style={{ background: 'rgba(251,146,60,0.15)', border: '1px solid rgba(251,146,60,0.35)', color: '#fb923c' }}>
                Force Finish &amp; Continue
              </button>
              <button onClick={() => onSkip(job.name)}
                className="px-4 rounded-lg py-2 text-xs font-medium transition-all"
                style={{ background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(51,65,85,0.4)', color: '#64748b' }}>
                Skip
              </button>
            </div>
          </div>
        </motion.div>
      )}

      {/* Ready to delete — auto proceeds, no action needed */}
      {job.phase === 'ready_to_delete' && (
        <div className="px-4 pb-3">
          <div className="flex items-center gap-2 text-[10px] text-emerald-600">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            All checks passed — proceeding with deletion
          </div>
        </div>
      )}
    </motion.div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function JobDeletionPage() {
  const { connected } = useConnectionStore();

  const [input, setInput]     = useState('');
  const [jobs, setJobs]       = useState<JobState[]>([]);
  const [running, setRunning] = useState(false);
  const [summary, setSummary] = useState<{ done: number; failed: number; total: number } | null>(null);

  // Pending force-finish prompts — queue
  const pendingRef = useRef<string[]>([]);

  const updateJob = useCallback((name: string, patch: Partial<JobState>) => {
    setJobs(prev => prev.map(j => j.name === name ? { ...j, ...patch } : j));
  }, []);

  const addStep = useCallback((name: string, step: Step) => {
    setJobs(prev => prev.map(j => j.name === name ? { ...j, steps: [...j.steps, step] } : j));
  }, []);

  const loadJobs = () => {
    const names = input.split(/[\n,]+/).map(s => s.trim()).filter(Boolean);
    const unique = [...new Set(names)];
    setJobs(unique.map(name => ({ name, phase: 'idle', inspect: null, steps: [], success: null })));
    setSummary(null);
  };

  // ── Process a single job end-to-end ──────────────────────────────────────
  const processJob = useCallback(async (name: string) => {
    // 1. Inspect
    updateJob(name, { phase: 'inspecting', steps: [] });
    let inspect: InspectData | null = null;
    try {
      const res = await globalApi.inspectJob(name);
      inspect = res.data?.data as InspectData;
      updateJob(name, { inspect, steps: inspect.steps });

      if (!inspect.task) {
        updateJob(name, { phase: 'done', success: false });
        return;
      }

      if (inspect.hasActiveInstances) {
        updateJob(name, { phase: 'prompt_force_finish' });
        // Wait for user response — handled by onForceFinish / onSkip
        return;
      }

      // No active instances — go straight to delete
      await deleteJob(name);
    } catch (e: any) {
      addStep(name, { label: `Inspect error: ${e.message}`, status: 'error', ts: new Date().toISOString() });
      updateJob(name, { phase: 'done', success: false });
    }
  }, [updateJob, addStep]);

  const deleteJob = useCallback(async (name: string) => {
    updateJob(name, { phase: 'deleting' });
    try {
      const res = await globalApi.deleteJob(name);
      const d = res.data;
      const newSteps: Step[] = d?.data?.steps ?? [];
      setJobs(prev => prev.map(j => j.name === name
        ? { ...j, phase: 'done', success: d.success, steps: [...j.steps, ...newSteps] }
        : j
      ));
    } catch (e: any) {
      addStep(name, { label: `Deletion error: ${e.message}`, status: 'error', ts: new Date().toISOString() });
      updateJob(name, { phase: 'done', success: false });
    }
  }, [updateJob, addStep]);

  const handleForceFinish = useCallback(async (name: string) => {
    updateJob(name, { phase: 'force_finishing' });
    try {
      const res = await globalApi.forceFinishJob(name);
      const steps: Step[] = res.data?.data?.steps ?? [];
      setJobs(prev => prev.map(j => j.name === name
        ? { ...j, steps: [...j.steps, ...steps] }
        : j
      ));
      addStep(name, { label: 'Force finish complete — proceeding with deletion', status: 'ok', ts: new Date().toISOString() });
    } catch (e: any) {
      addStep(name, { label: `Force finish error: ${e.message}`, status: 'error', ts: new Date().toISOString() });
    }
    await deleteJob(name);
  }, [updateJob, addStep, deleteJob]);

  const handleSkip = useCallback((name: string) => {
    addStep(name, { label: 'Skipped by user — active instances remain', status: 'warn', ts: new Date().toISOString() });
    updateJob(name, { phase: 'done', success: false });
  }, [updateJob, addStep]);

  // ── Run all jobs sequentially ─────────────────────────────────────────────
  const handleRun = async () => {
    if (!jobs.length || !connected) return;
    setRunning(true);
    setSummary(null);

    for (const job of jobs) {
      if (job.phase !== 'idle') continue;
      await processJob(job.name);

      // Wait if job is in prompt state (user needs to respond)
      await new Promise<void>(resolve => {
        const check = setInterval(() => {
          setJobs(current => {
            const j = current.find(x => x.name === job.name);
            if (j && j.phase !== 'prompt_force_finish' && j.phase !== 'force_finishing' && j.phase !== 'deleting' && j.phase !== 'inspecting') {
              clearInterval(check);
              resolve();
            }
            return current;
          });
        }, 300);
      });
    }

    setRunning(false);
    setJobs(current => {
      const done    = current.filter(j => j.phase === 'done' && j.success).length;
      const failed  = current.filter(j => j.phase === 'done' && !j.success).length;
      setSummary({ done, failed, total: current.length });
      return current;
    });
  };

  const allDone    = jobs.length > 0 && jobs.every(j => j.phase === 'done');
  const anyPrompt  = jobs.some(j => j.phase === 'prompt_force_finish');
  const canRun     = connected && jobs.length > 0 && !running && jobs.some(j => j.phase === 'idle');

  return (
    <div className="min-h-screen grid-bg scan-line" style={{ background: '#020812' }}>
      <GlobalHeader title="Job Deletion" subtitle="Safe trigger + task removal" />

      <main className="pt-20 max-w-4xl mx-auto px-6 pb-24 space-y-5">

        {/* Input */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border p-5 space-y-4"
          style={{ background: 'rgba(15,23,42,0.5)', borderColor: 'rgba(51,65,85,0.5)' }}>
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold tracking-widest uppercase text-slate-500">Jobs to Delete</h2>
            <span className="text-[10px] text-slate-700">One per line or comma separated</span>
          </div>
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            disabled={running}
            placeholder={'Automation_Test_Job_001\nAutomation_Test_Job_002\nAutomation_Test_Job_003'}
            className="w-full h-28 px-4 py-3 rounded-xl text-sm text-slate-200 font-mono placeholder:text-slate-700 outline-none resize-none transition-all"
            style={{ background: 'rgba(2,8,18,0.8)', border: '1px solid rgba(51,65,85,0.5)' }}
          />
          <div className="flex items-center gap-3">
            <button onClick={loadJobs} disabled={!input.trim() || running}
              className="px-5 py-2.5 rounded-lg text-sm font-semibold transition-all"
              style={{
                background: 'rgba(6,182,212,0.1)', border: '1px solid rgba(6,182,212,0.3)',
                color: '#67e8f9', opacity: (!input.trim() || running) ? 0.4 : 1,
              }}>
              Load
            </button>

            {jobs.length > 0 && (
              <button onClick={handleRun} disabled={!canRun}
                className="px-6 py-2.5 rounded-lg text-sm font-bold transition-all"
                style={{
                  background: canRun ? 'rgba(239,68,68,0.15)' : 'rgba(15,23,42,0.6)',
                  border: canRun ? '1px solid rgba(239,68,68,0.4)' : '1px solid rgba(51,65,85,0.4)',
                  color: canRun ? '#f87171' : '#475569',
                  boxShadow: canRun ? '0 0 20px rgba(239,68,68,0.1)' : 'none',
                  cursor: !canRun ? 'not-allowed' : 'pointer',
                }}>
                {running ? (
                  <span className="flex items-center gap-2">
                    <motion.span className="w-3.5 h-3.5 rounded-full border-2 border-red-400 border-t-transparent inline-block"
                      animate={{ rotate: 360 }} transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }} />
                    Running...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    Delete {jobs.filter(j => j.phase === 'idle').length} Job{jobs.filter(j => j.phase === 'idle').length !== 1 ? 's' : ''}
                  </span>
                )}
              </button>
            )}

            {jobs.length > 0 && (
              <span className="text-xs text-slate-600">
                {jobs.length} job{jobs.length !== 1 ? 's' : ''} loaded
              </span>
            )}

            {anyPrompt && !running && (
              <span className="text-xs text-orange-400 font-medium flex items-center gap-1.5">
                <motion.span className="w-1.5 h-1.5 rounded-full bg-orange-400 inline-block"
                  animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 1, repeat: Infinity }} />
                Action required
              </span>
            )}
          </div>
        </motion.div>

        {/* Summary */}
        <AnimatePresence>
          {summary && (
            <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
              className="grid grid-cols-3 gap-3">
              {[
                { label: 'Deleted',  val: summary.done,   color: '#4ade80' },
                { label: 'Failed',   val: summary.failed, color: '#f87171' },
                { label: 'Total',    val: summary.total,  color: '#94a3b8' },
              ].map(s => (
                <div key={s.label} className="rounded-xl p-4 text-center"
                  style={{ background: 'rgba(15,23,42,0.5)', border: '1px solid rgba(51,65,85,0.4)' }}>
                  <div className="text-3xl font-bold" style={{ color: s.color }}>{s.val}</div>
                  <div className="text-[10px] text-slate-600 uppercase tracking-wider mt-1">{s.label}</div>
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Job cards — real-time execution feed */}
        <div className="space-y-3">
          <AnimatePresence>
            {jobs.map(job => (
              <JobCard
                key={job.name}
                job={job}
                onForceFinish={handleForceFinish}
                onDelete={deleteJob}
                onSkip={handleSkip}
              />
            ))}
          </AnimatePresence>
        </div>

        <footer className="border-t py-6 text-center" style={{ borderColor: 'rgba(6,182,212,0.06)' }}>
          <p className="text-xs text-slate-700">Built by <span className="text-slate-500 font-medium">Abhay Thakur</span></p>
        </footer>
      </main>
    </div>
  );
}
