'use client';
import { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { JobRow } from '@/types';
import { ExplainPayload } from '@/components/copilot';

// ── Drop Zone ────────────────────────────────────────────────────────────────
export function DropZone({ onFile, hasData }: { onFile: (f: File) => void; hasData: boolean }) {
  const [dragging, setDragging] = useState(false);
  const [error, setError]       = useState('');
  const ref = useRef<HTMLInputElement>(null);

  const validate = (file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    if (!['csv','xlsx','ods'].includes(ext)) { setError('Use CSV, XLSX or ODS.'); return false; }
    if (file.size > 10 * 1024 * 1024)       { setError('File exceeds 10 MB.');   return false; }
    setError(''); return true;
  };

  const handle = (file: File) => { if (validate(file)) onFile(file); };

  return (
    <motion.div
      onDragOver={e => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) handle(f); }}
      onClick={() => ref.current?.click()}
      className="relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-300 overflow-hidden group"
      style={{
        borderColor: dragging ? '#06b6d4' : hasData ? 'rgba(34,197,94,0.4)' : 'rgba(51,65,85,0.4)',
        background: dragging ? 'rgba(6,182,212,0.04)' : hasData ? 'rgba(34,197,94,0.02)' : 'transparent',
      }}
    >
      {/* Shimmer on hover */}
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse at 50% 50%, rgba(6,182,212,0.04), transparent 70%)' }} />

      <input ref={ref} type="file" className="hidden" accept=".csv,.xlsx,.ods"
        onChange={e => { const f = e.target.files?.[0]; if (f) handle(f); }} />

      <div className="flex flex-col items-center gap-3 relative z-10">
        <div className="w-12 h-12 rounded-xl flex items-center justify-center"
          style={{
            background: hasData ? 'rgba(34,197,94,0.1)' : 'rgba(6,182,212,0.08)',
            border: hasData ? '1px solid rgba(34,197,94,0.2)' : '1px solid rgba(6,182,212,0.15)',
          }}>
          {hasData
            ? <svg className="w-6 h-6 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
            : <svg className="w-6 h-6 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
          }
        </div>
        <p className="text-sm font-medium text-slate-300">
          {hasData ? 'File parsed — drop another to replace' : 'Drag and drop the job file here'}
        </p>
        <p className="text-[10px] text-slate-600 font-mono">CSV / XLSX / ODS — Max 10 MB</p>
        {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
      </div>
    </motion.div>
  );
}

