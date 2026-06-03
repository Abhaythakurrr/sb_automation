'use client';
import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { AUTOMATIONS, Automation } from '@/automations/registry';
import { useConnectionStore, globalApi } from '@/store/useConnectionStore';
import { useWorkspaceStore, AutomationId } from '@/store/useWorkspaceStore';

// ── Animated Background Particles ─────────────────────────────────────────────
function ParticleField() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {Array.from({ length: 30 }).map((_, i) => (
        <motion.div
          key={i}
          className="absolute w-1 h-1 rounded-full"
          style={{
            background: i % 3 === 0 ? '#06b6d4' : i % 3 === 1 ? '#3b82f6' : '#8b5cf6',
            left: `${Math.random() * 100}%`,
            top: `${Math.random() * 100}%`,
            opacity: 0.15 + Math.random() * 0.2,
          }}
          animate={{
            y: [0, -30 - Math.random() * 50, 0],
            x: [0, (Math.random() - 0.5) * 40, 0],
            opacity: [0.1, 0.4, 0.1],
          }}
          transition={{
            duration: 4 + Math.random() * 6,
            repeat: Infinity,
            delay: Math.random() * 5,
            ease: 'easeInOut',
          }}
        />
      ))}
    </div>
  );
}

// ── Hex Grid Background ───────────────────────────────────────────────────────
function HexGrid() {
  return (
    <div className="absolute inset-0 pointer-events-none opacity-[0.03]">
      <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="hexagons" width="56" height="100" patternUnits="userSpaceOnUse" patternTransform="scale(1.5)">
            <path d="M28 66L0 50L0 16L28 0L56 16L56 50L28 66L28 100" fill="none" stroke="#06b6d4" strokeWidth="0.5"/>
            <path d="M28 0L28 34L0 50L0 84L28 100L56 84L56 50L28 34" fill="none" stroke="#06b6d4" strokeWidth="0.5"/>
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#hexagons)" />
      </svg>
    </div>
  );
}

// ── Live Data Pulse ───────────────────────────────────────────────────────────
function DataPulse() {
  return (
    <div className="absolute top-0 left-0 right-0 h-[1px] overflow-hidden pointer-events-none">
      <motion.div
        className="h-full w-32"
        style={{ background: 'linear-gradient(90deg, transparent, #06b6d4, transparent)' }}
        animate={{ x: ['-128px', 'calc(100vw + 128px)'] }}
        transition={{ duration: 4, repeat: Infinity, ease: 'linear', repeatDelay: 2 }}
      />
    </div>
  );
}

// ── Icons ─────────────────────────────────────────────────────────────────────
function IconJob() {
  return (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
    </svg>
  );
}
function IconAgent() {
  return (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18" />
    </svg>
  );
}
function IconMonitor() {
  return (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  );
}
function IconDelete() {
  return (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  );
}
function IconUpdate() {
  return (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
  );
}

function AutomationIcon({ icon }: { icon: string }) {
  if (icon === 'job')     return <IconJob />;
  if (icon === 'agent')   return <IconAgent />;
  if (icon === 'monitor') return <IconMonitor />;
  if (icon === 'delete')  return <IconDelete />;
  if (icon === 'update')  return <IconUpdate />;
  return <IconJob />;
}

// ── Status badge ──────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: Automation['status'] }) {
  const cfg = {
    'live':        { label: 'Operational', cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30', dot: 'bg-emerald-400' },
    'beta':        { label: 'Beta',        cls: 'bg-amber-500/10 text-amber-400 border-amber-500/30', dot: 'bg-amber-400' },
    'coming-soon': { label: 'Offline',     cls: 'bg-slate-700/30 text-slate-500 border-slate-600/30', dot: 'bg-slate-600' },
    'maintenance': { label: 'In Dev',      cls: 'bg-blue-500/10 text-blue-400 border-blue-500/30', dot: 'bg-blue-400' },
    'wip':         { label: 'Building',    cls: 'bg-orange-500/10 text-orange-400 border-orange-500/30', dot: 'bg-orange-400' },
  }[status];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-semibold tracking-wider uppercase border ${cfg.cls}`}>
      <motion.span
        className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`}
        animate={status === 'live' ? { opacity: [1, 0.3, 1] } : {}}
        transition={{ duration: 2, repeat: Infinity }}
      />
      {cfg.label}
    </span>
  );
}


