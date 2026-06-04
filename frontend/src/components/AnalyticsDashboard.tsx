'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import GlobalHeader from '@/components/GlobalHeader';
import { useConnectionStore, globalApi } from '@/store/useConnectionStore';
import { playClick, playNotification, playSuccess } from '@/utils/soundEffects';

// ── Types ─────────────────────────────────────────────────────────────────────
interface FailedJob {
  name: string;
  status: string;
  startTime: string;
  endTime: string;
  agent?: string;
  exitCode?: string;
  type?: string;
}

interface CreatedItem {
  name: string;
  type: string;
  createdTime: string;
  createdBy?: string;
}

interface DayStats {
  date: string;      // YYYY-MM-DD
  failures: number;
  created: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function getMonthRange(offset: number): { start: string; end: string; label: string } {
  const now = new Date();
  const target = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const start = target.toISOString().slice(0, 10);
  const endDate = new Date(target.getFullYear(), target.getMonth() + 1, 0);
  const end = endDate.toISOString().slice(0, 10);
  const label = target.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  return { start, end, label };
}

function getDaysInMonth(offset: number): string[] {
  const now = new Date();
  const target = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const daysInMonth = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  const days: string[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    days.push(new Date(target.getFullYear(), target.getMonth(), d).toISOString().slice(0, 10));
  }
  return days;
}

function formatTime(iso: string): string {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); }
  catch { return iso; }
}

