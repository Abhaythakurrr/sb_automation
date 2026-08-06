'use client';
/**
 * Copilot launcher.
 *
 * A small persistent affordance, mounted at the root so it exists on every page.
 * Clicking it opens the Copilot workspace tab — it does not open a dialog.
 *
 * That distinction is the whole point of this file being 90 lines instead of 700.
 * The Copilot used to be a modal that covered the application, which made it
 * impossible to consult while working on the thing you were asking about. It now
 * lives in CopilotCanvas as a tab with its own space; this is just the door.
 *
 * The documentation and SOP routes render outside the workspace shell, so from
 * those pages the launcher navigates home with a hash the shell picks up.
 */
import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useCopilotStore } from '@/store/useCopilotStore';
import { useWorkspaceStore } from '@/store/useWorkspaceStore';
import { playHover, playWhoosh } from '@/utils/soundEffects';
import { BetaBadge, SparkIcon } from './CopilotParts';

export default function CopilotDock() {
  const { enabled, checkHealth, badge } = useCopilotStore();
  const { openTab, activeTab } = useWorkspaceStore();

  useEffect(() => { checkHealth(); }, [checkHealth]);

  const open = () => {
    playWhoosh();
    const inWorkspace = typeof window !== 'undefined' && window.location.pathname === '/';
    if (inWorkspace) openTab('copilot', 'Copilot');
    else window.location.href = '/#copilot';
  };

  // Ctrl/Cmd+K from anywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        open();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Links anywhere in the app can point at the Copilot with href="#copilot".
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const link = (e.target as HTMLElement)?.closest?.('a[href="#copilot"]');
      if (!link) return;
      e.preventDefault();
      e.stopPropagation();
      open();
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Hidden while the Copilot tab is the one you are looking at — a button that
  // opens what is already open is just clutter.
  const redundant = activeTab === 'copilot';
  if (!enabled || redundant) return null;

  return (
    <AnimatePresence>
      <motion.button
        initial={{ opacity: 0, scale: 0.7, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.7, y: 16 }}
        transition={{ type: 'spring', damping: 20, stiffness: 300 }}
        whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
        onMouseEnter={playHover} onClick={open}
        title="Copilot — Ctrl+K"
        aria-label="Open the Copilot"
        className="lq-glass lq-rim fixed bottom-5 right-5 z-[70] flex items-center gap-2.5 pl-2.5 pr-4 py-2.5 rounded-full">
        <span className="lq-orb relative flex items-center justify-center w-7 h-7 rounded-full shrink-0">
          <SparkIcon className="w-4 h-4 text-white/95" />
          <span className="lq-halo" />
        </span>
        <span className="text-[13px] font-semibold lq-title">Copilot</span>
        <BetaBadge />
        {badge > 0 && (
          <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }}
            transition={{ type: 'spring', damping: 12, stiffness: 400 }}
            className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full
              flex items-center justify-center text-[11px] font-bold text-white"
            style={{ background: '#ef4444', boxShadow: '0 0 12px rgba(239,68,68,0.55)' }}>
            {badge > 9 ? '9+' : badge}
          </motion.span>
        )}
      </motion.button>
    </AnimatePresence>
  );
}
