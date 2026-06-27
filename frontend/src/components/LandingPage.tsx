'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence, useMotionValue, useTransform, useSpring } from 'framer-motion';
import { AUTOMATIONS, Automation } from '@/automations/registry';
import { useConnectionStore, globalApi } from '@/store/useConnectionStore';
import { useWorkspaceStore, AutomationId } from '@/store/useWorkspaceStore';
import { playClick, playHover, playConnect, playDisconnect, playWhoosh } from '@/utils/soundEffects';

// ── 3D Tilt Hook ──────────────────────────────────────────────────────────────
function use3DTilt(intensity = 8) {
  const ref = useRef<HTMLDivElement>(null);
  const rotateX = useMotionValue(0);
  const rotateY = useMotionValue(0);
  const springX = useSpring(rotateX, { stiffness: 300, damping: 30 });
  const springY = useSpring(rotateY, { stiffness: 300, damping: 30 });

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    rotateX.set(-y * intensity);
    rotateY.set(x * intensity);
  }, [intensity, rotateX, rotateY]);

  const handleMouseLeave = useCallback(() => {
    rotateX.set(0);
    rotateY.set(0);
  }, [rotateX, rotateY]);

  return { ref, springX, springY, handleMouseMove, handleMouseLeave };
}

// ── Premium Particle System ───────────────────────────────────────────────────
function PremiumParticles() {
  const particles = useRef(
    Array.from({ length: 40 }, (_, i) => ({
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: 1 + Math.random() * 2,
      color: i % 4 === 0 ? '#f59e0b' : i % 4 === 1 ? '#8b5cf6' : i % 4 === 2 ? '#06b6d4' : '#94a3b8',
      duration: 5 + Math.random() * 8,
      delay: Math.random() * 5,
    }))
  ).current;

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {particles.map((p, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full"
          style={{
            width: p.size,
            height: p.size,
            background: p.color,
            left: `${p.x}%`,
            top: `${p.y}%`,
            opacity: 0.12,
          }}
          animate={{
            y: [0, -40 - Math.random() * 60, 0],
            x: [0, (Math.random() - 0.5) * 50, 0],
            opacity: [0.05, 0.25, 0.05],
            scale: [1, 1.5, 1],
          }}
          transition={{
            duration: p.duration,
            repeat: Infinity,
            delay: p.delay,
            ease: 'easeInOut',
          }}
        />
      ))}
    </div>
  );
}

// ── 3D Floating Orbs ──────────────────────────────────────────────────────────
function FloatingOrbs() {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {/* Gold orb */}
      <motion.div
        className="absolute w-[500px] h-[500px] rounded-full"
        style={{
          background: 'radial-gradient(circle, rgba(245,158,11,0.06) 0%, transparent 70%)',
          right: '-10%',
          top: '5%',
        }}
        animate={{
          y: [0, -30, 0],
          x: [0, 15, 0],
          scale: [1, 1.1, 1],
        }}
        transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut' }}
      />
      {/* Purple orb */}
      <motion.div
        className="absolute w-[400px] h-[400px] rounded-full"
        style={{
          background: 'radial-gradient(circle, rgba(139,92,246,0.05) 0%, transparent 70%)',
          left: '-5%',
          bottom: '10%',
        }}
        animate={{
          y: [0, 20, 0],
          x: [0, -10, 0],
          scale: [1, 1.05, 1],
        }}
        transition={{ duration: 15, repeat: Infinity, ease: 'easeInOut', delay: 3 }}
      />
      {/* Cyan orb */}
      <motion.div
        className="absolute w-[300px] h-[300px] rounded-full"
        style={{
          background: 'radial-gradient(circle, rgba(6,182,212,0.04) 0%, transparent 70%)',
          left: '30%',
          top: '20%',
        }}
        animate={{
          y: [0, -20, 0],
          scale: [1, 1.15, 1],
        }}
        transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut', delay: 5 }}
      />
    </div>
  );
}

