'use client';
import { useState } from 'react';
import { motion } from 'framer-motion';
import GlobalHeader from '@/components/GlobalHeader';
import { ABOUT_TOOL_DOC, type AboutSection } from '@/data/aboutToolContent';

function FlowDiagram({ diagram }: { diagram: NonNullable<AboutSection['diagram']> }) {
  if (!diagram.nodes || !diagram.edges) return null;

  const nodeColors = {
    start: '#10b981',
    end: '#ef4444',
    process: '#3b82f6',
    decision: '#f59e0b',
    data: '#8b5cf6',
  };

  return (
    <div className="my-6 p-6 rounded-xl bg-slate-900/40 border border-slate-700/30">
      <p className="text-xs text-slate-400 mb-4">{diagram.description}</p>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {diagram.nodes.map((node) => (
          <motion.div
            key={node.id}
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            className="p-3 rounded-lg text-center"
            style={{
              background: `${nodeColors[node.type]}15`,
              border: `1px solid ${nodeColors[node.type]}40`,
            }}
          >
            <div
              className="w-10 h-10 mx-auto mb-2 rounded-full flex items-center justify-center text-xs font-bold"
              style={{
                background: `${nodeColors[node.type]}20`,
                color: nodeColors[node.type],
              }}
            >
              {node.id.substring(0, 2).toUpperCase()}
            </div>
            <p className="text-[10px] text-slate-300 leading-tight whitespace-pre-line">
              {node.label}
            </p>
          </motion.div>
        ))}
      </div>
      <div className="mt-4 pt-4 border-t border-slate-700/30">
        <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-2">
          Flow Connections
        </p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {diagram.edges.map((edge, i) => (
            <div key={i} className="flex items-center gap-2 text-[10px] text-slate-400">
              <span className="text-cyan-400">{edge.from}</span>
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 7l5 5m0 0l-5 5m5-5H6"
                />
              </svg>
              <span className="text-cyan-400">{edge.to}</span>
              {edge.label && <span className="text-slate-600">({edge.label})</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function DataTable({ table }: { table: NonNullable<AboutSection['table']> }) {
  return (
    <div className="my-4 overflow-x-auto rounded-xl border border-slate-700/30">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr>
            {table.columns.map((col, i) => (
              <th
                key={i}
                className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-200 bg-slate-800/50 border-b border-slate-700/30"
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, ri) => (
            <tr
              key={ri}
              className={ri % 2 === 0 ? 'bg-slate-900/20' : 'bg-transparent'}
            >
              {row.map((cell, ci) => (
                <td
                  key={ci}
                  className="px-4 py-3 text-xs text-slate-400 align-top border-b border-slate-700/10 whitespace-pre-line"
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CodeExample({ example }: { example: NonNullable<AboutSection['codeExample']> }) {
  return (
    <div className="my-4">
      <p className="text-xs text-slate-400 mb-2">{example.description}</p>
      <div className="rounded-xl bg-slate-950 border border-slate-700/30 p-4">
        <pre className="text-[11px] text-slate-300 overflow-x-auto">
          <code>{example.code}</code>
        </pre>
      </div>
    </div>
  );
}

function Section({ section }: { section: AboutSection }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-50px' }}
      className="glass-card p-6 mb-5"
    >
      <div className="flex items-center gap-2 mb-3">
        <div className="w-1 h-5 rounded-full bg-cyan-400" />
        <h2 className="text-base font-bold text-slate-100">{section.heading}</h2>
      </div>

      {section.intro && (
        <p className="text-xs text-slate-400 leading-relaxed mb-4">{section.intro}</p>
      )}

      {section.content && (
        <div className="space-y-2">
          {section.content.map((line, i) => (
            <p key={i} className="text-xs text-slate-400 leading-relaxed">
              {line}
            </p>
          ))}
        </div>
      )}

      {section.subsections && (
        <div className="space-y-4 mt-4">
          {section.subsections.map((sub, i) => (
            <div key={i} className="pl-3 border-l-2 border-cyan-400/20">
              <h3 className="text-sm font-bold text-slate-200 mb-2">{sub.title}</h3>
              <ul className="space-y-1.5">
                {sub.points.map((point, j) => (
                  <li key={j} className="flex gap-2 text-xs text-slate-400">
                    <span className="text-cyan-400 shrink-0">▸</span>
                    <span className="leading-relaxed whitespace-pre-line">{point}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {section.diagram && <FlowDiagram diagram={section.diagram} />}
      {section.table && <DataTable table={section.table} />}
      {section.codeExample && <CodeExample example={section.codeExample} />}
    </motion.section>
  );
}

export default function AboutToolPage() {
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const { generateAboutToolDocx } = await import('@/utils/aboutToolDocx');
      await generateAboutToolDocx(ABOUT_TOOL_DOC);
    } catch (e: any) {
      console.error('DOCX export failed', e);
      const msg = e?.message || e?.toString?.() || 'Unknown error';
      alert('Could not generate the DOCX:\n\n' + msg + '\n\n(Open console for full error.)');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="min-h-screen relative" style={{ background: 'var(--bg-deep)' }}>
      {/* Ambient background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <motion.div
          className="absolute w-[500px] h-[500px] rounded-full"
          style={{
            background: 'radial-gradient(circle, rgba(6,182,212,0.1) 0%, transparent 70%)',
            right: '-10%',
            top: '5%',
          }}
          animate={{ y: [0, -20, 0], scale: [1, 1.05, 1] }}
          transition={{ duration: 16, repeat: Infinity, ease: 'easeInOut' }}
        />
        <div
          className="absolute inset-0 opacity-[0.015]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(6,182,212,0.4) 1px, transparent 1px), linear-gradient(90deg, rgba(6,182,212,0.4) 1px, transparent 1px)',
            backgroundSize: '72px 72px',
          }}
        />
      </div>

      <GlobalHeader
        title="About the Tool"
        subtitle="Technical Documentation & Architecture"
      />

      <main className="max-w-6xl mx-auto px-6 pb-24 pt-6 relative z-10">
        {/* Title / cover */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card p-7 relative overflow-hidden mb-6"
        >
          <div
            className="absolute top-0 left-0 right-0 h-[3px]"
            style={{
              background:
                'linear-gradient(90deg, transparent, rgba(6,182,212,1), transparent)',
            }}
          />
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex-1 min-w-[240px]">
              <span className="text-[10px] font-mono font-bold tracking-widest uppercase text-cyan-400">
                TECHNICAL DOCUMENTATION · v{ABOUT_TOOL_DOC.version}
              </span>
              <h1 className="text-2xl font-black text-slate-100 mt-1.5 leading-tight">
                {ABOUT_TOOL_DOC.title}
              </h1>
              <p className="text-sm text-slate-500 mt-1">{ABOUT_TOOL_DOC.subtitle}</p>
            </div>

            <motion.button
              onClick={handleDownload}
              disabled={downloading}
              whileHover={{ scale: 1.03, y: -1 }}
              whileTap={{ scale: 0.97 }}
              className="px-5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 disabled:opacity-50 shrink-0"
              style={{
                background: 'rgba(6,182,212,0.1)',
                border: '1px solid rgba(6,182,212,0.3)',
                color: '#06b6d4',
              }}
            >
              {downloading ? (
                <>
                  <motion.div
                    className="w-3.5 h-3.5 rounded-full border-2 border-current border-t-transparent"
                    animate={{ rotate: 360 }}
                    transition={{ duration: 0.7, repeat: Infinity, ease: 'linear' }}
                  />
                  Generating...
                </>
              ) : (
                <>
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                  Download DOCX
                </>
              )}
            </motion.button>
          </div>

          {/* Meta grid */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-6">
            {[
              { k: 'Version', v: ABOUT_TOOL_DOC.version },
              { k: 'Last Updated', v: ABOUT_TOOL_DOC.lastUpdated },
              { k: 'Format', v: 'Web + DOCX Export' },
            ].map((m) => (
              <div key={m.k} className="text-center">
                <p className="text-[10px] text-slate-600 uppercase font-bold tracking-wider">
                  {m.k}
                </p>
                <p className="text-xs text-slate-400 mt-0.5">{m.v}</p>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Sections */}
        <div className="space-y-5">
          {ABOUT_TOOL_DOC.sections.map((section, i) => (
            <Section key={i} section={section} />
          ))}
        </div>
      </main>
    </div>
  );
}