// ── Automation Card — Command Center Style ────────────────────────────────────
function AutomationCard({ auto, index }: { auto: Automation; index: number }) {
  const isLive = auto.status === 'live' || auto.status === 'beta';
  const isWip  = auto.status === 'wip' || auto.status === 'maintenance';
  const { openTab } = useWorkspaceStore();

  const handleClick = () => {
    if (!isLive) return;
    // Map route to automation ID
    const routeMap: Record<string, AutomationId> = {
      '/job-creation':  'job-creation',
      '/agent-control': 'agent-control',
      '/monitoring':    'monitoring',
      '/job-deletion':  'job-deletion',
    };
    const id = routeMap[auto.route];
    if (id) openTab(id, auto.title);
  };

  const cardContent = (
    <motion.div
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.4 + index * 0.08, ease: [0.16, 1, 0.3, 1] }}
      whileHover={isLive ? { y: -6, scale: 1.02 } : {}}
      className={`relative group rounded-xl overflow-hidden transition-all duration-500 ${
        isLive
          ? 'cursor-pointer'
          : isWip
          ? 'cursor-default'
          : 'cursor-not-allowed opacity-40'
      }`}
      style={{
        background: isLive
          ? 'linear-gradient(145deg, rgba(6,15,30,0.9), rgba(2,8,18,0.95))'
          : 'rgba(6,15,30,0.5)',
        border: isLive
          ? '1px solid rgba(6,182,212,0.15)'
          : isWip
          ? '1px solid rgba(100,116,139,0.15)'
          : '1px solid rgba(51,65,85,0.1)',
      }}
    >
      {/* Top accent line */}
      {isLive && (
        <div className="absolute top-0 left-0 right-0 h-[1px]"
          style={{ background: 'linear-gradient(90deg, transparent, rgba(6,182,212,0.5), rgba(59,130,246,0.5), transparent)' }} />
      )}

      {/* Hover glow */}
      {isLive && (
        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
          style={{ background: 'radial-gradient(ellipse at 50% 0%, rgba(6,182,212,0.08), transparent 70%)' }} />
      )}

      <div className="p-5">
        {/* Header row */}
        <div className="flex items-start justify-between mb-4">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center"
            style={{
              background: isLive
                ? 'linear-gradient(135deg, rgba(6,182,212,0.12), rgba(59,130,246,0.12))'
                : 'rgba(30,41,59,0.3)',
              border: isLive
                ? '1px solid rgba(6,182,212,0.2)'
                : '1px solid rgba(51,65,85,0.2)',
            }}>
            <span style={{ color: isLive ? '#67e8f9' : '#475569' }}>
              <AutomationIcon icon={auto.icon} />
            </span>
          </div>
          <StatusBadge status={auto.status} />
        </div>

        {/* Category */}
        <p className="text-[9px] font-bold tracking-[0.2em] uppercase mb-1.5"
          style={{ color: isLive ? 'rgba(6,182,212,0.6)' : 'rgba(100,116,139,0.5)' }}>
          {auto.category}
        </p>

        {/* Title */}
        <h3 className={`text-base font-bold mb-2 ${
          isLive ? 'text-slate-100 group-hover:text-cyan-50' : 'text-slate-500'
        } transition-colors`}>
          {auto.title}
        </h3>

        {/* Description */}
        <p className="text-xs text-slate-500 leading-relaxed mb-4 line-clamp-2">
          {auto.description}
        </p>

        {/* Features — compact */}
        <div className="flex flex-wrap gap-1.5 mb-4">
          {auto.features.slice(0, 3).map(f => (
            <span key={f} className="px-2 py-0.5 rounded text-[9px] font-medium"
              style={{
                background: isLive ? 'rgba(6,182,212,0.06)' : 'rgba(30,41,59,0.3)',
                border: isLive ? '1px solid rgba(6,182,212,0.1)' : '1px solid rgba(51,65,85,0.2)',
                color: isLive ? '#94a3b8' : '#475569',
              }}>
              {f}
            </span>
          ))}
          {auto.features.length > 3 && (
            <span className="px-2 py-0.5 rounded text-[9px] font-medium text-slate-600">
              +{auto.features.length - 3} more
            </span>
          )}
        </div>

        {/* CTA */}
        {isLive ? (
          <div className="flex items-center gap-2 text-xs font-semibold text-cyan-400 group-hover:text-cyan-300 transition-colors">
            <span>Launch</span>
            <motion.svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"
              animate={{}} whileHover={{ x: 4 }}>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
            </motion.svg>
          </div>
        ) : isWip ? (
          <div className="flex items-center gap-1.5 text-[10px] font-medium text-slate-600">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Under development
          </div>
        ) : (
          <p className="text-[10px] text-slate-700 font-medium">Offline</p>
        )}
      </div>
    </motion.div>
  );

  if (isLive) return <div onClick={handleClick}>{cardContent}</div>;
  return cardContent;
}


