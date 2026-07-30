'use client';
import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { globalApi } from '@/store/useConnectionStore';
import * as XLSX from 'xlsx';
import { ExplainError } from '@/components/copilot';

// ── Types ─────────────────────────────────────────────────────────────────────
interface StreamStep {
  index: number; name: string; step: string; status: string; message?: string;
}
interface VerifyCheck {
  field: string; actual?: string; status: 'pass' | 'fail' | 'warn';
}
interface JobVerification {
  taskName: string;
  status: 'pending' | 'verifying' | 'done';
  checks: VerifyCheck[];
  command?: string;
  qualifyingTimes?: string[];
}
interface Props {
  rows: any[];
  executing: boolean;
  progress: number;
  streamSteps: StreamStep[];
  streamSummary: { total: number; successful: number; failed: number } | null;
  onEnableTriggers: () => void;
  enablingTriggers: boolean;
  triggersEnabled: boolean;
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function ExecutionDashboard({
  rows, executing, progress, streamSteps, streamSummary,
  onEnableTriggers, enablingTriggers, triggersEnabled,
}: Props) {
  const [verifications, setVerifications] = useState<JobVerification[]>([]);
  const [verifying, setVerifying] = useState(false);
  const verifyQueueRef = useRef<string[]>([]);

  // Start verification after TRIGGER is created
  useEffect(() => {
    if (!streamSteps.length) return;
    const completedJobs = new Set<string>();
    streamSteps.forEach(s => {
      if (s.status === 'success' && s.step === 'Trigger created') completedJobs.add(s.name);
    });
    completedJobs.forEach(name => {
      if (!verifications.find(v => v.taskName === name) && !verifyQueueRef.current.includes(name)) {
        verifyQueueRef.current.push(name);
        setVerifications(prev => [...prev, { taskName: name, status: 'pending', checks: [] }]);
      }
    });
  }, [streamSteps]);

  // Process verification queue
  useEffect(() => {
    if (verifying || verifyQueueRef.current.length === 0) return;
    const processNext = async () => {
      const name = verifyQueueRef.current.shift();
      if (!name) return;
      setVerifying(true);
      setVerifications(prev => prev.map(v => v.taskName === name ? { ...v, status: 'verifying' } : v));
      await new Promise(r => setTimeout(r, 1500)); // Wait for UAC to index
      try {
        const res = await globalApi.verifyJob(name);
        const data = res.data?.data;
        setVerifications(prev => prev.map(v => v.taskName === name ? {
          ...v, status: 'done', checks: data?.checks || [],
          command: data?.task?.command,
          qualifyingTimes: data?.qualifyingTimes?.map((qt: any) => qt.triggerTimeZone || qt.userTimeZone) || [],
        } : v));
      } catch {
        setVerifications(prev => prev.map(v => v.taskName === name ? {
          ...v, status: 'done', checks: [{ field: 'Verification', actual: 'Failed', status: 'fail' }],
        } : v));
      }
      setVerifying(false);
      if (verifyQueueRef.current.length > 0) setTimeout(processNext, 300);
    };
    processNext();
  }, [verifying, verifications]);

  const verifiedCount = verifications.filter(v => v.status === 'done').length;
  const allVerified = verifications.length > 0 && verifiedCount === verifications.length;
  const passedAll = verifications.every(v => v.checks.every(c => c.status === 'pass'));

  // Download proof
  const handleDownloadProof = async () => {
    const summaryRows = verifications.map((v, i) => ({
      '#': i + 1,
      'Job Name': v.taskName,
      'Trigger': `${v.taskName}-TR001`,
      'Command': v.command || '',
      'Checks': `${v.checks.filter(c => c.status === 'pass').length}/${v.checks.length} passed`,
      'Status': v.checks.every(c => c.status === 'pass') ? 'VERIFIED' : 'WARNING',
    }));
    const checkRows: any[] = [];
    verifications.forEach(v => v.checks.forEach(c => checkRows.push({
      'Job Name': v.taskName, 'Check': c.field, 'Value': c.actual || '', 'Result': c.status.toUpperCase(),
    })));
    const qualRows: any[] = [];
    for (const v of verifications) {
      if (v.qualifyingTimes?.length) {
        v.qualifyingTimes.forEach((qt, i) => qualRows.push({ 'Job': v.taskName, 'Run': i + 1, 'Scheduled': qt }));
      } else {
        try {
          const res = await globalApi.getQualifyingTimes(`${v.taskName}-TR001`, 10);
          (res.data?.data?.qualifyingTimes || []).forEach((qt: any, i: number) =>
            qualRows.push({ 'Job': v.taskName, 'Run': i + 1, 'Scheduled': qt.triggerTimeZone || qt.userTimeZone || '' })
          );
        } catch { qualRows.push({ 'Job': v.taskName, 'Run': '-', 'Scheduled': 'Enable trigger first' }); }
      }
    }
    const wb = XLSX.utils.book_new();
    const ws1 = XLSX.utils.json_to_sheet(summaryRows);
    ws1['!cols'] = [{ wch: 4 }, { wch: 45 }, { wch: 48 }, { wch: 80 }, { wch: 16 }, { wch: 10 }];
    XLSX.utils.book_append_sheet(wb, ws1, 'Summary');
    const ws2 = XLSX.utils.json_to_sheet(checkRows);
    ws2['!cols'] = [{ wch: 45 }, { wch: 18 }, { wch: 60 }, { wch: 8 }];
    XLSX.utils.book_append_sheet(wb, ws2, 'Checks');
    if (qualRows.length) {
      const ws3 = XLSX.utils.json_to_sheet(qualRows);
      ws3['!cols'] = [{ wch: 45 }, { wch: 6 }, { wch: 50 }];
      XLSX.utils.book_append_sheet(wb, ws3, 'Qualifying Times');
    }
    XLSX.writeFile(wb, `proof_${new Date().toISOString().slice(0, 10)}_${verifications.length}jobs.xlsx`);
  };

  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, rgba(6,182,212,0.15), rgba(139,92,246,0.15))', border: '1px solid rgba(6,182,212,0.2)' }}>
            <svg className="w-4 h-4 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-200">Execution & Verification</h2>
            <p className="text-[9px] text-slate-600 font-mono">
              {executing ? 'CREATING JOBS...' : streamSummary ? (allVerified ? 'ALL VERIFIED' : 'VERIFYING...') : 'IDLE'}
            </p>
          </div>
        </div>
        {verifications.length > 0 && (
          <div className="flex items-center gap-2">
            <div className="flex gap-0.5">
              {verifications.slice(0, 20).map((v, i) => (
                <motion.div key={i} className="w-1.5 h-4 rounded-sm"
                  style={{
                    background: v.status === 'done' && v.checks.every(c => c.status === 'pass')
                      ? '#22c55e' : v.status === 'verifying' ? '#8b5cf6' : v.status === 'done' ? '#fbbf24' : 'rgba(51,65,85,0.4)',
                  }}
                  initial={{ scaleY: 0 }} animate={{ scaleY: 1 }}
                  transition={{ delay: i * 0.02 }}
                />
              ))}
            </div>
            <span className="text-[9px] font-mono text-slate-500">{verifiedCount}/{verifications.length}</span>
          </div>
        )}
      </div>

