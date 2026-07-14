'use client';
/**
 * Application-level notification primitives.
 *
 * Two exports:
 *   <ToastContainer />   — mount once in a layout; renders all live toasts
 *   <ConfirmModal />     — inline confirm dialog matching the deletion-confirm
 *                          style already used in JobDeletionPage
 *
 * Both match the existing design language exactly:
 *   dark glass cards · font-mono · framer-motion · slate/red/green/amber palette
 *
 * Usage — Toast:
 *   const { toast } = useToast();
 *   toast.success('Backup downloaded');
 *   toast.error('Clear failed: ' + err.message);
 *   toast.warn('No jobs matched');
 *   toast.info('Connecting…');
 *
 * Usage — ConfirmModal:
 *   const [confirm, setConfirm] = useState<ConfirmOptions | null>(null);
 *   <ConfirmModal options={confirm} onConfirm={() => { doThing(); setConfirm(null); }} onCancel={() => setConfirm(null)} />
 *   // trigger:
 *   setConfirm({ title: 'Clear All?', message: '…', confirmLabel: 'Clear', danger: true });
 */

import { useState, useEffect, useCallback, createContext, useContext, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// ── Types ─────────────────────────────────────────────────────────────────────

export type ToastVariant = 'success' | 'error' | 'warn' | 'info';

export interface ToastItem {
  id:        string;
  variant:   ToastVariant;
  message:   string;
  /** Auto-dismiss after ms. Default 4000. Pass 0 to persist until manually closed. */
  duration?: number;
}

export interface ConfirmOptions {
  title:          string;
  message:        string;
  confirmLabel?:  string;
  cancelLabel?:   string;
  /** Uses red danger styling when true (default: false) */
  danger?:        boolean;
}

// ── Design tokens (matching app palette) ─────────────────────────────────────

const VARIANT_STYLES: Record<ToastVariant, {
  bg:     string;
  border: string;
  bar:    string;
  icon:   string;
  color:  string;
  label:  string;
}> = {
  success: {
    bg:     'rgba(4,20,12,0.92)',
    border: 'rgba(34,197,94,0.3)',
    bar:    '#22c55e',
    icon:   'M5 13l4 4L19 7',
    color:  '#4ade80',
    label:  'SUCCESS',
  },
  error: {
    bg:     'rgba(20,4,4,0.95)',
    border: 'rgba(239,68,68,0.35)',
    bar:    '#ef4444',
    icon:   'M6 18L18 6M6 6l12 12',
    color:  '#f87171',
    label:  'ERROR',
  },
  warn: {
    bg:     'rgba(20,14,2,0.93)',
    border: 'rgba(245,158,11,0.3)',
    bar:    '#f59e0b',
    icon:   'M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
    color:  '#fbbf24',
    label:  'WARNING',
  },
  info: {
    bg:     'rgba(2,12,22,0.93)',
    border: 'rgba(6,182,212,0.3)',
    bar:    '#06b6d4',
    icon:   'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
    color:  '#67e8f9',
    label:  'INFO',
  },
};

// ── Context ───────────────────────────────────────────────────────────────────

interface ToastContextValue {
  success: (message: string, duration?: number) => void;
  error:   (message: string, duration?: number) => void;
  warn:    (message: string, duration?: number) => void;
  info:    (message: string, duration?: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}

// ── Provider ──────────────────────────────────────────────────────────────────

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const push = useCallback((variant: ToastVariant, message: string, duration = 4000) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setToasts(prev => [...prev, { id, variant, message, duration }]);
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const api: ToastContextValue = {
    success: (msg, dur) => push('success', msg, dur),
    error:   (msg, dur) => push('error',   msg, dur),
    warn:    (msg, dur) => push('warn',    msg, dur),
    info:    (msg, dur) => push('info',    msg, dur),
  };

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastContainer toasts={toasts} dismiss={dismiss} />
    </ToastContext.Provider>
  );
}

// ── Single toast item ─────────────────────────────────────────────────────────

function Toast({ item, onDismiss }: { item: ToastItem; onDismiss: (id: string) => void }) {
  const s = VARIANT_STYLES[item.variant];
  const duration = item.duration ?? 4000;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (duration <= 0) return;
    timerRef.current = setTimeout(() => onDismiss(item.id), duration);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [item.id, duration, onDismiss]);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 64, scale: 0.92 }}
      animate={{ opacity: 1, x: 0,  scale: 1 }}
      exit={{    opacity: 0, x: 64, scale: 0.88, transition: { duration: 0.18 } }}
      transition={{ type: 'spring', stiffness: 420, damping: 32 }}
      className="relative flex items-start gap-3 px-4 py-3 rounded-xl min-w-[260px] max-w-[380px] overflow-hidden"
      style={{
        background:  s.bg,
        border:      `1px solid ${s.border}`,
        boxShadow:   `0 4px 24px rgba(0,0,0,0.4), 0 0 0 1px ${s.border}`,
        backdropFilter: 'blur(12px)',
      }}
      role="alert"
      aria-live="assertive"
    >
      {/* Left accent bar */}
      <div className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-xl" style={{ background: s.bar }} />

      {/* Icon */}
      <div className="shrink-0 mt-0.5 w-5 h-5 flex items-center justify-center rounded-full"
        style={{ background: `${s.bar}22` }}>
        <svg className="w-3 h-3" fill="none" stroke={s.color} strokeWidth={2.5}
          strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
          <path d={s.icon} />
        </svg>
      </div>

      {/* Message */}
      <div className="flex-1 min-w-0 py-0.5">
        <p className="text-[9px] font-mono font-bold uppercase tracking-widest mb-0.5" style={{ color: s.bar }}>
          {s.label}
        </p>
        <p className="text-[11px] font-mono text-slate-200 leading-snug break-words">
          {item.message}
        </p>
      </div>

      {/* Dismiss button */}
      <button
        onClick={() => onDismiss(item.id)}
        className="shrink-0 mt-0.5 text-slate-600 hover:text-slate-300 transition-colors text-xs leading-none"
        aria-label="Dismiss notification"
      >
        ✕
      </button>

      {/* Auto-dismiss progress bar */}
      {duration > 0 && (
        <motion.div
          className="absolute bottom-0 left-0 h-[2px] rounded-bl-xl"
          style={{ background: s.bar, opacity: 0.45 }}
          initial={{ width: '100%' }}
          animate={{ width: '0%' }}
          transition={{ duration: duration / 1000, ease: 'linear' }}
        />
      )}
    </motion.div>
  );
}

