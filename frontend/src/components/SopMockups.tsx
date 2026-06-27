'use client';
import { motion } from 'framer-motion';

/**
 * Dummy UI mockups ("screenshots") for the SOP pages.
 * These are hand-built recreations of the real platform screens — clearly
 * labelled as illustrations — so readers can see where each control lives
 * without needing live screenshots.
 */

function Pin({ n, accent }: { n: number; accent: string }) {
  return (
    <span className="inline-flex items-center justify-center w-4 h-4 rounded-full text-[9px] font-bold shrink-0"
      style={{ background: accent, color: '#021018' }}>{n}</span>
  );
}

function Frame({ title, accent, children, caption }: { title: string; accent: string; children: React.ReactNode; caption?: string }) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
      className="rounded-xl overflow-hidden my-3" style={{ border: '1px solid rgba(51,65,85,0.35)', background: 'rgba(2,8,18,0.6)' }}>
      {/* window chrome */}
      <div className="flex items-center gap-2 px-3 py-2" style={{ background: 'rgba(8,14,26,0.9)', borderBottom: '1px solid rgba(51,65,85,0.3)' }}>
        <span className="w-2.5 h-2.5 rounded-full" style={{ background: '#ef4444' }} />
        <span className="w-2.5 h-2.5 rounded-full" style={{ background: '#f59e0b' }} />
        <span className="w-2.5 h-2.5 rounded-full" style={{ background: '#22c55e' }} />
        <span className="ml-2 text-[10px] font-mono text-slate-500">{title}</span>
        <span className="ml-auto text-[8px] font-mono uppercase tracking-widest px-1.5 py-0.5 rounded"
          style={{ background: `${accent}1a`, color: accent }}>illustration</span>
      </div>
      <div className="p-4">{children}</div>
      {caption && (
        <div className="px-4 pb-3 -mt-1">
          <p className="text-[10px] text-slate-500 leading-relaxed">{caption}</p>
        </div>
      )}
    </motion.div>
  );
}

const box = (extra: React.CSSProperties = {}): React.CSSProperties => ({
  background: 'rgba(2,8,18,0.8)', border: '1px solid rgba(51,65,85,0.3)', borderRadius: 8, ...extra,
});

// ── Connection panel ─────────────────────────────────────────────────────────
function ConnectMock({ accent }: { accent: string }) {
  return (
    <Frame title="Home — Connect to UAC" accent={accent}
      caption="Connect once: enter the Base URL and bearer token, then Connect. Only a session ID is kept afterwards.">
      <div className="space-y-2.5 max-w-md">
        <div className="flex items-center gap-2">
          <Pin n={1} accent={accent} />
          <div className="flex-1 px-3 py-2 text-[11px] text-slate-400 font-mono" style={box()}>https://uac.company.internal/uc</div>
        </div>
        <div className="flex items-center gap-2">
          <Pin n={2} accent={accent} />
          <div className="flex-1 px-3 py-2 text-[11px] text-slate-600 font-mono" style={box()}>•••••••••••• (bearer token)</div>
        </div>
        <div className="flex items-center gap-2">
          <Pin n={3} accent={accent} />
          <div className="px-4 py-2 text-[11px] font-bold rounded-lg" style={{ background: `${accent}1a`, border: `1px solid ${accent}55`, color: accent }}>Connect</div>
          <span className="flex items-center gap-1.5 text-[10px] text-emerald-400 ml-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Connected
          </span>
        </div>
      </div>
    </Frame>
  );
}

// ── Job creation input (chat / upload) ─────────────────────────────────────────
function CreationInputMock({ accent }: { accent: string }) {
  return (
    <Frame title="Job Creation — Provide Jobs" accent={accent}
      caption="Either paste a job document into Job Builder Chat (left) or upload a spreadsheet (right). Pick the Task Type first.">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div style={box({ padding: 10 })}>
          <div className="flex items-center gap-2 mb-2"><Pin n={1} accent={accent} /><span className="text-[11px] font-bold text-slate-300">Job Builder Chat</span></div>
          <div className="flex gap-1 mb-2">
            {['Unix','Windows','SQL'].map((t, i) => (
              <span key={t} className="px-2 py-0.5 rounded text-[9px] font-mono"
                style={{ background: i===0 ? `${accent}22` : 'rgba(51,65,85,0.2)', color: i===0 ? accent : '#64748b' }}>{t}</span>
            ))}
          </div>
          <div className="px-2 py-2 text-[10px] font-mono text-slate-600 leading-relaxed h-20 overflow-hidden" style={box()}>
            Job Name = PMFG-BU-AS1-...<br/>Job Workstation = A0021I10P3...<br/>Job Script = /usr/bin/bash ...
          </div>
          <div className="mt-2 px-3 py-1.5 inline-block text-[10px] font-bold rounded" style={{ background: `${accent}1a`, color: accent }}>Parse</div>
        </div>
        <div style={box({ padding: 10 })}>
          <div className="flex items-center gap-2 mb-2"><Pin n={2} accent={accent} /><span className="text-[11px] font-bold text-slate-300">Spreadsheet Upload</span></div>
          <div className="flex flex-col items-center justify-center h-28 rounded-lg border border-dashed" style={{ borderColor: 'rgba(51,65,85,0.5)' }}>
            <svg className="w-7 h-7 mb-1" fill="none" stroke="#64748b" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 11l3-3m0 0l3 3m-3-3v12"/></svg>
            <span className="text-[10px] text-slate-500">Drop .xlsx / .ods / .csv</span>
          </div>
        </div>
      </div>
    </Frame>
  );
}