// ── Animated Grid Mesh ────────────────────────────────────────────────────────
function GridMesh() {
  return (
    <div className="absolute inset-0 pointer-events-none opacity-[0.025]">
      <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="premium-grid" width="80" height="80" patternUnits="userSpaceOnUse">
            <path d="M 80 0 L 0 0 0 80" fill="none" stroke="url(#gridGradient)" strokeWidth="0.5"/>
          </pattern>
          <linearGradient id="gridGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#f59e0b" />
            <stop offset="50%" stopColor="#8b5cf6" />
            <stop offset="100%" stopColor="#06b6d4" />
          </linearGradient>
        </defs>
        <rect width="100%" height="100%" fill="url(#premium-grid)" />
      </svg>
    </div>
  );
}

// ── Data Pulse — Gold ─────────────────────────────────────────────────────────
function DataPulse() {
  return (
    <div className="absolute top-0 left-0 right-0 h-[1px] overflow-hidden pointer-events-none">
      <motion.div
        className="h-full w-40"
        style={{ background: 'linear-gradient(90deg, transparent, #f59e0b, #8b5cf6, transparent)' }}
        animate={{ x: ['-160px', 'calc(100vw + 160px)'] }}
        transition={{ duration: 4, repeat: Infinity, ease: 'linear', repeatDelay: 3 }}
      />
    </div>
  );
}

// ── Icons (unchanged logic, just updated colors) ──────────────────────────────
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
function IconAnalytics() {
  return (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M16 8v8m-4-5v5m-4-2v2m-2 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  );
}

function AutomationIcon({ icon }: { icon: string }) {
  if (icon === 'job')       return <IconJob />;
  if (icon === 'agent')     return <IconAgent />;
  if (icon === 'monitor')   return <IconMonitor />;
  if (icon === 'delete')    return <IconDelete />;
  if (icon === 'update')    return <IconUpdate />;
  if (icon === 'analytics') return <IconAnalytics />;
  return <IconJob />;
}