// ── Container (portal-style fixed overlay) ────────────────────────────────────

function ToastContainer({ toasts, dismiss }: { toasts: ToastItem[]; dismiss: (id: string) => void }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Don't render on server to avoid hydration mismatch
  if (!mounted) return null;

  return (
    <div
      className="fixed top-4 right-4 z-[200] flex flex-col gap-2.5 pointer-events-none"
      aria-label="Notifications"
    >
      <AnimatePresence mode="sync">
        {toasts.map(t => (
          <div key={t.id} className="pointer-events-auto">
            <Toast item={t} onDismiss={dismiss} />
          </div>
        ))}
      </AnimatePresence>
    </div>
  );
}

// ── ConfirmModal ──────────────────────────────────────────────────────────────
// Matches the dark-glass danger modal already used in JobDeletionPage.

export interface ConfirmModalProps {
  options:    ConfirmOptions | null;
  onConfirm:  () => void;
  onCancel:   () => void;
}

export function ConfirmModal({ options, onConfirm, onCancel }: ConfirmModalProps) {
  // Close on Escape
  useEffect(() => {
    if (!options) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [options, onCancel]);

  const accentColor   = options?.danger ? '#ef4444' : '#06b6d4';
  const confirmBg     = options?.danger ? 'rgba(239,68,68,0.15)'  : 'rgba(6,182,212,0.12)';
  const confirmBorder = options?.danger ? 'rgba(239,68,68,0.4)'   : 'rgba(6,182,212,0.35)';
  const confirmText   = options?.danger ? '#fca5a5'               : '#67e8f9';
  const iconPath      = options?.danger
    ? 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z'
    : 'M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z';

  return (
    <AnimatePresence>
      {options && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[150] flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(6px)' }}
          onClick={onCancel}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 24 }}
            animate={{ opacity: 1, scale: 1,   y: 0  }}
            exit={{    opacity: 0, scale: 0.9, y: 16 }}
            transition={{ type: 'spring', stiffness: 420, damping: 30 }}
            onClick={e => e.stopPropagation()}
            className="w-full max-w-sm mx-4 rounded-2xl overflow-hidden"
            style={{
              background: 'linear-gradient(145deg, rgba(8,4,12,0.98), rgba(4,2,8,0.99))',
              border:     `1px solid ${confirmBorder}`,
              boxShadow:  `0 0 50px ${confirmBg}, 0 20px 40px rgba(0,0,0,0.5)`,
            }}
          >
            {/* Top accent */}
            <div className="h-[2px]" style={{ background: `linear-gradient(90deg, transparent, ${accentColor}, transparent)` }} />

            <div className="p-6">
              {/* Icon */}
              <div className="flex justify-center mb-4">
                <motion.div
                  className="w-14 h-14 rounded-2xl flex items-center justify-center relative"
                  style={{ background: `${accentColor}12`, border: `1px solid ${accentColor}30` }}
                  animate={{ rotate: options.danger ? [0, -2, 2, -1, 0] : 0 }}
                  transition={{ duration: 0.45, delay: 0.2 }}
                >
                  <svg className="w-7 h-7" fill="none" stroke={accentColor} strokeWidth={1.5}
                    strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                    <path d={iconPath} />
                  </svg>
                  <motion.div
                    className="absolute inset-0 rounded-2xl"
                    style={{ border: `1px solid ${accentColor}40` }}
                    animate={{ scale: [1, 1.18], opacity: [0.5, 0] }}
                    transition={{ duration: 1.8, repeat: Infinity }}
                  />
                </motion.div>
              </div>

              {/* Title + message */}
              <h3 className="text-sm font-bold text-center text-slate-100 mb-2">{options.title}</h3>
              <p className="text-[11px] text-center text-slate-400 leading-relaxed mb-6">{options.message}</p>

              {/* Buttons */}
              <div className="flex gap-3">
                <button
                  onClick={onCancel}
                  className="flex-1 px-4 py-2.5 rounded-xl text-xs font-medium text-slate-400 hover:text-slate-200 transition-all"
                  style={{ background: 'rgba(51,65,85,0.2)', border: '1px solid rgba(51,65,85,0.3)' }}
                >
                  {options.cancelLabel ?? 'Cancel'}
                </button>
                <motion.button
                  onClick={onConfirm}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                  className="flex-1 px-4 py-2.5 rounded-xl text-xs font-bold transition-all"
                  style={{
                    background: confirmBg,
                    border:     `1px solid ${confirmBorder}`,
                    color:      confirmText,
                    boxShadow:  `0 0 16px ${confirmBg}`,
                  }}
                >
                  {options.confirmLabel ?? 'Confirm'}
                </motion.button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