// ── Execute progress ───────────────────────────────────────────────────────────
function CreationExecuteMock({ accent }: { accent: string }) {
  const steps = [
    { t: 'Agent resolved → A0021I10P3_DD_94', c: '#4ade80' },
    { t: 'Task created → PMFG-BU-AS1-MFG-I10-B2CPAYLD', c: '#4ade80' },
    { t: 'Trigger created (DISABLED) → …-TR001', c: '#fbbf24' },
  ];
  return (
    <Frame title="Job Creation — Execute & Verify" accent={accent}
      caption="Live progress per job. Triggers are created disabled; use Verify, then Enable to go live.">
      <div className="space-y-1.5 mb-3">
        {steps.map((s, i) => (
          <div key={i} className="flex items-center gap-2 text-[11px] font-mono" style={box({ padding: '6px 10px' })}>
            <span style={{ color: s.c }}>{i === 2 ? '!' : '✓'}</span>
            <span className="text-slate-400">{s.t}</span>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <span className="px-3 py-1.5 text-[10px] font-bold rounded" style={{ background: 'rgba(6,182,212,0.12)', color: '#67e8f9' }}>Verify</span>
        <span className="px-3 py-1.5 text-[10px] font-bold rounded" style={{ background: 'rgba(34,197,94,0.12)', color: '#4ade80' }}>Enable Trigger</span>
      </div>
    </Frame>
  );
}

// ── Deletion input ──────────────────────────────────────────────────────────────
function DeletionInputMock({ accent }: { accent: string }) {
  return (
    <Frame title="Job Deletion — Enter Jobs" accent={accent}
      caption="Paste one task name per line, keep Backup enabled, then Delete. A confirmation step follows.">
      <div className="space-y-2.5 max-w-lg">
        <div className="flex items-start gap-2">
          <Pin n={1} accent={accent} />
          <div className="flex-1 px-3 py-2 text-[10px] font-mono text-slate-500 leading-relaxed h-16" style={box()}>
            PMFG-BU-AS1-MFG-I10-TESTJOB1<br/>PMFG-BU-AS1-MFG-I10-TESTJOB2
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="px-4 py-1.5 text-[11px] font-bold rounded-lg" style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.35)', color: '#fca5a5' }}>Delete 2 Jobs</span>
          <span className="flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded" style={{ background: 'rgba(139,92,246,0.12)', color: '#c4b5fd' }}>
            <Pin n={2} accent={accent} /> Backup Before Delete
          </span>
        </div>
      </div>
    </Frame>
  );
}

// ── Deletion confirm modal ───────────────────────────────────────────────────────
function DeletionConfirmMock({ accent }: { accent: string }) {
  return (
    <Frame title="Job Deletion — Confirmation" accent={accent}
      caption="A modal lists the jobs to be deleted and requires explicit confirmation to guard against accidental bulk deletes.">
      <div className="max-w-sm mx-auto rounded-xl p-4" style={{ background: 'linear-gradient(145deg, rgba(20,8,8,0.9), rgba(10,4,4,0.95))', border: '1px solid rgba(239,68,68,0.3)' }}>
        <div className="flex justify-center mb-2">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)' }}>
            <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z"/></svg>
          </div>
        </div>
        <p className="text-center text-xs font-bold text-slate-100 mb-1">Confirm Deletion</p>
        <p className="text-center text-[10px] text-slate-500 mb-3">You are about to delete <span className="text-red-400 font-bold">2 job(s)</span>. This cannot be undone without a backup.</p>
        <div className="flex gap-2 justify-center">
          <span className="px-3 py-1.5 text-[10px] font-bold rounded" style={{ background: 'rgba(239,68,68,0.15)', color: '#fca5a5' }}>Delete</span>
          <span className="px-3 py-1.5 text-[10px] rounded text-slate-500" style={{ border: '1px solid rgba(51,65,85,0.3)' }}>Cancel</span>
        </div>
      </div>
    </Frame>
  );
}

// ── Deletion job cards ────────────────────────────────────────────────────────────
function DeletionCardsMock({ accent }: { accent: string }) {
  const steps = [
    { t: 'Task is in 1 workflow(s): SB-Unix-Test-086-Workflow', s: '!', c: '#fbbf24', cat: 'wf' },
    { t: 'Deleted workflow trigger: …-Workflow-TR001', s: '✓', c: '#4ade80', cat: 'tr' },
    { t: 'Workflow deleted (all tasks removed)', s: '✓', c: '#4ade80', cat: 'wf' },
    { t: 'Task deleted: SB-Unix-Test-086', s: '✓', c: '#4ade80', cat: '' },
  ];
  return (
    <Frame title="Job Deletion — Per-Job Result" accent={accent}
      caption="Each card streams live steps. WF = workflow action, TR = trigger action. Final status shows DELETED/FAILED with ok/warn/error counts.">
      <div className="rounded-xl p-3" style={{ background: 'rgba(4,20,12,0.5)', border: '1px solid rgba(34,197,94,0.2)' }}>
        <div className="flex items-center gap-2 mb-2">
          <span className="w-4 h-4 rounded-full flex items-center justify-center" style={{ background: 'rgba(34,197,94,0.15)' }}>
            <svg className="w-2.5 h-2.5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7"/></svg>
          </span>
          <span className="text-[11px] font-mono font-bold text-slate-200 flex-1">SB-Unix-Test-086</span>
          <span className="px-1.5 py-0.5 rounded text-[8px] font-bold" style={{ background: 'rgba(168,85,247,0.12)', color: '#c084fc' }}>WF</span>
          <span className="px-1.5 py-0.5 rounded text-[8px] font-bold" style={{ background: 'rgba(251,191,36,0.1)', color: '#fbbf24' }}>TR</span>
          <span className="text-[9px] font-mono font-bold text-emerald-400">DELETED</span>
        </div>
        <div className="space-y-1 ml-6">
          {steps.map((s, i) => (
            <div key={i} className="flex items-center gap-2 text-[10px] font-mono px-2 py-1 rounded"
              style={{ background: s.cat === 'wf' ? 'rgba(168,85,247,0.06)' : s.cat === 'tr' ? 'rgba(251,191,36,0.05)' : 'transparent' }}>
              <span style={{ color: s.c }}>{s.s}</span>
              <span className="text-slate-400 flex-1">{s.t}</span>
              {s.cat && <span className="text-[7px] uppercase tracking-widest" style={{ color: s.cat === 'wf' ? '#a855f7' : '#f59e0b' }}>{s.cat}</span>}
            </div>
          ))}
        </div>
      </div>
    </Frame>
  );
}

// ── Recovery center ─────────────────────────────────────────────────────────────
function DeletionRecoveryMock({ accent }: { accent: string }) {
  return (
    <Frame title="Job Deletion — Recovery Center" accent={accent}
      caption="After a backup, recoverable jobs are listed. Click Recover, or re-upload the backup file to restore in bulk.">
      <div style={box({ padding: 12 })}>
        <div className="flex items-center gap-2 mb-3">
          <svg className="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
          <span className="text-[11px] font-bold text-slate-300">Recovery Center</span>
          <span className="ml-auto px-2.5 py-1 text-[9px] font-bold rounded" style={{ background: 'rgba(6,182,212,0.08)', color: '#67e8f9' }}>Upload to Restore</span>
        </div>
        {['SB-Unix-Test-086', 'SB-Unix-Test-087'].map(n => (
          <div key={n} className="flex items-center gap-3 px-3 py-2 rounded-lg mb-1" style={{ background: 'rgba(139,92,246,0.04)', border: '1px solid rgba(139,92,246,0.1)' }}>
            <span className="text-[10px] font-mono text-slate-400 flex-1">{n}</span>
            <span className="text-[9px] font-mono text-slate-600">taskUnix</span>
            <span className="px-2.5 py-1 rounded text-[9px] font-bold" style={{ background: 'rgba(139,92,246,0.12)', color: '#c4b5fd' }}>Recover</span>
          </div>
        ))}
      </div>
    </Frame>
  );
}

const REGISTRY: Record<string, (p: { accent: string }) => JSX.Element> = {
  'connect': ConnectMock,
  'creation-input': CreationInputMock,
  'creation-execute': CreationExecuteMock,
  'deletion-input': DeletionInputMock,
  'deletion-confirm': DeletionConfirmMock,
  'deletion-cards': DeletionCardsMock,
  'deletion-recovery': DeletionRecoveryMock,
};

export default function SopMockup({ name, accent }: { name: string; accent: string }) {
  const Comp = REGISTRY[name];
  if (!Comp) return null;
  return <Comp accent={accent} />;
}
