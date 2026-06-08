'use client';
import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import GlobalHeader from '@/components/GlobalHeader';
import { useConnectionStore, globalApi } from '@/store/useConnectionStore';

interface FailedJob { name: string; status: string; startTime: string; endTime: string; agent?: string; exitCode?: string; type?: string; }
interface CreatedItem { name: string; type: string; createdTime: string; createdBy?: string; }

function getMonthRange(offset: number) {
  const now = new Date();
  const target = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const start = target.toISOString().slice(0, 10);
  const end = new Date(target.getFullYear(), target.getMonth() + 1, 0).toISOString().slice(0, 10);
  const label = target.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  return { start, end, label };
}

function getDaysInMonth(offset: number): string[] {
  const now = new Date();
  const t = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const days: string[] = [];
  for (let d = 1; d <= new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate(); d++)
    days.push(new Date(t.getFullYear(), t.getMonth(), d).toISOString().slice(0, 10));
  return days;
}

function MiniBar({ data, color, label }: { data: { day: string; value: number }[]; color: string; label: string }) {
  const max = Math.max(...data.map(d => d.value), 1);
  return (
    <div className="glass-card p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{label}</span>
        <span className="text-[9px] font-mono text-slate-600">{data.reduce((s, d) => s + d.value, 0)} total</span>
      </div>
      <div className="flex items-end gap-[2px] h-24">
        {data.map((d, i) => (
          <motion.div key={i} className="flex-1 rounded-t-sm min-w-[2px]"
            initial={{ height: 0 }} animate={{ height: `${Math.max((d.value / max) * 100, d.value > 0 ? 8 : 2)}%` }}
            transition={{ delay: i * 0.01, duration: 0.3 }}
            style={{ background: d.value > 0 ? color : 'rgba(51,65,85,0.2)' }}
            title={`${d.day}: ${d.value}`} />
        ))}
      </div>
      <div className="flex justify-between mt-2 text-[8px] text-slate-700 font-mono">
        <span>{data[0]?.day.slice(8)}</span>
        <span>{data[Math.floor(data.length/2)]?.day.slice(8)}</span>
        <span>{data[data.length-1]?.day.slice(8)}</span>
      </div>
    </div>
  );
}