      {/* ── Two Column: Stream + Verify ── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">

        {/* Left (3/5): Creation Stream */}
        <div className="lg:col-span-3 rounded-xl overflow-hidden relative"
          style={{ background: 'linear-gradient(180deg, rgba(2,8,16,0.9), rgba(6,15,30,0.9))', border: '1px solid rgba(51,65,85,0.15)' }}>
          {executing && (
            <motion.div className="absolute top-0 left-0 right-0 h-[1px]"
              style={{ background: 'linear-gradient(90deg, transparent, #06b6d4, transparent)' }}
              animate={{ opacity: [0.2, 0.8, 0.2] }} transition={{ duration: 2, repeat: Infinity }} />
          )}
          <div className="px-4 py-2.5 border-b flex items-center justify-between" style={{ borderColor: 'rgba(51,65,85,0.15)' }}>
            <div className="flex items-center gap-2">
              <motion.div className="w-2 h-2 rounded-full"
                style={{ background: executing ? '#06b6d4' : streamSummary ? '#4ade80' : '#334155' }}
                animate={executing ? { scale: [1, 1.3, 1] } : {}}
                transition={{ duration: 1.5, repeat: Infinity }} />
              <span className="text-[10px] font-bold text-slate-500 tracking-wider">PIPELINE</span>
            </div>
            <span className="text-[9px] font-mono text-slate-700">{streamSteps.filter(s => s.status === 'success').length} OK</span>
          </div>
          <div className="p-3 max-h-80 overflow-auto space-y-0.5 custom-scroll">
            {streamSteps.length === 0 && executing && (
              <div className="flex items-center justify-center gap-2 text-xs text-slate-600 py-8">
                <motion.div className="w-4 h-4 rounded-full border-2 border-cyan-500/50 border-t-transparent"
                  animate={{ rotate: 360 }} transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }} />
                <span className="font-mono text-[10px]">Connecting to stream...</span>
              </div>
            )}
            {streamSteps.map((s, i) => (
              <motion.div key={i} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.15 }}
                className="flex items-center gap-2 py-0.5 px-1 rounded"
                style={{ background: s.status === 'error' ? 'rgba(239,68,68,0.04)' : 'transparent' }}>
                {s.status === 'success' ? (
                  <div className="w-3 h-3 rounded-full flex items-center justify-center" style={{ background: 'rgba(34,197,94,0.15)' }}>
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  </div>
                ) : s.status === 'error' ? (
                  <div className="w-3 h-3 rounded-full flex items-center justify-center" style={{ background: 'rgba(239,68,68,0.15)' }}>
                    <div className="w-1.5 h-1.5 rounded-full bg-red-400" />
                  </div>
                ) : (
                  <motion.div className="w-3 h-3 rounded-full border border-cyan-500/50 border-t-transparent"
                    animate={{ rotate: 360 }} transition={{ duration: 0.6, repeat: Infinity, ease: 'linear' }} />
                )}
                <span className="text-[10px] font-mono truncate flex-1" style={{
                  color: s.status === 'success' ? '#86efac' : s.status === 'error' ? '#fca5a5' : '#67e8f9',
                }}>
                  <span className="text-slate-600">{s.name}</span>
                  <span className="text-slate-700 mx-1">/</span>
                  {s.step}
                  {s.message && <span className="text-slate-600 ml-1">— {s.message}</span>}
                </span>
                {/* Failures get a one-click explanation grounded in this app's behaviour */}
                {s.status === 'error' && s.message && (
                  <ExplainError message={s.message} label="explain" />
                )}
              </motion.div>
            ))}
          </div>
        </div>

        {/* Right (2/5): Verification */}
        <div className="lg:col-span-2 rounded-xl overflow-hidden relative"
          style={{ background: 'linear-gradient(180deg, rgba(2,8,16,0.9), rgba(6,15,30,0.9))', border: '1px solid rgba(51,65,85,0.15)' }}>
          {verifying && (
            <motion.div className="absolute top-0 left-0 right-0 h-[1px]"
              style={{ background: 'linear-gradient(90deg, transparent, #8b5cf6, transparent)' }}
              animate={{ opacity: [0.2, 0.8, 0.2] }} transition={{ duration: 1.5, repeat: Infinity }} />
          )}
          <div className="px-4 py-2.5 border-b flex items-center justify-between" style={{ borderColor: 'rgba(51,65,85,0.15)' }}>
            <div className="flex items-center gap-2">
              <motion.div className="w-2 h-2 rounded-full"
                style={{ background: verifying ? '#8b5cf6' : allVerified ? '#4ade80' : '#334155' }}
                animate={verifying ? { scale: [1, 1.3, 1] } : {}}
                transition={{ duration: 1.5, repeat: Infinity }} />
              <span className="text-[10px] font-bold text-slate-500 tracking-wider">VERIFY</span>
            </div>
            <span className="text-[9px] font-mono text-slate-700">
              {allVerified ? 'DONE' : verifying ? 'CHECKING' : 'QUEUE'}
            </span>
          </div>
          <div className="p-3 max-h-80 overflow-auto space-y-2 custom-scroll">
            {verifications.length === 0 && (
              <p className="text-[10px] text-slate-700 text-center py-8 font-mono">WAITING FOR JOBS...</p>
            )}
            {verifications.map((v, i) => {
              const pass = v.checks.filter(c => c.status === 'pass').length;
              const total = v.checks.length;
              const ok = pass === total && total > 0;
              return (
                <motion.div key={v.taskName} initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: i * 0.02 }}
                  className="rounded-lg p-2.5 relative overflow-hidden"
                  style={{
                    background: ok ? 'rgba(34,197,94,0.03)' : v.status === 'verifying' ? 'rgba(139,92,246,0.03)' : 'rgba(15,23,42,0.4)',
                    border: ok ? '1px solid rgba(34,197,94,0.12)' : '1px solid rgba(51,65,85,0.12)',
                  }}>
                  {v.status === 'verifying' && (
                    <motion.div className="absolute inset-0 rounded-lg"
                      style={{ background: 'linear-gradient(90deg, transparent, rgba(139,92,246,0.05), transparent)' }}
                      animate={{ x: ['-100%', '100%'] }}
                      transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }} />
                  )}
                  <div className="flex items-center justify-between relative z-10">
                    <div className="flex items-center gap-1.5 min-w-0">
                      {v.status === 'verifying' ? (
                        <motion.div className="w-2.5 h-2.5 rounded-full border-[1.5px] border-purple-400 border-t-transparent shrink-0"
                          animate={{ rotate: 360 }} transition={{ duration: 0.6, repeat: Infinity, ease: 'linear' }} />
                      ) : ok ? (
                        <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 shrink-0" />
                      ) : v.status === 'pending' ? (
                        <div className="w-2.5 h-2.5 rounded-full bg-slate-700 shrink-0" />
                      ) : (
                        <div className="w-2.5 h-2.5 rounded-full bg-amber-400 shrink-0" />
                      )}
                      <span className="text-[9px] font-mono text-slate-400 truncate">{v.taskName}</span>
                    </div>
                    {total > 0 && (
                      <span className="text-[8px] font-mono shrink-0 ml-1" style={{ color: ok ? '#4ade80' : '#94a3b8' }}>
                        {pass}/{total}
                      </span>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Results + Actions ── */}
      {streamSummary && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'Created', val: streamSummary.successful, color: '#22c55e', icon: '✓' },
              { label: 'Failed', val: streamSummary.failed, color: '#ef4444', icon: '✗' },
              { label: 'Verified', val: verifiedCount, color: '#8b5cf6', icon: '◉' },
              { label: 'Total Ops', val: streamSummary.total, color: '#94a3b8', icon: '∑' },
            ].map(s => (
              <div key={s.label} className="rounded-lg p-3 text-center relative overflow-hidden"
                style={{ background: 'linear-gradient(145deg, rgba(6,15,30,0.9), rgba(2,8,18,0.95))', border: '1px solid rgba(51,65,85,0.15)' }}>
                <div className="text-xl font-black tabular-nums" style={{ color: s.color }}>{s.val}</div>
                <div className="text-[8px] text-slate-600 uppercase tracking-widest mt-0.5 font-bold">{s.label}</div>
              </div>
            ))}
          </div>

          {/* Enable Triggers */}
          {!triggersEnabled && streamSummary.successful > 0 && (
            <div className="rounded-xl p-5 relative overflow-hidden"
              style={{ background: 'linear-gradient(135deg, rgba(234,179,8,0.03), rgba(251,146,60,0.03))', border: '1px solid rgba(234,179,8,0.12)' }}>
              <div className="flex items-center justify-between relative z-10">
                <div>
                  <p className="text-sm font-bold text-amber-200">Triggers Created — Disabled</p>
                  <p className="text-[10px] text-slate-500 mt-1">
                    {allVerified && passedAll
                      ? 'All checks passed. Ready to go live.'
                      : 'Verify in UAC before enabling.'}
                  </p>
                </div>
                <motion.button onClick={onEnableTriggers} disabled={enablingTriggers}
                  whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                  className="px-6 py-3 rounded-lg text-xs font-bold transition-all shrink-0"
                  style={{
                    background: enablingTriggers ? 'rgba(15,23,42,0.6)' : 'linear-gradient(135deg, rgba(34,197,94,0.2), rgba(16,185,129,0.2))',
                    border: '1px solid rgba(34,197,94,0.35)',
                    color: '#4ade80',
                    opacity: enablingTriggers ? 0.5 : 1,
                    boxShadow: enablingTriggers ? 'none' : '0 0 20px rgba(34,197,94,0.1)',
                  }}>
                  {enablingTriggers ? 'Enabling...' : 'Enable All Triggers'}
                </motion.button>
              </div>
            </div>
          )}

          {/* Triggers Enabled */}
          {triggersEnabled && (
            <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }}
              className="rounded-xl p-5 flex items-center gap-4"
              style={{ background: 'rgba(34,197,94,0.03)', border: '1px solid rgba(34,197,94,0.12)' }}>
              <div className="w-10 h-10 rounded-full flex items-center justify-center"
                style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)' }}>
                <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-bold text-emerald-300">All Triggers Enabled</p>
                <p className="text-[10px] text-slate-500">Jobs are now live and will fire on their configured schedules.</p>
              </div>
            </motion.div>
          )}

          {/* Download Proof + Push to Excel — shows as soon as jobs created */}
          {streamSummary && streamSummary.successful > 0 && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              className="rounded-xl p-5 relative overflow-hidden"
              style={{ background: 'linear-gradient(135deg, rgba(139,92,246,0.03), rgba(59,130,246,0.03))', border: '1px solid rgba(139,92,246,0.12)' }}>
              <div className="flex items-center justify-between relative z-10">
                <div>
                  <p className="text-sm font-bold text-purple-200">Proof Document</p>
                  <p className="text-[10px] text-slate-500 mt-1">
                    Verification report + commands + qualifying times (run cycle).
                  </p>
                </div>
                <motion.button onClick={handleDownloadProof}
                  whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                  className="px-6 py-3 rounded-lg text-xs font-bold transition-all shrink-0 flex items-center gap-2"
                  style={{
                    background: 'linear-gradient(135deg, rgba(139,92,246,0.2), rgba(99,102,241,0.2))',
                    border: '1px solid rgba(139,92,246,0.35)',
                    color: '#c4b5fd',
                    boxShadow: '0 0 20px rgba(139,92,246,0.08)',
                  }}>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Download Proof
                </motion.button>
              </div>
            </motion.div>
          )}
        </motion.div>
      )}
    </div>
  );
}
