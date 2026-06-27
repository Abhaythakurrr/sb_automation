'use client';
import { motion } from 'framer-motion';
import { useConnectionStore } from '@/store/useConnectionStore';
import { useWorkspaceStore } from '@/store/useWorkspaceStore';

interface GlobalHeaderProps {
  title:     string;
  subtitle?: string;
  sopHref?:  string;
}

export default function GlobalHeader({ title, subtitle, sopHref }: GlobalHeaderProps) {
  const { connected, environment, baseUrlHint, username, disconnect } = useConnectionStore();
  const { setActiveTab } = useWorkspaceStore();

  return (
    <header
      className="sticky top-0 z-50"
      style={{
        background: 'rgba(2,8,18,0.92)',
        backdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(6,182,212,0.08)',
      }}
    >
      {/* Top accent pulse */}
      <div className="absolute top-0 left-0 right-0 h-[1px] overflow-hidden">
        <motion.div
          className="h-full w-32"
          style={{ background: 'linear-gradient(90deg, transparent, rgba(6,182,212,0.4), transparent)' }}
          animate={{ x: ['-128px', 'calc(100vw + 128px)'] }}
          transition={{ duration: 5, repeat: Infinity, ease: 'linear', repeatDelay: 3 }}
        />
      </div>

      <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">

        {/* Left: back + logo + title */}
        <div className="flex items-center gap-4">
          <button
            onClick={() => setActiveTab('home')}
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-cyan-400 transition-colors group"
          >
            <svg className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            <span className="hidden sm:inline">Home</span>
          </button>

          <div className="w-[1px] h-4" style={{ background: 'rgba(51,65,85,0.4)' }} />

          <div className="flex items-center gap-2.5">
            <div
              className="w-7 h-7 rounded-lg overflow-hidden shrink-0 relative"
              style={{ border: '1px solid rgba(6,182,212,0.2)' }}
            >
              <div className="absolute inset-0" style={{ background: 'linear-gradient(135deg, rgba(6,182,212,0.1), rgba(59,130,246,0.1))' }} />
              <img src="/logo.png" alt="SB" className="w-full h-full object-contain relative z-10" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-sm font-bold neon-text">{title}</span>
              {subtitle && (
                <span className="text-[9px] text-slate-600 font-mono tracking-wide hidden md:inline uppercase">{subtitle}</span>
              )}
            </div>
          </div>
        </div>

        {/* Right: connection status */}
        <div className="flex items-center gap-3">
          {sopHref && (
            <a href={sopHref}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-bold text-cyan-400/80 hover:text-cyan-300 transition-colors"
              style={{ background: 'rgba(6,182,212,0.06)', border: '1px solid rgba(6,182,212,0.18)' }}
              title="Open the Standard Operating Procedure">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
              <span className="hidden sm:inline">SOP</span>
            </a>
          )}
          {connected ? (
            <>
              <div className="flex items-center gap-2 px-2.5 py-1 rounded-md"
                style={{ background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.15)' }}>
                <motion.span
                  className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block"
                  animate={{ opacity: [1, 0.3, 1] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                />
                <span className="text-[11px] font-medium text-emerald-400">{username || environment}</span>
                {baseUrlHint && (
                  <span className="text-[9px] text-slate-600 font-mono ml-1 hidden lg:inline">
                    {baseUrlHint}
                  </span>
                )}
              </div>
              <button
                onClick={disconnect}
                className="text-[10px] text-red-500/50 hover:text-red-400 transition-colors font-medium"
              >
                Disconnect
              </button>
            </>
          ) : (
            <button
              onClick={() => setActiveTab('home')}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium text-amber-500/80 hover:text-amber-400 transition-colors"
              style={{ background: 'rgba(245,158,11,0.05)', border: '1px solid rgba(245,158,11,0.15)' }}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block" />
              Not connected
            </button>
          )}
        </div>

      </div>
    </header>
  );
}
