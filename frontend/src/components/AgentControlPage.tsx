'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import GlobalHeader from '@/components/GlobalHeader';
import { useConnectionStore, globalApi } from '@/store/useConnectionStore';

// ── Types ─────────────────────────────────────────────────────────────────────
interface Agent {
  name: string;
  type: string;
  status: 'Active' | 'Offline' | string;
  suspended: boolean;
  hostName?: string;
  ipAddress?: string;
  version?: string;
}

interface AgentResult {
  name: string;
  status: 'success' | 'error' | 'pending';
  message: string;
}

type Action = 'suspend' | 'resume';
type Timing = 'immediate' | 'scheduled';
type StatusFilter = 'Active' | 'Suspended' | 'Offline' | null;

// (globalApi singleton from useConnectionStore is used instead of local ApiClient)

// ── Complete IANA Timezone list grouped by region ─────────────────────────────
const TIMEZONE_GROUPS = [
  { group: 'UTC / GMT', zones: ['UTC','GMT','Etc/GMT','Etc/GMT+1','Etc/GMT-1','Etc/GMT+2','Etc/GMT-2','Etc/GMT+3','Etc/GMT-3','Etc/GMT+4','Etc/GMT-4','Etc/GMT+5','Etc/GMT-5','Etc/GMT+6','Etc/GMT-6','Etc/GMT+7','Etc/GMT-7','Etc/GMT+8','Etc/GMT-8','Etc/GMT+9','Etc/GMT-9','Etc/GMT+10','Etc/GMT-10','Etc/GMT+11','Etc/GMT-11','Etc/GMT+12','Etc/GMT-12'] },
  { group: 'Asia', zones: ['Asia/Kolkata','Asia/Jakarta','Asia/Shanghai','Asia/Tokyo','Asia/Singapore','Asia/Hong_Kong','Asia/Seoul','Asia/Bangkok','Asia/Kuala_Lumpur','Asia/Manila','Asia/Taipei','Asia/Karachi','Asia/Dhaka','Asia/Colombo','Asia/Kathmandu','Asia/Rangoon','Asia/Yangon','Asia/Phnom_Penh','Asia/Ho_Chi_Minh','Asia/Ulaanbaatar','Asia/Almaty','Asia/Tashkent','Asia/Baku','Asia/Tbilisi','Asia/Yerevan','Asia/Tehran','Asia/Baghdad','Asia/Kuwait','Asia/Riyadh','Asia/Dubai','Asia/Muscat','Asia/Kabul','Asia/Beirut','Asia/Damascus','Asia/Amman','Asia/Jerusalem','Asia/Novosibirsk','Asia/Krasnoyarsk','Asia/Irkutsk','Asia/Vladivostok','Asia/Magadan','Asia/Kamchatka'] },
  { group: 'Europe', zones: ['Europe/London','Europe/Dublin','Europe/Lisbon','Europe/Madrid','Europe/Paris','Europe/Berlin','Europe/Amsterdam','Europe/Brussels','Europe/Rome','Europe/Vienna','Europe/Zurich','Europe/Stockholm','Europe/Oslo','Europe/Copenhagen','Europe/Helsinki','Europe/Tallinn','Europe/Riga','Europe/Vilnius','Europe/Warsaw','Europe/Prague','Europe/Budapest','Europe/Sofia','Europe/Bucharest','Europe/Athens','Europe/Istanbul','Europe/Kiev','Europe/Minsk','Europe/Moscow','Europe/Samara','Europe/Kaliningrad'] },
  { group: 'America', zones: ['America/New_York','America/Detroit','America/Indiana/Indianapolis','America/Chicago','America/Denver','America/Phoenix','America/Los_Angeles','America/Anchorage','Pacific/Honolulu','America/Toronto','America/Vancouver','America/Winnipeg','America/Edmonton','America/Halifax','America/St_Johns','America/Mexico_City','America/Cancun','America/Bogota','America/Lima','America/Santiago','America/Buenos_Aires','America/Sao_Paulo','America/Manaus','America/Caracas','America/La_Paz','America/Asuncion','America/Montevideo','America/Havana','America/Jamaica','America/Panama','America/Costa_Rica','America/Guatemala'] },
  { group: 'Africa', zones: ['Africa/Cairo','Africa/Johannesburg','Africa/Lagos','Africa/Nairobi','Africa/Accra','Africa/Casablanca','Africa/Tunis','Africa/Algiers','Africa/Tripoli','Africa/Khartoum','Africa/Addis_Ababa','Africa/Dar_es_Salaam','Africa/Kampala','Africa/Lusaka','Africa/Harare','Africa/Maputo','Africa/Windhoek','Africa/Abidjan','Africa/Dakar','Africa/Kinshasa','Africa/Luanda','Africa/Juba','Africa/Ndjamena'] },
  { group: 'Pacific / Australia', zones: ['Australia/Sydney','Australia/Melbourne','Australia/Brisbane','Australia/Perth','Australia/Adelaide','Australia/Darwin','Australia/Hobart','Pacific/Auckland','Pacific/Fiji','Pacific/Guam','Pacific/Port_Moresby','Pacific/Noumea','Pacific/Apia','Pacific/Tongatapu','Pacific/Chatham','Pacific/Kiritimati','Pacific/Midway','Pacific/Wake','Pacific/Tahiti','Pacific/Easter'] },
];

