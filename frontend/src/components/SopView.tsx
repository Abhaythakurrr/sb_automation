'use client';
import { useState } from 'react';
import { motion } from 'framer-motion';
import GlobalHeader from '@/components/GlobalHeader';
import SopMockup from '@/components/SopMockups';
import type { Sop, SopSection, CalloutKind } from '@/data/sopContent';
import { createLogger } from '@/utils/logger';
import { useToast } from '@/components/ui/Toast';

const log = createLogger('SopView');

const CALLOUT_THEME: Record<CalloutKind, { bg: string; border: string; text: string; label: string; icon: string }> = {
  info:    { bg: 'rgba(59,130,246,0.08)',  border: 'rgba(59,130,246,0.3)',  text: '#93c5fd', label: 'NOTE',      icon: 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
  warning: { bg: 'rgba(245,158,11,0.08)',  border: 'rgba(245,158,11,0.3)',  text: '#fbbf24', label: 'IMPORTANT', icon: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z' },
  success: { bg: 'rgba(34,197,94,0.08)',   border: 'rgba(34,197,94,0.3)',   text: '#4ade80', label: 'TIP',       icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z' },
  danger:  { bg: 'rgba(239,68,68,0.08)',   border: 'rgba(239,68,68,0.3)',   text: '#f87171', label: 'CAUTION',   icon: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z' },
};

function Callout({ kind, title, body }: { kind: CalloutKind; title: string; body: string }) {
  const t = CALLOUT_THEME[kind];
  return (
    <motion.div initial={{ opacity: 0, x: -8 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }}
      className="rounded-xl p-4 flex gap-3" style={{ background: t.bg, border: `1px solid ${t.border}`, borderLeftWidth: 4 }}>
      <svg className="w-5 h-5 shrink-0 mt-0.5" fill="none" stroke={t.text} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={t.icon} />
      </svg>
      <div>
        <p className="text-[11px] font-bold tracking-wider mb-0.5" style={{ color: t.text }}>{t.label} — {title}</p>
        <p className="text-xs text-slate-400 leading-relaxed">{body}</p>
      </div>
    </motion.div>
  );
}

function DataTable({ columns, rows, accent }: { columns: string[]; rows: string[][]; accent: string }) {
  return (
    <div className="overflow-x-auto rounded-xl" style={{ border: '1px solid rgba(51,65,85,0.25)' }}>
      <table className="w-full text-left border-collapse">
        <thead>
          <tr>
            {columns.map((c, i) => (
              <th key={i} className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-slate-200"
                style={{ background: `${accent}22`, borderBottom: `1px solid ${accent}44` }}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri} style={{ background: ri % 2 === 0 ? 'rgba(2,8,18,0.4)' : 'transparent' }}>
              {r.map((cell, ci) => (
                <td key={ci} className="px-4 py-2.5 text-xs text-slate-400 align-top"
                  style={{ borderBottom: '1px solid rgba(51,65,85,0.12)' }}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StepItem({ index, title, detail, substeps, accent }: { index: number; title: string; detail: string; substeps?: string[]; accent: string }) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
      className="flex gap-3">
      <div className="flex flex-col items-center shrink-0">
        <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
          style={{ background: `${accent}1a`, border: `1px solid ${accent}55`, color: accent }}>{index}</div>
        <div className="w-[1px] flex-1 mt-1" style={{ background: 'rgba(51,65,85,0.3)' }} />
      </div>
      <div className="pb-5 flex-1">
        <p className="text-sm font-bold text-slate-200 mb-1">{title}</p>
        <p className="text-xs text-slate-400 leading-relaxed">{detail}</p>
        {substeps && substeps.length > 0 && (
          <ul className="mt-2 space-y-1">
            {substeps.map((s, i) => (
              <li key={i} className="flex gap-2 text-[11px] text-slate-500">
                <span style={{ color: accent }}>▸</span><span className="leading-relaxed">{s}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </motion.div>
  );
}

function Section({ section, accent }: { section: SopSection; accent: string }) {
  return (
    <motion.section initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-50px' }}
      className="glass-card p-6">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-1 h-5 rounded-full" style={{ background: accent }} />
        <h2 className="text-base font-bold text-slate-100">{section.heading}</h2>
      </div>
      {section.intro && <p className="text-xs text-slate-400 leading-relaxed mb-4">{section.intro}</p>}

      {section.steps && (
        <div className="mt-2">
          {section.steps.map((s, i) => (
            <StepItem key={i} index={i + 1} title={s.title} detail={s.detail} substeps={s.substeps} accent={accent} />
          ))}
        </div>
      )}

      {section.bullets && (
        <ul className="space-y-2 mt-1">
          {section.bullets.map((b, i) => (
            <li key={i} className="flex gap-2.5 text-xs text-slate-300 leading-relaxed">
              <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" stroke={accent} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
              {b}
            </li>
          ))}
        </ul>
      )}

      {section.table && <div className="mt-3"><DataTable columns={section.table.columns} rows={section.table.rows} accent={accent} /></div>}

      {section.callout && <div className="mt-4"><Callout kind={section.callout.kind} title={section.callout.title} body={section.callout.body} /></div>}

      {section.mockups && section.mockups.length > 0 && (
        <div className="mt-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-600 mb-1">Screen reference</p>
          {section.mockups.map((m, i) => <SopMockup key={i} name={m} accent={accent} />)}
        </div>
      )}
    </motion.section>
  );
}

export default function SopView({ sop }: { sop: Sop }) {
  const [downloading, setDownloading] = useState(false);
  const toast = useToast();
  const accent = sop.accent;

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const { generateSopDocx } = await import('@/utils/sopDocx');
      await generateSopDocx(sop);
    } catch (e: any) {
      log.error('DOCX export failed', e);
      const msg = e?.message || e?.toString?.() || 'Unknown error';
      toast.error('Could not generate the DOCX: ' + msg);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="min-h-screen relative" style={{ background: 'var(--bg-deep)' }}>
      {/* Ambient background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <motion.div className="absolute w-[500px] h-[500px] rounded-full"
          style={{ background: `radial-gradient(circle, ${accent}0a 0%, transparent 70%)`, right: '-10%', top: '5%' }}
          animate={{ y: [0, -20, 0], scale: [1, 1.05, 1] }} transition={{ duration: 16, repeat: Infinity, ease: 'easeInOut' }} />
        <div className="absolute inset-0 opacity-[0.015]"
          style={{ backgroundImage: `linear-gradient(${accent}66 1px, transparent 1px), linear-gradient(90deg, ${accent}66 1px, transparent 1px)`, backgroundSize: '72px 72px' }} />
      </div>

      <GlobalHeader title="Standard Operating Procedure" subtitle={sop.docCode} />

      <main className="max-w-4xl mx-auto px-6 pb-24 pt-6 space-y-5 relative z-10">

        {/* Title / cover */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
          className="glass-card p-7 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-[3px]" style={{ background: `linear-gradient(90deg, transparent, ${accent}, transparent)` }} />
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex-1 min-w-[240px]">
              <span className="text-[10px] font-mono font-bold tracking-widest uppercase" style={{ color: accent }}>SOP · {sop.docCode}</span>
              <h1 className="text-2xl font-black text-slate-100 mt-1.5 leading-tight">{sop.title}</h1>
              <p className="text-sm text-slate-500 mt-1">{sop.subtitle}</p>
            </div>

            <motion.button onClick={handleDownload} disabled={downloading}
              whileHover={{ scale: 1.03, y: -1 }} whileTap={{ scale: 0.97 }}
              className="px-5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 disabled:opacity-50 shrink-0"
              style={{ background: `${accent}1a`, border: `1px solid ${accent}55`, color: accent }}>
              {downloading ? (
                <>
                  <motion.div className="w-3.5 h-3.5 rounded-full border-2 border-current border-t-transparent"
                    animate={{ rotate: 360 }} transition={{ duration: 0.7, repeat: Infinity, ease: 'linear' }} />
                  Generating...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Download DOCX
                </>
              )}
            </motion.button>
          </div>

          {/* Meta grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-6">
            {[
              { k: 'Version', v: sop.version },
              { k: 'Owner', v: sop.owner },
              { k: 'Audience', v: sop.audience },
              { k: 'Updated', v: new Date().toISOString().slice(0, 10) },
            ].map(m => (
              <div key={m.k} className="rounded-lg p-3" style={{ background: 'rgba(2,8,18,0.5)', border: '1px solid rgba(51,65,85,0.2)' }}>
                <p className="text-[9px] uppercase tracking-widest text-slate-600 font-bold">{m.k}</p>
                <p className="text-xs text-slate-300 mt-1 font-medium">{m.v}</p>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Purpose */}
        <motion.div initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="glass-card p-6">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-1 h-5 rounded-full" style={{ background: accent }} />
            <h2 className="text-base font-bold text-slate-100">Purpose</h2>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">{sop.purpose}</p>
        </motion.div>

        {/* Prerequisites */}
        <motion.div initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="glass-card p-6">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-1 h-5 rounded-full" style={{ background: accent }} />
            <h2 className="text-base font-bold text-slate-100">Prerequisites</h2>
          </div>
          <ul className="space-y-2">
            {sop.prerequisites.map((p, i) => (
              <li key={i} className="flex gap-2.5 text-xs text-slate-300 leading-relaxed">
                <span className="w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-bold shrink-0"
                  style={{ background: `${accent}1a`, color: accent }}>{i + 1}</span>
                {p}
              </li>
            ))}
          </ul>
        </motion.div>

        {/* Sections */}
        {sop.sections.map((s, i) => <Section key={i} section={s} accent={accent} />)}

        <footer className="section-line mt-10" />
        <p className="text-center text-[9px] font-mono py-4">
          <span className="neon-text-gold">DESIGNED AND ENGINEERED BY ABHAY THAKUR</span>
        </p>
      </main>
    </div>
  );
}
