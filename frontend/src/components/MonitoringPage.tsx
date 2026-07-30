'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import GlobalHeader from '@/components/GlobalHeader';
import { useConnectionStore, globalApi } from '@/store/useConnectionStore';
import { useCopilotPageContext } from '@/hooks/useCopilotPageContext';

interface AlertRecord {
  id: string; type: 'agent_offline' | 'job_failure'; name: string; status?: string;
  agent?: string; time: string; environment: string; operationalMemo: string;
  incidentNumbers: string[]; serviceNowLinks: string[]; teamsSent: boolean;
}

export default function MonitoringPage() {
  const { connected, environment, sessionId } = useConnectionStore();
  // Copilot context is registered near the bottom, once the live counts exist.
  const [running, setRunning] = useState(false);
  const [pollMin, setPollMin] = useState(5);
  const [monAgents, setMonAgents] = useState(true);
  const [monJobs, setMonJobs] = useState(true);
  const [alerts, setAlerts] = useState<AlertRecord[]>([]);
  const [otherSessionRunning, setOtherSessionRunning] = useState<string | null>(null);
  const [lastRun, setLastRun] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<any>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [filter, setFilter] = useState<'all' | 'agent_offline' | 'job_failure'>('all');
  const [monitoringSessionId, setMonitoringSessionId] = useState<string | null>(null);
  const logsRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (logsRef.current) logsRef.current.scrollTop = logsRef.current.scrollHeight; }, [logs]);
  const addLog = useCallback((msg: string) => { setLogs(p => [...p, `[${new Date().toLocaleTimeString('en-US', { hour12: false })}] ${msg}`]); }, []);

  useEffect(() => {
    if (!connected) return;
    fetchStatus();
    fetchAlerts();
    // Poll status periodically — also refreshes the background monitor's token
    // from the live session on the backend, preventing recurring 401s.
    const id = setInterval(() => { fetchStatus(); fetchAlerts(); }, 30000);
    return () => clearInterval(id);
  }, [connected]);

  const fetchStatus = async () => {
    try {
      const res = await globalApi.getMonitoringStatus();
      const d = res.data?.data;
      setRunning(d?.running ?? false);
      setLastRun(d?.lastRunAt ?? null);
      setLastResult(d?.lastResult ?? null);
      
      // Check if monitoring is running for a DIFFERENT session
      if (d?.config) {
        // We don't get the sessionId in the response config, but we can infer
        // if running=true and we're not the owner, show a warning
        setOtherSessionRunning(d.runningAnyEnv && !d.running ? 'another' : null);
      } else {
        setOtherSessionRunning(null);
      }
      
      if (d?.config) { setPollMin(Math.round((d.config.pollIntervalMs || 300000) / 60000)); setMonAgents(d.config.monitorAgents ?? true); setMonJobs(d.config.monitorJobs ?? true); }
    } catch {}
  };
  const fetchAlerts = async () => { try { const res = await globalApi.getAlerts(); setAlerts(res.data?.data?.alerts ?? []); } catch {} };

  // Start/restart monitoring with explicit config (used for live reconfigure).
  const startWith = async (cfg: { pollMin: number; monAgents: boolean; monJobs: boolean }) => {
    await globalApi.startMonitoring({ pollIntervalMinutes: cfg.pollMin, monitorAgents: cfg.monAgents, monitorJobs: cfg.monJobs, environment });
  };
  const handleStart = async () => { try { await startWith({ pollMin, monAgents, monJobs }); setRunning(true); addLog(`Started — polling every ${pollMin}m`); } catch (e: any) { addLog('Start failed: ' + e.message); } };
  const handleStop = async () => { try { await globalApi.stopMonitoring(); setRunning(false); addLog('Stopped'); } catch (e: any) { addLog('Stop failed: ' + e.message); } };
  const handleClearHistory = async () => { try { await globalApi.clearMonitoringState(); setAlerts([]); addLog('Cleared alert state and history'); } catch (e: any) { addLog('Clear failed: ' + e.message); } };
  const handleRunNow = async () => { try { addLog('Running check...'); const res = await globalApi.runMonitoringNow(); const d = res.data?.data; setLastResult(d); setLastRun(new Date().toISOString()); addLog(`Done — ${d?.agentsTotal ?? 0} agents (${d?.agentsOffline ?? 0} offline), ${d?.jobsFailed ?? 0} failed today · ${d?.agentAlerts ?? 0} new agent alert(s), ${d?.jobAlerts ?? 0} new job alert(s)`); await fetchAlerts(); } catch (e: any) { addLog('Failed: ' + e.message); } };

  // Config controls are always interactive. When monitoring is already running,
  // a change is applied live by restarting the cycle with the new settings.
  const applyPoll = (m: number) => { setPollMin(m); if (running) { startWith({ pollMin: m, monAgents, monJobs }).then(() => addLog(`Reconfigured — every ${m}m`)).catch(() => {}); } };
  const applyToggle = (which: 'agents' | 'jobs') => {
    const nextAgents = which === 'agents' ? !monAgents : monAgents;
    const nextJobs   = which === 'jobs'   ? !monJobs   : monJobs;
    if (which === 'agents') setMonAgents(nextAgents); else setMonJobs(nextJobs);
    if (running) { startWith({ pollMin, monAgents: nextAgents, monJobs: nextJobs }).then(() => addLog('Reconfigured monitors')).catch(() => {}); }
  };

  const filteredAlerts = filter === 'all' ? alerts : alerts.filter(a => a.type === filter);

  // ── AI Operations Copilot context ───────────────────────────────────────────
  // Sharing the live counts lets the Copilot answer "why am I seeing this" with
  // reference to the actual cycle rather than in the abstract.
  useCopilotPageContext('monitoring', {
    step: running ? 'monitoring active' : 'monitoring stopped',
    detail: {
      running,
      pollIntervalMinutes: pollMin,
      monitorAgents: monAgents,
      monitorJobs: monJobs,
      environment,
      alertCount: alerts.length,
      agentsOffline: lastResult?.agentsOffline,
      jobsFailedToday: lastResult?.jobsFailed,
      lastRun: lastRun || undefined,
    },
  });

  return (
    <div className="min-h-screen relative scan-line" style={{ background: 'var(--bg-deep)' }}>
      <GlobalHeader title="Monitoring & Alerts" subtitle="TEAMS + SERVICENOW INTEGRATION" />

      <main className="max-w-6xl mx-auto px-6 pb-24 space-y-6">

        {/* Session ownership warning */}
        {otherSessionRunning && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="rounded-lg px-4 py-2.5 flex items-center gap-2 text-[11px]"
            style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)', color: '#fbbf24' }}>
            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            Monitoring is currently running in <b>another session</b>. Each user must start monitoring with their own session. Click <b>Stop</b> to end the current session's monitoring or <b>Start</b> to begin monitoring with your own session.
          </motion.div>
        )}
        
        {/* Control Bar */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-4">
          <div className="flex flex-wrap items-center gap-3">
            {/* Status */}
            <div className="flex items-center gap-2">
              <motion.div className="w-2.5 h-2.5 rounded-full" style={{ background: running ? '#22c55e' : '#475569' }}
                animate={running ? { scale: [1, 1.2, 1] } : {}} transition={{ duration: 1.5, repeat: Infinity }} />
              <span className="text-xs font-bold" style={{ color: running ? '#4ade80' : '#64748b' }}>
                {running ? `Active (${pollMin}m)` : 'Stopped'}
              </span>
            </div>

            <div className="flex-1" />

            {/* Poll interval */}
            <div className="flex items-center gap-1">
              {[1, 5, 10, 15].map(m => (
                <button key={m} onClick={() => applyPoll(m)}
                  className="px-2 py-1 rounded text-[10px] font-bold transition-all"
                  style={{ background: pollMin === m ? 'rgba(6,182,212,0.12)' : 'transparent', border: pollMin === m ? '1px solid rgba(6,182,212,0.25)' : '1px solid transparent', color: pollMin === m ? '#67e8f9' : '#475569' }}>
                  {m}m
                </button>
              ))}
            </div>

            {/* Toggles */}
            {(['Agents', 'Jobs'] as const).map((label, i) => {
              const val = i === 0 ? monAgents : monJobs;
              return (
                <button key={label} onClick={() => applyToggle(i === 0 ? 'agents' : 'jobs')}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[10px] font-bold transition-all"
                  style={{ background: val ? 'rgba(6,182,212,0.08)' : 'transparent', border: val ? '1px solid rgba(6,182,212,0.2)' : '1px solid rgba(51,65,85,0.15)', color: val ? '#67e8f9' : '#475569' }}>
                  <div className="w-2.5 h-2.5 rounded-sm" style={{ background: val ? '#06b6d4' : 'rgba(51,65,85,0.3)' }} />
                  {label}
                </button>
              );
            })}

            {/* Actions */}
            {!running ? (
              <button onClick={handleStart} disabled={!connected} className="btn-success px-4 py-2 rounded-lg text-[10px] disabled:opacity-40">Start</button>
            ) : (
              <button onClick={handleStop} className="btn-danger px-4 py-2 rounded-lg text-[10px]">Stop</button>
            )}
            <button onClick={handleRunNow} disabled={!running} className="btn-primary px-4 py-2 rounded-lg text-[10px] disabled:opacity-40">Run Now</button>
          </div>
        </motion.div>

        {/* Stats — live counts from the latest monitoring cycle (run Start or Run Now to populate) */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Total Agents', val: lastResult?.agentsTotal ?? '—', color: '#67e8f9' },
            { label: 'Agents Offline', val: lastResult?.agentsOffline ?? '—', color: '#f87171' },
            { label: 'Failed (today)', val: lastResult?.jobsFailed ?? '—', color: '#fb923c' },
            { label: 'Incidents', val: alerts.filter(a => a.incidentNumbers.length > 0).length, color: '#a78bfa' },
          ].map(s => (
            <div key={s.label} className="stat-card">
              <div className="text-2xl font-black tabular-nums" style={{ color: s.color }}>{s.val}</div>
              <div className="text-[8px] text-slate-600 uppercase tracking-widest mt-1 font-bold">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Alert History */}
        <div className="glass-card overflow-hidden">
          <div className="px-5 py-3 border-b flex items-center justify-between" style={{ borderColor: 'rgba(51,65,85,0.1)' }}>
            <span className="text-[10px] font-bold text-slate-500 tracking-wider">ALERT HISTORY</span>
            <div className="flex gap-1.5 items-center">
              {(['all', 'agent_offline', 'job_failure'] as const).map(f => (
                <button key={f} onClick={() => setFilter(f)}
                  className="px-2 py-1 rounded text-[9px] font-bold transition-all"
                  style={{ background: filter === f ? 'rgba(6,182,212,0.1)' : 'transparent', border: filter === f ? '1px solid rgba(6,182,212,0.2)' : '1px solid transparent', color: filter === f ? '#67e8f9' : '#475569' }}>
                  {f === 'all' ? 'All' : f === 'agent_offline' ? 'Agents' : 'Jobs'}
                </button>
              ))}
              <button onClick={handleClearHistory}
                className="px-2 py-1 rounded text-[9px] font-bold transition-all"
                style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171' }}>
                Clear
              </button>
            </div>
          </div>
          <div className="max-h-96 overflow-auto custom-scroll divide-y" style={{ divideColor: 'rgba(51,65,85,0.08)' } as React.CSSProperties}>
            {filteredAlerts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-slate-700">
                <svg className="w-8 h-8 mb-2 text-slate-800" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/></svg>
                <p className="text-xs">{connected ? 'No alerts yet.' : 'Connect to view alerts.'}</p>
              </div>
            ) : (
              filteredAlerts.map(alert => (
                <motion.div key={alert.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="px-5 py-3 hover:bg-slate-800/10 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full shrink-0" style={{ background: alert.type === 'agent_offline' ? '#f87171' : '#fb923c' }} />
                    <span className="text-xs font-bold text-slate-200 truncate">{alert.name}</span>
                    <span className="text-[9px] px-1.5 py-0.5 rounded font-bold"
                      style={{ background: alert.type === 'agent_offline' ? 'rgba(239,68,68,0.1)' : 'rgba(251,146,60,0.1)', color: alert.type === 'agent_offline' ? '#f87171' : '#fb923c' }}>
                      {alert.type === 'agent_offline' ? 'OFFLINE' : 'FAILED'}
                    </span>
                    {alert.teamsSent && <span className="text-[8px] text-emerald-600 font-mono">TEAMS ✓</span>}
                    <span className="flex-1" />
                    <span className="text-[9px] text-slate-600 font-mono">{new Date(alert.time).toLocaleString()}</span>
                  </div>
                  {alert.incidentNumbers.length > 0 && (
                    <div className="flex gap-1.5 mt-1.5 ml-5">
                      {alert.incidentNumbers.map((inc, i) => (
                        <a key={inc} href={alert.serviceNowLinks[i]} target="_blank" rel="noopener noreferrer"
                          className="text-[9px] px-1.5 py-0.5 rounded font-mono font-bold"
                          style={{ background: 'rgba(167,139,250,0.1)', border: '1px solid rgba(167,139,250,0.2)', color: '#a78bfa' }}>
                          {inc}
                        </a>
                      ))}
                    </div>
                  )}
                </motion.div>
              ))
            )}
          </div>
        </div>

        {/* Logs */}
        <div className="terminal">
          <div className="terminal-header">
            <div className="terminal-dot" style={{ background: 'rgba(239,68,68,0.6)' }} />
            <div className="terminal-dot" style={{ background: 'rgba(234,179,8,0.6)' }} />
            <div className="terminal-dot" style={{ background: 'rgba(34,197,94,0.6)' }} />
            <span className="text-[9px] text-slate-600 font-mono ml-2">monitoring.log</span>
            <span className="flex-1" />
            <button onClick={() => setLogs([])} className="text-[9px] text-slate-700 hover:text-slate-400">Clear</button>
          </div>
          <div ref={logsRef} className="p-4 h-32 overflow-auto custom-scroll font-mono text-[10px] space-y-0.5">
            {logs.length === 0 ? <p className="text-slate-800">{'>'} Waiting...</p> : logs.map((l, i) => (
              <div key={i} style={{ color: l.includes('failed') || l.includes('Error') ? '#f87171' : l.includes('Started') || l.includes('Done') ? '#4ade80' : '#64748b' }}>{l}</div>
            ))}
          </div>
        </div>

        <footer className="section-line mt-10" />
        <p className="text-center text-[9px] font-mono text-slate-800 py-4">DESIGNED AND ENGINEERED BY ABHAY THAKUR</p>
      </main>
    </div>
  );
}