// Flat list for search
const ALL_TIMEZONES = TIMEZONE_GROUPS.flatMap(g => g.zones);

// ── Timezone-aware ISO builder ────────────────────────────────────────────────
// Converts "date + time in selected timezone" → correct UTC ISO string
// Converts "date + time in selected timezone" → correct UTC ISO string
// Example: 21:00 Asia/Kolkata (IST UTC+5:30) → 15:30 UTC
function buildScheduledISO(date: string, time: string, tz: string): string {
  // Build a date string and find its UTC equivalent in the given timezone.
  // Strategy: use Intl to format a UTC date as if it were in the target TZ,
  // then binary-search for the UTC time that produces the desired local time.
  //
  // Simpler reliable approach:
  // 1. Parse the local time string
  // 2. Get the UTC offset for that timezone at that moment using Intl
  // 3. Subtract the offset to get UTC

  const localStr = `${date}T${time}:00`;

  // Create a reference date (treated as local/UTC doesn't matter for offset calc)
  const refDate = new Date(localStr);

  // Format this date in the target timezone to get what the clock shows there
  const tzFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year:     'numeric',
    month:    '2-digit',
    day:      '2-digit',
    hour:     '2-digit',
    minute:   '2-digit',
    second:   '2-digit',
    hour12:   false,
  });

  // Get the parts of what the target TZ clock shows for refDate (UTC)
  const parts = tzFormatter.formatToParts(refDate);
  const p: Record<string, string> = {};
  parts.forEach(({ type, value }) => { p[type] = value; });

  // Reconstruct what the TZ clock shows as a UTC date
  const tzShows = new Date(
    `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}Z`
  );

  // The offset = what TZ shows - what UTC is
  const offsetMs = tzShows.getTime() - refDate.getTime();

  // To get UTC from local: subtract the offset
  // local = UTC + offset  →  UTC = local - offset
  const utcTime = new Date(refDate.getTime() - offsetMs);
  return utcTime.toISOString();
}

// ── HeartbeatLine ─────────────────────────────────────────────────────────────
function HeartbeatLine() {
  // ECG-style: flat → spike up → spike down → flat
  // Points for a 80x24 viewBox
  const points = '0,12 20,12 28,12 32,2 36,22 40,12 60,12 80,12';
  const totalLen = 200;

  return (
    <svg width="80" height="24" viewBox="0 0 80 24" fill="none" aria-hidden="true">
      <motion.polyline
        points={points}
        stroke="#22c55e"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        initial={{ strokeDasharray: totalLen, strokeDashoffset: totalLen }}
        animate={{ strokeDashoffset: [totalLen, 0, -totalLen] }}
        transition={{ duration: 1.8, repeat: Infinity, ease: 'linear', repeatDelay: 0.3 }}
      />
    </svg>
  );
}

