'use client';
import { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import GlobalHeader from '@/components/GlobalHeader';
import { useConnectionStore, globalApi } from '@/store/useConnectionStore';
import { playClick, playSuccess, playError, playWhoosh } from '@/utils/soundEffects';

// ── Types ─────────────────────────────────────────────────────────────────────
type RestorePhase = 'pending' | 'restoring' | 'done' | 'failed';

interface RecoveryJob {
  taskName: string;
  task: any;
  triggers: any[];
  savedAt?: string;
  phase: RestorePhase;
  message: string;
}

// ── Per-row status icon ───────────────────────────────────────────────────────
function RestoreIcon({ phase }: { phase: RestorePhase }) {
  if (phase === 'restoring') {
    return (
      <motion.div
        className="w-6 h-6 rounded-full border-2 border-t-transparent"
        style={{ borderColor: 'rgba(139,92,246,0.3)', borderTopColor: '#a78bfa' }}
        animate={{ rotate: 360 }}
        transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
      />
    );
  }
  if (phase === 'done') {
    return (
      <motion.div
        initial={{ scale: 0 }} animate={{ scale: 1 }}
        transition={{ type: 'spring', stiffness: 500, damping: 25 }}
        className="w-6 h-6 rounded-full flex items-center justify-center"
        style={{ background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)' }}
      >
        <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
        </svg>
      </motion.div>
    );
  }
  if (phase === 'failed') {
    return (
      <motion.div
        initial={{ scale: 0 }} animate={{ scale: 1 }}
        transition={{ type: 'spring', stiffness: 500, damping: 25 }}
        className="w-6 h-6 rounded-full flex items-center justify-center"
        style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)' }}
      >
        <svg className="w-3.5 h-3.5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </motion.div>
    );
  }
  // pending
  return (
    <div className="w-6 h-6 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center">
      <div className="w-1.5 h-1.5 rounded-full bg-slate-600" />
    </div>
  );
}

// ── Single job restore card ───────────────────────────────────────────────────
function RestoreCard({ job }: { job: RecoveryJob }) {
  const isActive = job.phase === 'restoring';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl px-5 py-4 relative overflow-hidden transition-all duration-300"
      style={{
        background:
          job.phase === 'done'    ? 'rgba(4,20,12,0.6)' :
          job.phase === 'failed'  ? 'rgba(20,4,4,0.6)'  :
          isActive                ? 'rgba(12,8,24,0.7)' :
                                    'rgba(8,12,21,0.7)',
        border: `1px solid ${
          job.phase === 'done'   ? 'rgba(34,197,94,0.25)'    :
          job.phase === 'failed' ? 'rgba(239,68,68,0.25)'    :
          isActive               ? 'rgba(139,92,246,0.35)'   :
                                   'rgba(51,65,85,0.2)'
        }`,
        boxShadow: isActive ? '0 0 25px rgba(139,92,246,0.06)' : 'none',
      }}
    >
      {/* Scanning line while restoring */}
      {isActive && (
        <motion.div
          className="absolute top-0 left-0 right-0 h-[2px]"
          style={{ background: 'linear-gradient(90deg, transparent, #a78bfa, transparent)' }}
          animate={{ x: ['-100%', '100%'] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: 'linear' }}
        />
      )}

      <div className="flex items-center gap-3">
        <RestoreIcon phase={job.phase} />

        <div className="flex-1 min-w-0">
          <span className="text-sm font-mono font-bold text-slate-200 block truncate">
            {job.taskName}
          </span>
          <div className="flex items-center gap-3 mt-0.5">
            {job.task?.type && (
              <span className="text-[9px] font-mono text-slate-600 uppercase">{job.task.type}</span>
            )}
            {job.triggers?.length > 0 && (
              <span className="text-[9px] font-mono px-1.5 py-0.5 rounded"
                style={{ background: 'rgba(251,191,36,0.08)', color: '#92400e', border: '1px solid rgba(251,191,36,0.12)' }}>
                {job.triggers.length} trigger{job.triggers.length !== 1 ? 's' : ''}
              </span>
            )}
            {job.savedAt && (
              <span className="text-[9px] font-mono text-slate-700">
                saved {new Date(job.savedAt).toLocaleDateString()}
              </span>
            )}
          </div>
        </div>

        {/* Phase label */}
        <span className="text-[9px] font-mono font-bold uppercase tracking-wider shrink-0"
          style={{
            color:
              job.phase === 'done'      ? '#4ade80' :
              job.phase === 'failed'    ? '#f87171' :
              job.phase === 'restoring' ? '#c4b5fd' :
                                          '#475569',
          }}
        >
          {job.phase === 'pending'   ? 'Queued'    :
           job.phase === 'restoring' ? 'Restoring…':
           job.phase === 'done'      ? 'Restored'  :
                                       'Failed'}
        </span>
      </div>

      {/* Error / success message */}
      <AnimatePresence>
        {job.message && (
          <motion.p
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="text-[10px] font-mono mt-2 ml-9 pl-0"
            style={{ color: job.phase === 'failed' ? '#fca5a5' : '#86efac' }}
          >
            {job.message}
          </motion.p>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function JobRecoveryPage() {
  const { connected } = useConnectionStore();

  // Server-persisted backups (loaded on mount)
  const [serverJobs, setServerJobs] = useState<RecoveryJob[]>([]);
  const [loadingServer, setLoadingServer] = useState(false);

  // Jobs queued for restore (from server list OR from uploaded Excel)
  const [restoreQueue, setRestoreQueue] = useState<RecoveryJob[]>([]);
  const [running, setRunning] = useState(false);
  const [summary, setSummary] = useState<{ done: number; failed: number; total: number } | null>(null);

  // Upload state
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Load server backups ──────────────────────────────────────────────────
  const loadServerBackups = useCallback(async () => {
    if (!connected) return;
    setLoadingServer(true);
    try {
      const res = await globalApi.getRecovery();
      const backups: any[] = res.data?.data?.backups || [];
      setServerJobs(
        backups
          .filter((b: any) => b.task)
          .map((b: any) => ({
            taskName: b.taskName,
            task:     b.task,
            triggers: b.triggers || [],
            savedAt:  b.savedAt,
            phase:    'pending',
            message:  '',
          }))
      );
    } catch { /* not yet connected */ }
    setLoadingServer(false);
  }, [connected]);

  useEffect(() => { loadServerBackups(); }, [loadServerBackups]);

  // ── Queue all server jobs ────────────────────────────────────────────────
  const queueAll = () => {
    playClick();
    const toAdd = serverJobs.filter(
      sj => !restoreQueue.find(r => r.taskName === sj.taskName)
    );
    if (!toAdd.length) return;
    setRestoreQueue(prev => [...prev, ...toAdd.map(j => ({ ...j, phase: 'pending' as RestorePhase, message: '' }))]);
    setSummary(null);
  };

  const queueOne = (job: RecoveryJob) => {
    playClick();
    if (restoreQueue.find(r => r.taskName === job.taskName)) return;
    setRestoreQueue(prev => [...prev, { ...job, phase: 'pending', message: '' }]);
    setSummary(null);
  };

  const removeFromQueue = (taskName: string) => {
    setRestoreQueue(prev => prev.filter(r => r.taskName !== taskName));
  };

  // ── Upload Excel and auto-queue matched jobs ─────────────────────────────
  const handleFileUpload = async (file: File) => {
    if (!file) return;
    setUploading(true);
    setUploadMsg('');
    try {
      const res = await globalApi.uploadFile(file);
      const rows: any[] = res.data?.data?.rows || [];
      if (!rows.length) { setUploadMsg('No rows found in the file.'); setUploading(false); return; }

      // Match uploaded rows to server backups by task name
      const matched: RecoveryJob[] = [];
      const unmatched: string[] = [];

      for (const row of rows) {
        const name = (row.task_name || row['Job Name'] || row['Task Name'] || '').trim();
        if (!name) continue;
        const serverMatch = serverJobs.find(sj => sj.taskName.toLowerCase() === name.toLowerCase());
        if (serverMatch) {
          if (!restoreQueue.find(r => r.taskName === serverMatch.taskName)) {
            matched.push({ ...serverMatch, phase: 'pending', message: '' });
          }
        } else {
          unmatched.push(name);
        }
      }

      if (matched.length) {
        setRestoreQueue(prev => [...prev, ...matched]);
        setSummary(null);
      }

      const parts = [];
      if (matched.length) parts.push(`${matched.length} job(s) queued`);
      if (unmatched.length) parts.push(`${unmatched.length} not found in server backups`);
      setUploadMsg(parts.join(' · '));
    } catch (err: any) {
      setUploadMsg(`Upload failed: ${err.message}`);
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // ── Run restore for all queued jobs ─────────────────────────────────────
  const handleRestore = async () => {
    const pending = restoreQueue.filter(r => r.phase === 'pending');
    if (!pending.length || !connected) return;
    setRunning(true);
    setSummary(null);
    playWhoosh();

    let done = 0, failed = 0;

    for (const job of pending) {
      // Set restoring
      setRestoreQueue(prev =>
        prev.map(r => r.taskName === job.taskName ? { ...r, phase: 'restoring', message: '' } : r)
      );

      try {
        await globalApi.recoverJob(job.task, job.triggers);
        // Remove from server recovery store
        try { await globalApi.removeRecovery(job.taskName); } catch { /* best effort */ }
        setRestoreQueue(prev =>
          prev.map(r => r.taskName === job.taskName
            ? { ...r, phase: 'done', message: `Task + ${job.triggers.length} trigger(s) recreated` }
            : r)
        );
        setServerJobs(prev => prev.filter(sj => sj.taskName !== job.taskName));
        playSuccess();
        done++;
      } catch (err: any) {
        const msg = err.response?.data?.error || err.message || 'Unknown error';
        setRestoreQueue(prev =>
          prev.map(r => r.taskName === job.taskName ? { ...r, phase: 'failed', message: msg } : r)
        );
        playError();
        failed++;
      }

      // Small delay between jobs so UAC isn't hammered
      await new Promise(r => setTimeout(r, 600));
    }

    setRunning(false);
    setSummary({ done, failed, total: done + failed });
  };

  // Derived counts
  const pendingCount   = restoreQueue.filter(r => r.phase === 'pending').length;
  const restoringCount = restoreQueue.filter(r => r.phase === 'restoring').length;
  const doneCount      = restoreQueue.filter(r => r.phase === 'done').length;
  const failedCount    = restoreQueue.filter(r => r.phase === 'failed').length;
  const totalQueued    = restoreQueue.length;
  const pct = totalQueued ? Math.round(((doneCount + failedCount) / totalQueued) * 100) : 0;

  const canRun = connected && pendingCount > 0 && !running;

  return (
    <div className="min-h-screen relative scan-line" style={{ background: 'var(--bg-deep)' }}>
      {/* Ambient bg */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <motion.div className="absolute w-[500px] h-[500px] rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(139,92,246,0.05) 0%, transparent 70%)', right: '-10%', top: '5%' }}
          animate={{ y: [0, -25, 0], scale: [1, 1.07, 1] }}
          transition={{ duration: 14, repeat: Infinity, ease: 'easeInOut' }} />
        <motion.div className="absolute w-[400px] h-[400px] rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(34,197,94,0.03) 0%, transparent 70%)', left: '-5%', bottom: '10%' }}
          animate={{ y: [0, 18, 0] }}
          transition={{ duration: 17, repeat: Infinity, ease: 'easeInOut', delay: 3 }} />
        <div className="absolute inset-0 opacity-[0.012]"
          style={{ backgroundImage: 'linear-gradient(rgba(139,92,246,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(139,92,246,0.5) 1px, transparent 1px)', backgroundSize: '72px 72px' }} />
      </div>

      <GlobalHeader title="Job Recovery" subtitle="RESTORE DELETED JOBS FROM BACKUP" />

      <main className="max-w-4xl mx-auto px-6 pb-24 space-y-6 relative z-10">

        {/* ── Section 1: Server Backup List ── */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-6 relative group">
          <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none"
            style={{ background: 'radial-gradient(ellipse at 50% 0%, rgba(139,92,246,0.04), transparent 70%)' }} />

          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center"
                style={{ background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.2)' }}>
                <svg className="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
                </svg>
              </div>
              <div>
                <h2 className="text-sm font-bold text-slate-200">Server Backups</h2>
                <p className="text-[9px] font-mono text-slate-600 mt-0.5">
                  {loadingServer ? 'Loading…' : `${serverJobs.length} job(s) · auto-expire after 7 days`}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button onClick={loadServerBackups} disabled={loadingServer}
                className="px-3 py-1.5 rounded-lg text-[10px] font-medium transition-all disabled:opacity-40"
                style={{ background: 'rgba(51,65,85,0.3)', border: '1px solid rgba(51,65,85,0.3)', color: '#94a3b8' }}>
                {loadingServer ? 'Loading…' : '↻ Refresh'}
              </button>
              {serverJobs.length > 0 && (
                <button onClick={queueAll}
                  className="px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all hover:scale-105"
                  style={{ background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.25)', color: '#c4b5fd' }}>
                  Queue All
                </button>
              )}
              {serverJobs.length > 0 && (
                <button
                  onClick={async () => {
                    if (!confirm('Clear all server backups for this environment? This cannot be undone.')) return;
                    try { await globalApi.clearRecovery(); setServerJobs([]); } catch (err: any) { alert('Clear failed: ' + err.message); }
                  }}
                  className="px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all"
                  style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171' }}>
                  Clear All
                </button>
              )}
            </div>
          </div>

          {!connected && (
            <p className="text-xs text-slate-500 text-center py-6">Connect to a UAC instance to see server backups.</p>
          )}

          {connected && !loadingServer && serverJobs.length === 0 && (
            <div className="text-center py-8">
              <div className="w-12 h-12 rounded-2xl mx-auto mb-3 flex items-center justify-center"
                style={{ background: 'rgba(51,65,85,0.2)', border: '1px solid rgba(51,65,85,0.2)' }}>
                <svg className="w-6 h-6 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                </svg>
              </div>
              <p className="text-xs text-slate-600">No server backups found for this environment.</p>
              <p className="text-[10px] text-slate-700 mt-1">Backups are created automatically when deleting jobs with "Backup Before Delete" enabled.</p>
            </div>
          )}

          {serverJobs.length > 0 && (
            <div className="max-h-56 overflow-auto custom-scroll space-y-1.5 pr-1">
              {serverJobs.map(job => {
                const alreadyQueued = !!restoreQueue.find(r => r.taskName === job.taskName);
                return (
                  <motion.div key={job.taskName} layout
                    className="flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all"
                    style={{ background: alreadyQueued ? 'rgba(139,92,246,0.06)' : 'rgba(30,41,59,0.3)', border: '1px solid rgba(51,65,85,0.15)' }}>
                    <span className="text-[10px] font-mono text-slate-300 flex-1 truncate">{job.taskName}</span>
                    {job.task?.type && (
                      <span className="text-[9px] font-mono text-slate-600 uppercase">{job.task.type}</span>
                    )}
                    {job.triggers?.length > 0 && (
                      <span className="text-[9px] font-mono px-1.5 rounded"
                        style={{ background: 'rgba(251,191,36,0.08)', color: '#92400e' }}>
                        {job.triggers.length}tr
                      </span>
                    )}
                    {job.savedAt && (
                      <span className="text-[9px] font-mono text-slate-700 shrink-0">
                        {new Date(job.savedAt).toLocaleDateString()}
                      </span>
                    )}
                    {alreadyQueued ? (
                      <span className="text-[9px] font-mono text-purple-500 shrink-0">Queued</span>
                    ) : (
                      <button onClick={() => queueOne(job)}
                        className="px-2.5 py-1 rounded text-[9px] font-bold shrink-0 transition-all hover:scale-105"
                        style={{ background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.25)', color: '#c4b5fd' }}>
                        + Queue
                      </button>
                    )}
                  </motion.div>
                );
              })}
            </div>
          )}
        </motion.div>

        {/* ── Section 2: Upload Excel Backup ── */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}
          className="glass-card p-6 relative group">
          <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none"
            style={{ background: 'radial-gradient(ellipse at 50% 0%, rgba(6,182,212,0.03), transparent 70%)' }} />

          <div className="flex items-center gap-2.5 mb-4">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center"
              style={{ background: 'rgba(6,182,212,0.1)', border: '1px solid rgba(6,182,212,0.2)' }}>
              <svg className="w-4 h-4 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 11l3-3m0 0l3 3m-3-3v8"/>
              </svg>
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-200">Upload Backup File</h2>
              <p className="text-[9px] font-mono text-slate-600 mt-0.5">
                Upload the Excel backup downloaded during deletion — jobs will be matched to server backups and queued
              </p>
            </div>
          </div>

          {/* Drop zone */}
          <label
            className="flex flex-col items-center justify-center gap-3 rounded-xl py-8 cursor-pointer transition-all group/drop"
            style={{ background: 'rgba(6,182,212,0.03)', border: '1.5px dashed rgba(6,182,212,0.2)' }}
            onDragOver={e => { e.preventDefault(); }}
            onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFileUpload(f); }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.ods,.csv"
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFileUpload(f); }}
            />
            {uploading ? (
              <motion.div className="w-8 h-8 rounded-full border-2 border-t-transparent border-cyan-400/40"
                style={{ borderTopColor: '#22d3ee' }}
                animate={{ rotate: 360 }} transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }} />
            ) : (
              <svg className="w-8 h-8 text-cyan-700 group-hover/drop:text-cyan-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
              </svg>
            )}
            <div className="text-center">
              <p className="text-xs font-medium text-slate-400">
                {uploading ? 'Parsing file…' : 'Click to upload or drag & drop'}
              </p>
              <p className="text-[10px] text-slate-600 mt-0.5">.xlsx  ·  .ods  ·  .csv</p>
            </div>
          </label>

          {/* Upload feedback */}
          <AnimatePresence>
            {uploadMsg && (
              <motion.div
                initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className="flex items-center gap-2 mt-3 px-1"
              >
                <span className="text-[10px] font-mono"
                  style={{ color: uploadMsg.startsWith('Upload failed') ? '#f87171' : '#67e8f9' }}>
                  {uploadMsg}
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* ── Section 3: Restore Queue + Controls ── */}
        {restoreQueue.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">

            {/* Header + run button */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-[1px] w-5" style={{ background: 'linear-gradient(90deg, #a78bfa, transparent)' }} />
                <span className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">
                  Restore Queue — {pendingCount} pending
                </span>
              </div>
              <div className="flex items-center gap-2">
                {!running && pendingCount === 0 && doneCount + failedCount > 0 && (
                  <button onClick={() => { setRestoreQueue([]); setSummary(null); }} 
                    className="px-3 py-1.5 rounded-lg text-[10px] font-medium transition-all"
                    style={{ background: 'rgba(51,65,85,0.2)', border: '1px solid rgba(51,65,85,0.3)', color: '#94a3b8' }}>
                    Clear Done
                  </button>
                )}
                <motion.button
                  onClick={handleRestore}
                  disabled={!canRun}
                  whileHover={canRun ? { scale: 1.03, y: -1 } : {}}
                  whileTap={canRun ? { scale: 0.97 } : {}}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold transition-all disabled:opacity-40"
                  style={{
                    background: canRun ? 'linear-gradient(135deg, rgba(139,92,246,0.25), rgba(124,58,237,0.15))' : 'rgba(51,65,85,0.2)',
                    border: canRun ? '1px solid rgba(139,92,246,0.4)' : '1px solid rgba(51,65,85,0.2)',
                    color: canRun ? '#c4b5fd' : '#475569',
                    boxShadow: canRun ? '0 0 20px rgba(139,92,246,0.1)' : 'none',
                  }}
                >
                  {running ? (
                    <>
                      <motion.div className="w-3 h-3 rounded-full border-2 border-t-transparent border-purple-400/40"
                        style={{ borderTopColor: '#a78bfa' }}
                        animate={{ rotate: 360 }} transition={{ duration: 0.7, repeat: Infinity, ease: 'linear' }} />
                      Restoring…
                    </>
                  ) : (
                    <>
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
                      </svg>
                      Restore {pendingCount} Job{pendingCount !== 1 ? 's' : ''}
                    </>
                  )}
                </motion.button>
              </div>
            </div>

            {/* Progress bar — only while running or after done */}
            {(running || (doneCount + failedCount > 0 && totalQueued > 0)) && (
              <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                className="glass-card p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-bold text-slate-300">
                    {running ? '↺ Restoring…' : '✓ Completed'}
                    <span className="text-slate-500 font-mono ml-2">{doneCount + failedCount}/{totalQueued}</span>
                  </span>
                  <span className="text-[11px] font-mono font-bold"
                    style={{ color: running ? '#a78bfa' : failedCount > 0 ? '#fbbf24' : '#4ade80' }}>
                    {pct}%
                  </span>
                </div>
                <div className="h-2.5 rounded-full overflow-hidden"
                  style={{ background: 'rgba(2,8,18,0.8)', border: '1px solid rgba(51,65,85,0.2)' }}>
                  <motion.div className="h-full rounded-full"
                    initial={{ width: 0 }} animate={{ width: `${pct}%` }}
                    transition={{ ease: 'easeOut', duration: 0.4 }}
                    style={{
                      background: failedCount > 0
                        ? 'linear-gradient(90deg, #a78bfa, #f59e0b)'
                        : 'linear-gradient(90deg, #8b5cf6, #22c55e)',
                    }} />
                </div>
                {failedCount > 0 && (
                  <p className="text-[9px] text-amber-400/70 font-mono mt-1.5">{failedCount} failed — check error messages below</p>
                )}
              </motion.div>
            )}

            {/* Summary stat cards */}
            <AnimatePresence>
              {summary && (
                <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
                  className="grid grid-cols-3 gap-3">
                  {[
                    { label: 'Restored', val: summary.done,   color: '#4ade80', icon: '✓' },
                    { label: 'Failed',   val: summary.failed, color: '#f87171', icon: '✗' },
                    { label: 'Total',    val: summary.total,  color: '#94a3b8', icon: '∑' },
                  ].map(s => (
                    <motion.div key={s.label} whileHover={{ scale: 1.03, y: -3 }}
                      className="stat-card relative group overflow-hidden">
                      <div className="absolute inset-0 rounded-[14px] opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                        style={{ background: `radial-gradient(ellipse at 50% 0%, ${s.color}10, transparent 70%)` }} />
                      <div className="flex items-center justify-center gap-2 relative z-10">
                        <span className="text-lg" style={{ color: s.color }}>{s.icon}</span>
                        <div className="text-2xl font-black tabular-nums" style={{ color: s.color }}>{s.val}</div>
                      </div>
                      <div className="text-[8px] text-slate-600 uppercase tracking-widest mt-1.5 font-bold text-center relative z-10">{s.label}</div>
                    </motion.div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Per-job restore cards */}
            <div className="space-y-2">
              <AnimatePresence>
                {restoreQueue.map(job => (
                  <div key={job.taskName} className="relative group/card">
                    <RestoreCard job={job} />
                    {/* Remove button — only for pending jobs when not running */}
                    {job.phase === 'pending' && !running && (
                      <button
                        onClick={() => removeFromQueue(job.taskName)}
                        className="absolute top-3 right-3 w-6 h-6 rounded-lg flex items-center justify-center opacity-0 group-hover/card:opacity-100 transition-all"
                        style={{ background: 'rgba(51,65,85,0.4)', border: '1px solid rgba(51,65,85,0.3)' }}
                        title="Remove from queue"
                      >
                        <svg className="w-3 h-3 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>
                ))}
              </AnimatePresence>
            </div>
          </motion.div>
        )}

        <footer className="section-line mt-10" />
        <p className="text-center text-[9px] font-mono py-4">
          <span className="neon-text-gold">DESIGNED AND ENGINEERED BY ABHAY THAKUR</span>
        </p>
      </main>
    </div>
  );
}
