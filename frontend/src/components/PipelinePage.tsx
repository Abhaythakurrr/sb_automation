'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import GlobalHeader from '@/components/GlobalHeader';
import { useConnectionStore, globalApi } from '@/store/useConnectionStore';
import { JobRow } from '@/types';
import { DropZone, ParsedTable, JsonPanel, MergeTable } from './PipelineComponents';
import JobBuilderChat from './JobBuilderChat';
import ExecutionDashboard from './ExecutionDashboard';
import { JobRow as ChatJobRow } from '@/utils/jobDocParser';
import { playClick, playSuccess, playError, playTick, playComplete, playWhoosh } from '@/utils/soundEffects';
import * as XLSX from 'xlsx';

// ─── tiny helpers ────────────────────────────────────────────────────────────
const G = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <div className={`glass-card p-6 ${className}`}>
    {children}
  </div>
);

const Tag = ({ label, color }: { label: string; color: 'cyan'|'green'|'red'|'yellow'|'purple'|'gold' }) => {
  const c = {
    cyan:   'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
    green:  'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    red:    'bg-red-500/10 text-red-400 border-red-500/20',
    yellow: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    purple: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
    gold:   'bg-amber-500/10 text-amber-400 border-amber-500/25',
  }[color];
  return <span className={`px-2.5 py-0.5 rounded-md text-[10px] font-bold tracking-wide border ${c}`}>{label}</span>;
};

// ─── Pipeline Step Visualization ─────────────────────────────────────────────
const PIPELINE_STEPS = [
  { id: 'upload', label: 'Upload', icon: '📄', description: 'Parse file or paste job doc' },
  { id: 'preview', label: 'Preview', icon: '🔍', description: 'Review parsed data & JSON' },
  { id: 'resolve', label: 'Resolve', icon: '🔗', description: 'Agent & ref job resolution' },
  { id: 'execute', label: 'Execute', icon: '⚡', description: 'Create tasks & triggers' },
  { id: 'verify', label: 'Verify', icon: '✓', description: 'Validate in UAC' },
];