export default function AnalyticsDashboard() {
  const { connected, username } = useConnectionStore();
  const [monthOffset, setMonthOffset] = useState(0);
  const [failedJobs, setFailedJobs] = useState<FailedJob[]>([]);
  const [createdItems, setCreatedItems] = useState<CreatedItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [lastRefresh, setLastRefresh] = useState('');

  const { start, end, label } = getMonthRange(monthOffset);
  const days = getDaysInMonth(monthOffset);

  const fetchData = useCallback(async () => {
    if (!connected) return;
    setLoading(true); setError('');
    try {
      const [failRes, createRes] = await Promise.all([
        globalApi.http.post('/api/analytics/failed-jobs', { startDate: start, endDate: end }).catch(() => ({ data: { data: { jobs: [] } } })),
        globalApi.http.post('/api/analytics/created-items', { startDate: start, endDate: end }).catch(() => ({ data: { data: { items: [] } } })),
      ]);
      setFailedJobs(failRes.data?.data?.jobs || []);
      setCreatedItems(createRes.data?.data?.items || []);
      setLastRefresh(new Date().toLocaleTimeString());
    } catch (e: any) { setError(e.message || 'Failed to fetch'); }
    setLoading(false);
  }, [connected, start, end]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Build daily stats
  const failByDay = days.map(day => ({ day, value: failedJobs.filter(j => (j.startTime || '').startsWith(day)).length }));
  const createByDay = days.map(day => ({ day, value: createdItems.filter(i => (i.createdTime || '').startsWith(day)).length }));

  return (
    <div className="min-h-screen scan-line" style={{ background: 'var(--bg-deep)' }}>
      <GlobalHeader title="Analytics" subtitle="OPERATIONS INTELLIGENCE" />
      <main className="max-w-6xl mx-auto px-6 pb-24 space-y-6">

        {/* Header row */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-slate-200">{username || 'Operations'}</h1>
            <p className="text-[10px] text-slate-600 font-mono">{label} — {connected ? 'CONNECTED' : 'OFFLINE'}</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setMonthOffset(o => o - 1)} className="btn-primary px-3 py-1.5 rounded-lg text-[10px]">← Prev</button>
            <button onClick={() => setMonthOffset(0)} className="btn-primary px-3 py-1.5 rounded-lg text-[10px]">Current</button>
            <button onClick={fetchData} disabled={loading} className="btn-success px-3 py-1.5 rounded-lg text-[10px]">
              {loading ? 'Loading...' : 'Refresh'}
            </button>
          </div>
        </div>

        {error && <div className="glass-card p-3 text-xs text-red-400">{error}</div>}
        {lastRefresh && <p className="text-[9px] text-slate-700 font-mono">Last: {lastRefresh}</p>}

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Failed Jobs', val: failedJobs.length, color: '#ef4444' },
            { label: 'Created Items', val: createdItems.length, color: '#22c55e' },
            { label: 'Tasks', val: createdItems.filter(i => (i.type||'').includes('task')).length, color: '#06b6d4' },
            { label: 'Triggers', val: createdItems.filter(i => !(i.type||'').includes('task')).length, color: '#8b5cf6' },
          ].map(s => (
            <div key={s.label} className="stat-card">
              <div className="text-2xl font-black tabular-nums" style={{ color: s.color }}>{s.val}</div>
              <div className="text-[8px] text-slate-600 uppercase tracking-widest mt-1 font-bold">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <MiniBar data={failByDay} color="#ef4444" label="Failed Jobs by Day" />
          <MiniBar data={createByDay} color="#22c55e" label="Created Items by Day" />
        </div>

        {/* Failed jobs table */}
        {failedJobs.length > 0 && (
          <div className="glass-card overflow-hidden">
            <div className="px-4 py-3 border-b" style={{ borderColor: 'rgba(51,65,85,0.1)' }}>
              <span className="text-[10px] font-bold text-red-400 uppercase tracking-wider">Failed Jobs — {failedJobs.length}</span>
            </div>
            <div className="max-h-64 overflow-auto custom-scroll">
              <table className="w-full text-[10px]">
                <thead className="sticky top-0" style={{ background: 'var(--bg-card)' }}>
                  <tr><th className="px-3 py-2 text-left text-slate-500">Name</th><th className="px-3 py-2 text-left text-slate-500">Status</th><th className="px-3 py-2 text-left text-slate-500">Time</th><th className="px-3 py-2 text-left text-slate-500">Agent</th></tr>
                </thead>
                <tbody>
                  {failedJobs.map((j, i) => (
                    <tr key={i} className="border-t" style={{ borderColor: 'rgba(51,65,85,0.08)' }}>
                      <td className="px-3 py-2 font-mono text-slate-300">{j.name}</td>
                      <td className="px-3 py-2 text-red-400">{j.status}</td>
                      <td className="px-3 py-2 text-slate-500">{j.startTime ? new Date(j.startTime).toLocaleString() : '—'}</td>
                      <td className="px-3 py-2 text-slate-600">{j.agent || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Created items table */}
        {createdItems.length > 0 && (
          <div className="glass-card overflow-hidden">
            <div className="px-4 py-3 border-b" style={{ borderColor: 'rgba(51,65,85,0.1)' }}>
              <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">Created Items — {createdItems.length}</span>
            </div>
            <div className="max-h-64 overflow-auto custom-scroll">
              <table className="w-full text-[10px]">
                <thead className="sticky top-0" style={{ background: 'var(--bg-card)' }}>
                  <tr><th className="px-3 py-2 text-left text-slate-500">Name</th><th className="px-3 py-2 text-left text-slate-500">Type</th><th className="px-3 py-2 text-left text-slate-500">Created</th></tr>
                </thead>
                <tbody>
                  {createdItems.map((item, i) => (
                    <tr key={i} className="border-t" style={{ borderColor: 'rgba(51,65,85,0.08)' }}>
                      <td className="px-3 py-2 font-mono text-slate-300">{item.name}</td>
                      <td className="px-3 py-2"><span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${(item.type||'').includes('task') ? 'bg-emerald-500/10 text-emerald-400' : 'bg-cyan-500/10 text-cyan-400'}`}>{(item.type||'').includes('task') ? 'TASK' : 'TRIGGER'}</span></td>
                      <td className="px-3 py-2 text-slate-500">{item.createdTime ? new Date(item.createdTime).toLocaleString() : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <footer className="section-line mt-8" />
        <p className="text-center text-[9px] font-mono text-slate-800 py-4">DESIGNED AND ENGINEERED BY ABHAY THAKUR</p>
      </main>
    </div>
  );
}