// ── Parsed Table ─────────────────────────────────────────────────────────────
export function ParsedTable({ rows }: { rows: JobRow[] }) {
  return (
    <div className="h-72 rounded-xl overflow-hidden flex flex-col"
      style={{ background: 'rgba(2,8,16,0.8)', border: '1px solid rgba(51,65,85,0.3)' }}>
      <div className="px-4 py-2.5 border-b shrink-0 flex items-center justify-between"
        style={{ borderColor: 'rgba(51,65,85,0.3)', background: 'rgba(6,15,30,0.5)' }}>
        <span className="text-[10px] font-mono text-slate-500">{rows.length} row(s) parsed</span>
        <span className="text-[9px] font-mono text-slate-700">PREVIEW</span>
      </div>
      <div className="overflow-auto flex-1">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0" style={{ background: '#060f1e' }}>
            <tr>
              {['Task Name','Type','Agent','Command','Enabled','Ref Job'].map(h => (
                <th key={h} className="px-3 py-2 text-[10px] text-slate-500 font-semibold whitespace-nowrap uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="border-t hover:bg-slate-800/20 transition-colors" style={{ borderColor: 'rgba(51,65,85,0.2)' }}>
                <td className="px-3 py-2 text-cyan-300 font-medium whitespace-nowrap max-w-[160px] truncate font-mono text-[11px]">{row.task_name}</td>
                <td className="px-3 py-2 text-slate-400 text-[11px]">{row.task_type}</td>
                <td className="px-3 py-2 text-slate-400 whitespace-nowrap text-[11px]">{row.agent}</td>
                <td className="px-3 py-2 text-slate-500 max-w-[140px] truncate font-mono text-[10px]">{row.command}</td>
                <td className="px-3 py-2">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${row.enabled === 'true' ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
                    {row.enabled}
                  </span>
                </td>
                <td className="px-3 py-2 text-purple-400 whitespace-nowrap text-[11px] font-mono">{row.ref_job || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── JSON Panel ───────────────────────────────────────────────────────────────
export function JsonPanel({
  data,
  maxH = 'h-72',
  /** Job name, so the Copilot can explain this exact payload when asked. */
  explainName,
}: { data: any; maxH?: string; explainName?: string }) {
  const json = JSON.stringify(data, null, 2);

  // Syntax highlight
  const highlighted = json
    .replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, match => {
      if (/^"/.test(match)) {
        if (/:$/.test(match)) return `<span style="color:#67e8f9">${match}</span>`;
        return `<span style="color:#86efac">${match}</span>`;
      }
      if (/true|false/.test(match)) return `<span style="color:#f9a8d4">${match}</span>`;
      if (/null/.test(match))       return `<span style="color:#64748b">${match}</span>`;
      return `<span style="color:#fbbf24">${match}</span>`;
    });

  return (
    <div className={`${maxH} rounded-xl overflow-hidden flex flex-col`}
      style={{ background: 'rgba(2,8,16,0.8)', border: '1px solid rgba(51,65,85,0.3)' }}>
      <div className="px-4 py-2.5 border-b shrink-0 flex items-center gap-2"
        style={{ borderColor: 'rgba(51,65,85,0.3)', background: 'rgba(6,15,30,0.5)' }}>
        <motion.div className="w-2 h-2 rounded-full bg-cyan-500"
          animate={{ opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 2, repeat: Infinity }} />
        <span className="text-[10px] font-mono text-slate-500">JSON PAYLOAD</span>
        <span className="flex-1" />
        {/* Every generated payload is explainable field by field. */}
        <ExplainPayload name={explainName} label="Explain" />
      </div>
      <div className="overflow-auto flex-1 p-4">
        <pre className="text-[11px] font-mono leading-relaxed"
          dangerouslySetInnerHTML={{ __html: highlighted }} />
      </div>
    </div>
  );
}

// ── Merge Table ──────────────────────────────────────────────────────────────
export function MergeTable({ rows }: { rows: any[] }) {
  return (
    <div className="rounded-xl overflow-hidden"
      style={{ background: 'rgba(2,8,16,0.8)', border: '1px solid rgba(51,65,85,0.3)' }}>
      <table className="w-full text-sm">
        <thead style={{ background: 'rgba(6,15,30,0.8)' }}>
          <tr>
            {['Task','Field','Input','Ref Job','Final'].map(h => (
              <th key={h} className="px-4 py-3 text-left text-[10px] text-slate-500 font-semibold uppercase tracking-wider">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <motion.tr key={i} initial={{ opacity:0, x:-8 }} animate={{ opacity:1, x:0 }} transition={{ delay: i * 0.02 }}
              className="border-t hover:bg-slate-800/20 transition-colors" style={{ borderColor: 'rgba(51,65,85,0.2)' }}>
              <td className="px-4 py-2.5 text-cyan-300 text-[11px] font-mono whitespace-nowrap">{row.taskName}</td>
              <td className="px-4 py-2.5 text-slate-300 text-xs font-medium">{row.field}</td>
              <td className="px-4 py-2.5 text-blue-400 text-xs font-mono">{row.inputValue}</td>
              <td className="px-4 py-2.5 text-purple-400 text-xs font-mono">{row.referenceValue}</td>
              <td className="px-4 py-2.5 text-xs">
                <span className={`font-semibold ${row.isInherited ? 'text-yellow-300' : 'text-green-400'}`}>
                  {row.finalValue}
                </span>
                {row.isInherited && (
                  <span className="ml-2 text-[9px] text-yellow-500/70 px-1.5 py-0.5 rounded font-medium"
                    style={{ background: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.15)' }}>
                    inherited
                  </span>
                )}
              </td>
            </motion.tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
