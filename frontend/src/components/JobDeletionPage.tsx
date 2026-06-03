'use client';
import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import GlobalHeader from '@/components/GlobalHeader';
import { useConnectionStore, globalApi } from '@/store/useConnectionStore';
import * as XLSX from 'xlsx';

type StepStatus = 'checking' | 'ok' | 'warn' | 'error';
interface Step { label: string; status: StepStatus; detail?: string; ts: string; }
interface InspectData { task: any; triggers: any[]; parents: any[]; activeInstances: any[]; hasActiveInstances: boolean; steps: Step[]; }
type JobPhase = 'idle' | 'inspecting' | 'inspected' | 'prompt_force_finish' | 'force_finishing' | 'ready_to_delete' | 'deleting' | 'done';
interface JobState { name: string; phase: JobPhase; inspect: InspectData | null; steps: Step[]; success: boolean | null; }

function PhaseIcon({ phase, success }: { phase: JobPhase; success: boolean | null }) {
  if (phase === 'done' && success) return <div className="w-5 h-5 rounded-full flex items-center justify-center" style={{ background: 'rgba(34,197,94,0.15)' }}><svg className="w-3 h-3 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7"/></svg></div>;
  if (phase === 'done' && !success) return <div className="w-5 h-5 rounded-full flex items-center justify-center" style={{ background: 'rgba(239,68,68,0.15)' }}><svg className="w-3 h-3 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg></div>;
  if (phase === 'prompt_force_finish') return <div className="w-5 h-5 rounded-full flex items-center justify-center" style={{ background: 'rgba(251,146,60,0.15)' }}><svg className="w-3 h-3 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg></div>;
  if (['inspecting','force_finishing','deleting'].includes(phase)) return <motion.div className="w-5 h-5 rounded-full border-2 border-cyan-400/50 border-t-transparent" animate={{ rotate: 360 }} transition={{ duration: 0.7, repeat: Infinity, ease: 'linear' }}/>;
  return <div className="w-5 h-5 rounded-full bg-slate-800 border border-slate-700"/>;
}

const PHASE_DESCRIPTION: Record<JobPhase, string> = {
  idle:                'Queued',
  inspecting:          'Checking task & dependencies...',
  inspected:           'Inspection complete',
  prompt_force_finish: 'Active instances detected — action required',
  force_finishing:     'Force finishing active instances...',
  ready_to_delete:     'Ready for deletion',
  deleting:            'Removing triggers & task...',
  done:                '',
};