function PipelineStepper({ currentStep, completedSteps }: { currentStep: number; completedSteps: number[] }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-8"
    >
      <div className="relative rounded-2xl overflow-hidden p-4"
        style={{ background: 'linear-gradient(135deg, rgba(6,15,30,0.95), rgba(2,8,18,0.98))', border: '1px solid rgba(245,158,11,0.08)' }}>
        {/* Top accent */}
        <div className="absolute top-0 left-0 right-0 h-[1px]"
          style={{ background: 'linear-gradient(90deg, transparent, rgba(245,158,11,0.3), rgba(139,92,246,0.2), transparent)' }} />

        <div className="flex items-center justify-between relative">
          {PIPELINE_STEPS.map((step, i) => {
            const isActive = i === currentStep;
            const isComplete = completedSteps.includes(i);
            const isPast = i < currentStep;

            return (
              <div key={step.id} className="flex items-center flex-1">
                {/* Step node */}
                <div className="flex flex-col items-center relative z-10">
                  <motion.div
                    className="w-10 h-10 rounded-xl flex items-center justify-center text-sm relative"
                    style={{
                      background: isComplete
                        ? 'linear-gradient(135deg, rgba(245,158,11,0.2), rgba(251,191,36,0.1))'
                        : isActive
                        ? 'linear-gradient(135deg, rgba(139,92,246,0.2), rgba(167,139,250,0.1))'
                        : 'rgba(15,23,42,0.6)',
                      border: isComplete
                        ? '1px solid rgba(245,158,11,0.4)'
                        : isActive
                        ? '1px solid rgba(139,92,246,0.4)'
                        : '1px solid rgba(51,65,85,0.3)',
                      boxShadow: isActive ? '0 0 20px rgba(139,92,246,0.15)' : isComplete ? '0 0 15px rgba(245,158,11,0.1)' : 'none',
                    }}
                    animate={isActive ? { scale: [1, 1.05, 1] } : {}}
                    transition={{ duration: 2, repeat: Infinity }}
                  >
                    {isComplete ? (
                      <svg className="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <span className={isActive ? 'grayscale-0' : 'grayscale opacity-50'}>{step.icon}</span>
                    )}
                    {/* Active pulse ring */}
                    {isActive && (
                      <motion.div
                        className="absolute inset-0 rounded-xl"
                        style={{ border: '1px solid rgba(139,92,246,0.3)' }}
                        animate={{ scale: [1, 1.3], opacity: [0.5, 0] }}
                        transition={{ duration: 1.5, repeat: Infinity }}
                      />
                    )}
                  </motion.div>
                  <span className={`mt-1.5 text-[9px] font-bold tracking-wider uppercase ${
                    isComplete ? 'text-amber-400' : isActive ? 'text-purple-400' : 'text-slate-600'
                  }`}>
                    {step.label}
                  </span>
                </div>

                {/* Connector line */}
                {i < PIPELINE_STEPS.length - 1 && (
                  <div className="flex-1 h-[2px] mx-2 rounded-full relative overflow-hidden"
                    style={{ background: 'rgba(51,65,85,0.3)' }}>
                    <motion.div
                      className="absolute inset-y-0 left-0 rounded-full"
                      style={{
                        background: isPast || isComplete
                          ? 'linear-gradient(90deg, #f59e0b, #8b5cf6)'
                          : 'transparent',
                      }}
                      initial={{ width: '0%' }}
                      animate={{ width: isPast || isComplete ? '100%' : '0%' }}
                      transition={{ duration: 0.5, delay: i * 0.1 }}
                    />
                    {isActive && (
                      <motion.div
                        className="absolute inset-y-0 w-8 rounded-full"
                        style={{ background: 'linear-gradient(90deg, transparent, rgba(139,92,246,0.5), transparent)' }}
                        animate={{ x: ['-32px', '200%'] }}
                        transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                      />
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
}

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
    playClick();
    try {
      const res     = await globalApi.uploadFile(file);
      const payload = res.data?.data;
      const parsed: JobRow[] = Array.isArray(payload?.rows) ? payload.rows : [];
      setRows(parsed);
      setCompRows([]); setMergedTriggers([]); setRefResolved(false); setResults([]); setLogs([]); setPushDone(false);
      log(`[SUCCESS] Parsed ${parsed.length} row(s)`);
      playSuccess();
    } catch (e: any) {
      log(`[ERROR] Upload failed: ${e.message}`);
      playError();
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
      servicenow_group:  r.servicenow_group ?? '',
      schedule_string:   r.schedule_string ?? '',
      job_doc:           r.job_doc ?? '',
      recovery1:         r.recovery1 ?? '',
      recovery2:         r.recovery2 ?? '',
      end_time:          r.end_time ?? '',
    }));
    setRows(mapped);
    setCompRows([]); setMergedTriggers([]); setRefResolved(false); setResults([]); setLogs([]); setPushDone(false);
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

  // ── Preview payloads from backend (shows EXACT payload going to UAC) ────────
  const [previewData, setPreviewData] = useState<any[]>([]);
  const [previewSummaries, setPreviewSummaries] = useState<string[]>([]);

  useEffect(() => {
    if (!rows.length || !refResolved || !connected) { setPreviewData([]); setPreviewSummaries([]); return; }
    // Fetch real preview from backend
    globalApi.previewPayloads(rows, resolvedRefs).then(res => {
      const previews = res.data?.data?.previews ?? [];
      setPreviewData(previews);
      setPreviewSummaries(previews.map((p: any) => p.summary));
    }).catch(() => { /* silent — preview is optional */ });
  }, [rows, refResolved, resolvedRefs, connected]);

  const triggerJSON = previewData.length
    ? previewData.map(p => p.trigger)
    : rows.map(r => ({
        type: 'triggerTime',
        name: `${r.task_name}-TR001`,
        tasks: [r.task_name],
        enabled: false,
        note: 'Connect and resolve refs for full preview',
      }));

  // ── Execute via SSE stream — real-time updates ──────────────────────────────
  const [streamSteps, setStreamSteps] = useState<{index:number; name:string; step:string; status:string; message?:string}[]>([]);
  const [streamSummary, setStreamSummary] = useState<{total:number; successful:number; failed:number} | null>(null);
  const [triggersEnabled, setTriggersEnabled] = useState(false);
  const [enablingTriggers, setEnablingTriggers] = useState(false);
  const abortRef = useRef<(() => void) | null>(null);

  const handleExecute = () => {
    if (!rows.length) return;
    setExecuting(true); setResults([]); setProgress(0); setStreamSteps([]); setStreamSummary(null); setPushDone(false);
    log(`[INFO] Starting execution — ${rows.length} task(s) via stream...`);
    playWhoosh();

    let completedJobs = 0;
    const totalJobs = rows.length;

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
            playTick();
          } else if (data.status === 'error') {
            log(`[ERROR] ${data.name}: ${data.step}${data.message ? ' — ' + data.message : ''}`);
            playError();
          }
        } else if (event === 'job_done') {
          completedJobs++;
          setProgress(Math.round((completedJobs / totalJobs) * 100));
        } else if (event === 'complete') {
          setStreamSummary(data);
          setProgress(100);
          log(`[INFO] Done — ${data.successful} success, ${data.failed} failed out of ${data.total}`);
          playComplete();
        }
      },
      // onDone
      () => { setExecuting(false); },
      // onError
      (err) => { log(`[ERROR] Stream error: ${err}`); setExecuting(false); playError(); }
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

  // ── Download Job Doc Excel — matches the standard job tracking format ──────
  const handleDownloadJobDoc = () => {
    if (!rows.length) return;

    // Build rows matching the exact format:
    // ID, JOB_ID, INSTRUCTION, TICKET, SCRIPT, JOB_WORKSTATION, JOB_NAME, STREAMLOGON, DESCRIPTION, TASKTYPE, QUEUE
    const docRows = rows.map((r, i) => {
      // Build instruction from recovery fields or parse from job_doc
      const rec1 = r.recovery1?.trim() || '';
      const rec2 = r.recovery2?.trim() || '';
      let instruction = [rec1, rec2].filter(Boolean).join('. ');

      // If no recovery fields, try to extract from job_doc text
      if (!instruction && r.job_doc) {
        const doc = r.job_doc;
        const r1Match = doc.match(/Job Recovery1\s*[=:]\s*(.+?)(?:\n|$)/i);
        const r2Match = doc.match(/Job Recovery2\s*[=:]\s*(.+?)(?:\n|$)/i);
        const parts = [r1Match?.[1]?.trim(), r2Match?.[1]?.trim()].filter(Boolean);
        if (parts.length) instruction = parts.join('. ');
      }

      // TASKTYPE: UNIX or WINDOWS (uppercase, no prefix)
      const taskTypeMap: Record<string, string> = { 'taskUnix': 'UNIX', 'taskWindows': 'WINDOWS' };
      const taskType = taskTypeMap[r.task_type] || r.task_type?.replace('task', '').toUpperCase() || 'UNIX';

      return {
        'ID':              i + 1,
        'JOB_ID':          `${r.agent}#${r.task_name}`,
        'INSTRUCTION':     instruction,
        'TICKET':          r.servicenow_ticket || '',
        'SCRIPT':          r.command || '',
        'JOB_WORKSTATION': r.agent || '',
        'JOB_NAME':        r.task_name || '',
        'STREAMLOGON':     r.credential || '',
        'DESCRIPTION':     r.description || '',
        'TASKTYPE':        taskType,
        'QUEUE':           r.servicenow_group || '',
      };
    });

    const ws = XLSX.utils.json_to_sheet(docRows);
    ws['!cols'] = [
      { wch: 6 },   // ID
      { wch: 45 },  // JOB_ID
      { wch: 80 },  // INSTRUCTION
      { wch: 18 },  // TICKET
      { wch: 100 }, // SCRIPT
      { wch: 30 },  // JOB_WORKSTATION
      { wch: 45 },  // JOB_NAME
      { wch: 12 },  // STREAMLOGON
      { wch: 40 },  // DESCRIPTION
      { wch: 10 },  // TASKTYPE
      { wch: 30 },  // QUEUE
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Job_Doc');
    const timestamp = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `job_doc_${timestamp}_${rows.length}jobs.xlsx`);
    log(`[SUCCESS] Job Doc Excel downloaded — ${rows.length} row(s)`);
  };

  // ── Push to Excel via Power Automate — injects rows directly into shared sheet ─
  const [pushing, setPushing] = useState(false);
  const [pushDone, setPushDone] = useState(false);
  const [startId, setStartId] = useState(1);

  const handlePushToExcel = async () => {
    if (!rows.length) return;
    setPushing(true);
    setPushDone(false);
    log(`[INFO] Pushing ${rows.length} row(s) to Excel via Power Automate (starting ID: ${startId})...`);

    // Build all row payloads — same format as download
    const payloadRows = rows.map((r, i) => {
      // INSTRUCTION: from recovery1/recovery2, or parse from job_doc
      const rec1 = r.recovery1?.trim() || '';
      const rec2 = r.recovery2?.trim() || '';
      let instruction = [rec1, rec2].filter(Boolean).join('. ');
      if (!instruction && r.job_doc) {
        const doc = r.job_doc;
        const r1Match = doc.match(/Job Recovery1\s*[=:]\s*(.+?)(?:\n|$)/i);
        const r2Match = doc.match(/Job Recovery2\s*[=:]\s*(.+?)(?:\n|$)/i);
        const parts = [r1Match?.[1]?.trim(), r2Match?.[1]?.trim()].filter(Boolean);
        if (parts.length) instruction = parts.join('. ');
      }

      // TASKTYPE: UNIX or WINDOWS (uppercase, no prefix)
      const taskTypeMap: Record<string, string> = { 'taskUnix': 'UNIX', 'taskWindows': 'WINDOWS' };
      const taskType = taskTypeMap[r.task_type] || r.task_type?.replace('task', '').toUpperCase() || 'UNIX';

      return {
        ID:               startId + i,
        JOB_ID:           `${r.agent || ''}#${r.task_name || ''}`,
        INSTRUCTION:      instruction || '',
        TICKET:           r.servicenow_ticket || '',
        SCRIPT:           r.command || '',
        JOB_WORKSTATION:  r.agent || '',
        JOB_NAME:         r.task_name || '',
        STREAMLOGON:      r.credential || '',
        DESCRIPTION:      r.description || '',
        TASKTYPE:         taskType,
        QUEUE:            r.servicenow_group || '',
      };
    });

    try {
      const res = await globalApi.pushJobDoc(payloadRows);
      const data = res.data?.data;
      const success = data?.summary?.success ?? 0;
      const failed = data?.summary?.failed ?? 0;
      if (failed > 0) {
        data?.results?.filter((r: any) => r.status === 'failed').forEach((r: any) => {
          log(`[ERROR] ${r.name}: ${r.error}`);
        });
      }
      log(`[SUCCESS] Power Automate push complete — ${success} success, ${failed} failed`);
      // Update startId for next push
      setStartId(startId + rows.length);
      setPushDone(true);
    } catch (e: any) {
      log(`[ERROR] Push failed: ${e.message}`);
    } finally {
      setPushing(false);
    }
  };

  const hasData     = rows.length > 0;
  const canExecute  = hasData && refResolved && !executing && connected;

  // Compute pipeline step
  const currentStep = executing ? 3 : streamSummary ? 4 : hasData && refResolved ? 2 : hasData ? 1 : 0;
  const completedSteps = [
    ...(hasData ? [0] : []),
    ...(hasData && refResolved ? [1] : []),
    ...(hasData && refResolved && !executing ? [2] : []),
    ...(streamSummary ? [3] : []),
    ...(streamSummary && !executing ? [4] : []),
  ];

  return (
    <div className="min-h-screen relative scan-line" style={{ background: 'var(--bg-deep)' }}>
      <GlobalHeader title="Job Creation" subtitle="BULK TASK + TRIGGER PIPELINE" />

      <main className="pb-16 px-4 max-w-7xl mx-auto space-y-6 min-h-screen">

        {/* ── PIPELINE STEPPER — Visual Progress ── */}
        <PipelineStepper currentStep={currentStep} completedSteps={completedSteps} />

        {/* ── JOB BUILDER CHAT ── */}
        <motion.div initial={{ opacity:0, y:24 }} animate={{ opacity:1, y:0 }} transition={{ duration:0.4 }}>
          <JobBuilderChat onGenerate={handleChatGenerate} />
        </motion.div>

        {/* ── SECTION 1: UPLOAD ── */}
        <motion.div initial={{ opacity:0, y:24 }} animate={{ opacity:1, y:0 }} transition={{ duration:0.5 }}>
          <G>
            <div className="flex items-center gap-3 mb-5">
              <span className="w-8 h-8 rounded-xl text-xs font-bold flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg, rgba(245,158,11,0.15), rgba(251,191,36,0.08))', border: '1px solid rgba(245,158,11,0.3)', color: '#fbbf24' }}>1</span>
              <h2 className="text-base font-semibold text-slate-200">Upload Job File</h2>
              {hasData && <Tag label={`${rows.length} rows parsed`} color="gold" />}
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
                    <span className="w-8 h-8 rounded-xl text-xs font-bold flex items-center justify-center"
                      style={{ background: 'linear-gradient(135deg, rgba(139,92,246,0.15), rgba(167,139,250,0.08))', border: '1px solid rgba(139,92,246,0.3)', color: '#c4b5fd' }}>2</span>
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

                {/* Schedule Summaries — plain English */}
                {previewSummaries.length > 0 && (
                  <div className="mt-4 rounded-lg p-3" style={{ background: 'rgba(6,182,212,0.04)', border: '1px solid rgba(6,182,212,0.1)' }}>
                    <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-2">Schedule Summary — {previewSummaries.length} job(s)</p>
                    <div className="space-y-1 max-h-64 overflow-auto">
                      {previewSummaries.map((s, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs">
                          <span className="text-cyan-500 font-mono text-[10px] shrink-0 w-6">{String(i+1).padStart(2,'0')}</span>
                          <span className="text-slate-400 font-mono truncate max-w-[200px]">{rows[i]?.task_name}</span>
                          <span className="text-slate-700 mx-0.5">—</span>
                          <span className="text-emerald-400 font-medium text-[11px]">{s}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
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
                  <span className="w-8 h-8 rounded-xl text-xs font-bold flex items-center justify-center"
                    style={{ background: 'linear-gradient(135deg, rgba(34,197,94,0.15), rgba(16,185,129,0.08))', border: '1px solid rgba(34,197,94,0.3)', color: '#4ade80' }}>3</span>
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
                  <span className="w-8 h-8 rounded-xl text-xs font-bold flex items-center justify-center"
                    style={{ background: 'linear-gradient(135deg, rgba(6,182,212,0.15), rgba(59,130,246,0.08))', border: '1px solid rgba(6,182,212,0.3)', color: '#67e8f9' }}>4</span>
                  <h2 className="text-base font-semibold text-slate-200">Final JSON Payload</h2>
                  <Tag label="Ready to send" color="gold" />
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
                    whileHover={{ scale: 1.03, y: -2 }}
                    whileTap={{ scale: 0.97 }}
                    className="px-12 py-4 rounded-2xl text-base font-bold text-white relative overflow-hidden group"
                    style={{
                      background: 'linear-gradient(135deg, rgba(245,158,11,0.25), rgba(139,92,246,0.2))',
                      border: '1px solid rgba(245,158,11,0.4)',
                      boxShadow: '0 0 40px rgba(245,158,11,0.15), 0 8px 32px rgba(0,0,0,0.3)',
                    }}
                  >
                    {/* Animated shine */}
                    <motion.div
                      className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity"
                      style={{ background: 'linear-gradient(135deg, rgba(245,158,11,0.1), rgba(251,191,36,0.05), transparent)' }}
                    />
                    <span className="relative z-10 flex items-center gap-3">
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                      <span className="neon-text-gold">Create Tasks</span>
                    </span>
                  </motion.button>
                </div>
              </G>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── SECTION 8: EXECUTION DASHBOARD ── */}
        <AnimatePresence>
          {(executing || streamSteps.length > 0 || streamSummary) && (
            <motion.div key="s8" initial={{ opacity:0, y:24 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0 }}>
              <G>
                {/* Progress HUD */}
                {/* ── PROGRESS — Holographic Command Display ── */}
                <div className="mb-6 relative">
                  <div className="rounded-xl p-5 relative overflow-hidden"
                    style={{ background: 'rgba(2,6,14,0.8)', border: '1px solid rgba(6,182,212,0.1)' }}>
                    <div className="absolute inset-0 opacity-[0.03]"
                      style={{ backgroundImage: 'linear-gradient(rgba(6,182,212,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(6,182,212,0.5) 1px, transparent 1px)', backgroundSize: '20px 20px' }} />
                    {executing && (
                      <motion.div className="absolute top-0 left-0 right-0 h-[1px]"
                        style={{ background: 'linear-gradient(90deg, transparent, #06b6d4, #8b5cf6, transparent)' }}
                        animate={{ opacity: [0.3, 1, 0.3] }}
                        transition={{ duration: 2, repeat: Infinity }}
                      />
                    )}
                    <div className="relative z-10 flex items-center gap-5">
                      <div className="relative w-16 h-16 shrink-0">
                        <motion.svg className="absolute inset-0 w-16 h-16" viewBox="0 0 64 64"
                          animate={executing ? { rotate: 360 } : {}}
                          transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}>
                          <circle cx="32" cy="32" r="28" fill="none" stroke="rgba(6,182,212,0.1)" strokeWidth="1" strokeDasharray="4 4" />
                        </motion.svg>
                        <svg className="absolute inset-0 w-16 h-16 -rotate-90" viewBox="0 0 64 64">
                          <circle cx="32" cy="32" r="24" fill="none" stroke="rgba(51,65,85,0.2)" strokeWidth="3" />
                          <motion.circle cx="32" cy="32" r="24" fill="none"
                            stroke="url(#progGrad)" strokeWidth="3" strokeLinecap="round"
                            strokeDasharray={`${2 * Math.PI * 24}`}
                            animate={{ strokeDashoffset: 2 * Math.PI * 24 * (1 - progress / 100) }}
                            transition={{ duration: 0.5, ease: 'easeOut' }}
                          />
                          <defs><linearGradient id="progGrad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#06b6d4" /><stop offset="100%" stopColor="#8b5cf6" /></linearGradient></defs>
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                          <span className="text-base font-black tabular-nums" style={{ color: progress === 100 ? '#4ade80' : '#e2e8f0' }}>{progress}%</span>
                        </div>
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-bold" style={{ color: progress === 100 ? '#4ade80' : '#e2e8f0' }}>
                          {progress === 0 ? 'Initializing...' : progress < 100 ? 'Executing Pipeline' : 'Complete'}
                        </p>
                        <p className="text-[10px] text-slate-500 font-mono">{Math.round(progress * rows.length / 100)}/{rows.length} JOBS</p>
                        <div className="flex gap-[2px] h-1.5 mt-2">
                          {Array.from({ length: Math.min(rows.length, 40) }).map((_, i) => (
                            <div key={i} className="flex-1 rounded-sm" style={{
                              background: i < (progress / 100) * Math.min(rows.length, 40)
                                ? 'linear-gradient(180deg, #06b6d4, #3b82f6)' : 'rgba(30,41,59,0.5)',
                            }} />
                          ))}
                        </div>
                      </div>
                      {executing && (
                        <button onClick={handleAbort}
                          className="px-3 py-1.5 rounded-lg text-[10px] font-semibold shrink-0"
                          style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171' }}>
                          Abort
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Execution + Verification Dashboard */}
                <ExecutionDashboard
                  rows={rows}
                  executing={executing}
                  progress={progress}
                  streamSteps={streamSteps}
                  streamSummary={streamSummary}
                  onEnableTriggers={handleEnableTriggers}
                  enablingTriggers={enablingTriggers}
                  triggersEnabled={triggersEnabled}
                />

                {/* ── Job Doc Download + Push to Excel — shown immediately after execution ── */}
                {streamSummary && streamSummary.successful > 0 && (
                  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                    className="mt-5 rounded-xl p-5"
                    style={{ background: 'linear-gradient(135deg, rgba(59,130,246,0.04), rgba(139,92,246,0.04))', border: '1px solid rgba(59,130,246,0.12)' }}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-bold text-blue-300">Job Documentation</p>
                        <p className="text-[10px] text-slate-500 mt-0.5">
                          Download job doc or push directly to the shared Excel via Power Automate.
                        </p>
                        <div className="flex items-center gap-2 mt-2">
                          <span className="text-[9px] font-mono text-slate-600">Start ID:</span>
                          <input
                            type="number"
                            value={startId}
                            onChange={e => setStartId(parseInt(e.target.value) || 1)}
                            className="w-14 px-2 py-1 rounded text-xs text-slate-200 text-center font-mono outline-none"
                            style={{ background: 'rgba(2,8,18,0.8)', border: '1px solid rgba(51,65,85,0.3)' }}
                            min={1}
                          />
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button onClick={handleDownloadJobDoc}
                          className="px-4 py-2.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2"
                          style={{ background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.25)', color: '#93c5fd' }}>
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                          Download
                        </button>
                        <button onClick={handlePushToExcel} disabled={pushing || pushDone}
                          className="px-4 py-2.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2"
                          style={{
                            background: pushDone ? 'rgba(34,197,94,0.08)' : 'linear-gradient(135deg, rgba(34,197,94,0.15), rgba(16,185,129,0.15))',
                            border: pushDone ? '1px solid rgba(34,197,94,0.2)' : '1px solid rgba(34,197,94,0.3)',
                            color: pushDone ? '#4ade80' : '#6ee7b7',
                            opacity: pushing ? 0.6 : 1,
                          }}>
                          {pushing ? (
                            <><motion.div className="w-3 h-3 rounded-full border-2 border-emerald-400 border-t-transparent"
                              animate={{ rotate: 360 }} transition={{ duration: 0.7, repeat: Infinity, ease: 'linear' }}/>Pushing...</>
                          ) : pushDone ? (
                            <><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/></svg>Pushed</>
                          ) : (
                            <><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/></svg>Push to Excel</>
                          )}
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}

              </G>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── SECTION 9: LIVE LOGS ── */}
        {/* ── SECTION 9: LIVE LOGS ── */}
        <AnimatePresence>
          {logs.length > 0 && (
            <motion.div key="s9" initial={{ opacity:0, y:24 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0 }}>
              <div className="rounded-xl overflow-hidden"
                style={{ background: 'rgba(2,8,16,0.9)', border: '1px solid rgba(6,182,212,0.08)' }}>
                <div className="px-5 py-2.5 border-b flex items-center gap-2" style={{ borderColor: 'rgba(51,65,85,0.2)', background: 'rgba(6,15,30,0.5)' }}>
                  <div className="flex gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-red-500/60" />
                    <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/60" />
                    <div className="w-2.5 h-2.5 rounded-full bg-green-500/60" />
                  </div>
                  <span className="text-[10px] text-slate-600 ml-2 font-mono">execution.log</span>
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
      <div className="fixed bottom-3 right-4 text-[9px] text-slate-800 pointer-events-none select-none font-mono">
        <span className="neon-text-gold">BUILT BY ABHAY THAKUR</span>
      </div>
    </div>
  );
}