// ── Premium Status Badge ──────────────────────────────────────────────────────
function StatusBadge({ status }: { status: Automation['status'] }) {
  const cfg = {
    'live':        { label: 'Operational', cls: 'badge-gold', dot: 'bg-amber-400' },
    'beta':        { label: 'Beta',        cls: 'badge-purple', dot: 'bg-purple-400' },
    'coming-soon': { label: 'Offline',     cls: 'badge-silver', dot: 'bg-slate-600' },
    'maintenance': { label: 'In Dev',      cls: 'badge-silver', dot: 'bg-blue-400' },
    'wip':         { label: 'Building',    cls: 'badge-silver', dot: 'bg-orange-400' },
  }[status];
  return (
    <span className={`inline-flex items-center gap-1.5 ${cfg.cls}`}>
      <motion.span
        className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`}
        animate={status === 'live' ? { opacity: [1, 0.3, 1], scale: [1, 0.8, 1] } : {}}
        transition={{ duration: 2, repeat: Infinity }}
      />
      {cfg.label}
    </span>
  );
}

// ── 3D Automation Card ────────────────────────────────────────────────────────
function AutomationCard({ auto, index }: { auto: Automation; index: number }) {
  const isLive = auto.status === 'live' || auto.status === 'beta';
  const isWip  = auto.status === 'wip' || auto.status === 'maintenance';
  const { openTab } = useWorkspaceStore();
  const tilt = use3DTilt(6);

  // Determine tier color
  const tierColor = auto.status === 'live' ? 'gold' : auto.status === 'beta' ? 'purple' : 'silver';

  const handleClick = () => {
    if (!isLive) return;
    playClick();
    const routeMap: Record<string, AutomationId> = {
      '/job-creation':  'job-creation',
      '/agent-control': 'agent-control',
      '/monitoring':    'monitoring',
      '/job-deletion':  'job-deletion',
      '/search':        'search',
    };
    const id = routeMap[auto.route];
    if (id) openTab(id, auto.title);
  };

  const cardContent = (
    <motion.div
      ref={tilt.ref}
      onMouseMove={tilt.handleMouseMove}
      onMouseLeave={tilt.handleMouseLeave}
      onMouseEnter={() => isLive && playHover()}
      initial={{ opacity: 0, y: 50, rotateX: -10 }}
      animate={{ opacity: 1, y: 0, rotateX: 0 }}
      transition={{ duration: 0.7, delay: 0.3 + index * 0.1, ease: [0.16, 1, 0.3, 1] }}
      style={{
        rotateX: tilt.springX,
        rotateY: tilt.springY,
        transformStyle: 'preserve-3d',
        perspective: '1200px',
      }}
      className={`relative group rounded-2xl overflow-hidden transition-all duration-500 ${
        isLive
          ? 'cursor-pointer'
          : isWip
          ? 'cursor-default'
          : 'cursor-not-allowed opacity-40'
      } ${isLive ? `card-3d-${tierColor}` : ''}`}
      whileHover={isLive ? { scale: 1.02 } : {}}
    >
      {/* Background */}
      <div className="absolute inset-0" style={{
        background: isLive
          ? tierColor === 'gold'
            ? 'linear-gradient(145deg, rgba(13,17,23,0.95), rgba(6,15,30,0.98))'
            : 'linear-gradient(145deg, rgba(6,15,30,0.9), rgba(2,8,18,0.95))'
          : 'rgba(6,15,30,0.5)',
      }} />

      {/* Top accent line — premium gradient */}
      {isLive && (
        <div className="absolute top-0 left-0 right-0 h-[1px]"
          style={{
            background: tierColor === 'gold'
              ? 'linear-gradient(90deg, transparent, rgba(245,158,11,0.5), rgba(251,191,36,0.4), transparent)'
              : 'linear-gradient(90deg, transparent, rgba(139,92,246,0.4), rgba(167,139,250,0.3), transparent)',
          }} />
      )}

      {/* Hover glow — 3D depth effect */}
      {isLive && (
        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
          style={{
            background: tierColor === 'gold'
              ? 'radial-gradient(ellipse at 50% 0%, rgba(245,158,11,0.08), transparent 70%)'
              : 'radial-gradient(ellipse at 50% 0%, rgba(139,92,246,0.08), transparent 70%)',
          }} />
      )}

      <div className="p-5 relative z-10" style={{ transform: 'translateZ(0)' }}>
        {/* Header row */}
        <div className="flex items-start justify-between mb-4">
          <div className="w-11 h-11 rounded-xl flex items-center justify-center"
            style={{
              background: isLive
                ? tierColor === 'gold'
                  ? 'linear-gradient(135deg, rgba(245,158,11,0.12), rgba(251,191,36,0.08))'
                  : 'linear-gradient(135deg, rgba(139,92,246,0.12), rgba(167,139,250,0.08))'
                : 'rgba(30,41,59,0.3)',
              border: isLive
                ? tierColor === 'gold'
                  ? '1px solid rgba(245,158,11,0.25)'
                  : '1px solid rgba(139,92,246,0.25)'
                : '1px solid rgba(51,65,85,0.2)',
              transform: 'translateZ(20px)',
            }}>
            <span style={{ color: isLive ? (tierColor === 'gold' ? '#fbbf24' : '#c4b5fd') : '#475569' }}>
              <AutomationIcon icon={auto.icon} />
            </span>
          </div>
          <StatusBadge status={auto.status} />
        </div>

        {/* Category */}
        <p className="text-[9px] font-bold tracking-[0.2em] uppercase mb-1.5"
          style={{ color: isLive ? (tierColor === 'gold' ? 'rgba(245,158,11,0.6)' : 'rgba(139,92,246,0.6)') : 'rgba(100,116,139,0.5)' }}>
          {auto.category}
        </p>

        {/* Title */}
        <h3 className={`text-base font-bold mb-2 ${
          isLive ? 'text-slate-100 group-hover:text-white' : 'text-slate-500'
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
                background: isLive ? (tierColor === 'gold' ? 'rgba(245,158,11,0.06)' : 'rgba(139,92,246,0.06)') : 'rgba(30,41,59,0.3)',
                border: isLive ? (tierColor === 'gold' ? '1px solid rgba(245,158,11,0.1)' : '1px solid rgba(139,92,246,0.1)') : '1px solid rgba(51,65,85,0.2)',
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
          <div className="flex items-center gap-2 text-xs font-semibold transition-colors"
            style={{ color: tierColor === 'gold' ? '#fbbf24' : '#c4b5fd' }}>
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


// ── Connection Panel — Premium Gold Theme ─────────────────────────────────────
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
      playConnect();
    } catch (e: any) {
      setConnError(e.response?.data?.error || e.message || 'Connection failed');
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = () => {
    playDisconnect();
    disconnect();
  };

  return (
    <motion.section
      initial={{ opacity: 0, y: 30, rotateX: -5 }}
      animate={{ opacity: 1, y: 0, rotateX: 0 }}
      transition={{ duration: 0.7, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
      className="max-w-6xl mx-auto px-6 mb-16"
      style={{ perspective: '1200px' }}
    >
      <div className={`relative rounded-2xl overflow-hidden ${connected ? 'glass-card-gold' : 'glass-card'}`}
        style={{
          border: connected ? '1px solid rgba(245,158,11,0.2)' : '1px solid rgba(51,65,85,0.15)',
        }}>

        <div className="p-6">
          {/* Panel header */}
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <motion.div className="w-9 h-9 rounded-xl flex items-center justify-center"
                style={{
                  background: connected ? 'rgba(245,158,11,0.1)' : 'rgba(6,182,212,0.1)',
                  border: connected ? '1px solid rgba(245,158,11,0.25)' : '1px solid rgba(6,182,212,0.15)',
                }}
                animate={connected ? { boxShadow: ['0 0 0 0 rgba(245,158,11,0)', '0 0 0 8px rgba(245,158,11,0)', '0 0 0 0 rgba(245,158,11,0)'] } : {}}
                transition={{ duration: 2, repeat: Infinity }}
              >
                <svg className="w-4.5 h-4.5" fill="none" stroke={connected ? '#fbbf24' : '#67e8f9'} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.858 15.355-5.858 21.213 0" />
                </svg>
              </motion.div>
              <div>
                <h2 className="text-sm font-semibold text-slate-200">UAC Connection</h2>
                <p className="text-[10px] text-slate-600 mt-0.5">Secure session — token stored server-side only</p>
              </div>
            </div>
            {connected && (
              <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg"
                style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}>
                <motion.span className="w-2 h-2 rounded-full bg-amber-400"
                  animate={{ opacity: [1, 0.3, 1], scale: [1, 0.8, 1] }}
                  transition={{ duration: 2, repeat: Infinity }} />
                <span className="text-xs font-medium text-amber-400">{environment}</span>
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
                  <div key={item.label} className="rounded-xl px-3 py-2.5 flex items-center gap-2.5"
                    style={{ background: 'rgba(2,8,18,0.6)', border: '1px solid rgba(245,158,11,0.08)' }}>
                    <svg className="w-3.5 h-3.5 text-amber-600/50 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={item.icon} />
                    </svg>
                    <div className="min-w-0 flex-1">
                      <p className="text-[9px] text-slate-600 uppercase tracking-wider font-semibold">{item.label}</p>
                      {(item as any).editable ? (
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
              <button onClick={handleDisconnect}
                className="w-full btn-danger rounded-xl py-2.5 text-xs">
                Disconnect Session
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <input
                  className="w-full rounded-xl px-3 py-2.5 text-sm text-slate-200 outline-none placeholder:text-slate-600 focus:ring-1 focus:ring-amber-500/30 transition-all"
                  style={{ background: 'rgba(2,8,18,0.8)', border: '1px solid rgba(51,65,85,0.4)' }}
                  placeholder="https://instance.stonebranch.cloud"
                  value={baseUrl} onChange={e => setBaseUrl(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleConnect()}
                  autoComplete="off"
                  disabled={!!process.env.NEXT_PUBLIC_SB_BASE_URL}
                  title={process.env.NEXT_PUBLIC_SB_BASE_URL ? 'Pre-configured by server admin' : ''} />
                <input
                  className="w-full rounded-xl px-3 py-2.5 text-sm text-slate-200 outline-none placeholder:text-slate-600 focus:ring-1 focus:ring-amber-500/30 transition-all"
                  style={{ background: 'rgba(2,8,18,0.8)', border: '1px solid rgba(51,65,85,0.4)' }}
                  placeholder="Bearer token" type="password"
                  value={token} onChange={e => setToken(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleConnect()}
                  autoComplete="new-password" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <input
                  className="w-full rounded-xl px-3 py-2.5 text-sm text-slate-200 outline-none placeholder:text-slate-600 focus:ring-1 focus:ring-amber-500/30 transition-all"
                  style={{ background: 'rgba(2,8,18,0.8)', border: '1px solid rgba(51,65,85,0.4)' }}
                  placeholder="Display Name (e.g. Abhay Thakur)"
                  value={nameInput} onChange={e => setNameInput(e.target.value)} />
                <input
                  className="w-full rounded-xl px-3 py-2.5 text-sm text-slate-200 outline-none placeholder:text-slate-600 focus:ring-1 focus:ring-amber-500/30 transition-all"
                  style={{ background: 'rgba(2,8,18,0.8)', border: '1px solid rgba(51,65,85,0.4)' }}
                  placeholder="Environment (e.g. Production)"
                  value={environment} onChange={e => setEnvironment(e.target.value)} />
                <motion.button onClick={handleConnect} disabled={connecting}
                  whileHover={{ scale: 1.02, y: -1 }}
                  whileTap={{ scale: 0.98 }}
                  className="relative rounded-xl px-4 py-2.5 text-sm font-bold transition-all overflow-hidden group btn-gold"
                  style={{ opacity: connecting ? 0.6 : 1 }}>
                  <span className="relative z-10">{connecting ? 'Connecting...' : 'Authenticate'}</span>
                </motion.button>
              </div>
              {connError && (
                <motion.p initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                  className="text-xs text-red-400 px-1 flex items-center gap-1.5">
                  <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {connError}
                </motion.p>
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


// ── System Stats — Premium ────────────────────────────────────────────────────
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
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500/60" />
          SYS: NOMINAL
        </span>
        <span className="shrink-0">MODULES: {liveCount}/{totalCount} ACTIVE</span>
        {connected && <span className="shrink-0">UPTIME: {uptime}</span>}
        <span className="shrink-0">API: REST v6.x</span>
        <span className="shrink-0">PROTO: HTTPS/TLS1.3</span>
        <span className="flex-1" />
        <span className="shrink-0 text-slate-700">BUILD: 3.0.0-premium</span>
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
      <GridMesh />
      <FloatingOrbs />
      <PremiumParticles />

      {/* Top bar */}
      <header className="fixed top-0 left-0 right-0 z-50"
        style={{ background: 'rgba(2,8,18,0.92)', backdropFilter: 'blur(20px)', borderBottom: '1px solid rgba(245,158,11,0.06)' }}>
        <DataPulse />
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <motion.div className="w-8 h-8 rounded-xl flex items-center justify-center overflow-hidden relative"
              style={{ border: '1px solid rgba(245,158,11,0.25)' }}
              whileHover={{ scale: 1.1, rotate: 5 }}
              transition={{ type: 'spring', stiffness: 400 }}>
              <div className="absolute inset-0" style={{ background: 'linear-gradient(135deg, rgba(245,158,11,0.1), rgba(139,92,246,0.1))' }} />
              <img src="/logo.png" alt="SB" className="w-6 h-6 object-contain relative z-10" />
            </motion.div>
            <div>
              <span className="text-sm font-bold neon-text-gold">SB Automation</span>
              <span className="text-[9px] text-slate-600 ml-2 font-mono hidden sm:inline">COMMAND CENTER</span>
            </div>
          </div>
          <div className="flex items-center gap-4 text-xs">
            {connected ? (
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg"
                  style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.15)' }}>
                  <motion.span className="w-1.5 h-1.5 rounded-full bg-amber-400"
                    animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 1.5, repeat: Infinity }} />
                  <span className="text-amber-400 font-medium text-[11px]">{environment}</span>
                </div>
              </div>
            ) : (
              <span className="text-slate-600 font-mono text-[10px]">{liveCount} MODULES READY</span>
            )}
          </div>
        </div>
      </header>

      <main className="pt-14 relative z-10">

        {/* Hero — Premium Command Center */}
        <section className="relative px-6 pt-16 pb-10 overflow-hidden">
          <div className="max-w-6xl mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
              style={{ perspective: '1200px' }}
            >
              {/* Tagline */}
              <motion.div
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 }}
                className="flex items-center gap-2 mb-4"
              >
                <div className="h-[1px] w-10" style={{ background: 'linear-gradient(90deg, #f59e0b, transparent)' }} />
                <span className="text-[10px] font-bold tracking-[0.3em] uppercase text-amber-500/70">
                  Enterprise Workload Automation
                </span>
              </motion.div>

              {/* Title */}
              {connected && username ? (
                <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-3">
                  <span className="text-sm text-slate-500">Welcome back,</span>
                  <h1 className="text-3xl md:text-4xl font-black tracking-tight leading-[1.1]">
                    <span className="neon-text-gold">{username}</span>
                  </h1>
                </motion.div>
              ) : (
                <h1 className="text-4xl md:text-5xl font-black tracking-tight leading-[1.1] mb-4">
                  <span className="neon-text-gold">Stonebranch</span>
                  <br />
                  <span className="text-slate-300">Automation Platform</span>
                </h1>
              )}

              {/* Subtitle */}
              <p className="text-sm text-slate-500 max-w-lg leading-relaxed mb-8">
                Orchestrate job creation, agent lifecycle, monitoring, and deletion
                through a unified command interface. Powered by the UAC REST API.
              </p>

              {/* Capability indicators — premium badges */}
              <div className="flex flex-wrap gap-2">
                {[
                  { label: 'Bulk Job Creation', active: true, tier: 'gold' },
                  { label: 'Schedule Parsing', active: true, tier: 'gold' },
                  { label: 'Agent Lifecycle', active: true, tier: 'purple' },
                  { label: 'Real-time Alerts', active: true, tier: 'purple' },
                  { label: 'Safe Deletion', active: true, tier: 'gold' },
                  { label: 'Bulk Updates', active: false, tier: 'silver' },
                ].map(cap => (
                  <motion.span
                    key={cap.label}
                    initial={{ opacity: 0, scale: 0.9, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    transition={{ delay: 0.3 + Math.random() * 0.3 }}
                    className="px-2.5 py-1 rounded-lg text-[10px] font-medium"
                    style={{
                      background: cap.active
                        ? cap.tier === 'gold' ? 'rgba(245,158,11,0.05)' : cap.tier === 'purple' ? 'rgba(139,92,246,0.05)' : 'rgba(6,182,212,0.05)'
                        : 'rgba(30,41,59,0.3)',
                      border: cap.active
                        ? cap.tier === 'gold' ? '1px solid rgba(245,158,11,0.12)' : cap.tier === 'purple' ? '1px solid rgba(139,92,246,0.12)' : '1px solid rgba(6,182,212,0.12)'
                        : '1px solid rgba(51,65,85,0.15)',
                      color: cap.active
                        ? cap.tier === 'gold' ? '#fbbf24' : cap.tier === 'purple' ? '#c4b5fd' : '#67e8f9'
                        : '#475569',
                    }}>
                    {cap.active && (
                      <span className="inline-block w-1 h-1 rounded-full mr-1.5 relative top-[-1px]"
                        style={{
                          background: cap.tier === 'gold' ? '#f59e0b' : cap.tier === 'purple' ? '#8b5cf6' : '#06b6d4',
                        }} />
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
              <motion.div initial={{ opacity: 0, y: 20, rotateX: -10 }} animate={{ opacity: 1, y: 0, rotateX: 0 }}
                className="glass-card-gold p-8 text-center max-w-sm"
                style={{ perspective: '800px' }}>
                <div className="w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center"
                  style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}>
                  <svg className="w-7 h-7 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
              <div className="h-[1px] w-5" style={{ background: 'linear-gradient(90deg, #f59e0b, transparent)' }} />
              <h2 className="text-xs font-bold tracking-[0.2em] uppercase text-slate-500">
                Automation Modules
              </h2>
            </div>
            <span className="text-[10px] font-mono text-slate-700">
              {liveCount} OPERATIONAL
            </span>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {AUTOMATIONS.map((auto, i) => (
              <AutomationCard key={auto.id} auto={auto} index={i} />
            ))}
          </div>
        </section>

        {/* Footer */}
        <footer className="border-t py-8" style={{ borderColor: 'rgba(245,158,11,0.05)', background: 'rgba(2,8,18,0.5)' }}>
          <div className="max-w-6xl mx-auto px-6 flex items-center justify-between">
            <p className="text-[10px] text-slate-700 font-mono">
              DESIGNED AND ENGINEERED BY <span className="neon-text-gold">ABHAY THAKUR</span>
            </p>
            <p className="text-[10px] text-slate-800 font-mono">v3.0.0</p>
          </div>
        </footer>

      </main>
    </div>
  );
}