function JobCard({ job, onForceFinish, onSkip }: { job: JobState; onForceFinish: (n: string) => void; onSkip: (n: string) => void }) {
  const isActive = ['inspecting','force_finishing','deleting'].includes(job.phase);
  return (
    <motion.div layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      className="glass-card p-4">
      <div className="flex items-center gap-3 mb-2">
        <PhaseIcon phase={job.phase} success={job.success} />
        <span className="text-sm font-mono font-bold text-slate-200 truncate flex-1">{job.name}</span>
        <span className="text-[9px] font-mono font-bold uppercase tracking-wider"
          style={{ color: job.phase === 'done' ? (job.success ? '#4ade80' : '#f87171') : job.phase === 'prompt_force_finish' ? '#fb923c' : '#67e8f9' }}>
          {job.phase === 'done' ? (job.success ? 'DELETED' : 'FAILED') : job.phase.replace(/_/g,' ')}
        </span>
      </div>

      {job.steps.length > 0 && (
        <div className="space-y-0.5 mb-3 ml-8">
          {job.steps.slice(-5).map((s, i) => (
            <div key={i} className="flex items-center gap-1.5 text-[10px] font-mono">
              <span style={{ color: s.status === 'ok' ? '#4ade80' : s.status === 'error' ? '#f87171' : s.status === 'warn' ? '#fbbf24' : '#67e8f9' }}>
                {s.status === 'ok' ? '✓' : s.status === 'error' ? '✗' : s.status === 'warn' ? '!' : '›'}
              </span>
              <span className="text-slate-500">{s.label}</span>
            </div>
          ))}
        </div>
      )}

      {job.phase === 'prompt_force_finish' && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
          className="ml-8 rounded-lg p-3 mt-2" style={{ background: 'rgba(251,146,60,0.05)', border: '1px solid rgba(251,146,60,0.15)' }}>
          <p className="text-[10px] text-orange-300 font-medium mb-2">
            {job.inspect?.activeInstances.length} active instance(s) — force finish before deleting?
          </p>
          <div className="flex gap-2">
            <button onClick={() => onForceFinish(job.name)} className="btn-danger px-3 py-1.5 rounded-md text-[10px]">
              Force Finish
            </button>
            <button onClick={() => onSkip(job.name)} className="px-3 py-1.5 rounded-md text-[10px] text-slate-500 hover:text-slate-300"
              style={{ border: '1px solid rgba(51,65,85,0.2)' }}>
              Skip
            </button>
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}

export default function JobDeletionPage() {
  const { connected } = useConnectionStore();
  const [input, setInput] = useState('');
  const [jobs, setJobs] = useState<JobState[]>([]);
  const [running, setRunning] = useState(false);
  const [summary, setSummary] = useState<{ done: number; failed: number; total: number } | null>(null);
  const [backupEnabled, setBackupEnabled] = useState(true);
  const [backupData, setBackupData] = useState<any[]>([]);
  const [backingUp, setBackingUp] = useState(false);
  const [backupDone, setBackupDone] = useState(false);

  const updateJob = useCallback((name: string, patch: Partial<JobState>) => {
    setJobs(prev => prev.map(j => j.name === name ? { ...j, ...patch } : j));
  }, []);
  const addStep = useCallback((name: string, step: Step) => {
    setJobs(prev => prev.map(j => j.name === name ? { ...j, steps: [...j.steps, step] } : j));
  }, []);

  const loadJobs = () => {
    const names = input.split(/[\n,]+/).map(s => s.trim()).filter(Boolean);
    setJobs([...new Set(names)].map(name => ({ name, phase: 'idle', inspect: null, steps: [], success: null })));
    setSummary(null);
  };

  const processJob = useCallback(async (name: string) => {
    updateJob(name, { phase: 'inspecting', steps: [] });
    try {
      const res = await globalApi.inspectJob(name);
      const inspect = res.data?.data as InspectData;
      updateJob(name, { inspect, steps: inspect.steps });
      if (!inspect.task) { updateJob(name, { phase: 'done', success: false }); return; }
      if (inspect.hasActiveInstances) { updateJob(name, { phase: 'prompt_force_finish' }); return; }
      await deleteJob(name);
    } catch (e: any) {
      addStep(name, { label: `Error: ${e.message}`, status: 'error', ts: new Date().toISOString() });
      updateJob(name, { phase: 'done', success: false });
    }
  }, [updateJob, addStep]);

  const deleteJob = useCallback(async (name: string) => {
    updateJob(name, { phase: 'deleting' });
    try {
      const res = await globalApi.deleteJob(name);
      const d = res.data;
      setJobs(prev => prev.map(j => j.name === name ? { ...j, phase: 'done', success: d.success, steps: [...j.steps, ...(d?.data?.steps ?? [])] } : j));
    } catch (e: any) {
      addStep(name, { label: `Delete error: ${e.message}`, status: 'error', ts: new Date().toISOString() });
      updateJob(name, { phase: 'done', success: false });
    }
    await new Promise(r => setTimeout(r, 500));
  }, [updateJob, addStep]);

  const handleForceFinish = useCallback(async (name: string) => {
    updateJob(name, { phase: 'force_finishing' });
    try {
      const res = await globalApi.forceFinishJob(name);
      setJobs(prev => prev.map(j => j.name === name ? { ...j, steps: [...j.steps, ...(res.data?.data?.steps ?? [])] } : j));
    } catch (e: any) {
      addStep(name, { label: `Force finish error: ${e.message}`, status: 'error', ts: new Date().toISOString() });
    }
    await deleteJob(name);
  }, [updateJob, addStep, deleteJob]);

  const handleSkip = useCallback((name: string) => {
    addStep(name, { label: 'Skipped by user', status: 'warn', ts: new Date().toISOString() });
    updateJob(name, { phase: 'done', success: false });
  }, [updateJob, addStep]);

  const jobsRef = useRef(jobs);
  useEffect(() => { jobsRef.current = jobs; }, [jobs]);

  const handleRun = async () => {
    if (!jobs.length || !connected) return;
    setRunning(true); setSummary(null);

    // Backup step: fetch all job data before deleting
    if (backupEnabled) {
      setBackingUp(true);
      try {
        const names = jobs.map(j => j.name);
        const res = await globalApi.backupJobs(names);
        const backups = res.data?.data?.backups || [];
        const templateRows = res.data?.data?.templateRows || [];
        setBackupData(backups);
        setBackupDone(true);

        // Download backup as job creation template format (same as upload template)
        const wb = XLSX.utils.book_new();

        // Sheet 1: Job creation template format — can be uploaded to recreate jobs
        const ws1 = XLSX.utils.json_to_sheet(templateRows);
        ws1['!cols'] = [
          { wch: 40 }, { wch: 14 }, { wch: 35 }, { wch: 100 }, { wch: 18 },
          { wch: 45 }, { wch: 30 }, { wch: 14 }, { wch: 55 }, { wch: 20 },
          { wch: 35 }, { wch: 10 }, { wch: 35 }, { wch: 30 }, { wch: 18 },
          { wch: 35 }, { wch: 45 },
        ];
        XLSX.utils.book_append_sheet(wb, ws1, 'Job_Creation_Template');

        // Sheet 2: Raw backup data (for manual reference)
        const rawRows = backups.map((b: any) => ({
          'Job Name': b.taskName,
          'Type': b.task?.type || '',
          'Agent': b.task?.agentCluster || b.task?.agent || '',
          'Command': b.task?.command || '',
          'Triggers': b.triggers?.map((t: any) => t.name).join(', ') || '',
          'Status': b.error ? 'FETCH ERROR' : 'BACKED UP',
        }));
        const ws2 = XLSX.utils.json_to_sheet(rawRows);
        XLSX.utils.book_append_sheet(wb, ws2, 'Backup_Summary');

        XLSX.writeFile(wb, `backup_${new Date().toISOString().slice(0, 10)}_${names.length}jobs.xlsx`);
      } catch (e: any) {
        console.warn('Backup failed:', e.message);
      }
      setBackingUp(false);
    }

    // Proceed with deletion
    for (let i = 0; i < jobs.length; i++) {
      const jobName = jobs[i].name;
      if (jobsRef.current[i]?.phase !== 'idle') continue;
      await processJob(jobName);
      await new Promise<void>(resolve => {
        const poll = setInterval(() => {
          const j = jobsRef.current.find(x => x.name === jobName);
          if (!j || j.phase === 'done' || j.phase === 'prompt_force_finish') { clearInterval(poll); resolve(); }
        }, 200);
        setTimeout(() => { clearInterval(poll); resolve(); }, 120000);
      });
      if (jobsRef.current.find(x => x.name === jobName)?.phase === 'prompt_force_finish') {
        await new Promise<void>(resolve => {
          const poll = setInterval(() => { if (jobsRef.current.find(x => x.name === jobName)?.phase === 'done') { clearInterval(poll); resolve(); } }, 300);
          setTimeout(() => { clearInterval(poll); resolve(); }, 300000);
        });
      }
    }
    setRunning(false);
    const final = jobsRef.current;
    setSummary({ done: final.filter(j => j.success).length, failed: final.filter(j => j.phase === 'done' && !j.success).length, total: final.length });
  };

  const canRun = connected && jobs.length > 0 && !running && jobs.some(j => j.phase === 'idle');

  return (
    <div className="min-h-screen relative scan-line" style={{ background: 'var(--bg-deep)' }}>
      <GlobalHeader title="Job Deletion" subtitle="SAFE TRIGGER + TASK REMOVAL" />

      <main className="max-w-4xl mx-auto px-6 pb-24 space-y-6">

        {/* Input */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.15)' }}>
                <svg className="w-3.5 h-3.5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                </svg>
              </div>
              <h2 className="text-sm font-bold text-slate-200">Jobs to Delete</h2>
            </div>
            <span className="text-[9px] font-mono text-slate-600">ONE PER LINE OR COMMA SEPARATED</span>
          </div>

          <textarea value={input} onChange={e => setInput(e.target.value)} disabled={running}
            placeholder={'PMFG-BU-AS1-MFG-I10-TESTJOB1\nPMFG-BU-AS1-MFG-I10-TESTJOB2'}
            className="w-full h-28 px-4 py-3 rounded-lg text-sm text-slate-200 font-mono placeholder:text-slate-700 outline-none resize-none transition-all focus:ring-1 focus:ring-cyan-500/30"
            style={{ background: 'rgba(2,8,18,0.8)', border: '1px solid rgba(51,65,85,0.2)' }}
          />

          <div className="flex items-center gap-3 mt-4">
            <button onClick={loadJobs} disabled={!input.trim() || running}
              className="btn-primary px-5 py-2.5 rounded-lg text-xs disabled:opacity-40">
              Load Jobs
            </button>
            {jobs.length > 0 && (
              <motion.button onClick={handleRun} disabled={!canRun}
                whileHover={canRun ? { scale: 1.02 } : {}} whileTap={canRun ? { scale: 0.98 } : {}}
                className="btn-danger px-6 py-2.5 rounded-lg text-xs flex items-center gap-2 disabled:opacity-40">
                {running ? (
                  <><motion.div className="w-3 h-3 rounded-full border-2 border-red-400 border-t-transparent" animate={{ rotate: 360 }} transition={{ duration: 0.7, repeat: Infinity, ease: 'linear' }}/>Running...</>
                ) : (
                  <><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>Delete {jobs.filter(j => j.phase === 'idle').length} Jobs</>
                )}
              </motion.button>
            )}
            {jobs.length > 0 && <span className="text-[10px] text-slate-600 font-mono">{jobs.length} loaded</span>}

            {/* Backup Toggle */}
            {jobs.length > 0 && (
              <button onClick={() => setBackupEnabled(!backupEnabled)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[10px] font-bold transition-all ml-auto"
                style={{
                  background: backupEnabled ? 'rgba(139,92,246,0.1)' : 'transparent',
                  border: backupEnabled ? '1px solid rgba(139,92,246,0.25)' : '1px solid rgba(51,65,85,0.2)',
                  color: backupEnabled ? '#c4b5fd' : '#475569',
                }}>
                <div className="w-2.5 h-2.5 rounded-sm" style={{ background: backupEnabled ? '#8b5cf6' : 'rgba(51,65,85,0.3)' }} />
                Backup Before Delete
              </button>
            )}
          </div>

          {/* Backup status */}
          {backingUp && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-2 mt-3 px-1">
              <motion.div className="w-3 h-3 rounded-full border-2 border-purple-400 border-t-transparent"
                animate={{ rotate: 360 }} transition={{ duration: 0.7, repeat: Infinity, ease: 'linear' }} />
              <span className="text-[10px] text-purple-300 font-mono">Fetching backup data from UAC...</span>
            </motion.div>
          )}
          {backupDone && !backingUp && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-2 mt-3 px-1">
              <svg className="w-3 h-3 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/></svg>
              <span className="text-[10px] text-purple-300 font-mono">Backup downloaded — {backupData.length} jobs saved</span>
            </motion.div>
          )}
        </motion.div>

        {/* Summary */}
        <AnimatePresence>
          {summary && (
            <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
              className="grid grid-cols-3 gap-3">
              {[
                { label: 'Deleted', val: summary.done, color: '#4ade80' },
                { label: 'Failed', val: summary.failed, color: '#f87171' },
                { label: 'Total', val: summary.total, color: '#94a3b8' },
              ].map(s => (
                <div key={s.label} className="stat-card">
                  <div className="text-2xl font-black tabular-nums" style={{ color: s.color }}>{s.val}</div>
                  <div className="text-[8px] text-slate-600 uppercase tracking-widest mt-1 font-bold">{s.label}</div>
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Job Cards */}
        <div className="space-y-3">
          <AnimatePresence>
            {jobs.map(job => (
              <JobCard key={job.name} job={job} onForceFinish={handleForceFinish} onSkip={handleSkip} />
            ))}
          </AnimatePresence>
        </div>

        {/* Recovery Section — shows as soon as backup data exists */}
        {backupData.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center"
                style={{ background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.2)' }}>
                <svg className="w-3.5 h-3.5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
                </svg>
              </div>
              <div>
                <h3 className="text-xs font-bold text-slate-300">Recovery Center</h3>
                <p className="text-[9px] text-slate-600 font-mono">{backupData.filter((b: any) => b.task).length} JOB(S) RECOVERABLE</p>
              </div>
              <div className="ml-auto flex items-center gap-2">
                {/* Upload Excel to restore */}
                <label className="px-3 py-1.5 rounded-lg text-[10px] font-bold cursor-pointer transition-all flex items-center gap-1.5"
                  style={{ background: 'rgba(6,182,212,0.08)', border: '1px solid rgba(6,182,212,0.2)', color: '#67e8f9' }}>
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 11l3-3m0 0l3 3m-3-3v12"/>
                  </svg>
                  Upload to Restore
                  <input type="file" accept=".xlsx,.ods,.csv" className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      try {
                        // Parse Excel and send to job creation pipeline
                        const formData = new FormData();
                        formData.append('file', file);
                        const res = await globalApi.uploadFile(file);
                        const parsed = res.data?.data?.rows || [];
                        // Restore each job via the recover endpoint
                        for (const row of parsed) {
                          const match = backupData.find((b: any) => b.taskName === row.task_name);
                          if (match?.task) {
                            await globalApi.recoverJob(match.task, match.triggers);
                          }
                        }
                        alert(`Restored ${parsed.length} job(s) from uploaded file.`);
                      } catch (err: any) {
                        alert('Restore failed: ' + err.message);
                      }
                      e.target.value = '';
                    }}
                  />
                </label>
              </div>
            </div>

            <p className="text-[10px] text-slate-500 mb-3">
              Backup downloaded as job creation template — upload it to restore, or click individual job buttons below.
            </p>

            {/* All recoverable jobs */}
            <div className="max-h-64 overflow-auto custom-scroll space-y-1">
              {backupData.filter((b: any) => b.task).map((b: any) => (
                <motion.div key={b.taskName} layout
                  className="flex items-center gap-3 px-3 py-2 rounded-lg transition-all"
                  style={{ background: 'rgba(139,92,246,0.04)', border: '1px solid rgba(139,92,246,0.1)' }}>
                  <span className="text-[10px] font-mono text-slate-400 flex-1 truncate">{b.taskName}</span>
                  <span className="text-[9px] font-mono text-slate-600">{b.task?.type || ''}</span>
                  <button
                    onClick={async () => {
                      try {
                        await globalApi.recoverJob(b.task, b.triggers);
                        setBackupData(prev => prev.filter((x: any) => x.taskName !== b.taskName));
                      } catch (err: any) {
                        alert('Recovery failed: ' + err.message);
                      }
                    }}
                    className="px-2.5 py-1 rounded text-[9px] font-bold shrink-0 transition-all hover:scale-105"
                    style={{ background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.25)', color: '#c4b5fd' }}>
                    Recover
                  </button>
                </motion.div>
              ))}
            </div>

            {backupData.filter((b: any) => !b.task && b.error).length > 0 && (
              <div className="mt-3">
                <p className="text-[9px] font-mono text-red-400/70 mb-1">FETCH ERRORS:</p>
                {backupData.filter((b: any) => b.error).map((b: any) => (
                  <p key={b.taskName} className="text-[9px] font-mono text-slate-600">{b.taskName}: {b.error}</p>
                ))}
              </div>
            )}
          </motion.div>
        )}

        <footer className="section-line mt-10" />
        <p className="text-center text-[9px] font-mono text-slate-800 py-4">DESIGNED AND ENGINEERED BY ABHAY THAKUR</p>
      </main>
    </div>
  );
}
