'use client';
import { useState } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { AUTOMATIONS, Automation } from '@/automations/registry';

// ── Icons ─────────────────────────────────────────────────────────────────────
function IconJob() {
  return (
    <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
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
  if (icon === 'monitor') return <IconMonitor />;
  if (icon === 'update')  return <IconUpdate />;
  return <IconJob />;
}

// ── Status badge ──────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: Automation['status'] }) {
  const cfg = {
    'live':         { label: 'Live',         cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25' },
    'beta':         { label: 'Beta',         cls: 'bg-amber-500/15 text-amber-400 border-amber-500/25' },
    'coming-soon':  { label: 'Coming Soon',  cls: 'bg-slate-700/50 text-slate-500 border-slate-600/30' },
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

  const card = (
    <motion.div
      initial={{ opacity: 0, y: 32 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: index * 0.1 }}
      whileHover={isLive ? { y: -4, scale: 1.01 } : {}}
      className={`relative group rounded-2xl border p-6 transition-all duration-300 ${
        isLive
          ? 'border-slate-700/60 bg-slate-900/50 hover:border-cyan-500/40 cursor-pointer'
          : 'border-slate-800/40 bg-slate-900/20 cursor-not-allowed opacity-50'
      }`}
      style={isLive ? { boxShadow: '0 0 0 0 rgba(6,182,212,0)' } : {}}
    >
      {/* Glow on hover */}
      {isLive && (
        <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
          style={{ boxShadow: '0 0 30px rgba(6,182,212,0.08), inset 0 0 30px rgba(6,182,212,0.03)' }} />
      )}

      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="w-12 h-12 rounded-xl flex items-center justify-center"
          style={{ background: isLive ? 'linear-gradient(135deg,rgba(6,182,212,0.15),rgba(59,130,246,0.15))' : 'rgba(30,41,59,0.5)',
                   border: isLive ? '1px solid rgba(6,182,212,0.2)' : '1px solid rgba(51,65,85,0.3)' }}>
          <span className={isLive ? 'text-cyan-400' : 'text-slate-600'}>
            <AutomationIcon icon={auto.icon} />
          </span>
        </div>
        <StatusBadge status={auto.status} />
      </div>

      {/* Category */}
      <p className="text-[10px] font-semibold tracking-widest uppercase text-slate-600 mb-1">{auto.category}</p>

      {/* Title */}
      <h3 className={`text-lg font-bold mb-2 ${isLive ? 'text-slate-100' : 'text-slate-500'}`}>{auto.title}</h3>

      {/* Description */}
      <p className="text-sm text-slate-500 leading-relaxed mb-5">{auto.description}</p>

      {/* Features */}
      <ul className="space-y-1.5 mb-6">
        {auto.features.map(f => (
          <li key={f} className="flex items-center gap-2 text-xs text-slate-500">
            <span className={`w-1 h-1 rounded-full shrink-0 ${isLive ? 'bg-cyan-500' : 'bg-slate-700'}`} />
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
      ) : (
        <p className="text-xs text-slate-700 font-medium">Not yet available</p>
      )}
    </motion.div>
  );

  if (isLive) {
    return <Link href={auto.route}>{card}</Link>;
  }
  return card;
}

// ── Landing Page ──────────────────────────────────────────────────────────────
export default function LandingPage() {
  const liveCount = AUTOMATIONS.filter(a => a.status === 'live').length;

  return (
    <div className="min-h-screen grid-bg scan-line" style={{ background: 'var(--bg-deep)' }}>

      {/* Top bar */}
      <header className="fixed top-0 left-0 right-0 z-50 border-b"
        style={{ borderColor: 'rgba(6,182,212,0.1)', background: 'rgba(2,8,18,0.85)', backdropFilter: 'blur(16px)' }}>
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-bold"
              style={{ background: 'linear-gradient(135deg,#06b6d4,#3b82f6)', boxShadow: '0 0 12px rgba(6,182,212,0.4)' }}>
              SB
            </div>
            <span className="text-sm font-semibold neon-text">Stonebranch Automation</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-600">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse inline-block" />
            {liveCount} automation{liveCount !== 1 ? 's' : ''} live
          </div>
        </div>
      </header>

      <main className="pt-14">

        {/* Hero */}
        <section className="relative flex flex-col items-center justify-center text-center px-6 py-28 overflow-hidden">
          {/* Background glow */}
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] rounded-full opacity-10"
              style={{ background: 'radial-gradient(ellipse, #06b6d4, transparent 70%)' }} />
          </div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
            <p className="text-xs font-semibold tracking-[0.3em] uppercase text-cyan-500/70 mb-4">
              Enterprise Automation Platform
            </p>
            <h1 className="text-5xl sm:text-6xl font-bold tracking-tight mb-5">
              <span className="neon-text">Welcome to</span>
              <br />
              <span className="text-slate-100">Stonebranch Automation</span>
            </h1>
            <p className="text-lg text-slate-500 max-w-xl mx-auto leading-relaxed">
              A unified control center for automating Stonebranch UAC operations.
              Select an automation below to get started.
            </p>
          </motion.div>

          {/* Stats */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="flex items-center gap-8 mt-10"
          >
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

        {/* Automations grid */}
        <section className="max-w-7xl mx-auto px-6 pb-24">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4, delay: 0.3 }}
            className="mb-8"
          >
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

        {/* Watermark footer */}
        <footer className="border-t py-6 text-center"
          style={{ borderColor: 'rgba(6,182,212,0.06)' }}>
          <p className="text-xs text-slate-700">
            Designed &amp; built by{' '}
            <span className="text-slate-500 font-medium">Abhay Thakur</span>
          </p>
        </footer>

      </main>
    </div>
  );
}
