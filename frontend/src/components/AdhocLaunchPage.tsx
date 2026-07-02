'use client';
import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import GlobalHeader from '@/components/GlobalHeader';
import { useConnectionStore, globalApi } from '@/store/useConnectionStore';

type Kind = 'task' | 'workflow' | 'trigger';
interface SearchResult { kind: Kind; name: string; type?: string; enabled?: boolean; agent?: string; tasks?: string[]; }
interface Inst {
  key: string;            // stable client-side key (for render + removal)
  id: string; name: string; status: string; kind: 'success' | 'failed' | 'running' | 'other';
  terminal: boolean; agent?: string; startTime?: string; endTime?: string; exitCode?: string; statusDescription?: string;
  launchedAt: number; finishedAt?: number; busy?: string | null;
}

const KIND_META: Record<Kind, { label: string; color: string }> = {
  task:     { label: 'TASK',     color: '#06b6d4' },
  workflow: { label: 'WORKFLOW', color: '#a855f7' },
  trigger:  { label: 'TRIGGER',  color: '#f59e0b' },
};

function statusColor(kind: Inst['kind']) {
  return kind === 'success' ? '#22c55e' : kind === 'failed' ? '#ef4444' : kind === 'running' ? '#06b6d4' : '#94a3b8';
}

function elapsed(ms: number) {
  if (ms < 0) ms = 0;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, '0')}s`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
}

const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

export default function AdhocLaunchPage() {
  const { connected } = useConnectionStore();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [instances, setInstances] = useState<Inst[]>([]);
  const [launchingName, setLaunchingName] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const debounceRef = useRef<any>(null);
  const instRef = useRef<Inst[]>([]);
  useEffect(() => { instRef.current = instances; }, [instances]);

  // Live 1s clock so elapsed time ticks smoothly between polls.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // ── Debounced global search ──────────────────────────────────────────────
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim() || !connected) { setResults([]); return; }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await globalApi.adhocSearch(query.trim());
        setResults(res.data?.data?.results || []);
      } catch { setResults([]); }
      finally { setSearching(false); }
    }, 350);
    return () => clearTimeout(debounceRef.current);
  }, [query, connected]);

  // ── Launch ─────────────────────────────────────────────────────────────────
  const launch = useCallback(async (r: SearchResult) => {
    setLaunchingName(r.name);
    try {
      const res = await globalApi.adhocLaunch(r.kind, r.name);
      const launched: Inst[] = (res.data?.data?.instances || []).map((i: any) => ({
        key: uid(), id: i.id, name: i.name, status: 'Launching', kind: 'running' as const, terminal: false,
        launchedAt: Date.now(), busy: null,
      }));
      if (launched.length) setInstances(prev => [...launched, ...prev].slice(0, 30));
    } catch (e: any) {
      alert('Launch failed: ' + (e.response?.data?.error || e.message));
    } finally {
      setLaunchingName(null);
    }
  }, []);

  // ── Live polling of non-terminal instances ──────────────────────────────────
  useEffect(() => {
    const tick = async () => {
      const active = instRef.current.filter(i => !i.terminal);
      if (!active.length) return;
      try {
        const res = await globalApi.adhocStatus(active.map(i => ({ id: i.id, name: i.name })));
        const updates: any[] = res.data?.data?.instances || [];
        setInstances(prev => prev.map(i => {
          if (i.terminal) return i;
          const u = updates.find(x => (x.id && x.id === i.id) || x.name === i.name);
          if (!u) return i;
          // When the instance first reaches a terminal state, freeze the clock.
          const finishedAt = u.terminal && !i.finishedAt ? Date.now() : i.finishedAt;
          return { ...i, ...u, key: i.key, launchedAt: i.launchedAt, finishedAt, busy: i.busy };
        }));
      } catch { /* transient */ }
    };
    const id = setInterval(tick, 3000);
    return () => clearInterval(id);
  }, []);

  const doOp = useCallback(async (inst: Inst, op: string) => {
    setInstances(prev => prev.map(i => i.key === inst.key ? { ...i, busy: op } : i));
    try {
      await globalApi.adhocOp(op, inst.id, inst.name);
      const res = await globalApi.adhocStatus([{ id: inst.id, name: inst.name }]);
      const u = res.data?.data?.instances?.[0];
      setInstances(prev => prev.map(i => i.key === inst.key
        ? { ...i, ...(u || {}), key: i.key, launchedAt: i.launchedAt,
            finishedAt: u?.terminal ? (i.finishedAt || Date.now()) : undefined, busy: null }
        : i));
    } catch (e: any) {
      alert(`${op} failed: ` + (e.response?.data?.error || e.message));
      setInstances(prev => prev.map(i => i.key === inst.key ? { ...i, busy: null } : i));
    }
  }, []);

  const removeInst = (key: string) => setInstances(prev => prev.filter(i => i.key !== key));
  const clearFinished = () => setInstances(prev => prev.filter(i => !i.terminal));
  const clearAll = () => setInstances([]);

  const opsFor = (i: Inst): { op: string; label: string; color: string }[] => {
    if (i.terminal) return [{ op: 'rerun', label: '↻ Rerun', color: '#06b6d4' }];
    if (i.status === 'Held') return [
      { op: 'release', label: '▶ Release', color: '#22c55e' },
      { op: 'cancel', label: '✖ Cancel', color: '#ef4444' },
      { op: 'forcefinish', label: '⏹ Force Finish', color: '#f59e0b' },
    ];
    return [
      { op: 'hold', label: '⏸ Hold', color: '#eab308' },
      { op: 'cancel', label: '✖ Cancel', color: '#ef4444' },
      { op: 'forcefinish', label: '⏹ Force Finish', color: '#f59e0b' },
      { op: 'halt', label: '⛔ Halt+FF', color: '#f97316' },
    ];
  };

  const activeCount = instances.filter(i => !i.terminal).length;
  const doneCount = instances.length - activeCount;

  return (
    <div className="min-h-screen relative scan-line" style={{ background: 'var(--bg-deep)' }}>
      {/* Ambient */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <motion.div className="absolute w-[520px] h-[520px] rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(6,182,212,0.05) 0%, transparent 70%)', right: '-8%', top: '6%' }}
          animate={{ y: [0, -20, 0], scale: [1, 1.06, 1] }} transition={{ duration: 15, repeat: Infinity, ease: 'easeInOut' }} />
        <motion.div className="absolute w-[420px] h-[420px] rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(168,85,247,0.04) 0%, transparent 70%)', left: '-5%', bottom: '8%' }}
          animate={{ y: [0, 16, 0] }} transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut', delay: 3 }} />
      </div>

      <GlobalHeader title="Ad-hoc Launch" subtitle="GLOBAL SEARCH · LAUNCH · LIVE MONITOR" />

      <main className="max-w-5xl mx-auto px-6 pb-24 pt-6 space-y-6 relative z-10">

        {/* Search */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-5">
          <div className="flex items-center gap-3 rounded-xl px-4 py-3 relative overflow-hidden"
            style={{ background: 'rgba(2,8,18,0.8)', border: '1px solid rgba(51,65,85,0.3)' }}>
            {searching && (
              <motion.div className="absolute bottom-0 left-0 h-[2px]"
                style={{ background: 'linear-gradient(90deg, transparent, #22d3ee, transparent)', width: '40%' }}
                animate={{ x: ['-40%', '260%'] }} transition={{ duration: 1.1, repeat: Infinity, ease: 'linear' }} />
            )}
            <svg className="w-5 h-5 text-cyan-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input value={query} onChange={e => setQuery(e.target.value)} disabled={!connected}
              placeholder="Search any task, workflow, or trigger by name…"
              className="flex-1 bg-transparent text-sm text-slate-200 placeholder:text-slate-600 outline-none font-mono" />
            {query && <button onClick={() => setQuery('')} className="text-slate-600 hover:text-slate-400 text-xs">✕</button>}
          </div>
          {!connected && <p className="text-[11px] text-amber-500/80 mt-2">Connect to an environment first.</p>}

          {/* Results */}
          <AnimatePresence>
            {results.length > 0 && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                className="mt-3 space-y-1.5 max-h-80 overflow-auto custom-scroll">
                {results.map((r, i) => {
                  const m = KIND_META[r.kind];
                  return (
                    <motion.div key={`${r.kind}:${r.name}`} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(i * 0.02, 0.3) }}
                      whileHover={{ x: 3 }}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-lg"
                      style={{ background: 'rgba(2,8,18,0.5)', border: '1px solid rgba(51,65,85,0.2)' }}>
                      <span className="px-1.5 py-0.5 rounded text-[8px] font-bold tracking-wider shrink-0"
                        style={{ background: `${m.color}1a`, border: `1px solid ${m.color}44`, color: m.color }}>{m.label}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-mono font-bold text-slate-200 truncate">{r.name}</p>
                        <p className="text-[9px] text-slate-600 font-mono">{r.type || ''}{r.kind === 'trigger' ? (r.enabled ? ' · enabled' : ' · disabled') : ''}{r.agent ? ` · ${r.agent}` : ''}</p>
                      </div>
                      <motion.button onClick={() => launch(r)} disabled={launchingName === r.name}
                        whileTap={{ scale: 0.95 }}
                        className="px-3 py-1.5 rounded-lg text-[10px] font-bold shrink-0 transition-all hover:scale-105 disabled:opacity-50"
                        style={{ background: `${m.color}1a`, border: `1px solid ${m.color}55`, color: m.color }}>
                        {launchingName === r.name ? 'Launching…' : (r.kind === 'trigger' ? '⚡ Trigger Now' : '🚀 Launch')}
                      </motion.button>
                    </motion.div>
                  );
                })}
              </motion.div>
            )}
          </AnimatePresence>
          {query.trim() && !searching && results.length === 0 && connected && (
            <p className="text-[11px] text-slate-600 mt-3 text-center">No tasks, workflows, or triggers match “{query}”.</p>
          )}
        </motion.div>

        {/* Live Monitor header */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="w-1 h-5 rounded-full bg-cyan-500" />
          <h2 className="text-sm font-bold text-slate-100">Live Monitor</h2>
          {activeCount > 0 && (
            <span className="flex items-center gap-1 text-[10px] font-mono font-bold text-cyan-400 px-2 py-0.5 rounded-full"
              style={{ background: 'rgba(6,182,212,0.1)', border: '1px solid rgba(6,182,212,0.2)' }}>
              <motion.span className="w-1.5 h-1.5 rounded-full bg-cyan-400 inline-block"
                animate={{ opacity: [1, 0.3, 1], scale: [1, 1.3, 1] }} transition={{ duration: 1.2, repeat: Infinity }} />
              {activeCount} running
            </span>
          )}
          <div className="ml-auto flex items-center gap-2">
            {doneCount > 0 && (
              <button onClick={clearFinished}
                className="px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all hover:scale-105"
                style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', color: '#4ade80' }}>
                Clear Finished ({doneCount})
              </button>
            )}
            {instances.length > 0 && (
              <button onClick={clearAll}
                className="px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all hover:scale-105"
                style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171' }}>
                Clear All
              </button>
            )}
          </div>
        </div>

        {instances.length === 0 ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="glass-card p-10 text-center">
            <motion.div className="w-12 h-12 mx-auto mb-3 rounded-2xl flex items-center justify-center"
              style={{ background: 'rgba(6,182,212,0.08)', border: '1px solid rgba(6,182,212,0.15)' }}
              animate={{ scale: [1, 1.05, 1] }} transition={{ duration: 3, repeat: Infinity }}>
              <svg className="w-6 h-6 text-cyan-500/70" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
            </motion.div>
            <p className="text-xs text-slate-600">Launch a task, workflow, or trigger above — it appears here and updates in real time until it finishes.</p>
          </motion.div>
        ) : (
          <div className="space-y-3">
            <AnimatePresence mode="popLayout">
              {instances.map(i => {
                const c = statusColor(i.kind);
                const running = !i.terminal;
                // Freeze the clock once finished; only running cards track `now`.
                const endMs = running ? now : (i.finishedAt || now);
                return (
                  <motion.div key={i.key} layout
                    initial={{ opacity: 0, y: 14, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
                    className="rounded-2xl p-4 relative overflow-hidden"
                    style={{ background: i.kind === 'failed' ? 'rgba(20,4,4,0.6)' : i.kind === 'success' ? 'rgba(4,20,12,0.6)' : 'rgba(8,12,21,0.7)',
                      border: `1px solid ${c}33` }}>

                    {/* Running: animated glow + top sweep + bottom indeterminate bar */}
                    {running && (
                      <>
                        <motion.div className="absolute inset-0 pointer-events-none"
                          style={{ background: `radial-gradient(ellipse at 50% 0%, ${c}10, transparent 60%)` }}
                          animate={{ opacity: [0.4, 0.9, 0.4] }} transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }} />
                        <motion.div className="absolute top-0 left-0 right-0 h-[2px]"
                          style={{ background: `linear-gradient(90deg, transparent, ${c}, transparent)` }}
                          animate={{ x: ['-100%', '100%'] }} transition={{ duration: 1.8, repeat: Infinity, ease: 'linear' }} />
                        <div className="absolute bottom-0 left-0 right-0 h-[3px] overflow-hidden" style={{ background: 'rgba(255,255,255,0.04)' }}>
                          <motion.div className="h-full" style={{ width: '35%', background: `linear-gradient(90deg, ${c}00, ${c}, ${c}00)` }}
                            animate={{ x: ['-35%', '300%'] }} transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }} />
                        </div>
                      </>
                    )}

                    <div className="flex items-center gap-3 relative z-10">
                      {running ? (
                        <div className="relative w-5 h-5">
                          <motion.div className="absolute inset-0 rounded-full border-2" style={{ borderColor: `${c}`, borderTopColor: 'transparent' }}
                            animate={{ rotate: 360 }} transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }} />
                          <motion.div className="absolute inset-0 rounded-full" style={{ border: `1px solid ${c}` }}
                            animate={{ scale: [1, 1.6], opacity: [0.6, 0] }} transition={{ duration: 1.5, repeat: Infinity }} />
                        </div>
                      ) : (
                        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 400, damping: 15 }}
                          className="w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold" style={{ background: `${c}22`, color: c }}>
                          {i.kind === 'success' ? '✓' : i.kind === 'failed' ? '✗' : '■'}
                        </motion.div>
                      )}
                      <span className="text-sm font-mono font-bold text-slate-200 truncate flex-1">{i.name}</span>
                      <AnimatePresence mode="wait">
                        <motion.span key={i.status} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 4 }}
                          className="text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded"
                          style={{ background: `${c}1a`, color: c }}>{i.status}</motion.span>
                      </AnimatePresence>
                      <button onClick={() => removeInst(i.key)} title="Remove from monitor"
                        className="text-slate-600 hover:text-red-400 text-xs px-1 transition-colors">✕</button>
                    </div>

                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 ml-8 text-[10px] font-mono text-slate-500 relative z-10">
                      {i.agent && <span>🖥 {i.agent}</span>}
                      <span style={running ? { color: c } : {}}>⏱ {elapsed(endMs - i.launchedAt)}</span>
                      {i.exitCode && <span>exit {i.exitCode}</span>}
                      {i.statusDescription && <span className="text-slate-600 truncate max-w-[260px]">{i.statusDescription}</span>}
                    </div>

                    <div className="flex flex-wrap gap-2 mt-3 ml-8 relative z-10">
                      {opsFor(i).map(b => (
                        <motion.button key={b.op} onClick={() => doOp(i, b.op)} disabled={!!i.busy} whileTap={{ scale: 0.94 }}
                          className="px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all hover:scale-105 disabled:opacity-40"
                          style={{ background: `${b.color}14`, border: `1px solid ${b.color}44`, color: b.color }}>
                          {i.busy === b.op ? '…' : b.label}
                        </motion.button>
                      ))}
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}

        <footer className="section-line mt-10" />
        <p className="text-center text-[9px] font-mono py-4"><span className="neon-text-gold">DESIGNED AND ENGINEERED BY ABHAY THAKUR</span></p>
      </main>
    </div>
  );
}
