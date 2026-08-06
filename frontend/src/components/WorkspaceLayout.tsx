'use client';
import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { useWorkspaceStore, AutomationId } from '@/store/useWorkspaceStore';
import LandingPage from './LandingPage';
import PipelinePage from './PipelinePage';
import AgentControlPage from './AgentControlPage';
import MonitoringPage from './MonitoringPage';
import JobDeletionPage from './JobDeletionPage';
import JobRecoveryPage from './JobRecoveryPage';
import SearchEditPage from './SearchEditPage';
import AdhocLaunchPage from './AdhocLaunchPage';
import CopilotCanvas from './copilot/CopilotCanvas';

// ── Tab Bar ───────────────────────────────────────────────────────────────────
function TabBar() {
  const { openTabs, activeTab, setActiveTab, closeTab } = useWorkspaceStore();

  const tabIcons: Record<AutomationId, React.ReactNode> = {
    'home': (
      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
    ),
    'job-creation': (
      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
      </svg>
    ),
    'agent-control': (
      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18" />
      </svg>
    ),
    'monitoring': (
      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
    'job-deletion': (
      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
      </svg>
    ),
    'job-recovery': (
      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
      </svg>
    ),
    'search': (
      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
    ),
    'adhoc-launch': (
      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ),
    'copilot': (
      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
      </svg>
    ),
  };

  if (openTabs.length <= 1) return null; // Don't show tab bar if only home is open

  return (
    <div className="fixed top-0 left-0 right-0 z-[60] flex items-end"
      style={{ background: 'rgba(2,6,14,0.95)', backdropFilter: 'blur(12px)', borderBottom: '1px solid rgba(51,65,85,0.15)' }}>
      <div className="flex items-end overflow-x-auto max-w-full px-2 pt-1.5" style={{ scrollbarWidth: 'none' }}>
        {openTabs.map(tab => {
          const isActive = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`group relative flex items-center gap-1.5 px-3 py-2 text-[11px] font-medium rounded-t-lg transition-all shrink-0 ${
                isActive
                  ? 'text-slate-200'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
              style={{
                background: isActive
                  ? 'rgba(6,15,30,0.9)'
                  : 'transparent',
                borderTop: isActive ? '1px solid rgba(6,182,212,0.3)' : '1px solid transparent',
                borderLeft: isActive ? '1px solid rgba(51,65,85,0.2)' : '1px solid transparent',
                borderRight: isActive ? '1px solid rgba(51,65,85,0.2)' : '1px solid transparent',
              }}
            >
              {/* Active indicator */}
              {isActive && (
                <div className="absolute top-0 left-2 right-2 h-[1px]"
                  style={{ background: 'linear-gradient(90deg, transparent, rgba(6,182,212,0.6), transparent)' }} />
              )}

              <span className={isActive ? 'text-cyan-400' : 'text-slate-600 group-hover:text-slate-400'}>
                {tabIcons[tab.id]}
              </span>
              <span className="max-w-[100px] truncate">{tab.title}</span>

              {/* Close button — not on home */}
              {tab.id !== 'home' && (
                <span
                  onClick={(e) => { e.stopPropagation(); closeTab(tab.id); }}
                  className="ml-1 w-4 h-4 rounded flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-slate-700/50 transition-all text-slate-500 hover:text-slate-300"
                >
                  <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Workspace Layout ──────────────────────────────────────────────────────────
// All opened automations stay mounted. Only the active one is visible.
// This preserves state across tab switches — no data loss.
export default function WorkspaceLayout() {
  const { openTabs, activeTab, openTab } = useWorkspaceStore();

  // Arriving from a documentation page with /#copilot opens the tab. Those routes
  // render outside this shell, so the launcher there navigates rather than
  // calling openTab directly.
  useEffect(() => {
    if (window.location.hash === '#copilot') {
      openTab('copilot', 'Copilot');
      history.replaceState(null, '', window.location.pathname);
    }
  }, [openTab]);

  // Track which automations have been opened (to lazy-mount them)
  const mountedIds = openTabs.map(t => t.id);
  const hasTabBar = openTabs.length > 1;

  return (
    <div className="min-h-screen" style={{ background: '#020812' }}>
      <TabBar />

      {/* Render all mounted automations — hide inactive ones */}
      <div style={{ paddingTop: hasTabBar ? '36px' : '0' }}>
        {/* Home / Landing */}
        <div style={{ display: activeTab === 'home' ? 'block' : 'none' }}>
          <LandingPageWrapper />
        </div>

        {/* Job Creation */}
        {mountedIds.includes('job-creation') && (
          <div style={{ display: activeTab === 'job-creation' ? 'block' : 'none' }}>
            <PipelinePage />
          </div>
        )}

        {/* Agent Control */}
        {mountedIds.includes('agent-control') && (
          <div style={{ display: activeTab === 'agent-control' ? 'block' : 'none' }}>
            <AgentControlPage />
          </div>
        )}

        {/* Monitoring */}
        {mountedIds.includes('monitoring') && (
          <div style={{ display: activeTab === 'monitoring' ? 'block' : 'none' }}>
            <MonitoringPage />
          </div>
        )}

        {/* Job Deletion */}
        {mountedIds.includes('job-deletion') && (
          <div style={{ display: activeTab === 'job-deletion' ? 'block' : 'none' }}>
            <JobDeletionPage />
          </div>
        )}

        {/* Job Recovery */}
        {mountedIds.includes('job-recovery') && (
          <div style={{ display: activeTab === 'job-recovery' ? 'block' : 'none' }}>
            <JobRecoveryPage />
          </div>
        )}

        {/* Search & Edit */}
        {mountedIds.includes('search') && (
          <div style={{ display: activeTab === 'search' ? 'block' : 'none' }}>
            <SearchEditPage />
          </div>
        )}

        {/* Ad-hoc Launch */}
        {mountedIds.includes('adhoc-launch') && (
          <div style={{ display: activeTab === 'adhoc-launch' ? 'block' : 'none' }}>
            <AdhocLaunchPage />
          </div>
        )}

        {/* Copilot — a tab like any other, so it can be consulted while working
            rather than covering the thing you are asking about. */}
        {mountedIds.includes('copilot') && (
          <div style={{ display: activeTab === 'copilot' ? 'block' : 'none' }}>
            <CopilotCanvas />
          </div>
        )}
      </div>
    </div>
  );
}

// ── Landing Page Wrapper — intercepts link clicks to open tabs instead ────────
function LandingPageWrapper() {
  const { openTab } = useWorkspaceStore();

  useEffect(() => {
    // Intercept automation link clicks on the landing page
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const link = target.closest('a[href]') as HTMLAnchorElement | null;
      if (!link) return;

      const href = link.getAttribute('href');
      if (!href || href === '#') return;

      // Map routes to automation IDs
      const routeMap: Record<string, { id: AutomationId; title: string }> = {
        '/job-creation':  { id: 'job-creation',  title: 'Job Creation' },
        '/agent-control': { id: 'agent-control', title: 'Agent Control' },
        '/monitoring':    { id: 'monitoring',    title: 'Monitoring' },
        '/job-deletion':  { id: 'job-deletion',  title: 'Job Deletion' },
        '/job-recovery':  { id: 'job-recovery',  title: 'Job Recovery' },
        '/search':        { id: 'search',        title: 'Search & Edit' },
        '/adhoc-launch':  { id: 'adhoc-launch',  title: 'Ad-hoc Launch' },
        '#copilot':       { id: 'copilot',       title: 'Copilot' },
      };

      const match = routeMap[href];
      if (match) {
        e.preventDefault();
        e.stopPropagation();
        openTab(match.id, match.title);
      }
    };

    document.addEventListener('click', handler, true);
    return () => document.removeEventListener('click', handler, true);
  }, [openTab]);

  return <LandingPage />;
}
