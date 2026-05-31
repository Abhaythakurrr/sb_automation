'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import GlobalHeader from '@/components/GlobalHeader';
import { useConnectionStore, globalApi } from '@/store/useConnectionStore';
import { JobRow } from '@/types';
import { DropZone, ParsedTable, JsonPanel, MergeTable } from './PipelineComponents';
import JobBuilderChat from './JobBuilderChat';
import { JobRow as ChatJobRow } from '@/utils/jobDocParser';

// ─── tiny helpers ────────────────────────────────────────────────────────────
const G = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <div className={`rounded-2xl border border-slate-700/60 bg-slate-900/50 backdrop-blur-md p-6 ${className}`}>
    {children}
  </div>
);

const Tag = ({ label, color }: { label: string; color: 'cyan'|'green'|'red'|'yellow'|'purple' }) => {
  const c = {
    cyan:   'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',
    green:  'bg-green-500/15 text-green-400 border-green-500/30',
    red:    'bg-red-500/15 text-red-400 border-red-500/30',
    yellow: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
    purple: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
  }[color];
  return <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium border ${c}`}>{label}</span>;
};

// ─── types ───────────────────────────────────────────────────────────────────
type ExecResult = { id:string; type:'task'|'trigger'; name:string; status:'success'|'failed'; message?:string; sbId?:string };
type CompRow    = { taskName:string; field:string; inputValue:string; referenceValue:string; finalValue:string; isInherited:boolean };

export default function PipelinePage() {
  // Global connection state — shared across all automations
  const { connected } = useConnectionStore();

  // data
  const [rows, setRows]               = useState<JobRow[]>([]);
  const [compRows, setCompRows]         = useState<CompRow[]>([]);
  const [mergedTriggers, setMergedTriggers] = useState<any[]>([]);
  const [resolvedRefs, setResolvedRefs] = useState<Record<string, any>>({});
  const [jsonView, setJsonView]         = useState<'task'|'trigger'>('task');
  const [refResolved, setRefResolved] = useState(false);
  const [resolving, setResolving]     = useState(false);

  // execution
  const [results, setResults]         = useState<ExecResult[]>([]);
  const [executing, setExecuting]     = useState(false);
  const [progress, setProgress]       = useState(0);
  const [logs, setLogs]               = useState<string[]>([]);
  const logsRef = useRef<HTMLDivElement>(null);

  const log = useCallback((msg: string) => {
    setLogs(p => [...p, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  }, []);

  useEffect(() => {
    if (logsRef.current) logsRef.current.scrollTop = logsRef.current.scrollHeight;
  }, [logs]);

  // ── Token validation is handled by GlobalHeader / useConnectionStore ──────

  // ── File upload ─────────────────────────────────────────────────────────────
  const handleFile = async (file: File) => {
    log(`[INFO] Uploading ${file.name}...`);
    try {
      const res     = await globalApi.uploadFile(file);
      const payload = res.data?.data;
      const parsed: JobRow[] = Array.isArray(payload?.rows) ? payload.rows : [];
      setRows(parsed);
      setCompRows([]); setMergedTriggers([]); setRefResolved(false); setResults([]); setLogs([]);
      log(`[SUCCESS] Parsed ${parsed.length} row(s)`);
    } catch (e: any) {
      log(`[ERROR] Upload failed: ${e.message}`);
    }
  };

  // Handle rows generated from Job Builder Chat
  const handleChatGenerate = (chatRows: ChatJobRow[]) => {
    const mapped: JobRow[] = chatRows.map(r => ({
      task_name:         r.task_name,
      task_type:         r.task_type,
      agent:             r.agent,
      command:           r.command,
      credential:        r.credential ?? '',
      description:       r.description ?? '',
      enabled:           r.enabled ?? 'true',
      first_run_date:    r.first_run_date ?? '',
      start_time:        r.start_time ?? '',
      timezone:          r.timezone ?? '',
      frequency_type:    r.frequency_type ?? '',
      frequency_value:   r.frequency_value ?? '',
      max_runtime:       r.max_runtime ?? '',
      ref_job:           r.ref_job ?? '',
      business_services: r.business_services ?? '',
      servicenow_ticket: r.servicenow_ticket ?? '',
      schedule_string:   r.schedule_string ?? '',
      job_doc:           r.job_doc ?? '',
    }));
    setRows(mapped);
    setCompRows([]); setMergedTriggers([]); setRefResolved(false); setResults([]); setLogs([]);
    log(`[SUCCESS] Loaded ${mapped.length} row(s) from Job Builder`);
  };

  // ── Auto ref-job resolution ─────────────────────────────────────────────────
  useEffect(() => {
    if (!rows.length) return;
    const withRef = rows.filter(r => r.ref_job?.trim());
    if (!withRef.length) { setRefResolved(true); return; }
    log(`[INFO] Detected ${withRef.length} ref_job(s) — resolving schedule...`);
    resolveRefs(withRef);
  }, [rows]);

  const resolveRefs = async (refRows: JobRow[]) => {
    setResolving(true);
    const allComp: CompRow[] = [];

    // resolved[refJob] = { schedule, maxRunTime, rawTrigger }
    const resolved: Record<string, any> = {};
    // Deduplicate — fetch each unique ref_job only once
    const uniqueRefs = [...new Set(refRows.map(r => r.ref_job.trim()))];

    for (const refJob of uniqueRefs) {
      try {
        const res = await globalApi.resolveRefJobTrigger(refJob);

        if (!res.data?.success) throw new Error(res.data?.error || 'Unknown error');

        // Surface backend logs
        (res.data?.logs ?? []).forEach((l: string) => log(l));

        resolved[refJob] = res.data.data; // { triggerName, schedule, maxRunTime, rawTrigger }

      } catch (e: any) {
        const errMsg = e.response?.data?.error ?? e.message;
        log(`[ERROR] ${errMsg}`);
        resolved[refJob] = null;
      }
    }

    // Build comparison rows
    for (const row of refRows) {
      const ref = resolved[row.ref_job?.trim()] ?? null;
      const sched = ref?.schedule;
      const fields = [
        { key: 'start_time',      refVal: ref?.rawTrigger?.time                ?? '' },
        { key: 'timezone',        refVal: ref?.rawTrigger?.timeZone            ?? '' },
        { key: 'frequency_type',  refVal: sched?.frequency_type               ?? '' },
        { key: 'frequency_value', refVal: sched?.human_readable               ?? '' },
        { key: 'max_runtime', refVal: ref?.maxRunTimeDisplay ?? (ref?.maxRunTime != null ? `${ref.maxRunTime}s` : '') },
      ];
      fields.forEach(({ key, refVal }) => {
        allComp.push({
          taskName:       row.task_name,
          field:          key.replace(/_/g,' ').toUpperCase(),
          inputValue:     (row as any)[key] || '(empty)',
          referenceValue: refVal            || '(empty)',
          finalValue:     (row as any)[key] || refVal || '(empty)',
          isInherited:    !(row as any)[key] && !!refVal,
        });
      });
    }

    setCompRows(allComp);
    setResolvedRefs(resolved);

    // Build merged trigger JSON — copy raw schedule fields from ref trigger
    const merged = rows.map(row => {
      const ref = resolved[row.ref_job?.trim()] ?? null;
      const raw = ref?.rawTrigger ?? {};

      const t: any = {
        type:    'triggerTime',
        // Copy ALL raw schedule fields from ref (dayStyle, dateNouns, etc.)
        ...raw,
        // These always override raw — input wins
        name:    `${row.task_name}-TR001`,
        tasks:   [row.task_name],
        enabled: row.enabled === 'true',
        intervalStartingDate: row.first_run_date || raw.intervalStartingDate || '',
        time:     row.start_time  || raw.time     || '',
        timeZone: row.timezone     || raw.timeZone || '',
        timeStyle: raw.timeStyle   || 'Absolute',
      };

      // maxRunTime from task (ref), not trigger
      const mr = row.max_runtime
        ? parseInt(row.max_runtime)
        : ref?.maxRunTime ?? null;
      if (mr) t.maxRunTime = mr;

      // Remove read-only fields that would cause API errors
      ['sysId','version','exportReleaseLevel','exportTable','retainSysIds',
       'nextScheduledTime','enabledBy','enabledTime','disabledBy','disabledTime'].forEach(f => delete t[f]);

      return t;
    });

    setMergedTriggers(merged);
    setResolving(false);
    setRefResolved(true);
  };

  // ── JSON previews ───────────────────────────────────────────────────────────
  const taskJSON = rows.map(r => {
    const t: any = {
      type:        r.task_type || 'taskUnix',
      name:        r.task_name,
      agentCluster:r.agent,           // preview uses agentCluster (resolved at execution time)
      command:     r.command,
      credentials: r.credential,
      summary:     r.description,     // API field is "summary" not "description"
      startHeld:   false,
      resolveNameImmediately: true,
      runAsSudo:   true,
    };
    const mr = r.max_runtime ? parseInt(r.max_runtime) : null;
    if (mr) { t.maxRunTime = mr; t.lfEnabled = true; t.lfType = 'Duration'; }
    if (r.business_services?.trim()) t.opswiseGroups = r.business_services.split(',').map((s: string) => s.trim()).filter(Boolean);
    if (r.servicenow_ticket?.trim()) t.customField2 = { label: 'ServiceNow Ticket', value: r.servicenow_ticket.trim() };
    return t;
  });

  const triggerJSON = mergedTriggers.length ? mergedTriggers : rows.map(r => {
    const base: any = {
      type:    'triggerTime',
      name:    `${r.task_name}-TR001`,
      tasks:   [r.task_name],
      enabled: r.enabled === 'true',
      intervalStartingDate: r.first_run_date,
    };

    if (r.schedule_string?.trim()) {
      // Parse schedule_string for preview
      const s = r.schedule_string;
      const atMatch    = s.match(/AT\s+(\d{4})/i);
      const untilMatch = s.match(/UNTIL\s+(\d{4})/i);
      const everyMatch = s.match(/EVERY\s+(\d{4})/i);
      const tzMatch    = s.match(/TIMEZONE\s+(\S+)/i);

      if (everyMatch) {
        const mins = parseInt(everyMatch[1].slice(0,2)) * 60 + parseInt(everyMatch[1].slice(2,4));
        const hrs  = mins >= 60 && mins % 60 === 0 ? mins / 60 : null;
        base.timeStyle         = 'Interval';
        base.timeInterval      = hrs ?? mins;
        base.timeIntervalUnits = hrs ? 'Hours' : 'Minutes';
        if (atMatch) base.enabledStart = `${atMatch[1].slice(0,2)}:${atMatch[1].slice(2,4)}`;
        if (untilMatch) { base.enabledEnd = `${untilMatch[1].slice(0,2)}:${untilMatch[1].slice(2,4)}`; base.restrictedTimes = true; }
      } else if (atMatch) {
        base.timeStyle = 'Absolute';
        base.time      = `${atMatch[1].slice(0,2)}:${atMatch[1].slice(2,4)}`;
      }
      base.timeZone = r.timezone || tzMatch?.[1] || '';
    } else {
      base.time     = r.start_time  || '';
      base.timeZone = r.timezone    || '';
      if (r.frequency_type?.toUpperCase() === 'INTERVAL') {
        base.timeStyle    = 'Interval';
        base.timeInterval = parseInt(r.frequency_value ?? '1');
        base.timeIntervalUnits = 'Hours';
      } else {
        base.timeStyle = 'Absolute';
      }
    }

    return base;
  });

  // ── Execute via SSE stream — real-time updates ──────────────────────────────
  const [streamSteps, setStreamSteps] = useState<{index:number; name:string; step:string; status:string; message?:string}[]>([]);
  const [streamSummary, setStreamSummary] = useState<{total:number; successful:number; failed:number} | null>(null);
  const [triggersEnabled, setTriggersEnabled] = useState(false);
  const [enablingTriggers, setEnablingTriggers] = useState(false);
  const abortRef = useRef<(() => void) | null>(null);

  const handleExecute = () => {
    if (!rows.length) return;
    setExecuting(true); setResults([]); setProgress(0); setStreamSteps([]); setStreamSummary(null);
    log(`[INFO] Starting execution — ${rows.length} task(s) via stream...`);

    const total = rows.length * 2; // task + trigger per row

    const abort = globalApi.executeStream(
      rows,
      resolvedRefs,
      // onEvent
      (event, data) => {
        if (event === 'start') {
          log(`[INFO] Stream connected — processing ${data.total} jobs`);
        } else if (event === 'job_start') {
          log(`[INFO] Processing: ${data.name} (${data.index + 1}/${data.total})`);
        } else if (event === 'step') {
          setStreamSteps(prev => [...prev, data]);
          if (data.status === 'success') {
            log(`[SUCCESS] ${data.name}: ${data.step}`);
            setProgress(p => Math.min(100, p + Math.round(100 / total)));
          } else if (data.status === 'error') {
            log(`[ERROR] ${data.name}: ${data.step}${data.message ? ' — ' + data.message : ''}`);
            setProgress(p => Math.min(100, p + Math.round(100 / total)));
          }
        } else if (event === 'job_done') {
          // Job completed — could update per-job status here
        } else if (event === 'complete') {
          setStreamSummary(data);
          setProgress(100);
          log(`[INFO] Done — ${data.successful} success, ${data.failed} failed out of ${data.total}`);
        }
      },
      // onDone
      () => { setExecuting(false); },
      // onError
      (err) => { log(`[ERROR] Stream error: ${err}`); setExecuting(false); }
    );

    abortRef.current = abort;
  };

  const handleAbort = () => {
    if (abortRef.current) { abortRef.current(); abortRef.current = null; }
    setExecuting(false);
    log('[WARN] Execution aborted by user');
  };

  const handleEnableTriggers = async () => {
    setEnablingTriggers(true);
    // Build trigger names from the rows that were successfully created
    const triggerNames = rows.map(r => `${r.task_name}-TR001`);
    log(`[INFO] Enabling ${triggerNames.length} trigger(s)...`);
    try {
      const res = await globalApi.enableTriggers(triggerNames);
      const results = res.data?.data?.results ?? [];
      const enabled = results.filter((r: any) => r.status === 'enabled').length;
      const failed  = results.filter((r: any) => r.status === 'failed').length;
      log(`[SUCCESS] ${enabled} trigger(s) enabled, ${failed} failed`);
      if (failed > 0) {
        results.filter((r: any) => r.status === 'failed').forEach((r: any) => {
          log(`[ERROR] ${r.name}: ${r.error}`);
        });
      }
      setTriggersEnabled(true);
    } catch (e: any) {
      log(`[ERROR] Enable triggers failed: ${e.message}`);
    } finally {
      setEnablingTriggers(false);
    }
  };

  const hasData     = rows.length > 0;
  const canExecute  = hasData && refResolved && !executing && connected;

  return (
    <div className="min-h-screen" style={{ background: '#050B1A' }}>
      <GlobalHeader title="Job Creation" subtitle="Stonebranch Automation" />

      <main className="pt-20 pb-16 px-4 max-w-7xl mx-auto space-y-8 grid-bg min-h-screen">

        {/* ── JOB BUILDER CHAT ── */}
        <motion.div initial={{ opacity:0, y:24 }} animate={{ opacity:1, y:0 }} transition={{ duration:0.4 }}>
          <JobBuilderChat onGenerate={handleChatGenerate} />
        </motion.div>

        {/* ── SECTION 1: UPLOAD ── */}
        <motion.div initial={{ opacity:0, y:24 }} animate={{ opacity:1, y:0 }} transition={{ duration:0.5 }}>
          <G>
            <div className="flex items-center gap-3 mb-5">
              <span className="w-7 h-7 rounded-lg bg-cyan-500/20 text-cyan-400 text-xs font-bold flex items-center justify-center">1</span>
              <h2 className="text-base font-semibold text-slate-200">Upload Job File</h2>
              {hasData && <Tag label={`${rows.length} rows parsed`} color="green" />}
            </div>
            <DropZone onFile={handleFile} hasData={hasData} />
          </G>
        </motion.div>

        {/* ── SECTION 2: PARSED + JSON ── */}
        <AnimatePresence>
          {hasData && (
            <motion.div key="s2" initial={{ opacity:0, y:24 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0 }} transition={{ duration:0.4 }}>
              <G>
                <div className="flex items-center justify-between mb-5">
                  <div className="flex items-center gap-3">
                    <span className="w-7 h-7 rounded-lg bg-purple-500/20 text-purple-400 text-xs font-bold flex items-center justify-center">2</span>
                    <h2 className="text-base font-semibold text-slate-200">Parsed Data & JSON Preview</h2>
                  </div>
                  <div className="flex gap-2">
                    {(['task','trigger'] as const).map(v => (
                      <button key={v} onClick={() => setJsonView(v)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${jsonView===v ? 'bg-cyan-600 text-white shadow-[0_0_12px_rgba(6,182,212,0.4)]' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}>
                        {v === 'task' ? 'Task JSON' : 'Trigger JSON'}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                  <ParsedTable rows={rows} />
                  <JsonPanel data={jsonView === 'task' ? taskJSON : triggerJSON} />
                </div>
              </G>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── SECTION 3: REF DETECTION BANNER ── */}
        <AnimatePresence>
          {hasData && rows.some(r => r.ref_job?.trim()) && (
            <motion.div key="s3" initial={{ opacity:0, scale:0.97 }} animate={{ opacity:1, scale:1 }} exit={{ opacity:0 }}>
              <div className="rounded-2xl border border-yellow-500/30 bg-yellow-500/5 px-6 py-4 flex items-center gap-4"
                style={{ boxShadow: '0 0 20px rgba(234,179,8,0.1)' }}>
                <motion.div animate={{ rotate: resolving ? 360 : 0 }} transition={{ repeat: Infinity, duration: 1.2, ease:'linear' }}>
                  <svg className="w-6 h-6 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </motion.div>
                <div>
                  <p className="text-sm font-semibold text-yellow-300">
                    {resolving ? 'Fetching all triggers — filtering locally...' : 'Reference job detected. Schedule will be inherited.'}
                  </p>
                  <p className="text-xs text-yellow-400/70 mt-0.5">
                    {resolving ? 'GET /resources/trigger/list → filtering by taskName in code' : 'Scheduling fields will be inherited where empty in input'}
                  </p>
                </div>
                {resolving && (
                  <div className="ml-auto flex gap-1">
                    {[0,1,2].map(i => (
                      <motion.div key={i} className="w-2 h-2 rounded-full bg-yellow-400"
                        animate={{ opacity:[0.3,1,0.3] }} transition={{ repeat:Infinity, duration:1, delay:i*0.2 }} />
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── SECTION 5: MERGE COMPARISON ── */}
        <AnimatePresence>
          {compRows.length > 0 && (
            <motion.div key="s5" initial={{ opacity:0, y:24 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0 }}>
              <G>
                <div className="flex items-center gap-3 mb-5">
                  <span className="w-7 h-7 rounded-lg bg-green-500/20 text-green-400 text-xs font-bold flex items-center justify-center">3</span>
                  <h2 className="text-base font-semibold text-slate-200">Schedule Merge — Ref Job Resolution</h2>
                </div>
                <MergeTable rows={compRows} />
              </G>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── SECTION 6: FINAL JSON ── */}
        <AnimatePresence>
          {hasData && refResolved && (
            <motion.div key="s6" initial={{ opacity:0, y:24 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0 }}>
              <G>
                <div className="flex items-center gap-3 mb-5">
                  <span className="w-7 h-7 rounded-lg bg-blue-500/20 text-blue-400 text-xs font-bold flex items-center justify-center">4</span>
                  <h2 className="text-base font-semibold text-slate-200">Final JSON Payload</h2>
                  <Tag label="Ready to send" color="cyan" />
                </div>
                <JsonPanel data={{ tasks: taskJSON, triggers: mergedTriggers.length ? mergedTriggers : triggerJSON }} maxH="h-80" />
              </G>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── SECTION 7: EXECUTE ── */}
        <AnimatePresence>
          {canExecute && (
            <motion.div key="s7" initial={{ opacity:0, scale:0.95 }} animate={{ opacity:1, scale:1 }} exit={{ opacity:0 }}>
              <G>
                <div className="flex flex-col items-center gap-6 py-4">
                  <p className="text-slate-400 text-sm">Pipeline ready — {rows.length} task(s) + {rows.length} trigger(s)</p>
                  <motion.button
                    onClick={handleExecute}
                    whileHover={{ scale: 1.04 }}
                    whileTap={{ scale: 0.97 }}
                    className="px-12 py-4 rounded-2xl text-lg font-bold text-white relative overflow-hidden"
                    style={{ background: 'linear-gradient(135deg,#0891b2,#2563eb)', boxShadow: '0 0 30px rgba(6,182,212,0.5), 0 0 60px rgba(6,182,212,0.2)' }}
                  >
                    <span className="relative z-10 flex items-center gap-3">
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                      Create Tasks
                    </span>
                  </motion.button>
                </div>
              </G>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── SECTION 8: EXECUTION DASHBOARD — Live Stream ── */}
        <AnimatePresence>
          {(executing || streamSteps.length > 0 || streamSummary) && (
            <motion.div key="s8" initial={{ opacity:0, y:24 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0 }}>
              <G>
                <div className="flex items-center justify-between mb-5">
                  <div className="flex items-center gap-3">
                    <span className="w-7 h-7 rounded-lg bg-cyan-500/20 text-cyan-400 text-xs font-bold flex items-center justify-center">5</span>
                    <h2 className="text-base font-semibold text-slate-200">Execution Dashboard</h2>
                    {executing && (
                      <motion.span className="w-2 h-2 rounded-full bg-cyan-400 inline-block"
                        animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 1, repeat: Infinity }} />
                    )}
                  </div>
                  {executing && (
                    <button onClick={handleAbort}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                      style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171' }}>
                      Abort
                    </button>
                  )}
                </div>

                {/* Progress bar */}
                <div className="mb-5">
                  <div className="flex justify-between text-xs text-slate-400 mb-1.5">
                    <span>Progress</span><span>{progress}%</span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                    <motion.div className="h-full rounded-full"
                      style={{ background: 'linear-gradient(90deg,#06b6d4,#3b82f6)', boxShadow: '0 0 8px rgba(6,182,212,0.6)' }}
                      initial={{ width: 0 }} animate={{ width: `${progress}%` }} transition={{ duration: 0.3 }} />
                  </div>
                </div>

                {/* Summary cards */}
                {streamSummary && (
                  <div className="grid grid-cols-3 gap-3 mb-5">
                    {[
                      { label: 'Successful', val: streamSummary.successful, color: '#22c55e' },
                      { label: 'Failed',     val: streamSummary.failed,     color: '#ef4444' },
                      { label: 'Total',      val: streamSummary.total,      color: '#94a3b8' },
                    ].map(s => (
                      <div key={s.label} className="rounded-xl p-3 text-center"
                        style={{ background: 'rgba(2,8,18,0.6)', border: '1px solid rgba(51,65,85,0.4)' }}>
                        <div className="text-2xl font-bold" style={{ color: s.color }}>{s.val}</div>
                        <div className="text-[10px] text-slate-600 uppercase tracking-wider mt-0.5">{s.label}</div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Enable Triggers — shown after execution completes */}
                {streamSummary && streamSummary.successful > 0 && !triggersEnabled && (
                  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                    className="mb-5 rounded-xl p-4"
                    style={{ background: 'rgba(234,179,8,0.06)', border: '1px solid rgba(234,179,8,0.2)' }}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-amber-300">Triggers created as disabled</p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Verify the jobs in UAC, then enable all triggers when ready.
                        </p>
                      </div>
                      <button onClick={handleEnableTriggers} disabled={enablingTriggers}
                        className="px-5 py-2.5 rounded-lg text-sm font-bold transition-all shrink-0"
                        style={{
                          background: enablingTriggers ? 'rgba(15,23,42,0.6)' : 'linear-gradient(135deg,rgba(34,197,94,0.2),rgba(16,185,129,0.2))',
                          border: '1px solid rgba(34,197,94,0.4)',
                          color: '#4ade80',
                          opacity: enablingTriggers ? 0.6 : 1,
                        }}>
                        {enablingTriggers ? 'Enabling...' : 'Enable All Triggers'}
                      </button>
                    </div>
                  </motion.div>
                )}

                {/* Triggers enabled confirmation */}
                {triggersEnabled && (
                  <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}
                    className="mb-5 rounded-xl p-4 flex items-center gap-3"
                    style={{ background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)' }}>
                    <svg className="w-5 h-5 text-emerald-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <div>
                      <p className="text-sm font-semibold text-emerald-400">All triggers enabled</p>
                      <p className="text-xs text-slate-500">Jobs will fire on their configured schedules.</p>
                    </div>
                  </motion.div>
                )}

                {/* Live step feed */}
                <div className="max-h-80 overflow-auto space-y-1 rounded-xl p-4"
                  style={{ background: 'rgba(2,8,18,0.8)', border: '1px solid rgba(51,65,85,0.3)' }}>
                  {streamSteps.length === 0 && executing && (
                    <div className="flex items-center gap-2 text-xs text-slate-600">
                      <motion.div className="w-3 h-3 rounded-full border-2 border-cyan-500 border-t-transparent"
                        animate={{ rotate: 360 }} transition={{ duration: 0.7, repeat: Infinity, ease: 'linear' }} />
                      Connecting to execution stream...
                    </div>
                  )}
                  {streamSteps.map((s, i) => (
                    <motion.div key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
                      className="flex items-center gap-2 py-1">
                      {/* Status icon */}
                      {s.status === 'success' ? (
                        <svg className="w-3 h-3 shrink-0 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      ) : s.status === 'error' ? (
                        <svg className="w-3 h-3 shrink-0 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      ) : (
                        <motion.div className="w-3 h-3 rounded-full border-2 border-cyan-400 border-t-transparent shrink-0"
                          animate={{ rotate: 360 }} transition={{ duration: 0.7, repeat: Infinity, ease: 'linear' }} />
                      )}
                      {/* Job name + step */}
                      <span className="text-xs font-mono truncate" style={{
                        color: s.status === 'success' ? '#4ade80' : s.status === 'error' ? '#f87171' : '#67e8f9',
                      }}>
                        <span className="text-slate-500">{s.name}</span>
                        {' — '}
                        {s.step}
                      </span>
                    </motion.div>
                  ))}
                </div>
              </G>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── SECTION 9: LIVE LOGS ── */}
        <AnimatePresence>
          {logs.length > 0 && (
            <motion.div key="s9" initial={{ opacity:0, y:24 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0 }}>
              <div className="rounded-2xl border border-slate-800/60 overflow-hidden"
                style={{ background: '#020810', boxShadow: '0 0 30px rgba(0,0,0,0.5)' }}>
                <div className="px-5 py-3 border-b border-slate-800/60 flex items-center gap-2">
                  <div className="flex gap-1.5">
                    <div className="w-3 h-3 rounded-full bg-red-500/70" />
                    <div className="w-3 h-3 rounded-full bg-yellow-500/70" />
                    <div className="w-3 h-3 rounded-full bg-green-500/70" />
                  </div>
                  <span className="text-xs text-slate-500 ml-2 font-mono">execution.log</span>
                </div>
                <div ref={logsRef} className="p-5 font-mono text-xs max-h-64 overflow-auto space-y-1">
                  {logs.map((l, i) => (
                    <div key={i} className={
                      l.includes('[SUCCESS]') ? 'text-green-400' :
                      l.includes('[ERROR]')   ? 'text-red-400'   :
                      l.includes('[WARN]')    ? 'text-yellow-400':
                                                'text-cyan-400'
                    }>{l}</div>
                  ))}
                  <div className="text-green-400 cursor-blink" />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

      </main>

      {/* Watermark */}
      <div className="fixed bottom-3 right-4 text-[10px] text-slate-800 pointer-events-none select-none">
        Built by Abhay Thakur
      </div>
    </div>
  );
}
