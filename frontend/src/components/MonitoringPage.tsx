'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import GlobalHeader from '@/components/GlobalHeader';
import { useConnectionStore, globalApi } from '@/store/useConnectionStore';

interface AlertRecord {
  id: string; type: 'agent_offline' | 'job_failure'; name: string; status?: string;
  agent?: string; time: string; environment: string; operationalMemo: string;
  incidentNumbers: string[]; serviceNowLinks: string[]; teamsSent: boolean;
}

export default function MonitoringPage() {
  const { connected, environment } = useConnectionStore();
  const [running, setRunning] = useState(false);
  const [pollMin, setPollMin] = useState(5);
  const [monAgents, setMonAgents] = useState(true);
  const [monJobs, setMonJobs] = useState(true);
  const [alerts, setAlerts] = useState<AlertRecord[]>([]);
  const [lastRun, setLastRun] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<any>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [filter, setFilter] = useState<'all' | 'agent_offline' | 'job_failure'>('all');
  const logsRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (logsRef.current) logsRef.current.scrollTop = logsRef.current.scrollHeight; }, [logs]);
  const addLog = useCallback((msg: string) => { setLogs(p => [...p, `[${new Date().toLocaleTimeString('en-US', { hour12: false })}] ${msg}`]); }, []);

  useEffect(() => { if (connected) { fetchStatus(); fetchAlerts(); } }, [connected]);

  const fetchStatus = async () => {
    try {
      const res = await globalApi.getMonitoringStatus();
      const d = res.data?.data;
      setRunning(d?.running ?? false);
      setLastRun(d?.lastRunAt ?? null);
      setLastResult(d?.lastResult ?? null);
      if (d?.config) { setPollMin(Math.round((d.config.pollIntervalMs || 300000) / 60000)); setMonAgents(d.config.monitorAgents ?? true); setMonJobs(d.config.monitorJobs ?? true); }
    } catch {}
  };
  const fetchAlerts = async () => { try { const res = await globalApi.getAlerts(); setAlerts(res.data?.data?.alerts ?? []); } catch {} };
  const handleStart = async () => { try { await globalApi.startMonitoring({ pollIntervalMinutes: pollMin, monitorAgents: monAgents, monitorJobs: monJobs, environment }); setRunning(true); addLog(`Started — polling every ${pollMin}m`); } catch (e: any) { addLog('Start failed: ' + e.message); } };
  const handleStop = async () => { try { await globalApi.stopMonitoring(); setRunning(false); addLog('Stopped'); } catch (e: any) { addLog('Stop failed: ' + e.message); } };
  const handleRunNow = async () => { try { addLog('Running check...'); const res = await globalApi.runMonitoringNow(); const d = res.data?.data; setLastResult(d); setLastRun(new Date().toISOString()); addLog(`Done — agents: ${d?.agentAlerts ?? 0}, jobs: ${d?.jobAlerts ?? 0}`); await fetchAlerts(); } catch (e: any) { addLog('Failed: ' + e.message); } };

  const filteredAlerts = filter === 'all' ? alerts : alerts.filter(a => a.type === filter);

  return (
    <div className="min-h-screen relative scan-line" style={{ background: 'var(--bg-deep)' }}>
      <GlobalHeader title="Monitoring & Alerts" subtitle="TEAMS + SERVICENOW INTEGRATION" />

      <main className="max-w-6xl mx-auto px-6 pb-24 space-y-6">

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
                <button key={m} onClick={() => setPollMin(m)} disabled={running}
                  className="px-2 py-1 rounded text-[10px] font-bold transition-all"
                  style={{ background: pollMin === m ? 'rgba(6,182,212,0.12)' : 'transparent', border: pollMin === m ? '1px solid rgba(6,182,212,0.25)' : '1px solid transparent', color: pollMin === m ? '#67e8f9' : '#475569', opacity: running ? 0.5 : 1 }}>
                  {m}m
                </button>
              ))}
            </div>

            {/* Toggles */}
            {(['Agents', 'Jobs'] as const).map((label, i) => {
              const val = i === 0 ? monAgents : monJobs;
              const set = i === 0 ? setMonAgents : setMonJobs;
              return (
                <button key={label} onClick={() => !running && set(!val)} disabled={running}
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

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Total', val: alerts.length, color: '#94a3b8' },
            { label: 'Agent Offline', val: alerts.filter(a => a.type === 'agent_offline').length, color: '#f87171' },
            { label: 'Job Failures', val: alerts.filter(a => a.type === 'job_failure').length, color: '#fb923c' },
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
            <div className="flex gap-1.5">
              {(['all', 'agent_offline', 'job_failure'] as const).map(f => (
                <button key={f} onClick={() => setFilter(f)}
                  className="px-2 py-1 rounded text-[9px] font-bold transition-all"
                  style={{ background: filter === f ? 'rgba(6,182,212,0.1)' : 'transparent', border: filter === f ? '1px solid rgba(6,182,212,0.2)' : '1px solid transparent', color: filter === f ? '#67e8f9' : '#475569' }}>
                  {f === 'all' ? 'All' : f === 'agent_offline' ? 'Agents' : 'Jobs'}
                </button>
              ))}
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
