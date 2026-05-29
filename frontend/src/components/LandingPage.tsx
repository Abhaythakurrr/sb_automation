'use client';
import { useState } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { AUTOMATIONS, Automation } from '@/automations/registry';
import { useConnectionStore, globalApi } from '@/store/useConnectionStore';

// ── Icons ─────────────────────────────────────────────────────────────────────
function IconJob() {
  return (
    <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
    </svg>
  );
}
function IconAgent() {
  return (
    <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18" />
    </svg>
  );
}
function IconMonitor() {
  return (
    <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  );
}

function IconDelete() {
  return (
    <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  );
}
function IconUpdate() {
  return (
    <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
    'live':        { label: 'Live',         cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25' },
    'beta':        { label: 'Beta',         cls: 'bg-amber-500/15 text-amber-400 border-amber-500/25' },
    'coming-soon': { label: 'Coming Soon',  cls: 'bg-slate-700/50 text-slate-500 border-slate-600/30' },
    'maintenance': { label: 'In Development', cls: 'bg-blue-500/15 text-blue-400 border-blue-500/25' },
    'wip':         { label: 'Work in Progress', cls: 'bg-orange-500/15 text-orange-400 border-orange-500/25' },
  }[status];
  return (
    <span className={`px-2 py-0.5 rounded text-[10px] font-semibold tracking-wider uppercase border ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}

// ── Automation Card ───────────────────────────────────────────────────────────
function AutomationCard({ auto, index }: { auto: Automation; index: number }) {
  const isLive = auto.status === 'live' || auto.status === 'beta';
  const isWip  = auto.status === 'wip' || auto.status === 'maintenance';

  // WIP/maintenance cards show a banner but are not clickable
  const cardContent = (
    <motion.div
      initial={{ opacity: 0, y: 32 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: index * 0.1 }}
      whileHover={isLive ? { y: -4, scale: 1.01 } : {}}
      className={`relative group rounded-2xl border p-6 transition-all duration-300 ${
        isLive
          ? 'border-slate-700/60 bg-slate-900/50 hover:border-cyan-500/40 cursor-pointer'
          : isWip
          ? 'border-slate-700/40 bg-slate-900/30 cursor-default'
          : 'border-slate-800/40 bg-slate-900/20 cursor-not-allowed opacity-50'
      }`}
    >
      {/* Glow on hover — live only */}
      {isLive && (
        <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
          style={{ boxShadow: '0 0 30px rgba(6,182,212,0.08), inset 0 0 30px rgba(6,182,212,0.03)' }} />
      )}

      {/* WIP / Maintenance banner */}
      {isWip && (
        <div className="absolute top-0 left-0 right-0 rounded-t-2xl px-4 py-1.5 flex items-center gap-2"
          style={{
            background: auto.status === 'wip'
              ? 'linear-gradient(90deg, rgba(249,115,22,0.12), rgba(249,115,22,0.06))'
              : 'linear-gradient(90deg, rgba(59,130,246,0.12), rgba(59,130,246,0.06))',
            borderBottom: auto.status === 'wip'
              ? '1px solid rgba(249,115,22,0.2)'
              : '1px solid rgba(59,130,246,0.2)',
          }}>
          <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"
            style={{ color: auto.status === 'wip' ? '#fb923c' : '#60a5fa' }}>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-[10px] font-medium"
            style={{ color: auto.status === 'wip' ? '#fb923c' : '#60a5fa' }}>
            {auto.status === 'wip' ? 'Work in progress — not yet available' : 'In development — coming soon'}
          </span>
        </div>
      )}

      {/* Header */}
      <div className={`flex items-start justify-between mb-4 ${isWip ? 'mt-6' : ''}`}>
        <div className="w-12 h-12 rounded-xl flex items-center justify-center"
          style={{
            background: isLive
              ? 'linear-gradient(135deg,rgba(6,182,212,0.15),rgba(59,130,246,0.15))'
              : isWip
              ? auto.status === 'wip'
                ? 'rgba(249,115,22,0.08)'
                : 'rgba(59,130,246,0.08)'
              : 'rgba(30,41,59,0.5)',
            border: isLive
              ? '1px solid rgba(6,182,212,0.2)'
              : isWip
              ? auto.status === 'wip'
                ? '1px solid rgba(249,115,22,0.2)'
                : '1px solid rgba(59,130,246,0.2)'
              : '1px solid rgba(51,65,85,0.3)',
          }}>
          <span style={{ color: isLive ? '#67e8f9' : isWip ? (auto.status === 'wip' ? '#fb923c' : '#60a5fa') : '#475569' }}>
            <AutomationIcon icon={auto.icon} />
          </span>
        </div>
        <StatusBadge status={auto.status} />
      </div>

      {/* Category */}
      <p className="text-[10px] font-semibold tracking-widest uppercase text-slate-600 mb-1">{auto.category}</p>

      {/* Title */}
      <h3 className={`text-lg font-bold mb-2 ${
        isLive ? 'text-slate-100' : isWip ? 'text-slate-400' : 'text-slate-500'
      }`}>{auto.title}</h3>

      {/* Description */}
      <p className="text-sm text-slate-500 leading-relaxed mb-5">{auto.description}</p>

      {/* Features */}
      <ul className="space-y-1.5 mb-6">
        {auto.features.map(f => (
          <li key={f} className="flex items-center gap-2 text-xs text-slate-500">
            <span className={`w-1 h-1 rounded-full shrink-0 ${
              isLive ? 'bg-cyan-500' : isWip ? (auto.status === 'wip' ? 'bg-orange-500/50' : 'bg-blue-500/50') : 'bg-slate-700'
            }`} />
            {f}
          </li>
        ))}
      </ul>

      {/* CTA */}
      {isLive ? (
        <div className="flex items-center gap-2 text-sm font-medium text-cyan-400 group-hover:text-cyan-300 transition-colors">
          <span>Open Automation</span>
          <svg className="w-4 h-4 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
          </svg>
        </div>
      ) : isWip ? (
        <div className="flex items-center gap-1.5 text-xs font-medium"
          style={{ color: auto.status === 'wip' ? '#fb923c' : '#60a5fa' }}>
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          {auto.status === 'wip' ? 'Under development' : 'In progress'}
        </div>
      ) : (
        <p className="text-xs text-slate-700 font-medium">Not yet available</p>
      )}
    </motion.div>
  );

  if (isLive) return <Link href={auto.route}>{cardContent}</Link>;
  return cardContent;
}

// ── Connection Panel ──────────────────────────────────────────────────────────
function ConnectionPanel() {
  const {
    connected, connecting, connError, environment,
    setConnected, setConnecting, setConnError,
    setEnvironment, setSessionId, setBaseUrlHint, disconnect,
  } = useConnectionStore();

  const [baseUrl, setBaseUrl] = useState('');
  const [token, setToken]     = useState('');

  const handleConnect = async () => {
    if (!baseUrl.trim() || !token.trim()) {
      setConnError('Base URL and token are required');
      return;
    }
    setConnecting(true);
    setConnError('');
    try {
      // Token sent ONCE — backend validates and returns a session ID
      // After this, token is cleared from state and never sent again
      const { sessionId } = await globalApi.connect(token.trim(), baseUrl.trim());
      setSessionId(sessionId);
      globalApi.setSessionId(sessionId);
      // Store only the hostname for display — never the full URL or token
      try {
        const hostname = new URL(baseUrl.trim()).hostname;
        setBaseUrlHint(hostname);
      } catch { setBaseUrlHint(baseUrl.trim()); }
      setConnected(true);
      // Clear token from local state immediately — it's now server-side only
      setToken('');
    } catch (e: any) {
      setConnError(e.response?.data?.error || e.message || 'Connection failed');
    } finally {
      setConnecting(false);
    }
  };

  const inputStyle = {
    background: 'rgba(15,23,42,0.8)',
    border: '1px solid rgba(51,65,85,0.6)',
    colorScheme: 'dark',
  } as React.CSSProperties;

  const inputCls = 'w-full rounded-lg px-3 py-2.5 text-sm text-slate-200 outline-none placeholder:text-slate-600 focus:ring-1 focus:ring-cyan-500/40 transition-all';

  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.35 }}
      className="max-w-3xl mx-auto px-6 mb-16"
    >
      <div className="rounded-2xl border p-6"
        style={{
          background: 'rgba(15,23,42,0.6)',
          borderColor: connected ? 'rgba(34,197,94,0.3)' : 'rgba(51,65,85,0.5)',
          boxShadow: connected ? '0 0 30px rgba(34,197,94,0.06)' : 'none',
        }}>

        {/* Panel header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-sm font-semibold text-slate-200">Stonebranch Connection</h2>
            <p className="text-xs text-slate-600 mt-0.5">Connect once — works across all automations</p>
          </div>
          {connected && (
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
              className="flex items-center gap-2 px-3 py-1.5 rounded-full"
              style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)' }}>
              <motion.span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block"
                animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 1.5, repeat: Infinity }} />
              <span className="text-xs font-medium text-emerald-400">{environment}</span>
            </motion.div>
          )}
        </div>

        {connected ? (
          /* Connected state */
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
              <div className="rounded-lg px-3 py-2.5" style={{ background: 'rgba(2,8,18,0.6)', border: '1px solid rgba(51,65,85,0.3)' }}>
                <p className="text-slate-600 uppercase tracking-wider text-[10px] mb-1">Connected To</p>
                <p className="text-slate-300 truncate font-mono">{useConnectionStore.getState().baseUrlHint || 'Stonebranch UAC'}</p>
              </div>
              <div className="rounded-lg px-3 py-2.5" style={{ background: 'rgba(2,8,18,0.6)', border: '1px solid rgba(51,65,85,0.3)' }}>
                <p className="text-slate-600 uppercase tracking-wider text-[10px] mb-1">Session</p>
                <p className="text-emerald-400 font-mono text-xs">Active — secure</p>
              </div>
              <div className="rounded-lg px-3 py-2.5" style={{ background: 'rgba(2,8,18,0.6)', border: '1px solid rgba(51,65,85,0.3)' }}>
                <p className="text-slate-600 uppercase tracking-wider text-[10px] mb-1">Environment</p>
                <input
                  className="bg-transparent text-slate-300 outline-none w-full text-sm"
                  value={environment}
                  onChange={e => setEnvironment(e.target.value)}
                  placeholder="Production"
                />
              </div>
            </div>
            <button onClick={disconnect}
              className="w-full rounded-lg py-2.5 text-sm font-medium transition-all"
              style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', color: '#f87171' }}>
              Disconnect
            </button>
          </div>
        ) : (
          /* Disconnected state */
          <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <input className={inputCls} style={inputStyle}
                placeholder="https://your-instance.stonebranch.cloud"
                value={baseUrl} onChange={e => setBaseUrl(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleConnect()}
                autoComplete="off" />
              <input className={inputCls} style={inputStyle}
                placeholder="Bearer token" type="password"
                value={token} onChange={e => setToken(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleConnect()}
                autoComplete="new-password" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <input className={`${inputCls} md:col-span-2`} style={inputStyle}
                placeholder="Environment label (e.g. Production)"
                value={environment} onChange={e => setEnvironment(e.target.value)} />
              <button onClick={handleConnect} disabled={connecting}
                className="rounded-lg px-4 py-2.5 text-sm font-semibold transition-all"
                style={{
                  background: 'linear-gradient(135deg,rgba(6,182,212,0.25),rgba(59,130,246,0.25))',
                  border: '1px solid rgba(6,182,212,0.4)',
                  color: '#67e8f9',
                  opacity: connecting ? 0.6 : 1,
                  boxShadow: '0 0 20px rgba(6,182,212,0.1)',
                }}>
                {connecting ? 'Connecting...' : 'Connect'}
              </button>
            </div>
            {connError && (
              <p className="text-xs text-red-400 px-1">{connError}</p>
            )}
            <p className="text-[10px] text-slate-700 px-1">
              Your token is sent once to establish a secure session and is never stored in the browser.
            </p>
          </div>
        )}
      </div>
    </motion.section>
  );
}

// ── Landing Page ──────────────────────────────────────────────────────────────
export default function LandingPage() {
  const { connected, environment } = useConnectionStore();
  const liveCount = AUTOMATIONS.filter(a => a.status === 'live').length;

  return (
    <div className="min-h-screen grid-bg scan-line" style={{ background: 'var(--bg-deep)' }}>

      {/* Top bar */}
      <header className="fixed top-0 left-0 right-0 z-50 border-b"
        style={{ borderColor: 'rgba(6,182,212,0.1)', background: 'rgba(2,8,18,0.85)', backdropFilter: 'blur(16px)' }}>
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center overflow-hidden"
              style={{ boxShadow: '0 0 12px rgba(6,182,212,0.4)' }}>
              <img src="/logo.png" alt="SB" className="w-full h-full object-contain" />
            </div>
            <span className="text-sm font-semibold neon-text">Stonebranch Automation</span>
          </div>
          <div className="flex items-center gap-3 text-xs">
            {connected ? (
              <div className="flex items-center gap-1.5 text-emerald-400">
                <motion.span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block"
                  animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 1.5, repeat: Infinity }} />
                {environment}
              </div>
            ) : (
              <span className="text-slate-600">{liveCount} automation{liveCount !== 1 ? 's' : ''} live</span>
            )}
          </div>
        </div>
      </header>

      <main className="pt-14">

        {/* Hero */}
        <section className="relative flex flex-col items-center justify-center text-center px-6 py-24 overflow-hidden">
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] rounded-full opacity-10"
              style={{ background: 'radial-gradient(ellipse, #06b6d4, transparent 70%)' }} />
          </div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
            <p className="text-xs font-semibold tracking-[0.3em] uppercase text-cyan-500/70 mb-4">
              Enterprise Automation Platform
            </p>
            <div className="flex items-center justify-center mb-6">
              <img src="/logo.png" alt="Stonebranch" className="w-20 h-20 object-contain opacity-90"
                style={{ filter: 'drop-shadow(0 0 20px rgba(6,182,212,0.4))' }} />
            </div>
            <h1 className="text-5xl sm:text-6xl font-bold tracking-tight mb-5">
              <span className="neon-text">Welcome to</span>
              <br />
              <span className="text-slate-100">Stonebranch Automation</span>
            </h1>
            <p className="text-lg text-slate-500 max-w-xl mx-auto leading-relaxed">
              A unified control center for automating Stonebranch UAC operations.
              Connect below, then select an automation to get started.
            </p>
          </motion.div>

          {/* Stats */}
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="flex items-center gap-8 mt-10">
            {[
              { label: 'Automations', value: AUTOMATIONS.length },
              { label: 'Live Now',    value: liveCount },
              { label: 'API Version', value: '7.8' },
            ].map(({ label, value }) => (
              <div key={label} className="text-center">
                <div className="text-2xl font-bold text-slate-200">{value}</div>
                <div className="text-xs text-slate-600 mt-0.5">{label}</div>
              </div>
            ))}
          </motion.div>
        </section>

        {/* Connection Panel */}
        <ConnectionPanel />

        {/* Automations grid */}
        <section className="max-w-7xl mx-auto px-6 pb-24">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            transition={{ duration: 0.4, delay: 0.3 }} className="mb-8">
            <h2 className="text-xs font-semibold tracking-[0.25em] uppercase text-slate-600">
              Available Automations
            </h2>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {AUTOMATIONS.map((auto, i) => (
              <AutomationCard key={auto.id} auto={auto} index={i} />
            ))}
          </div>
        </section>

        <footer className="border-t py-6 text-center" style={{ borderColor: 'rgba(6,182,212,0.06)' }}>
          <p className="text-xs text-slate-700">
            Designed &amp; built by{' '}
            <span className="text-slate-500 font-medium">Abhay Thakur</span>
          </p>
        </footer>

      </main>
    </div>
  );
}
