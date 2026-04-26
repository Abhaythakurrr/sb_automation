'use client';
import { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { JobRow } from '@/types';

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
      animate={{ borderColor: dragging ? '#06b6d4' : hasData ? '#22c55e' : 'rgba(100,116,139,0.4)' }}
      className="border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-colors duration-300"
      style={{ background: dragging ? 'rgba(6,182,212,0.05)' : hasData ? 'rgba(34,197,94,0.03)' : 'transparent' }}
    >
      <input ref={ref} type="file" className="hidden" accept=".csv,.xlsx,.ods"
        onChange={e => { const f = e.target.files?.[0]; if (f) handle(f); }} />

      <div className="flex flex-col items-center gap-3">
        <div className="w-14 h-14 rounded-full flex items-center justify-center"
          style={{ background: hasData ? 'rgba(34,197,94,0.15)' : 'rgba(6,182,212,0.1)', boxShadow: hasData ? '0 0 20px rgba(34,197,94,0.2)' : '0 0 20px rgba(6,182,212,0.15)' }}>
          {hasData
            ? <svg className="w-7 h-7 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
            : <svg className="w-7 h-7 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
          }
        </div>
        <p className="text-sm font-medium text-slate-300">
          {hasData ? 'File parsed — drop another to replace' : 'Drag & drop your job file here'}
        </p>
        <p className="text-xs text-slate-500">CSV · XLSX · ODS · Max 10 MB</p>
        {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
      </div>
    </motion.div>
  );
}

// ── Parsed Table ─────────────────────────────────────────────────────────────
export function ParsedTable({ rows }: { rows: JobRow[] }) {
  return (
    <div className="h-72 rounded-xl border border-slate-700/50 overflow-hidden flex flex-col"
      style={{ background: 'rgba(2,8,16,0.6)' }}>
      <div className="px-4 py-2 border-b border-slate-700/40 shrink-0">
        <span className="text-xs font-mono text-slate-500">{rows.length} row(s)</span>
      </div>
      <div className="overflow-auto flex-1">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0" style={{ background: '#0a1628' }}>
            <tr>
              {['Task Name','Type','Agent','Command','Enabled','Ref Job'].map(h => (
                <th key={h} className="px-3 py-2 text-slate-500 font-medium whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="border-t border-slate-800/50 hover:bg-slate-800/20 transition-colors">
                <td className="px-3 py-2 text-cyan-300 font-medium whitespace-nowrap max-w-[160px] truncate">{row.task_name}</td>
                <td className="px-3 py-2 text-slate-400">{row.task_type}</td>
                <td className="px-3 py-2 text-slate-400 whitespace-nowrap">{row.agent}</td>
                <td className="px-3 py-2 text-slate-500 max-w-[140px] truncate">{row.command}</td>
                <td className="px-3 py-2">
                  <span className={`px-2 py-0.5 rounded text-xs ${row.enabled === 'true' ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'}`}>
                    {row.enabled}
                  </span>
                </td>
                <td className="px-3 py-2 text-purple-400 whitespace-nowrap">{row.ref_job || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── JSON Panel ───────────────────────────────────────────────────────────────
export function JsonPanel({ data, maxH = 'h-72' }: { data: any; maxH?: string }) {
  const json = JSON.stringify(data, null, 2);

  // Syntax highlight
  const highlighted = json
    .replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, match => {
      if (/^"/.test(match)) {
        if (/:$/.test(match)) return `<span style="color:#67e8f9">${match}</span>`;
        return `<span style="color:#86efac">${match}</span>`;
      }
      if (/true|false/.test(match)) return `<span style="color:#f9a8d4">${match}</span>`;
      if (/null/.test(match))       return `<span style="color:#94a3b8">${match}</span>`;
      return `<span style="color:#fbbf24">${match}</span>`;
    });

  return (
    <div className={`${maxH} rounded-xl border border-slate-700/50 overflow-hidden flex flex-col`}
      style={{ background: 'rgba(2,8,16,0.6)' }}>
      <div className="px-4 py-2 border-b border-slate-700/40 shrink-0 flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-cyan-500 animate-pulse" />
        <span className="text-xs font-mono text-slate-500">JSON Preview</span>
      </div>
      <div className="overflow-auto flex-1 p-4">
        <pre className="text-xs font-mono leading-relaxed"
          dangerouslySetInnerHTML={{ __html: highlighted }} />
      </div>
    </div>
  );
}

// ── Merge Table ──────────────────────────────────────────────────────────────
export function MergeTable({ rows }: { rows: any[] }) {
  return (
    <div className="rounded-xl border border-slate-700/50 overflow-hidden"
      style={{ background: 'rgba(2,8,16,0.6)' }}>
      <table className="w-full text-sm">
        <thead style={{ background: '#0a1628' }}>
          <tr>
            {['Task','Field','Input','Ref Job','Final'].map(h => (
              <th key={h} className="px-4 py-3 text-left text-slate-500 font-medium text-xs">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <motion.tr key={i} initial={{ opacity:0, x:-8 }} animate={{ opacity:1, x:0 }} transition={{ delay: i * 0.03 }}
              className="border-t border-slate-800/50 hover:bg-slate-800/20 transition-colors">
              <td className="px-4 py-2.5 text-cyan-300 text-xs font-mono whitespace-nowrap">{row.taskName}</td>
              <td className="px-4 py-2.5 text-slate-300 text-xs font-medium">{row.field}</td>
              <td className="px-4 py-2.5 text-blue-400 text-xs">{row.inputValue}</td>
              <td className="px-4 py-2.5 text-purple-400 text-xs">{row.referenceValue}</td>
              <td className="px-4 py-2.5 text-xs">
                <span className={`font-semibold ${row.isInherited ? 'text-yellow-300' : 'text-green-400'}`}>
                  {row.finalValue}
                </span>
                {row.isInherited && (
                  <span className="ml-2 text-[10px] text-yellow-500/70 bg-yellow-500/10 px-1.5 py-0.5 rounded">inherited</span>
                )}
              </td>
            </motion.tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