// ── FlatLine ──────────────────────────────────────────────────────────────────
function FlatLine() {
  return (
    <svg width="80" height="24" viewBox="0 0 80 24" fill="none" aria-hidden="true">
      <line x1="0" y1="12" x2="80" y2="12" stroke="#475569" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

// ── BreatheLine ───────────────────────────────────────────────────────────────
function BreatheLine() {
  // Sine wave approximated with polyline points, animated via opacity/transform
  const sinePoints = Array.from({ length: 17 }, (_, i) => {
    const x = (i / 16) * 80;
    const y = 12 - Math.sin((i / 16) * Math.PI * 2) * 8;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');

  return (
    <svg width="80" height="24" viewBox="0 0 80 24" fill="none" aria-hidden="true">
      <motion.polyline
        points={sinePoints}
        stroke="#eab308"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        animate={{ opacity: [0.4, 1, 0.4], scaleY: [0.6, 1, 0.6] }}
        style={{ transformOrigin: '40px 12px' }}
        transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
      />
    </svg>
  );
}

// ── Donut Chart ───────────────────────────────────────────────────────────────
interface DonutProps {
  active: number;
  suspended: number;
  offline: number;
  total: number;
  filter: StatusFilter;
  onFilter: (f: StatusFilter) => void;
}

function DonutChart({ active, suspended, offline, total, filter, onFilter }: DonutProps) {
  const R = 54;
  const CX = 70;
  const CY = 70;
  const circumference = 2 * Math.PI * R;

  const segments = [
    { key: 'Active' as StatusFilter,    count: active,    color: '#22c55e', label: 'Active' },
    { key: 'Suspended' as StatusFilter, count: suspended, color: '#eab308', label: 'Suspended' },
    { key: 'Offline' as StatusFilter,   count: offline,   color: '#475569', label: 'Offline' },
  ];

  // Calculate dash offsets for each segment
  let cumulative = 0;
  const arcs = segments.map(seg => {
    const fraction = total > 0 ? seg.count / total : 0;
    const dash = fraction * circumference;
    const offset = circumference - cumulative * circumference / (total || 1);
    const startOffset = cumulative / (total || 1) * circumference;
    cumulative += seg.count;
    return { ...seg, dash, startOffset };
  });

  const centerLabel = filter ?? 'Total';
  const centerCount = filter === 'Active' ? active : filter === 'Suspended' ? suspended : filter === 'Offline' ? offline : total;

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative" style={{ width: 140, height: 140 }}>
        <svg width="140" height="140" viewBox="0 0 140 140">
          {/* Background ring */}
          <circle
            cx={CX} cy={CY} r={R}
            fill="none"
            stroke="rgba(51,65,85,0.3)"
            strokeWidth="14"
          />
          {/* Segments */}
          {arcs.map((arc, i) => {
            const isSelected = filter === arc.key;
            const isOther = filter !== null && filter !== arc.key;
            return (
              <motion.circle
                key={arc.key}
                cx={CX} cy={CY} r={R}
                fill="none"
                stroke={arc.color}
                strokeWidth={isSelected ? 18 : 14}
                strokeDasharray={`${arc.dash} ${circumference}`}
                strokeDashoffset={-arc.startOffset}
                strokeLinecap="butt"
                style={{
                  transform: 'rotate(-90deg)',
                  transformOrigin: `${CX}px ${CY}px`,
                  cursor: 'pointer',
                  opacity: isOther ? 0.3 : 1,
                  transition: 'opacity 0.2s, stroke-width 0.2s',
                }}
                initial={{ strokeDasharray: `0 ${circumference}` }}
                animate={{ strokeDasharray: `${arc.dash} ${circumference}` }}
                transition={{ duration: 0.9, delay: i * 0.15, ease: 'easeOut' }}
                onClick={() => onFilter(filter === arc.key ? null : arc.key)}
              />
            );
          })}
        </svg>
        {/* Center text */}
        <div
          className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none"
          style={{ top: 0, left: 0 }}
        >
          <span className="text-2xl font-bold text-slate-100 leading-none">{centerCount}</span>
          <span className="text-[10px] text-slate-500 uppercase tracking-wider mt-0.5">{centerLabel}</span>
        </div>
      </div>

      {/* Legend */}
      <div className="flex gap-4">
        {segments.map(seg => (
          <button
            key={seg.key}
            onClick={() => onFilter(filter === seg.key ? null : seg.key)}
            className="flex items-center gap-1.5 text-xs transition-opacity"
            style={{ opacity: filter !== null && filter !== seg.key ? 0.4 : 1 }}
          >
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: seg.color }} />
            <span className="text-slate-400">{seg.label}</span>
            <span className="font-bold" style={{ color: seg.color }}>{seg.count}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Timezone Selector — native grouped select, works everywhere ───────────────
interface TzSelectorProps {
  value: string;
  onChange: (tz: string) => void;
}

function TimezoneSelector({ value, onChange }: TzSelectorProps) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="w-full rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:ring-1"
      style={{
        background: 'rgba(15,23,42,0.9)',
        border: '1px solid rgba(51,65,85,0.6)',
        colorScheme: 'dark',
        cursor: 'pointer',
      } as React.CSSProperties}
    >
      {TIMEZONE_GROUPS.map(group => (
        <optgroup
          key={group.group}
          label={`── ${group.group} ──`}
          style={{ background: '#0a1628', color: '#64748b' }}
        >
          {group.zones.map(tz => (
            <option key={tz} value={tz} style={{ background: '#0f172a', color: '#e2e8f0' }}>
              {tz}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

// ── Agent Card ────────────────────────────────────────────────────────────────
function AgentCard({
  agent,
  selected,
  onToggle,
}: {
  agent: Agent;
  selected: boolean;
  onToggle: (name: string) => void;
}) {
  const isSuspended = agent.suspended;
  const isActive = !isSuspended && agent.status === 'Active';
  const isOffline = !isSuspended && agent.status !== 'Active';

  const statusLabel = isSuspended ? 'Suspended' : agent.status;
  const statusColor = isSuspended
    ? 'text-yellow-400'
    : isActive
    ? 'text-emerald-400'
    : 'text-slate-500';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      whileHover={{ y: -2 }}
      onClick={() => onToggle(agent.name)}
      className="relative rounded-xl border p-4 cursor-pointer transition-all duration-200 select-none"
      style={{
        background: selected
          ? 'rgba(6,182,212,0.07)'
          : 'rgba(15,23,42,0.6)',
        borderColor: selected
          ? 'rgba(6,182,212,0.45)'
          : 'rgba(51,65,85,0.5)',
        boxShadow: selected ? '0 0 18px rgba(6,182,212,0.1)' : 'none',
      }}
    >
      {/* Checkbox */}
      <div className="absolute top-3 right-3">
        <div
          className="w-4 h-4 rounded border flex items-center justify-center transition-all"
          style={{
            borderColor: selected ? '#06b6d4' : '#334155',
            background: selected ? '#06b6d4' : 'transparent',
          }}
        >
          {selected && (
            <svg className="w-2.5 h-2.5 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          )}
        </div>
      </div>

      {/* Status row */}
      <div className="flex items-center gap-2 mb-2">
        {isActive ? (
          <motion.span
            className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
            style={{ background: '#22c55e' }}
            animate={{ boxShadow: ['0 0 0 0 rgba(34,197,94,0.7)', '0 0 0 6px rgba(34,197,94,0)', '0 0 0 0 rgba(34,197,94,0)'] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: 'easeOut' }}
          />
        ) : (
          <span
            className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
            style={{ background: isSuspended ? '#eab308' : '#475569' }}
          />
        )}
        <span className={`text-xs font-semibold ${statusColor}`}>{statusLabel}</span>
      </div>

      {/* Name */}
      <p className="text-sm font-bold text-slate-100 mb-1 pr-6 truncate">{agent.name}</p>

      {/* Type */}
      <p className="text-[10px] font-semibold tracking-widest uppercase text-cyan-600 mb-3">{agent.type}</p>

      {/* Waveform */}
      <div className="mb-3">
        {isActive ? <HeartbeatLine /> : isSuspended ? <BreatheLine /> : <FlatLine />}
      </div>

      {/* Meta */}
      <div className="space-y-1">
        <div className="flex items-center gap-1.5 text-xs text-slate-500">
          <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M12 5l7 7-7 7" />
          </svg>
          <span className="truncate">{agent.hostName || '—'}</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-slate-600">
          <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9" />
          </svg>
          <span className="font-mono">{agent.ipAddress || '—'}</span>
        </div>
      </div>
    </motion.div>
  );
}

// ── Terminal log line ─────────────────────────────────────────────────────────
function LogLine({ line, index }: { line: string; index: number }) {
  const isError   = line.toLowerCase().includes('error') || line.toLowerCase().includes('fail');
  const isSuccess = line.toLowerCase().includes('success') || line.toLowerCase().includes('ok') || line.toLowerCase().includes('done');
  const isWarn    = line.toLowerCase().includes('warn') || line.toLowerCase().includes('skip');

  const color = isError ? '#f87171' : isSuccess ? '#4ade80' : isWarn ? '#facc15' : '#94a3b8';

  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.2, delay: index * 0.03 }}
      className="flex items-start gap-2 font-mono text-xs leading-relaxed"
    >
      <span style={{ color: '#1e3a4a' }} className="shrink-0 select-none">
        {String(index + 1).padStart(3, '0')}
      </span>
      <span style={{ color }}>{line}</span>
    </motion.div>
  );
}

// ── Result row ────────────────────────────────────────────────────────────────
function ResultRow({ result }: { result: AgentResult }) {
  const cfg = {
    success: { icon: '✓', color: '#4ade80', bg: 'rgba(34,197,94,0.08)', border: 'rgba(34,197,94,0.2)' },
    error:   { icon: '✗', color: '#f87171', bg: 'rgba(248,113,113,0.08)', border: 'rgba(248,113,113,0.2)' },
    pending: { icon: '…', color: '#94a3b8', bg: 'rgba(148,163,184,0.05)', border: 'rgba(148,163,184,0.15)' },
  }[result.status];

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm"
      style={{ background: cfg.bg, border: `1px solid ${cfg.border}` }}
    >
      <span className="font-bold text-base w-4 text-center shrink-0" style={{ color: cfg.color }}>
        {cfg.icon}
      </span>
      <span className="font-medium text-slate-300 flex-1 truncate">{result.name}</span>
      <span className="text-xs text-slate-500 truncate max-w-[200px]">{result.message}</span>
    </motion.div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function AgentControlPage() {
  // Global connection state — shared across all automations
  const { connected } = useConnectionStore();

  // Agents
  const [agents, setAgents]     = useState<Agent[]>([]);
  const [clusters, setClusters] = useState<any[]>([]);
  const [loading, setLoading]   = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Donut filter
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(null);

  // Action panel
  const [action, setAction]   = useState<Action>('suspend');
  const [timing, setTiming]   = useState<Timing>('immediate');
  const [schedDate, setSchedDate] = useState('');
  const [schedTime, setSchedTime] = useState('');
  const [schedTz, setSchedTz]     = useState('UTC');
  const [manualInput, setManualInput] = useState('');

  // Execution
  const [executing, setExecuting] = useState(false);
  const [results, setResults]     = useState<AgentResult[]>([]);
  const [logs, setLogs]           = useState<string[]>([]);

  const logsEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll logs
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const addLog = useCallback((msg: string) => {
    const ts = new Date().toLocaleTimeString('en-US', { hour12: false });
    setLogs(prev => [...prev, `[${ts}] ${msg}`]);
  }, []);

  // ── Stats ─────────────────────────────────────────────────────────────────
  const statsActive    = agents.filter(a => a.status === 'Active' && !a.suspended).length;
  const statsSuspended = agents.filter(a => a.suspended).length;
  const statsOffline   = agents.filter(a => a.status !== 'Active' && !a.suspended).length;

  // ── Filtered agents (only shown when a segment is clicked) ───────────────
  const filteredAgents = statusFilter === null
    ? []
    : agents.filter(a => {
        if (statusFilter === 'Active')    return a.status === 'Active' && !a.suspended;
        if (statusFilter === 'Suspended') return a.suspended;
        if (statusFilter === 'Offline')   return a.status !== 'Active' && !a.suspended;
        return false;
      });

  // ── Connect ──────────────────────────────────────────────────────────────
  // Connection is handled by GlobalHeader / useConnectionStore
  // Auto-fetch agents when connected
  useEffect(() => {
    if (connected) fetchAgents();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected]);

  // ── Fetch agents ─────────────────────────────────────────────────────────
  const fetchAgents = async () => {
    setLoading(true);
    addLog('Fetching agent list …');
    try {
      const res  = await globalApi.listAgents();
      const data = res?.data?.data;
      // Agents and clusters are separate — only agents have status/hostName/ipAddress
      const agentList: Agent[] = data?.agents   ?? [];
      const clusterList: any[] = data?.clusters ?? [];
      setAgents(agentList);
      setClusters(clusterList);
      addLog(`✓ Loaded ${agentList.length} agent(s), ${clusterList.length} cluster(s).`);
    } catch (e: any) {
      addLog(`✗ Failed to load agents: ${e?.message}`);
    } finally {
      setLoading(false);
    }
  };

  // ── Selection helpers ─────────────────────────────────────────────────────
  const toggleAgent = (name: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  };

  const selectAllVisible = () => {
    setSelected(prev => {
      const next = new Set(prev);
      filteredAgents.forEach(a => next.add(a.name));
      return next;
    });
  };

  const clearAll = () => setSelected(new Set());

  // ── Execute ───────────────────────────────────────────────────────────────
  const handleExecute = async () => {
    const manualNames = manualInput
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    const names = Array.from(new Set([...Array.from(selected), ...manualNames]));

    if (names.length === 0) {
      addLog('✗ No agents selected. Click a donut segment to browse agents, or enter names manually.');
      return;
    }

    setExecuting(true);
    setResults([]);
    addLog(`► Starting ${action.toUpperCase()} on ${names.length} agent(s) [${timing}] …`);

    // Seed pending results
    setResults(names.map(n => ({ name: n, status: 'pending', message: 'Queued…' })));

    try {
      if (timing === 'scheduled') {
        if (!schedDate || !schedTime) {
          addLog('✗ Please select both a date and time for scheduled execution.');
          setExecuting(false);
          return;
        }
        const isoDatetime = buildScheduledISO(schedDate, schedTime, schedTz);
        addLog(`Scheduling ${action} at ${schedDate} ${schedTime} ${schedTz} → UTC: ${isoDatetime}`);
        const res = await globalApi.scheduleAgentAction(names, action, isoDatetime);
        addLog(`✓ Job scheduled: ${res?.data?.jobId || 'OK'} [TZ: ${schedTz}]`);
        setResults(names.map(n => ({
          name: n,
          status: 'success',
          message: `Scheduled at ${isoDatetime} (${schedTz})`,
        })));
      } else {
        const fn = action === 'suspend' ? globalApi.suspendAgents.bind(globalApi) : globalApi.resumeAgents.bind(globalApi);
        addLog(`Executing ${action} on: ${names.join(', ')}`);
        const res = await fn(names);
        const raw = res?.data;

        const perAgent: AgentResult[] = names.map(n => {
          const found = Array.isArray(raw?.results)
            ? raw.results.find((r: any) => r.name === n || r.agent === n)
            : null;
          if (found) {
            const ok = found.success || found.status === 'success';
            return { name: n, status: ok ? 'success' : 'error', message: found.message || (ok ? 'Done' : 'Failed') };
          }
          return { name: n, status: 'success', message: 'Done' };
        });

        setResults(perAgent);
        const successCount = perAgent.filter(r => r.status === 'success').length;
        addLog(`✓ Completed: ${successCount}/${names.length} succeeded.`);
      }
    } catch (e: any) {
      addLog(`✗ Execution error: ${e?.message}`);
      setResults(prev => prev.map(r => ({ ...r, status: 'error', message: e?.message || 'Error' })));
    } finally {
      setExecuting(false);
    }
  };

  // ── Input style helpers ───────────────────────────────────────────────────
  const inputCls = `
    w-full rounded-lg px-3 py-2 text-sm text-slate-200 outline-none transition-all
    placeholder:text-slate-600 focus:ring-1
  `;
  const inputStyle = {
    background: 'rgba(15,23,42,0.8)',
    border: '1px solid rgba(51,65,85,0.6)',
    '--tw-ring-color': 'rgba(6,182,212,0.4)',
  } as React.CSSProperties;

  const dateTimeInputStyle = {
    background: 'rgba(15,23,42,0.9)',
    border: '1px solid rgba(51,65,85,0.6)',
    colorScheme: 'dark',
  } as React.CSSProperties;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen relative scan-line" style={{ background: 'var(--bg-deep)' }}>
      <GlobalHeader title="Agent Control" subtitle="SUSPEND / RESUME / SCHEDULE" />

      <main className="max-w-7xl mx-auto px-6 pb-24">

        {/* ── Refresh / Status bar ── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mt-8 flex items-center justify-between rounded-xl px-5 py-3"
          style={{
            background: 'linear-gradient(145deg, rgba(6,15,30,0.9), rgba(2,8,18,0.95))',
            border: connected ? '1px solid rgba(34,197,94,0.15)' : '1px solid rgba(51,65,85,0.2)',
          }}
        >
          <div className="flex items-center gap-2">
            {connected ? (
              <>
                <motion.span className="w-2 h-2 rounded-full bg-emerald-400 inline-block"
                  animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 1.5, repeat: Infinity }} />
                <span className="text-xs text-emerald-400 font-medium">Connected</span>
                <span className="text-xs text-slate-600 ml-2">
                  {agents.length > 0 ? `${agents.length} agents loaded` : 'No agents loaded yet'}
                </span>
              </>
            ) : (
              <>
                <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />
                <span className="text-xs text-slate-500">Not connected — use the connection panel above</span>
              </>
            )}
          </div>
          {connected && (
            <button
              onClick={fetchAgents}
              disabled={loading}
              className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-cyan-400 transition-colors px-3 py-1.5 rounded-lg"
              style={{ border: '1px solid rgba(51,65,85,0.4)' }}
            >
              <svg className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              {loading ? 'Loading…' : 'Refresh Agents'}
            </button>
          )}
        </motion.div>

        {/* ── Donut Chart Section ── */}
        <AnimatePresence>
          {agents.length > 0 && (
            <motion.section
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.5 }}
              className="mt-6 rounded-xl border p-6 flex flex-col items-center"
              style={{
                background: 'linear-gradient(145deg, rgba(6,15,30,0.9), rgba(2,8,18,0.95))',
                borderColor: 'rgba(51,65,85,0.2)',
              }}
            >
              <h2 className="text-xs font-semibold tracking-widest uppercase text-slate-500 mb-5 self-start">
                Agent Overview
                <span className="ml-2 text-slate-700 normal-case font-normal">— click a segment to filter</span>
              </h2>
              <DonutChart
                active={statsActive}
                suspended={statsSuspended}
                offline={statsOffline}
                total={agents.length}
                filter={statusFilter}
                onFilter={setStatusFilter}
              />
            </motion.section>
          )}
        </AnimatePresence>

        {/* ── Agent Cards (only shown when a segment is selected) ── */}
        <AnimatePresence>
          {statusFilter !== null && (
            <motion.section
              key={statusFilter}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.35 }}
              className="mt-4"
            >
              {/* Section header */}
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{
                      background:
                        statusFilter === 'Active' ? '#22c55e' :
                        statusFilter === 'Suspended' ? '#eab308' : '#475569',
                    }}
                  />
                  <h3 className="text-xs font-semibold tracking-widest uppercase text-slate-500">
                    {statusFilter} Agents
                    <span className="ml-2 text-cyan-600">{filteredAgents.length}</span>
                  </h3>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={selectAllVisible}
                    className="text-xs text-slate-500 hover:text-cyan-400 transition-colors px-2 py-1 rounded"
                    style={{ border: '1px solid rgba(51,65,85,0.4)' }}
                  >
                    Select All
                  </button>
                  <button
                    onClick={clearAll}
                    className="text-xs text-slate-500 hover:text-red-400 transition-colors px-2 py-1 rounded"
                    style={{ border: '1px solid rgba(51,65,85,0.4)' }}
                  >
                    Clear
                  </button>
                  <button
                    onClick={() => setStatusFilter(null)}
                    className="text-xs text-slate-600 hover:text-slate-400 transition-colors px-2 py-1 rounded"
                    style={{ border: '1px solid rgba(51,65,85,0.3)' }}
                  >
                    ✕ Close
                  </button>
                </div>
              </div>

              {loading ? (
                <div className="flex items-center justify-center py-12 text-slate-600 text-sm gap-2">
                  <motion.div
                    className="w-4 h-4 rounded-full border-2 border-cyan-500 border-t-transparent"
                    animate={{ rotate: 360 }}
                    transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
                  />
                  Loading agents…
                </div>
              ) : filteredAgents.length === 0 ? (
                <div className="flex items-center justify-center py-12 text-slate-700 text-sm">
                  No {statusFilter?.toLowerCase()} agents found.
                </div>
              ) : (
                <motion.div
                  layout
                  className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3"
                >
                  <AnimatePresence>
                    {filteredAgents.map(agent => (
                      <AgentCard
                        key={agent.name}
                        agent={agent}
                        selected={selected.has(agent.name)}
                        onToggle={toggleAgent}
                      />
                    ))}
                  </AnimatePresence>
                </motion.div>
              )}

              {selected.size > 0 && (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="mt-3 text-xs text-cyan-600"
                >
                  {selected.size} agent{selected.size !== 1 ? 's' : ''} selected
                </motion.p>
              )}
            </motion.section>
          )}
        </AnimatePresence>

        {/* ── Action Panel ── */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="mt-6 rounded-xl border p-6"
          style={{
            background: 'linear-gradient(145deg, rgba(6,15,30,0.9), rgba(2,8,18,0.95))',
            borderColor: 'rgba(51,65,85,0.2)',
          }}
        >
          <h2 className="text-xs font-semibold tracking-widest uppercase text-slate-500 mb-5">
            Action Configuration
          </h2>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left column */}
            <div className="space-y-5">
              {/* Action buttons */}
              <div>
                <label className="block text-xs text-slate-600 mb-2 uppercase tracking-wider">Action</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setAction('suspend')}
                    className="flex-1 rounded-lg py-2.5 text-sm font-semibold transition-all"
                    style={{
                      background: action === 'suspend'
                        ? 'rgba(239,68,68,0.15)'
                        : 'rgba(15,23,42,0.6)',
                      border: action === 'suspend'
                        ? '1px solid rgba(239,68,68,0.4)'
                        : '1px solid rgba(51,65,85,0.4)',
                      color: action === 'suspend' ? '#f87171' : '#64748b',
                      boxShadow: action === 'suspend' ? '0 0 16px rgba(239,68,68,0.1)' : 'none',
                    }}
                  >
                    <span className="flex items-center justify-center gap-1.5">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Suspend
                    </span>
                  </button>
                  <button
                    onClick={() => setAction('resume')}
                    className="flex-1 rounded-lg py-2.5 text-sm font-semibold transition-all"
                    style={{
                      background: action === 'resume'
                        ? 'rgba(34,197,94,0.15)'
                        : 'rgba(15,23,42,0.6)',
                      border: action === 'resume'
                        ? '1px solid rgba(34,197,94,0.4)'
                        : '1px solid rgba(51,65,85,0.4)',
                      color: action === 'resume' ? '#4ade80' : '#64748b',
                      boxShadow: action === 'resume' ? '0 0 16px rgba(34,197,94,0.1)' : 'none',
                    }}
                  >
                    <span className="flex items-center justify-center gap-1.5">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Resume
                    </span>
                  </button>
                </div>
              </div>

              {/* Timing */}
              <div>
                <label className="block text-xs text-slate-600 mb-2 uppercase tracking-wider">Timing</label>
                <div className="flex gap-2">
                  {(['immediate', 'scheduled'] as Timing[]).map(t => (
                    <button
                      key={t}
                      onClick={() => setTiming(t)}
                      className="flex-1 rounded-lg py-2 text-sm font-medium transition-all capitalize"
                      style={{
                        background: timing === t
                          ? 'rgba(6,182,212,0.12)'
                          : 'rgba(15,23,42,0.6)',
                        border: timing === t
                          ? '1px solid rgba(6,182,212,0.35)'
                          : '1px solid rgba(51,65,85,0.4)',
                        color: timing === t ? '#67e8f9' : '#64748b',
                      }}
                    >
                      {t === 'immediate' ? (
                        <span className="flex items-center justify-center gap-1.5">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                          </svg>
                          Immediate
                        </span>
                      ) : (
                        <span className="flex items-center justify-center gap-1.5">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          Scheduled
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Date + Time + Timezone pickers (only when scheduled) */}
              <AnimatePresence>
                {timing === 'scheduled' && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <label className="block text-xs text-slate-600 mb-2 uppercase tracking-wider">
                      Schedule Date &amp; Time
                    </label>
                    <div className="flex gap-2 mb-2">
                      <input
                        type="date"
                        value={schedDate}
                        onChange={e => setSchedDate(e.target.value)}
                        className="flex-1 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:ring-1"
                        style={{
                          ...dateTimeInputStyle,
                          '--tw-ring-color': 'rgba(6,182,212,0.4)',
                        } as React.CSSProperties}
                      />
                      <input
                        type="time"
                        value={schedTime}
                        onChange={e => setSchedTime(e.target.value)}
                        className="flex-1 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:ring-1"
                        style={{
                          ...dateTimeInputStyle,
                          '--tw-ring-color': 'rgba(6,182,212,0.4)',
                        } as React.CSSProperties}
                      />
                    </div>

                    {/* Timezone selector */}
                    <label className="block text-xs text-slate-600 mb-1.5 uppercase tracking-wider">
                      Timezone
                    </label>
                    <div className="flex gap-2 items-center">
                      <TimezoneSelector value={schedTz} onChange={setSchedTz} />
                    </div>

                    {/* Selected timezone badge */}
                    <div className="mt-2 flex items-center gap-2">
                      <span
                        className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium"
                        style={{
                          background: 'rgba(6,182,212,0.1)',
                          border: '1px solid rgba(6,182,212,0.25)',
                          color: '#67e8f9',
                        }}
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        {schedTz}
                      </span>
                      {schedDate && schedTime && (
                        <span className="text-xs text-cyan-700 font-mono">
                          UTC: {buildScheduledISO(schedDate, schedTime, schedTz)}
                        </span>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Right column */}
            <div className="space-y-5">
              {/* Manual agent names */}
              <div>
                <label className="block text-xs text-slate-600 mb-2 uppercase tracking-wider">
                  Manual Agent Names
                  <span className="ml-1 normal-case text-slate-700">(comma separated, optional)</span>
                </label>
                <textarea
                  className={`${inputCls} resize-none`}
                  style={{ ...inputStyle, minHeight: '72px' }}
                  placeholder="AGENT_01, AGENT_02, AGENT_03"
                  value={manualInput}
                  onChange={e => setManualInput(e.target.value)}
                />
              </div>

              {/* Execute button */}
              <button
                onClick={handleExecute}
                disabled={executing || !connected}
                className="w-full rounded-xl py-3 text-sm font-bold tracking-wide transition-all relative overflow-hidden"
                style={{
                  background: executing
                    ? 'rgba(6,182,212,0.1)'
                    : 'linear-gradient(135deg,rgba(6,182,212,0.25),rgba(59,130,246,0.25))',
                  border: '1px solid rgba(6,182,212,0.4)',
                  color: executing ? '#94a3b8' : '#67e8f9',
                  boxShadow: executing ? 'none' : '0 0 20px rgba(6,182,212,0.15)',
                  opacity: !connected ? 0.4 : 1,
                  cursor: !connected ? 'not-allowed' : 'pointer',
                }}
              >
                {executing ? (
                  <span className="flex items-center justify-center gap-2">
                    <motion.span
                      className="w-4 h-4 rounded-full border-2 border-cyan-500 border-t-transparent inline-block"
                      animate={{ rotate: 360 }}
                      transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
                    />
                    Executing…
                  </span>
                ) : (
                  `Execute ${action.charAt(0).toUpperCase() + action.slice(1)}`
                )}
              </button>

              {!connected && (
                <p className="text-xs text-slate-700 text-center">Connect first to execute actions.</p>
              )}

              {/* Selection summary */}
              {(selected.size > 0 || manualInput.trim()) && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="rounded-lg px-3 py-2 text-xs"
                  style={{
                    background: 'rgba(6,182,212,0.05)',
                    border: '1px solid rgba(6,182,212,0.15)',
                  }}
                >
                  {selected.size > 0 && (
                    <p className="text-cyan-700">
                      {selected.size} agent{selected.size !== 1 ? 's' : ''} selected from grid
                    </p>
                  )}
                  {manualInput.trim() && (
                    <p className="text-slate-600 mt-0.5">
                      + manual: {manualInput.split(',').filter(s => s.trim()).length} name(s)
                    </p>
                  )}
                </motion.div>
              )}
            </div>
          </div>
        </motion.section>

        {/* ── Results Panel ── */}
        <AnimatePresence>
          {results.length > 0 && (
            <motion.section
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mt-6 rounded-xl border p-6"
              style={{
                background: 'linear-gradient(145deg, rgba(6,15,30,0.9), rgba(2,8,18,0.95))',
                borderColor: 'rgba(51,65,85,0.2)',
              }}
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xs font-semibold tracking-widest uppercase text-slate-500">
                  Results
                </h2>
                <div className="flex gap-3 text-xs">
                  <span className="text-emerald-500">
                    ✓ {results.filter(r => r.status === 'success').length} success
                  </span>
                  <span className="text-red-400">
                    ✗ {results.filter(r => r.status === 'error').length} error
                  </span>
                  <span className="text-slate-600">
                    … {results.filter(r => r.status === 'pending').length} pending
                  </span>
                </div>
              </div>
              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {results.map((r, i) => (
                  <ResultRow key={`${r.name}-${i}`} result={r} />
                ))}
              </div>
            </motion.section>
          )}
        </AnimatePresence>

        {/* ── Terminal Logs ── */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="mt-6 rounded-xl overflow-hidden"
          style={{
            background: 'rgba(2,8,18,0.9)',
            borderColor: 'rgba(6,182,212,0.08)',
            border: '1px solid rgba(6,182,212,0.08)',
          }}
        >
          {/* Terminal header */}
          <div
            className="flex items-center justify-between px-4 py-2.5 border-b"
            style={{ borderColor: 'rgba(6,182,212,0.1)' }}
          >
            <div className="flex items-center gap-2">
              <div className="flex gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500/60" />
                <span className="w-2.5 h-2.5 rounded-full bg-yellow-500/60" />
                <span className="w-2.5 h-2.5 rounded-full bg-green-500/60" />
              </div>
              <span className="text-xs text-slate-600 font-mono ml-2">agent-control.log</span>
            </div>
            <button
              onClick={() => setLogs([])}
              className="text-[10px] text-slate-700 hover:text-slate-500 transition-colors"
            >
              Clear
            </button>
          </div>

          {/* Log body */}
          <div className="p-4 h-48 overflow-y-auto space-y-1 font-mono">
            {logs.length === 0 ? (
              <p className="text-xs text-slate-800 font-mono">
                {'>'} Waiting for activity…
              </p>
            ) : (
              logs.map((line, i) => <LogLine key={i} line={line} index={i} />)
            )}
            <div ref={logsEndRef} />
          </div>
        </motion.section>

        {/* ── Watermark ── */}
        <footer
          className="mt-10 border-t py-6 text-center"
          style={{ borderColor: 'rgba(6,182,212,0.05)' }}
        >
          <p className="text-[10px] text-slate-700 font-mono">
            DESIGNED AND ENGINEERED BY <span className="text-slate-500">ABHAY THAKUR</span>
          </p>
        </footer>

      </main>
    </div>
  );
}