// ── Connection Panel — Command Center Style ───────────────────────────────────
function ConnectionPanel() {
  const {
    connected, connecting, connError, environment,
    setConnected, setConnecting, setConnError,
    setEnvironment, setSessionId, setBaseUrlHint, setUsername, disconnect,
  } = useConnectionStore();

  const [baseUrl, setBaseUrl] = useState(process.env.NEXT_PUBLIC_SB_BASE_URL || '');
  const [token, setToken]     = useState('');
  const [nameInput, setNameInput] = useState('');

  const handleConnect = async () => {
    if (!baseUrl.trim() || !token.trim()) {
      setConnError('Base URL and token are required');
      return;
    }
    setConnecting(true);
    setConnError('');
    try {
      const { sessionId, username: resolvedName } = await globalApi.connect(token.trim(), baseUrl.trim(), nameInput.trim() || undefined);
      setSessionId(sessionId);
      globalApi.setSessionId(sessionId);
      setUsername(resolvedName);
      try {
        const hostname = new URL(baseUrl.trim()).hostname;
        setBaseUrlHint(hostname);
      } catch { setBaseUrlHint(baseUrl.trim()); }
      setConnected(true);
      setToken('');
    } catch (e: any) {
      setConnError(e.response?.data?.error || e.message || 'Connection failed');
    } finally {
      setConnecting(false);
    }
  };

  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.2 }}
      className="max-w-6xl mx-auto px-6 mb-16"
    >
      <div className="relative rounded-xl overflow-hidden"
        style={{
          background: 'linear-gradient(145deg, rgba(6,15,30,0.9), rgba(2,8,18,0.95))',
          border: connected ? '1px solid rgba(34,197,94,0.2)' : '1px solid rgba(6,182,212,0.12)',
        }}>
        {/* Top accent */}
        <div className="absolute top-0 left-0 right-0 h-[1px]"
          style={{
            background: connected
              ? 'linear-gradient(90deg, transparent, rgba(34,197,94,0.5), transparent)'
              : 'linear-gradient(90deg, transparent, rgba(6,182,212,0.4), transparent)',
          }} />

        <div className="p-6">
          {/* Panel header */}
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{
                  background: connected ? 'rgba(34,197,94,0.1)' : 'rgba(6,182,212,0.1)',
                  border: connected ? '1px solid rgba(34,197,94,0.2)' : '1px solid rgba(6,182,212,0.15)',
                }}>
                <svg className="w-4 h-4" fill="none" stroke={connected ? '#4ade80' : '#67e8f9'} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.858 15.355-5.858 21.213 0" />
                </svg>
              </div>
              <div>
                <h2 className="text-sm font-semibold text-slate-200">UAC Connection</h2>
                <p className="text-[10px] text-slate-600 mt-0.5">Secure session — token stored server-side only</p>
              </div>
            </div>
            {connected && (
              <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg"
                style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)' }}>
                <motion.span className="w-2 h-2 rounded-full bg-emerald-400"
                  animate={{ opacity: [1, 0.3, 1], scale: [1, 0.8, 1] }}
                  transition={{ duration: 2, repeat: Infinity }} />
                <span className="text-xs font-medium text-emerald-400">{environment}</span>
              </motion.div>
            )}
          </div>

          {connected ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {[
                  { label: 'Endpoint', value: useConnectionStore.getState().baseUrlHint || 'UAC Instance', icon: 'M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9' },
                  { label: 'Session', value: 'Active — encrypted', icon: 'M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z' },
                  { label: 'Environment', value: environment, icon: 'M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10', editable: true },
                ].map(item => (
                  <div key={item.label} className="rounded-lg px-3 py-2.5 flex items-center gap-2.5"
                    style={{ background: 'rgba(2,8,18,0.6)', border: '1px solid rgba(51,65,85,0.2)' }}>
                    <svg className="w-3.5 h-3.5 text-slate-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={item.icon} />
                    </svg>
                    <div className="min-w-0 flex-1">
                      <p className="text-[9px] text-slate-600 uppercase tracking-wider font-semibold">{item.label}</p>
                      {item.editable ? (
                        <input
                          className="bg-transparent text-slate-300 outline-none w-full text-xs mt-0.5"
                          value={environment}
                          onChange={e => setEnvironment(e.target.value)}
                          placeholder="Production"
                        />
                      ) : (
                        <p className="text-xs text-slate-300 truncate mt-0.5 font-mono">{item.value}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <button onClick={disconnect}
                className="w-full rounded-lg py-2.5 text-xs font-semibold transition-all hover:bg-red-500/10"
                style={{ background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171' }}>
                Disconnect Session
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <input
                  className="w-full rounded-lg px-3 py-2.5 text-sm text-slate-200 outline-none placeholder:text-slate-600 focus:ring-1 focus:ring-cyan-500/30 transition-all"
                  style={{ background: 'rgba(2,8,18,0.8)', border: '1px solid rgba(51,65,85,0.4)' }}
                  placeholder="https://instance.stonebranch.cloud"
                  value={baseUrl} onChange={e => setBaseUrl(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleConnect()}
                  autoComplete="off"
                  disabled={!!process.env.NEXT_PUBLIC_SB_BASE_URL}
                  title={process.env.NEXT_PUBLIC_SB_BASE_URL ? 'Pre-configured by server admin' : ''} />
                <input
                  className="w-full rounded-lg px-3 py-2.5 text-sm text-slate-200 outline-none placeholder:text-slate-600 focus:ring-1 focus:ring-cyan-500/30 transition-all"
                  style={{ background: 'rgba(2,8,18,0.8)', border: '1px solid rgba(51,65,85,0.4)' }}
                  placeholder="Bearer token" type="password"
                  value={token} onChange={e => setToken(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleConnect()}
                  autoComplete="new-password" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <input
                  className="w-full rounded-lg px-3 py-2.5 text-sm text-slate-200 outline-none placeholder:text-slate-600 focus:ring-1 focus:ring-cyan-500/30 transition-all"
                  style={{ background: 'rgba(2,8,18,0.8)', border: '1px solid rgba(51,65,85,0.4)' }}
                  placeholder="Display Name (e.g. Abhay Thakur)"
                  value={nameInput} onChange={e => setNameInput(e.target.value)} />
                <input
                  className="w-full rounded-lg px-3 py-2.5 text-sm text-slate-200 outline-none placeholder:text-slate-600 focus:ring-1 focus:ring-cyan-500/30 transition-all"
                  style={{ background: 'rgba(2,8,18,0.8)', border: '1px solid rgba(51,65,85,0.4)' }}
                  placeholder="Environment (e.g. Production)"
                  value={environment} onChange={e => setEnvironment(e.target.value)} />
                <button onClick={handleConnect} disabled={connecting}
                  className="relative rounded-lg px-4 py-2.5 text-sm font-bold transition-all overflow-hidden group"
                  style={{
                    background: 'linear-gradient(135deg, rgba(6,182,212,0.2), rgba(59,130,246,0.2))',
                    border: '1px solid rgba(6,182,212,0.3)',
                    color: '#67e8f9',
                    opacity: connecting ? 0.6 : 1,
                  }}>
                  <span className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ background: 'linear-gradient(135deg, rgba(6,182,212,0.3), rgba(59,130,246,0.3))' }} />
                  <span className="relative">{connecting ? 'Connecting...' : 'Authenticate'}</span>
                </button>
              </div>
              {connError && (
                <p className="text-xs text-red-400 px-1 flex items-center gap-1.5">
                  <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {connError}
                </p>
              )}
              <p className="text-[10px] text-slate-700 px-1">
                Token is transmitted once to establish a secure session. Never stored in the browser.
              </p>
            </div>
          )}
        </div>
      </div>
    </motion.section>
  );
}


// ── System Stats Bar ──────────────────────────────────────────────────────────
function SystemStats() {
  const { connected } = useConnectionStore();
  const liveCount = AUTOMATIONS.filter(a => a.status === 'live').length;
  const totalCount = AUTOMATIONS.length;

  const [uptime, setUptime] = useState('00:00:00');
  const startRef = useRef(Date.now());

  useEffect(() => {
    if (!connected) return;
    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startRef.current) / 1000);
      const h = Math.floor(elapsed / 3600).toString().padStart(2, '0');
      const m = Math.floor((elapsed % 3600) / 60).toString().padStart(2, '0');
      const s = (elapsed % 60).toString().padStart(2, '0');
      setUptime(`${h}:${m}:${s}`);
    }, 1000);
    return () => clearInterval(interval);
  }, [connected]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.6 }}
      className="max-w-6xl mx-auto px-6 mb-8"
    >
      <div className="flex items-center gap-6 text-[10px] font-mono text-slate-600 overflow-x-auto">
        <span className="flex items-center gap-1.5 shrink-0">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500/60" />
          SYS: NOMINAL
        </span>
        <span className="shrink-0">MODULES: {liveCount}/{totalCount} ACTIVE</span>
        {connected && <span className="shrink-0">UPTIME: {uptime}</span>}
        <span className="shrink-0">API: REST v6.x</span>
        <span className="shrink-0">PROTO: HTTPS/TLS1.3</span>
        <span className="flex-1" />
        <span className="shrink-0 text-slate-700">BUILD: 2.4.0-stable</span>
      </div>
    </motion.div>
  );
}

