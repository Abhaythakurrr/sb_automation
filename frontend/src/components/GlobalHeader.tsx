'use client';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { useConnectionStore } from '@/store/useConnectionStore';

interface GlobalHeaderProps {
  title:     string;
  subtitle?: string;
}

export default function GlobalHeader({ title, subtitle }: GlobalHeaderProps) {
  const { connected, environment, baseUrlHint, disconnect } = useConnectionStore();

  return (
    <header
      className="fixed top-0 left-0 right-0 z-50 border-b"
      style={{
        borderColor: 'rgba(6,182,212,0.1)',
        background: 'rgba(2,8,18,0.92)',
        backdropFilter: 'blur(16px)',
      }}
    >
      <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">

        {/* Left: back + logo + title */}
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-cyan-400 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Home
          </Link>
          <span className="text-slate-800">|</span>
          <div className="flex items-center gap-2">
            <div
              className="w-6 h-6 rounded-md overflow-hidden shrink-0"
              style={{ boxShadow: '0 0 10px rgba(6,182,212,0.4)' }}
            >
              <img src="/logo.png" alt="SB" className="w-full h-full object-contain" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-sm font-semibold neon-text">{title}</span>
              {subtitle && (
                <span className="text-[10px] text-slate-600 hidden sm:inline">{subtitle}</span>
              )}
            </div>
          </div>
        </div>

        {/* Right: connection status */}
        <div className="flex items-center gap-3">
          {connected ? (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex items-center gap-1.5 text-xs text-emerald-400"
              >
                <motion.span
                  className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block"
                  animate={{ opacity: [1, 0.3, 1] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                />
                {environment}
                {baseUrlHint && (
                  <span className="text-slate-600 text-[10px] ml-1 hidden md:inline">
                    {baseUrlHint}
                  </span>
                )}
              </motion.div>
              <button
                onClick={disconnect}
                className="text-xs text-red-500/60 hover:text-red-400 transition-colors"
              >
                Disconnect
              </button>
            </>
          ) : (
            <Link
              href="/"
              className="flex items-center gap-1.5 text-xs text-amber-500/80 hover:text-amber-400 transition-colors"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block" />
              Not connected — go to Home
            </Link>
          )}
        </div>

      </div>
    </header>
  );
}
