'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import GlobalHeader from '@/components/GlobalHeader';
import { useConnectionStore, globalApi } from '@/store/useConnectionStore';

interface AlertRecord {
  id:              string;
  type:            'agent_offline' | 'job_failure';
  name:            string;
  status?:         string;
  agent?:          string;
  time:            string;
  environment:     string;
  operationalMemo: string;
  incidentNumbers: string[];
  serviceNowLinks: string[];
  teamsSent:       boolean;
}

export default function MonitoringPage() {
  const { connected, environment } = useConnectionStore();

  const [running, setRunning]       = useState(false);
  const [pollMin, setPollMin]       = useState(5);
  const [monAgents, setMonAgents]   = useState(true);
  const [monJobs, setMonJobs]       = useState(true);
  const [alerts, setAlerts]         = useState<AlertRecord[]>([]);
  const [lastRun, setLastRun]       = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<any>(null);
  const [logs, setLogs]             = useState<string[]>([]);
  const [filter, setFilter]         = useState<'all' | 'agent_offline' | 'job_failure'>('all');
  const logsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logsRef.current) logsRef.current.scrollTop = logsRef.current.scrollHeight;
  }, [logs]);

  const addLog = useCallback((msg: string) => {
    const ts = new Date().toLocaleTimeString('en-US', { hour12: false });
    setLogs(p => [...p, `[${ts}] ${msg}`]);
  }, []);

  // Fetch status + alerts on mount and when connected
  useEffect(() => {
    if (connected) {
      fetchStatus();
      fetchAlerts();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected]);

  const fetchStatus = async () => {
    try {
      const res = await globalApi.getMonitoringStatus();
      const d = res.data?.data;
      setRunning(d?.running ?? false);
      setLastRun(d?.lastRunAt ?? null);
      setLastResult(d?.lastResult ?? null);
      if (d?.config) {
        setPollMin(Math.round((d.config.pollIntervalMs || 300000) / 60000));
        setMonAgents(d.config.monitorAgents ?? true);
        setMonJobs(d.config.monitorJobs ?? true);
      }
    } catch { /* silent */ }
  };

  const fetchAlerts = async () => {
    try {
      const res = await globalApi.getAlerts();
      setAlerts(res.data?.data?.alerts ?? []);
    } catch { /* silent */ }
  };

  const handleStart = async () => {
    try {
      await globalApi.startMonitoring({
        pollIntervalMinutes: pollMin,
        monitorAgents:       monAgents,
        monitorJobs:         monJobs,
        environment,
      });
      setRunning(true);
      addLog(`Monitoring started — polling every ${pollMin} min`);
    } catch (e: any) { addLog('Start failed: ' + e.message); }
  };

  const handleStop = async () => {
    try {
      await globalApi.stopMonitoring();
      setRunning(false);
      addLog('Monitoring stopped');
    } catch (e: any) { addLog('Stop failed: ' + e.message); }
  };

  const handleRunNow = async () => {
    try {
      addLog('Running manual check...');
      const res = await globalApi.runMonitoringNow();
      const d = res.data?.data;
      setLastResult(d);
      setLastRun(new Date().toISOString());
      addLog(`Done — agent alerts: ${d?.agentAlerts ?? 0}, job alerts: ${d?.jobAlerts ?? 0}`);
      if (d?.errors?.length) d.errors.forEach((e: string) => addLog('Error: ' + e));
      await fetchAlerts();
    } catch (e: any) { addLog('Run failed: ' + e.message); }
  };

  const filteredAlerts = filter === 'all' ? alerts : alerts.filter(a => a.type === filter);

  return (
    <div className="min-h-screen grid-bg scan-line" style={{ background: '#020812' }}>
      <GlobalHeader title="Monitoring & Alerts" subtitle="Teams notifications + ServiceNow tracking" />

      <main className="pt-20 max-w-7xl mx-auto px-6 pb-24 space-y-6">

        {/* Control bar */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
          className="flex flex-wrap items-center gap-3 p-4 rounded-2xl border"
          style={{ background: 'rgba(15,23,42,0.5)', borderColor: 'rgba(51,65,85,0.5)' }}>

          {/* Status indicator */}
          <div className="flex items-center gap-2">
            {running ? (
              <motion.span className="w-2 h-2 rounded-full bg-emerald-400 inline-block"
                animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 1.5, repeat: Infinity }} />
            ) : (
              <span className="w-2 h-2 rounded-full bg-slate-600 inline-block" />
            )}
            <span className="text-sm font-medium" style={{ color: running ? '#4ade80' : '#64748b' }}>
              {running ? `Monitoring Active (every ${pollMin}m)` : 'Monitoring Stopped'}
            </span>
          </div>

          <div className="flex-1" />

          {/* Poll interval */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-600">Poll:</span>
            {[1, 5, 10, 15].map(m => (
              <button key={m} onClick={() => setPollMin(m)} disabled={running}
                className="px-2 py-1 rounded text-xs font-medium transition-all"
                style={{
                  background: pollMin === m ? 'rgba(6,182,212,0.15)' : 'rgba(15,23,42,0.6)',
                  border: pollMin === m ? '1px solid rgba(6,182,212,0.4)' : '1px solid rgba(51,65,85,0.4)',
                  color: pollMin === m ? '#67e8f9' : '#64748b',
                  opacity: running ? 0.5 : 1,
                }}>
                {m}m
              </button>
            ))}
          </div>

          {/* Toggle agents/jobs */}
          {(['Agents', 'Jobs'] as const).map((label, i) => {
            const val = i === 0 ? monAgents : monJobs;
            const set = i === 0 ? setMonAgents : setMonJobs;
            return (
              <button key={label} onClick={() => !running && set(!val)} disabled={running}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                style={{
                  background: val ? 'rgba(6,182,212,0.1)' : 'rgba(15,23,42,0.6)',
                  border: val ? '1px solid rgba(6,182,212,0.3)' : '1px solid rgba(51,65,85,0.4)',
                  color: val ? '#67e8f9' : '#64748b',
                  opacity: running ? 0.6 : 1,
                }}>
                <div className="w-3 h-3 rounded-full border flex items-center justify-center"
                  style={{ borderColor: val ? '#06b6d4' : '#334155', background: val ? '#06b6d4' : 'transparent' }}>
                  {val && <svg className="w-2 h-2 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>}
                </div>
                {label}
              </button>
            );
          })}

          {/* Action buttons */}
          {!running ? (
            <button onClick={handleStart} disabled={!connected}
              className="px-4 py-2 rounded-lg text-sm font-semibold transition-all"
              style={{
                background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.4)',
                color: '#4ade80', opacity: !connected ? 0.4 : 1, cursor: !connected ? 'not-allowed' : 'pointer',
              }}>
              Start
            </button>
          ) : (
            <button onClick={handleStop}
              className="px-4 py-2 rounded-lg text-sm font-semibold transition-all"
              style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.4)', color: '#f87171' }}>
              Stop
            </button>
          )}
          <button onClick={handleRunNow} disabled={!running}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
            style={{
              background: 'rgba(6,182,212,0.1)', border: '1px solid rgba(6,182,212,0.3)',
              color: '#67e8f9', opacity: !running ? 0.4 : 1, cursor: !running ? 'not-allowed' : 'pointer',
            }}>
            Run Now
          </button>
          <button onClick={fetchAlerts}
            className="px-3 py-2 rounded-lg text-xs text-slate-500 hover:text-slate-300 transition-colors"
            style={{ border: '1px solid rgba(51,65,85,0.4)' }}>
            Refresh
          </button>
        </motion.div>

        {/* Last run status */}
        {(lastRun || lastResult) && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'Status',       value: running ? 'Active' : 'Stopped', color: running ? '#22c55e' : '#64748b' },
              { label: 'Last Run',     value: lastRun ? new Date(lastRun).toLocaleTimeString() : '—', color: '#94a3b8' },
              { label: 'Agent Alerts', value: String(lastResult?.agentAlerts ?? 0), color: (lastResult?.agentAlerts ?? 0) > 0 ? '#ef4444' : '#22c55e' },
              { label: 'Job Alerts',   value: String(lastResult?.jobAlerts   ?? 0), color: (lastResult?.jobAlerts   ?? 0) > 0 ? '#ef4444' : '#22c55e' },
            ].map(s => (
              <div key={s.label} className="rounded-xl p-4" style={{ background: 'rgba(15,23,42,0.5)', border: '1px solid rgba(51,65,85,0.4)' }}>
                <div className="text-2xl font-bold" style={{ color: s.color }}>{s.value}</div>
                <div className="text-[10px] text-slate-600 uppercase tracking-wider mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Total Alerts',   val: alerts.length,                                           color: '#94a3b8' },
            { label: 'Agent Offline',  val: alerts.filter(a => a.type === 'agent_offline').length,   color: '#f87171' },
            { label: 'Job Failures',   val: alerts.filter(a => a.type === 'job_failure').length,     color: '#fb923c' },
            { label: 'With Incidents', val: alerts.filter(a => a.incidentNumbers.length > 0).length, color: '#a78bfa' },
          ].map(s => (
            <div key={s.label} className="rounded-xl p-4" style={{ background: 'rgba(15,23,42,0.5)', border: '1px solid rgba(51,65,85,0.4)' }}>
              <div className="text-2xl font-bold" style={{ color: s.color }}>{s.val}</div>
              <div className="text-[10px] text-slate-600 uppercase tracking-wider mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Alert history */}
        <motion.section initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border overflow-hidden"
          style={{ background: 'rgba(15,23,42,0.5)', borderColor: 'rgba(51,65,85,0.5)' }}>
          <div className="flex items-center justify-between px-5 py-3 border-b" style={{ borderColor: 'rgba(51,65,85,0.4)' }}>
            <h2 className="text-xs font-semibold tracking-widest uppercase text-slate-500">Alert History</h2>
            <div className="flex gap-2">
              {(['all', 'agent_offline', 'job_failure'] as const).map(f => (
                <button key={f} onClick={() => setFilter(f)}
                  className="px-2.5 py-1 rounded text-[10px] font-medium transition-all"
                  style={{
                    background: filter === f ? 'rgba(6,182,212,0.15)' : 'transparent',
                    border: filter === f ? '1px solid rgba(6,182,212,0.3)' : '1px solid rgba(51,65,85,0.3)',
                    color: filter === f ? '#67e8f9' : '#64748b',
                  }}>
                  {f === 'all' ? 'All' : f === 'agent_offline' ? 'Agents' : 'Jobs'}
                </button>
              ))}
            </div>
          </div>

          <div className="divide-y max-h-[500px] overflow-auto" style={{ divideColor: 'rgba(51,65,85,0.3)' } as React.CSSProperties}>
            {filteredAlerts.length === 0 ? (
              <div className="flex items-center justify-center py-16 text-slate-700 text-sm">
                {connected ? 'No alerts yet. Start monitoring to detect issues.' : 'Connect to view alert history.'}
              </div>
            ) : (
              filteredAlerts.map(alert => (
                <motion.div key={alert.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
                  className="px-5 py-4 hover:bg-slate-800/20 transition-colors">
                  <div className="flex items-start gap-3 min-w-0">
                    {/* Type icon */}
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                      style={{
                        background: alert.type === 'agent_offline' ? 'rgba(239,68,68,0.15)' : 'rgba(251,146,60,0.15)',
                        border: alert.type === 'agent_offline' ? '1px solid rgba(239,68,68,0.3)' : '1px solid rgba(251,146,60,0.3)',
                      }}>
                      {alert.type === 'agent_offline' ? (
                        <svg className="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17H3a2 2 0 01-2-2V5a2 2 0 012-2h14a2 2 0 012 2v10a2 2 0 01-2 2h-2" />
                        </svg>
                      ) : (
                        <svg className="w-4 h-4 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-slate-200 truncate">{alert.name}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                          style={{
                            background: alert.type === 'agent_offline' ? 'rgba(239,68,68,0.15)' : 'rgba(251,146,60,0.15)',
                            color: alert.type === 'agent_offline' ? '#f87171' : '#fb923c',
                          }}>
                          {alert.type === 'agent_offline' ? 'AGENT OFFLINE' : 'JOB FAILED'}
                        </span>
                        {alert.teamsSent && (
                          <span className="text-[10px] text-emerald-600">Teams notified</span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1 flex-wrap">
                        <span className="text-xs text-slate-500">{new Date(alert.time).toLocaleString()}</span>
                        {alert.agent && <span className="text-xs text-slate-600">{alert.agent}</span>}
                        <span className="text-xs text-slate-700">{alert.environment}</span>
                      </div>
                      {alert.operationalMemo && (
                        <p className="text-xs text-slate-500 mt-1 font-mono truncate max-w-lg">{alert.operationalMemo}</p>
                      )}
                      {alert.incidentNumbers.length > 0 && (
                        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                          {alert.incidentNumbers.map((inc, i) => (
                            <a key={inc} href={alert.serviceNowLinks[i]} target="_blank" rel="noopener noreferrer"
                              className="text-xs px-2 py-0.5 rounded font-medium transition-colors hover:opacity-80"
                              style={{ background: 'rgba(167,139,250,0.15)', border: '1px solid rgba(167,139,250,0.3)', color: '#a78bfa' }}>
                              {inc}
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))
            )}
          </div>
        </motion.section>

        {/* Logs */}
        <div className="rounded-2xl border overflow-hidden" style={{ background: 'rgba(2,8,18,0.9)', borderColor: 'rgba(6,182,212,0.12)' }}>
          <div className="flex items-center justify-between px-4 py-2.5 border-b" style={{ borderColor: 'rgba(6,182,212,0.1)' }}>
            <div className="flex items-center gap-2">
              <div className="flex gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500/60" />
                <span className="w-2.5 h-2.5 rounded-full bg-yellow-500/60" />
                <span className="w-2.5 h-2.5 rounded-full bg-green-500/60" />
              </div>
              <span className="text-xs text-slate-600 font-mono ml-2">monitoring.log</span>
            </div>
            <button onClick={() => setLogs([])} className="text-[10px] text-slate-700 hover:text-slate-500">Clear</button>
          </div>
          <div ref={logsRef} className="p-4 h-36 overflow-auto space-y-1 font-mono">
            {logs.length === 0 ? (
              <p className="text-xs text-slate-800">{'>'} Waiting for activity...</p>
            ) : (
              logs.map((l, i) => (
                <div key={i} className="text-xs" style={{
                  color: l.includes('failed') || l.includes('Error') ? '#f87171' :
                         l.includes('started') || l.includes('Done') ? '#4ade80' : '#94a3b8',
                }}>{l}</div>
              ))
            )}
          </div>
        </div>

        <footer className="border-t py-6 text-center" style={{ borderColor: 'rgba(6,182,212,0.06)' }}>
          <p className="text-xs text-slate-700">Built by <span className="text-slate-500 font-medium">Abhay Thakur</span></p>
        </footer>
      </main>
    </div>
  );
}