// ── Landing Page ──────────────────────────────────────────────────────────────
export default function LandingPage() {
  const { connected, environment, username } = useConnectionStore();
  const liveCount = AUTOMATIONS.filter(a => a.status === 'live').length;

  return (
    <div className="min-h-screen relative scan-line" style={{ background: 'var(--bg-deep)' }}>
      {/* Background layers */}
      <HexGrid />
      <ParticleField />

      {/* Top bar */}
      <header className="fixed top-0 left-0 right-0 z-50"
        style={{ background: 'rgba(2,8,18,0.9)', backdropFilter: 'blur(20px)', borderBottom: '1px solid rgba(6,182,212,0.08)' }}>
        <DataPulse />
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center overflow-hidden relative"
              style={{ border: '1px solid rgba(6,182,212,0.2)' }}>
              <div className="absolute inset-0" style={{ background: 'linear-gradient(135deg, rgba(6,182,212,0.1), rgba(59,130,246,0.1))' }} />
              <img src="/logo.png" alt="SB" className="w-6 h-6 object-contain relative z-10" />
            </div>
            <div>
              <span className="text-sm font-bold neon-text">SB Automation</span>
              <span className="text-[9px] text-slate-600 ml-2 font-mono hidden sm:inline">COMMAND CENTER</span>
            </div>
          </div>
          <div className="flex items-center gap-4 text-xs">
            {connected ? (
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md"
                  style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.15)' }}>
                  <motion.span className="w-1.5 h-1.5 rounded-full bg-emerald-400"
                    animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 1.5, repeat: Infinity }} />
                  <span className="text-emerald-400 font-medium text-[11px]">{environment}</span>
                </div>
              </div>
            ) : (
              <span className="text-slate-600 font-mono text-[10px]">{liveCount} MODULES READY</span>
            )}
          </div>
        </div>
      </header>

      <main className="pt-14 relative z-10">

        {/* Hero — Command Center */}
        <section className="relative px-6 pt-16 pb-10 overflow-hidden">
          {/* Radial glows */}
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute top-10 right-[20%] w-[600px] h-[400px] rounded-full opacity-[0.04]"
              style={{ background: 'radial-gradient(ellipse, #06b6d4, transparent 60%)' }} />
            <div className="absolute bottom-0 left-[10%] w-[500px] h-[300px] rounded-full opacity-[0.03]"
              style={{ background: 'radial-gradient(ellipse, #8b5cf6, transparent 60%)' }} />
          </div>

          <div className="max-w-6xl mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
            >
              {/* Tagline */}
              <motion.div
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 }}
                className="flex items-center gap-2 mb-4"
              >
                <div className="h-[1px] w-8" style={{ background: 'linear-gradient(90deg, #06b6d4, transparent)' }} />
                <span className="text-[10px] font-bold tracking-[0.3em] uppercase text-cyan-500/70">
                  Enterprise Workload Automation
                </span>
              </motion.div>

              {/* Title */}
              {connected && username ? (
                <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-3">
                  <span className="text-sm text-slate-500">Welcome back,</span>
                  <h1 className="text-3xl md:text-4xl font-black tracking-tight leading-[1.1]">
                    <span className="neon-text">{username}</span>
                  </h1>
                </motion.div>
              ) : (
                <h1 className="text-4xl md:text-5xl font-black text-slate-100 tracking-tight leading-[1.1] mb-4">
                  <span className="neon-text">Stonebranch</span>
                  <br />
                  <span className="text-slate-300">Automation Platform</span>
                </h1>
              )}

              {/* Subtitle */}
              <p className="text-sm text-slate-500 max-w-lg leading-relaxed mb-8">
                Orchestrate job creation, agent lifecycle, monitoring, and deletion
                through a unified command interface. Powered by the UAC REST API.
              </p>

              {/* Capability indicators */}
              <div className="flex flex-wrap gap-2">
                {[
                  { label: 'Bulk Job Creation', active: true },
                  { label: 'Schedule Parsing', active: true },
                  { label: 'Agent Lifecycle', active: true },
                  { label: 'Real-time Alerts', active: true },
                  { label: 'Safe Deletion', active: true },
                  { label: 'Bulk Updates', active: false },
                ].map(cap => (
                  <motion.span
                    key={cap.label}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.3 + Math.random() * 0.3 }}
                    className="px-2.5 py-1 rounded-md text-[10px] font-medium"
                    style={{
                      background: cap.active ? 'rgba(6,182,212,0.05)' : 'rgba(30,41,59,0.3)',
                      border: cap.active ? '1px solid rgba(6,182,212,0.12)' : '1px solid rgba(51,65,85,0.15)',
                      color: cap.active ? '#94a3b8' : '#475569',
                    }}>
                    {cap.active && (
                      <span className="inline-block w-1 h-1 rounded-full bg-cyan-500/60 mr-1.5 relative top-[-1px]" />
                    )}
                    {cap.label}
                  </motion.span>
                ))}
              </div>
            </motion.div>
          </div>
        </section>

        {/* System Stats */}
        <SystemStats />

        {/* Connection Panel */}
        <ConnectionPanel />

        {/* Automations grid — blurred when not connected */}
        <section className={`max-w-6xl mx-auto px-6 pb-24 relative ${!connected ? 'pointer-events-none' : ''}`}>
          {/* Blur overlay when not authenticated */}
          {!connected && (
            <div className="absolute inset-0 z-20 flex items-start justify-center pt-20"
              style={{ backdropFilter: 'blur(8px)', background: 'rgba(2,8,18,0.4)' }}>
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                className="glass-card p-8 text-center max-w-sm">
                <div className="w-12 h-12 rounded-full mx-auto mb-4 flex items-center justify-center"
                  style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)' }}>
                  <svg className="w-6 h-6 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
                  </svg>
                </div>
                <h3 className="text-lg font-bold text-slate-200 mb-1">Authentication Required</h3>
                <p className="text-xs text-slate-500">Connect with a Stonebranch token above to access automation modules.</p>
              </motion.div>
            </div>
          )}

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4, delay: 0.35 }}
            className="flex items-center justify-between mb-6"
          >
            <div className="flex items-center gap-3">
              <div className="h-[1px] w-5" style={{ background: 'linear-gradient(90deg, #06b6d4, transparent)' }} />
              <h2 className="text-xs font-bold tracking-[0.2em] uppercase text-slate-500">
                Automation Modules
              </h2>
            </div>
            <span className="text-[10px] font-mono text-slate-700">
              {liveCount} OPERATIONAL
            </span>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {AUTOMATIONS.map((auto, i) => (
              <AutomationCard key={auto.id} auto={auto} index={i} />
            ))}
          </div>
        </section>

        {/* Footer */}
        <footer className="border-t py-8" style={{ borderColor: 'rgba(6,182,212,0.05)', background: 'rgba(2,8,18,0.5)' }}>
          <div className="max-w-6xl mx-auto px-6 flex items-center justify-between">
            <p className="text-[10px] text-slate-700 font-mono">
              DESIGNED AND ENGINEERED BY <span className="text-slate-500">ABHAY THAKUR</span>
            </p>
            <p className="text-[10px] text-slate-800 font-mono">v2.4.0</p>
          </div>
        </footer>

      </main>
    </div>
  );
}