// ── Bar Chart Component ───────────────────────────────────────────────────────
function BarChart({ data, color, label, maxVal }: { data: { day: string; value: number }[]; color: string; label: string; maxVal: number }) {
  const max = maxVal || Math.max(...data.map(d => d.value), 1);

  return (
    <div className="rounded-2xl overflow-hidden relative"
      style={{ background: 'linear-gradient(180deg, rgba(2,8,16,0.9), rgba(6,15,30,0.9))', border: '1px solid rgba(51,65,85,0.15)' }}>
      <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: 'rgba(51,65,85,0.1)' }}>
        <span className="text-[10px] font-bold text-slate-500 tracking-wider uppercase">{label}</span>
        <span className="text-[9px] font-mono text-slate-600">MAX: {max}</span>
      </div>
      <div className="p-4">
        <div className="flex items-end gap-[2px] h-32">
          {data.map((d, i) => {
            const height = max > 0 ? (d.value / max) * 100 : 0;
            return (
              <motion.div
                key={d.day}
                className="flex-1 rounded-t-sm relative group cursor-pointer"
                style={{ background: d.value > 0 ? color : 'rgba(51,65,85,0.15)', minWidth: '3px' }}
                initial={{ height: 0 }}
                animate={{ height: `${Math.max(height, 2)}%` }}
                transition={{ duration: 0.4, delay: i * 0.015 }}
                title={`${d.day}: ${d.value}`}
              >
                {/* Tooltip on hover */}
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block z-20 pointer-events-none">
                  <div className="chart-tooltip whitespace-nowrap">
                    <span className="font-bold">{d.value}</span>
                    <span className="text-slate-500 ml-1">{new Date(d.day).getDate()}</span>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
        {/* X-axis labels */}
        <div className="flex justify-between mt-2">
          <span className="text-[8px] text-slate-700 font-mono">1</span>
          <span className="text-[8px] text-slate-700 font-mono">{Math.ceil(data.length / 2)}</span>
          <span className="text-[8px] text-slate-700 font-mono">{data.length}</span>
        </div>
      </div>
    </div>
  );
}

// ── Heatmap Component ─────────────────────────────────────────────────────────
function Heatmap({ data, colorScale, label }: {
  data: { day: string; hour: number; value: number }[];
  colorScale: (v: number, max: number) => string;
  label: string;
}) {
  const max = Math.max(...data.map(d => d.value), 1);
  const hours = Array.from({ length: 24 }, (_, i) => i);
  const days = [...new Set(data.map(d => d.day))].sort().slice(-7); // Last 7 days

  return (
    <div className="rounded-2xl overflow-hidden"
      style={{ background: 'linear-gradient(180deg, rgba(2,8,16,0.9), rgba(6,15,30,0.9))', border: '1px solid rgba(51,65,85,0.15)' }}>
      <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: 'rgba(51,65,85,0.1)' }}>
        <span className="text-[10px] font-bold text-slate-500 tracking-wider uppercase">{label}</span>
        <div className="flex items-center gap-2">
          <div className="flex gap-0.5">
            {[0.1, 0.3, 0.5, 0.7, 1].map((v, i) => (
              <div key={i} className="w-3 h-3 rounded-sm" style={{ background: colorScale(v * max, max) }} />
            ))}
          </div>
          <span className="text-[8px] text-slate-600">intensity</span>
        </div>
      </div>
      <div className="p-4 overflow-x-auto">
        <div className="min-w-[500px]">
          {/* Hour labels */}
          <div className="flex ml-16 mb-1">
            {hours.filter((_, i) => i % 3 === 0).map(h => (
              <div key={h} className="text-[7px] text-slate-700 font-mono" style={{ width: `${100/8}%` }}>
                {String(h).padStart(2, '0')}
              </div>
            ))}
          </div>
          {/* Grid */}
          {days.map(day => (
            <div key={day} className="flex items-center mb-[2px]">
              <span className="w-16 text-[8px] text-slate-600 font-mono shrink-0">
                {new Date(day).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' })}
              </span>
              <div className="flex gap-[1px] flex-1">
                {hours.map(h => {
                  const cell = data.find(d => d.day === day && d.hour === h);
                  const value = cell?.value || 0;
                  return (
                    <div
                      key={h}
                      className="heatmap-cell flex-1 h-4"
                      style={{ background: colorScale(value, max) }}
                      title={`${day} ${String(h).padStart(2, '0')}:00 — ${value} events`}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Stat Card ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, trend, color, icon }: {
  label: string; value: number | string; trend?: string; color: string; icon: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20, rotateX: -5 }}
      animate={{ opacity: 1, y: 0, rotateX: 0 }}
      className="stat-card group"
      style={{ perspective: '600px' }}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ background: `${color}15`, border: `1px solid ${color}30` }}>
          {icon}
        </div>
        {trend && (
          <span className="text-[9px] font-mono" style={{ color }}>{trend}</span>
        )}
      </div>
      <div className="text-2xl font-black tabular-nums mt-2" style={{ color }}>{value}</div>
      <div className="text-[9px] text-slate-600 uppercase tracking-widest mt-1 font-bold">{label}</div>
    </motion.div>
  );
}

// ── Main Analytics Dashboard ──────────────────────────────────────────────────
export default function AnalyticsDashboard() {
  const { connected } = useConnectionStore();
  const [activeTab, setActiveTab] = useState<'failures' | 'created' | 'operations'>('failures');
  const [monthOffset, setMonthOffset] = useState(0); // 0 = current, -1 = last month
  const [loading, setLoading] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<string | null>(null);

  // Data
  const [failedJobs, setFailedJobs] = useState<FailedJob[]>([]);
  const [createdTasks, setCreatedTasks] = useState<CreatedItem[]>([]);
  const [createdTriggers, setCreatedTriggers] = useState<CreatedItem[]>([]);
  const [dailyFailures, setDailyFailures] = useState<DayStats[]>([]);
  const [dailyCreated, setDailyCreated] = useState<DayStats[]>([]);
  const [heatmapData, setHeatmapData] = useState<{ day: string; hour: number; value: number }[]>([]);
  const [opsSummary, setOpsSummary] = useState<{ agents: number; tasks: number; triggers: number; activeInstances: number }>({ agents: 0, tasks: 0, triggers: 0, activeInstances: 0 });
  const [opsHeatmap, setOpsHeatmap] = useState<{ day: string; hour: number; value: number }[]>([]);
  const [jobTypeBreakdown, setJobTypeBreakdown] = useState<{ type: string; count: number }[]>([]);
  const [topFailingJobs, setTopFailingJobs] = useState<{ name: string; count: number }[]>([]);

  // Auto-refresh timer
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const { start, end, label: monthLabel } = getMonthRange(monthOffset);
  const allDays = getDaysInMonth(monthOffset);

  // ── Fetch Data ────────────────────────────────────────────────────────────
  const fetchAnalytics = useCallback(async () => {
    if (!connected) return;
    setLoading(true);

    try {
      // Fetch failed task instances for the month
      const failRes = await globalApi.http.post('/api/analytics/failed-jobs', {
        startDate: start,
        endDate: end,
      });
      const fails: FailedJob[] = failRes.data?.data?.jobs || [];
      setFailedJobs(fails);

      // Build daily failure stats
      const dailyF: Record<string, number> = {};
      allDays.forEach(d => { dailyF[d] = 0; });
      fails.forEach(f => {
        const day = f.endTime?.slice(0, 10) || f.startTime?.slice(0, 10);
        if (day && dailyF[day] !== undefined) dailyF[day]++;
      });
      setDailyFailures(Object.entries(dailyF).map(([date, failures]) => ({ date, failures, created: 0 })));

      // Build heatmap (hour × day for last 7 days)
      const hm: { day: string; hour: number; value: number }[] = [];
      const last7 = allDays.slice(-7);
      last7.forEach(day => {
        for (let h = 0; h < 24; h++) {
          const count = fails.filter(f => {
            const d = f.endTime?.slice(0, 10);
            const hr = f.endTime ? new Date(f.endTime).getHours() : -1;
            return d === day && hr === h;
          }).length;
          hm.push({ day, hour: h, value: count });
        }
      });
      setHeatmapData(hm);

      // Fetch created tasks/triggers for the month
      const createRes = await globalApi.http.post('/api/analytics/created-items', {
        startDate: start,
        endDate: end,
      });
      const tasks: CreatedItem[] = createRes.data?.data?.tasks || [];
      const triggers: CreatedItem[] = createRes.data?.data?.triggers || [];
      setCreatedTasks(tasks);
      setCreatedTriggers(triggers);

      // Build daily created stats
      const dailyC: Record<string, number> = {};
      allDays.forEach(d => { dailyC[d] = 0; });
      [...tasks, ...triggers].forEach(item => {
        const day = item.createdTime?.slice(0, 10);
        if (day && dailyC[day] !== undefined) dailyC[day]++;
      });
      setDailyCreated(Object.entries(dailyC).map(([date, created]) => ({ date, failures: 0, created })));

      setLastRefresh(new Date().toLocaleTimeString());
      playSuccess();

      // Fetch operations summary
      try {
        const opsRes = await globalApi.http.get('/api/analytics/summary');
        setOpsSummary(opsRes.data?.data || { agents: 0, tasks: 0, triggers: 0, activeInstances: 0 });
      } catch { /* non-critical */ }

      // Build top failing jobs
      const failCounts: Record<string, number> = {};
      fails.forEach(f => { failCounts[f.name] = (failCounts[f.name] || 0) + 1; });
      const topFails = Object.entries(failCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10)
        .map(([name, count]) => ({ name, count }));
      setTopFailingJobs(topFails);

      // Build job type breakdown
      const typeCounts: Record<string, number> = {};
      fails.forEach(f => { const t = f.type || 'unknown'; typeCounts[t] = (typeCounts[t] || 0) + 1; });
      setJobTypeBreakdown(Object.entries(typeCounts).map(([type, count]) => ({ type, count })));

    } catch (e: any) {
      // If analytics endpoints don't exist yet, generate mock data for visualization
      console.warn('Analytics API not available — using mock data:', e.message);
      generateMockData();
      setLastRefresh(new Date().toLocaleTimeString() + ' (demo)');
    } finally {
      setLoading(false);
    }
  }, [connected, start, end, allDays]);

  // Mock data generator for demo/preview
  const generateMockData = useCallback(() => {
    const mockFails: FailedJob[] = [];
    const mockTasks: CreatedItem[] = [];
    const mockTriggers: CreatedItem[] = [];

    allDays.forEach(day => {
      // Random 0-8 failures per day
      const failCount = Math.floor(Math.random() * 8);
      for (let i = 0; i < failCount; i++) {
        const hour = Math.floor(Math.random() * 24);
        mockFails.push({
          name: `JOB-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
          status: 'Failed',
          startTime: `${day}T${String(hour).padStart(2, '0')}:${String(Math.floor(Math.random() * 60)).padStart(2, '0')}:00Z`,
          endTime: `${day}T${String(hour).padStart(2, '0')}:${String(Math.floor(Math.random() * 60)).padStart(2, '0')}:30Z`,
          agent: `Agent-${Math.floor(Math.random() * 10)}`,
          exitCode: String(Math.floor(Math.random() * 127) + 1),
          type: Math.random() > 0.3 ? 'taskUnix' : 'taskWindows',
        });
      }

      // Random 0-5 created per day
      const createCount = Math.floor(Math.random() * 5);
      for (let i = 0; i < createCount; i++) {
        const isTask = Math.random() > 0.4;
        const item: CreatedItem = {
          name: `${isTask ? 'TASK' : 'TRIG'}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
          type: isTask ? 'taskUnix' : 'triggerTime',
          createdTime: `${day}T${String(Math.floor(Math.random() * 24)).padStart(2, '0')}:00:00Z`,
          createdBy: 'operator',
        };
        if (isTask) mockTasks.push(item);
        else mockTriggers.push(item);
      }
    });

    setFailedJobs(mockFails);
    setCreatedTasks(mockTasks);
    setCreatedTriggers(mockTriggers);

    // Daily stats
    const dailyF: Record<string, number> = {};
    const dailyC: Record<string, number> = {};
    allDays.forEach(d => { dailyF[d] = 0; dailyC[d] = 0; });
    mockFails.forEach(f => { const d = f.endTime?.slice(0, 10); if (d && dailyF[d] !== undefined) dailyF[d]++; });
    [...mockTasks, ...mockTriggers].forEach(item => { const d = item.createdTime?.slice(0, 10); if (d && dailyC[d] !== undefined) dailyC[d]++; });
    setDailyFailures(Object.entries(dailyF).map(([date, failures]) => ({ date, failures, created: 0 })));
    setDailyCreated(Object.entries(dailyC).map(([date, created]) => ({ date, failures: 0, created })));

    // Heatmap
    const hm: { day: string; hour: number; value: number }[] = [];
    allDays.slice(-7).forEach(day => {
      for (let h = 0; h < 24; h++) {
        const count = mockFails.filter(f => f.endTime?.slice(0, 10) === day && new Date(f.endTime).getHours() === h).length;
        hm.push({ day, hour: h, value: count });
      }
    });
    setHeatmapData(hm);

    // Mock ops data
    setOpsSummary({ agents: 42 + Math.floor(Math.random() * 20), tasks: 350 + Math.floor(Math.random() * 150), triggers: 280 + Math.floor(Math.random() * 100), activeInstances: Math.floor(Math.random() * 15) });

    // Top failing jobs
    const failCounts: Record<string, number> = {};
    mockFails.forEach(f => { failCounts[f.name] = (failCounts[f.name] || 0) + 1; });
    setTopFailingJobs(Object.entries(failCounts).sort(([, a], [, b]) => b - a).slice(0, 10).map(([name, count]) => ({ name, count })));

    // Type breakdown
    const typeCounts: Record<string, number> = {};
    mockFails.forEach(f => { const t = f.type || 'unknown'; typeCounts[t] = (typeCounts[t] || 0) + 1; });
    setJobTypeBreakdown(Object.entries(typeCounts).map(([type, count]) => ({ type, count })));
  }, [allDays]);

  // Initial load + auto-refresh every hour
  useEffect(() => {
    if (connected) fetchAnalytics();
    intervalRef.current = setInterval(() => {
      if (connected) fetchAnalytics();
    }, 60 * 60 * 1000); // 1 hour
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [connected, monthOffset]);

  const handleManualRefresh = () => {
    playClick();
    fetchAnalytics();
  };

  // Color scales
  const failureColor = (v: number, max: number) => {
    if (v === 0) return 'rgba(51,65,85,0.1)';
    const intensity = Math.min(v / Math.max(max, 1), 1);
    return `rgba(239, 68, 68, ${0.15 + intensity * 0.7})`;
  };

  const totalFailures = failedJobs.length;
  const totalCreated = createdTasks.length + createdTriggers.length;
  const peakDay = dailyFailures.reduce((max, d) => d.failures > max.failures ? d : max, { date: '', failures: 0 });
  const avgDaily = dailyFailures.length > 0 ? Math.round(totalFailures / dailyFailures.filter(d => d.failures > 0).length || 1) : 0;

  return (
    <div className="min-h-screen relative scan-line" style={{ background: 'var(--bg-deep)' }}>
      <GlobalHeader title="Analytics" subtitle="OPERATIONS INTELLIGENCE" />

      <main className="max-w-7xl mx-auto px-6 pb-24 space-y-6">

        {/* ── Tab + Controls ── */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between flex-wrap gap-3">
          {/* Tabs */}
          <div className="flex gap-2">
            {([
              { id: 'failures' as const, label: 'Failed Jobs', icon: '🔴', color: '#ef4444' },
              { id: 'created' as const, label: 'Created Items', icon: '🟢', color: '#22c55e' },
              { id: 'operations' as const, label: 'Operations', icon: '⚡', color: '#f59e0b' },
            ]).map(tab => (
              <motion.button
                key={tab.id}
                onClick={() => { setActiveTab(tab.id); playClick(); }}
                whileHover={{ y: -1 }}
                className="px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2"
                style={{
                  background: activeTab === tab.id
                    ? `linear-gradient(135deg, ${tab.color}15, ${tab.color}08)`
                    : 'rgba(15,23,42,0.6)',
                  border: activeTab === tab.id
                    ? `1px solid ${tab.color}40`
                    : '1px solid rgba(51,65,85,0.3)',
                  color: activeTab === tab.id ? tab.color : '#64748b',
                  boxShadow: activeTab === tab.id ? `0 0 15px ${tab.color}10` : 'none',
                }}
              >
                <span>{tab.icon}</span>
                {tab.label}
              </motion.button>
            ))}
          </div>

          {/* Month selector + refresh */}
          <div className="flex items-center gap-3">
            <div className="flex gap-1">
              {([
                { offset: -1, label: 'Last Month' },
                { offset: 0, label: 'Current' },
              ]).map(m => (
                <button
                  key={m.offset}
                  onClick={() => { setMonthOffset(m.offset); playClick(); }}
                  className="px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all"
                  style={{
                    background: monthOffset === m.offset ? 'rgba(245,158,11,0.1)' : 'transparent',
                    border: monthOffset === m.offset ? '1px solid rgba(245,158,11,0.25)' : '1px solid rgba(51,65,85,0.2)',
                    color: monthOffset === m.offset ? '#fbbf24' : '#475569',
                  }}
                >
                  {m.label}
                </button>
              ))}
            </div>

            <button onClick={handleManualRefresh} disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all"
              style={{ background: 'rgba(6,182,212,0.08)', border: '1px solid rgba(6,182,212,0.2)', color: '#67e8f9' }}>
              <svg className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Refresh
            </button>

            {lastRefresh && (
              <span className="text-[9px] font-mono text-slate-700">Last: {lastRefresh}</span>
            )}
          </div>
        </motion.div>

        {/* ── Month Label ── */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="flex items-center gap-3">
          <div className="h-[1px] w-6" style={{ background: 'linear-gradient(90deg, #f59e0b, transparent)' }} />
          <h2 className="text-sm font-bold neon-text-gold">{monthLabel}</h2>
          <span className="text-[9px] font-mono text-slate-600">AUTO-REFRESH: 1HR</span>
        </motion.div>

        {/* ── Stats Cards ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {activeTab === 'failures' ? (
            <>
              <StatCard label="Total Failures" value={totalFailures} color="#ef4444"
                icon={<svg className="w-4 h-4" style={{ color: '#ef4444' }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>} />
              <StatCard label="Avg / Day" value={avgDaily} color="#f97316"
                icon={<svg className="w-4 h-4" style={{ color: '#f97316' }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"/></svg>} />
              <StatCard label="Peak Day" value={peakDay.failures} trend={peakDay.date ? new Date(peakDay.date).getDate() + 'th' : '—'} color="#eab308"
                icon={<svg className="w-4 h-4" style={{ color: '#eab308' }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9"/></svg>} />
              <StatCard label="Unique Jobs" value={new Set(failedJobs.map(f => f.name)).size} color="#8b5cf6"
                icon={<svg className="w-4 h-4" style={{ color: '#8b5cf6' }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/></svg>} />
            </>
          ) : activeTab === 'created' ? (
            <>
              <StatCard label="Tasks Created" value={createdTasks.length} color="#22c55e"
                icon={<svg className="w-4 h-4" style={{ color: '#22c55e' }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/></svg>} />
              <StatCard label="Triggers Created" value={createdTriggers.length} color="#06b6d4"
                icon={<svg className="w-4 h-4" style={{ color: '#06b6d4' }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>} />
              <StatCard label="Total Items" value={totalCreated} color="#f59e0b"
                icon={<svg className="w-4 h-4" style={{ color: '#f59e0b' }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6"/></svg>} />
              <StatCard label="Active Days" value={dailyCreated.filter(d => d.created > 0).length} color="#8b5cf6"
                icon={<svg className="w-4 h-4" style={{ color: '#8b5cf6' }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>} />
            </>
          ) : (
            <>
              <StatCard label="Total Agents" value={opsSummary.agents} color="#f59e0b"
                icon={<svg className="w-4 h-4" style={{ color: '#f59e0b' }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18"/></svg>} />
              <StatCard label="Active Instances" value={opsSummary.activeInstances} color="#22c55e"
                icon={<svg className="w-4 h-4" style={{ color: '#22c55e' }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>} />
              <StatCard label="Failures / Month" value={totalFailures} color="#ef4444"
                icon={<svg className="w-4 h-4" style={{ color: '#ef4444' }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>} />
              <StatCard label="Created / Month" value={totalCreated} color="#8b5cf6"
                icon={<svg className="w-4 h-4" style={{ color: '#8b5cf6' }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6"/></svg>} />
            </>
          )}
        </div>

        {/* ── Charts ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {activeTab === 'failures' ? (
            <>
              <BarChart
                data={allDays.map(d => ({
                  day: d,
                  value: dailyFailures.find(x => x.date === d)?.failures || 0,
                }))}
                color="rgba(239, 68, 68, 0.7)"
                label="Daily Failures"
                maxVal={0}
              />
              <Heatmap
                data={heatmapData}
                colorScale={failureColor}
                label="Failure Heatmap (Last 7 Days × Hour)"
              />
            </>
          ) : activeTab === 'created' ? (
            <>
              <BarChart
                data={allDays.map(d => ({
                  day: d,
                  value: dailyCreated.find(x => x.date === d)?.created || 0,
                }))}
                color="rgba(34, 197, 94, 0.7)"
                label="Daily Creations"
                maxVal={0}
              />
              <BarChart
                data={allDays.map(d => ({
                  day: d,
                  value: createdTasks.filter(t => t.createdTime?.slice(0, 10) === d).length,
                }))}
                color="rgba(6, 182, 212, 0.7)"
                label="Tasks Only"
                maxVal={0}
              />
            </>
          ) : (
            <>
              {/* Operations: Failure + Creation overlay */}
              <BarChart
                data={allDays.map(d => ({
                  day: d,
                  value: (dailyFailures.find(x => x.date === d)?.failures || 0) + (dailyCreated.find(x => x.date === d)?.created || 0),
                }))}
                color="rgba(245, 158, 11, 0.7)"
                label="Total Activity (Failures + Creations)"
                maxVal={0}
              />
              <Heatmap
                data={heatmapData}
                colorScale={failureColor}
                label="Failure Distribution (Hour × Day)"
              />
            </>
          )}
        </div>

        {/* ── Operations-specific: Top Failing Jobs + Type Breakdown ── */}
        {activeTab === 'operations' && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
            className="grid grid-cols-1 lg:grid-cols-2 gap-4">

            {/* Top Failing Jobs — Horizontal Bar */}
            <div className="rounded-2xl overflow-hidden"
              style={{ background: 'linear-gradient(180deg, rgba(2,8,16,0.9), rgba(6,15,30,0.9))', border: '1px solid rgba(51,65,85,0.15)' }}>
              <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: 'rgba(51,65,85,0.1)' }}>
                <span className="text-[10px] font-bold text-slate-500 tracking-wider uppercase">Top Failing Jobs</span>
                <span className="text-[9px] font-mono text-slate-600">TOP 10</span>
              </div>
              <div className="p-4 space-y-2">
                {topFailingJobs.length === 0 ? (
                  <p className="text-[10px] text-slate-700 text-center py-8">No data</p>
                ) : (
                  topFailingJobs.map((job, i) => {
                    const maxCount = topFailingJobs[0]?.count || 1;
                    const width = (job.count / maxCount) * 100;
                    return (
                      <motion.div key={job.name}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.05 }}
                        className="flex items-center gap-3"
                      >
                        <span className="text-[9px] text-slate-600 font-mono w-4 shrink-0">{i + 1}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-0.5">
                            <span className="text-[10px] text-slate-400 font-mono truncate max-w-[180px]">{job.name}</span>
                            <span className="text-[10px] font-bold text-red-400 shrink-0 ml-2">{job.count}</span>
                          </div>
                          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(51,65,85,0.2)' }}>
                            <motion.div
                              className="h-full rounded-full"
                              style={{ background: 'linear-gradient(90deg, #ef4444, #f97316)' }}
                              initial={{ width: 0 }}
                              animate={{ width: `${width}%` }}
                              transition={{ duration: 0.5, delay: i * 0.05 }}
                            />
                          </div>
                        </div>
                      </motion.div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Job Type Breakdown — Donut-like visualization */}
            <div className="rounded-2xl overflow-hidden"
              style={{ background: 'linear-gradient(180deg, rgba(2,8,16,0.9), rgba(6,15,30,0.9))', border: '1px solid rgba(51,65,85,0.15)' }}>
              <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: 'rgba(51,65,85,0.1)' }}>
                <span className="text-[10px] font-bold text-slate-500 tracking-wider uppercase">Failure by Job Type</span>
              </div>
              <div className="p-4">
                {jobTypeBreakdown.length === 0 ? (
                  <p className="text-[10px] text-slate-700 text-center py-8">No data</p>
                ) : (
                  <div className="space-y-3">
                    {/* Visual ring chart */}
                    <div className="flex justify-center mb-4">
                      <div className="relative w-32 h-32">
                        <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                          {(() => {
                            const total = jobTypeBreakdown.reduce((s, t) => s + t.count, 0);
                            const colors = ['#ef4444', '#f59e0b', '#8b5cf6', '#06b6d4', '#22c55e', '#ec4899'];
                            let cumulative = 0;
                            return jobTypeBreakdown.map((t, i) => {
                              const pct = total > 0 ? t.count / total : 0;
                              const dashArray = `${pct * 251.2} ${251.2}`;
                              const dashOffset = -cumulative * 251.2;
                              cumulative += pct;
                              return (
                                <motion.circle
                                  key={t.type}
                                  cx="50" cy="50" r="40"
                                  fill="none"
                                  stroke={colors[i % colors.length]}
                                  strokeWidth="8"
                                  strokeDasharray={dashArray}
                                  strokeDashoffset={dashOffset}
                                  strokeLinecap="butt"
                                  initial={{ opacity: 0 }}
                                  animate={{ opacity: 1 }}
                                  transition={{ delay: i * 0.1 }}
                                />
                              );
                            });
                          })()}
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                          <span className="text-lg font-black text-slate-200">{jobTypeBreakdown.reduce((s, t) => s + t.count, 0)}</span>
                          <span className="text-[8px] text-slate-600 uppercase">Total</span>
                        </div>
                      </div>
                    </div>
                    {/* Legend */}
                    <div className="space-y-1.5">
                      {(() => {
                        const colors = ['#ef4444', '#f59e0b', '#8b5cf6', '#06b6d4', '#22c55e', '#ec4899'];
                        const total = jobTypeBreakdown.reduce((s, t) => s + t.count, 0);
                        return jobTypeBreakdown.map((t, i) => (
                          <div key={t.type} className="flex items-center gap-2">
                            <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: colors[i % colors.length] }} />
                            <span className="text-[10px] text-slate-400 flex-1 font-mono">{t.type.replace('task', '').replace('trigger', '') || 'other'}</span>
                            <span className="text-[10px] font-bold text-slate-300">{t.count}</span>
                            <span className="text-[9px] text-slate-600">{total > 0 ? Math.round((t.count / total) * 100) : 0}%</span>
                          </div>
                        ));
                      })()}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}

        {/* ── Recent List ── */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl overflow-hidden"
          style={{ background: 'linear-gradient(180deg, rgba(2,8,16,0.9), rgba(6,15,30,0.9))', border: '1px solid rgba(51,65,85,0.15)' }}>
          <div className="px-5 py-3 border-b flex items-center justify-between" style={{ borderColor: 'rgba(51,65,85,0.1)' }}>
            <span className="text-[10px] font-bold text-slate-500 tracking-wider uppercase">
              {activeTab === 'failures' ? `Recent Failures (${failedJobs.length})` : `Recent Creations (${totalCreated})`}
            </span>
            <span className="text-[9px] font-mono text-slate-700">TOP 50</span>
          </div>
          <div className="max-h-80 overflow-auto custom-scroll">
            {activeTab === 'failures' ? (
              failedJobs.length === 0 ? (
                <div className="flex items-center justify-center py-12 text-slate-700 text-xs">
                  {loading ? 'Loading...' : 'No failures found for this period.'}
                </div>
              ) : (
                <table className="w-full text-xs">
                  <thead className="sticky top-0" style={{ background: '#060f1e' }}>
                    <tr>
                      {['Job Name', 'Status', 'Exit', 'Agent', 'Time'].map(h => (
                        <th key={h} className="px-4 py-2.5 text-left text-[9px] text-slate-600 font-bold uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {failedJobs.slice(0, 50).map((job, i) => (
                      <motion.tr key={`${job.name}-${i}`}
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.01 }}
                        className="border-t hover:bg-red-500/[0.02] transition-colors" style={{ borderColor: 'rgba(51,65,85,0.08)' }}>
                        <td className="px-4 py-2 text-slate-300 font-mono text-[10px] max-w-[200px] truncate">{job.name}</td>
                        <td className="px-4 py-2">
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-red-500/10 text-red-400 border border-red-500/20">
                            {job.status}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-red-400 font-mono text-[10px]">{job.exitCode || '—'}</td>
                        <td className="px-4 py-2 text-slate-500 text-[10px]">{job.agent || '—'}</td>
                        <td className="px-4 py-2 text-slate-600 text-[10px] font-mono">{formatTime(job.endTime)}</td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              )
            ) : (
              totalCreated === 0 ? (
                <div className="flex items-center justify-center py-12 text-slate-700 text-xs">
                  {loading ? 'Loading...' : 'No items created in this period.'}
                </div>
              ) : (
                <table className="w-full text-xs">
                  <thead className="sticky top-0" style={{ background: '#060f1e' }}>
                    <tr>
                      {['Name', 'Type', 'Created By', 'Time'].map(h => (
                        <th key={h} className="px-4 py-2.5 text-left text-[9px] text-slate-600 font-bold uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[...createdTasks, ...createdTriggers].sort((a, b) => b.createdTime.localeCompare(a.createdTime)).slice(0, 50).map((item, i) => (
                      <motion.tr key={`${item.name}-${i}`}
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.01 }}
                        className="border-t hover:bg-emerald-500/[0.02] transition-colors" style={{ borderColor: 'rgba(51,65,85,0.08)' }}>
                        <td className="px-4 py-2 text-slate-300 font-mono text-[10px] max-w-[200px] truncate">{item.name}</td>
                        <td className="px-4 py-2">
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                            item.type.includes('task') ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20'
                          }`}>
                            {item.type.includes('task') ? 'TASK' : 'TRIGGER'}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-slate-500 text-[10px]">{item.createdBy || '—'}</td>
                        <td className="px-4 py-2 text-slate-600 text-[10px] font-mono">{formatTime(item.createdTime)}</td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              )
            )}
          </div>
        </motion.div>

        <footer className="section-line mt-10" />
        <p className="text-center text-[9px] font-mono py-4"><span className="neon-text-gold">DESIGNED AND ENGINEERED BY ABHAY THAKUR</span></p>
      </main>
    </div>
  );
}
