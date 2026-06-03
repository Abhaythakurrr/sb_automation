'use client';
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { parseJobDoc, validateRow, EMPTY_ROW, JobRow } from '@/utils/jobDocParser';
import { TASK_TYPES } from '@/utils/taskTypeConfig';
import * as XLSX from 'xlsx';

export default function JobBuilderChat({ onGenerate }: { onGenerate: (rows: JobRow[]) => void }) {
  const [input, setInput]           = useState('');
  const [selectedType, setSelectedType] = useState('taskUnix');
  const [rows, setRows]             = useState<JobRow[]>([]);
  const [error, setError]           = useState('');

  const handleParse = () => {
    if (!input.trim()) return;
    const parsed = parseJobDoc(input);
    // Always use the selected task type from the UI — never from the job doc
    // "Job Type = Production" in the doc means environment, not task type
    parsed.task_type = selectedType;
    const errs = validateRow(parsed);
    if (errs.length > 0) { setError(errs.join(' · ')); return; }
    setError('');
    setRows(r => [...r, parsed]);
    setInput('');
  };

  const handleDownload = () => {
    if (!rows.length) return;
    const uiRows = rows.map(r => ({
      'Job Name':                    r.task_name,
      'Job Type':                    r.task_type,
      'Job Workstation':             r.agent,
      'Job Script':                  r.command,
      'Job Login Account':           r.credential,
      'Job Description':             r.description,
      'ServiceNow Group':            r.servicenow_group,
      'Firstrun Date':               r.first_run_date,
      'Job Starttime':               r.schedule_string || r.start_time || r.frequency_type,
      'Job Timezone':                r.timezone,
      'Scheduled Frequency':         r.frequency_type,
      'Maximum Runtime':             r.max_runtime,
      'Reference Job':               r.ref_job,
      'Member of Business Services': r.business_services,
      'ServiceNow Ticket':           r.servicenow_ticket,
      'Job Recovery1':               r.recovery1,
      'Job Recovery2':               r.recovery2,
    }));
    const ws = XLSX.utils.json_to_sheet(uiRows);
    ws['!cols'] = [
      { wch: 40 }, { wch: 14 }, { wch: 35 }, { wch: 100 },
      { wch: 18 }, { wch: 45 }, { wch: 30 }, { wch: 14 },
      { wch: 20 }, { wch: 20 }, { wch: 55 }, { wch: 10 },
      { wch: 35 }, { wch: 30 }, { wch: 18 }, { wch: 30 },
      { wch: 40 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Jobs');
    XLSX.writeFile(wb, 'stonebranch_jobs.xlsx');
  };

  const handleGenerate = () => {
    if (!rows.length) return;
    handleDownload();
    onGenerate(rows);
  };

  const handleDownloadTemplate = () => {
    const template = [{
      'Job Name':                    '',
      'Job Type':                    'taskUnix',
      'Job Workstation':             '',
      'Job Script':                  '',
      'Job Login Account':           '',
      'Job Description':             '',
      'ServiceNow Group':            '',
      'Firstrun Date':               '',
      'Job Starttime':               '',
      'Job Timezone':                '',
      'Scheduled Frequency':         '',
      'Maximum Runtime':             '',
      'Reference Job':               '',
      'Member of Business Services': '',
      'ServiceNow Ticket':           '',
      'Job Recovery1':               '',
      'Job Recovery2':               '',
    }];
    const ws = XLSX.utils.json_to_sheet(template);
    ws['!cols'] = [
      { wch: 40 }, { wch: 14 }, { wch: 35 }, { wch: 100 },
      { wch: 18 }, { wch: 45 }, { wch: 30 }, { wch: 14 },
      { wch: 20 }, { wch: 20 }, { wch: 20 }, { wch: 10 },
      { wch: 35 }, { wch: 30 }, { wch: 18 }, { wch: 30 },
      { wch: 40 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Template');
    XLSX.writeFile(wb, 'stonebranch_template.xlsx');
  };

  const selectedConfig = TASK_TYPES.find(t => t.apiType === selectedType);

  return (
    <div className="relative rounded-xl overflow-hidden p-6"
      style={{ background: 'linear-gradient(145deg, rgba(6,15,30,0.9), rgba(2,8,18,0.95))', border: '1px solid rgba(51,65,85,0.2)' }}>
      {/* Top accent */}
      <div className="absolute top-0 left-0 right-0 h-[1px]" style={{ background: 'linear-gradient(90deg, transparent, rgba(139,92,246,0.4), transparent)' }} />
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <span className="w-7 h-7 rounded-lg bg-purple-500/20 flex items-center justify-center shrink-0">
            <svg className="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
            </svg>
          </span>
          <div>
            <h2 className="text-sm font-semibold text-slate-200">Job Builder Chat</h2>
            <p className="text-[10px] text-slate-500">Paste job doc → auto-parsed into Excel row</p>
          </div>
          {rows.length > 0 && (
            <span className="px-2.5 py-0.5 rounded-full text-xs font-medium border bg-cyan-500/15 text-cyan-400 border-cyan-500/30">
              {rows.length} job{rows.length > 1 ? 's' : ''}
            </span>
          )}
        </div>
        <button
          onClick={handleDownloadTemplate}
          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 text-slate-300 hover:bg-slate-700 transition-colors"
        >
          Template
        </button>
      </div>

      {/* Task type selector */}
      <div className="mb-3">
        <label className="block text-[10px] font-semibold tracking-wider uppercase text-slate-500 mb-2">
          Task Type
        </label>
        <div className="flex flex-wrap gap-2">
          {TASK_TYPES.map(t => (
            <button
              key={t.apiType}
              onClick={() => setSelectedType(t.apiType)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                selectedType === t.apiType
                  ? 'bg-cyan-600 text-white shadow-[0_0_10px_rgba(6,182,212,0.3)]'
                  : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200'
              }`}
            >
              <span className="font-mono text-[10px] opacity-70">{t.icon}</span>
              <span>{t.label}</span>
            </button>
          ))}
        </div>
        {selectedConfig && (
          <p className="text-[10px] text-slate-600 mt-1.5">{selectedConfig.description}</p>
        )}
      </div>

      {/* Paste area */}
      <textarea
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={e => { if (e.ctrlKey && e.key === 'Enter') handleParse(); }}
        placeholder={`Paste job documentation here...\n\nJob Name = PMFG-BU-AS1-MFG-377-MYJOB\nJob Description = APAC - My Job\nJob Workstation = A0021377P3_DD_94\nJob Script = /usr/bin/bash -c 'unset TERM && sh /path/script.sh'\nJob Login Account = mfgeb\nFirstrun Date = 2026-04-27\nJob Starttime = AT 0330 TIMEZONE Asia/Kolkata MAXDUR 0100\nMaximum Runtime = 0060\nServiceNow Ticket = SCTASK0862800\nBusiness Services = BJA-QAD, BJA-QAD - AP\n\n(Ctrl+Enter to add)`}
        className="w-full h-52 px-4 py-3 rounded-xl bg-slate-950 border border-slate-700 text-slate-200 text-xs font-mono placeholder-slate-600 focus:border-cyan-500 focus:outline-none resize-none mb-3"
      />

      {error && (
        <div className="mb-3 p-2.5 rounded-lg bg-red-500/10 border border-red-500/20">
          <p className="text-xs text-red-400">{error}</p>
        </div>
      )}

      <div className="flex gap-2 mb-5">
        <button
          onClick={handleParse}
          disabled={!input.trim()}
          className="flex-1 px-4 py-2.5 rounded-lg font-medium text-sm bg-gradient-to-r from-cyan-600 to-blue-600 text-white hover:shadow-[0_0_12px_rgba(6,182,212,0.4)] disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          Add Job
        </button>
        <button
          onClick={() => setInput('')}
          className="px-4 py-2.5 rounded-lg font-medium text-sm bg-slate-800 text-slate-400 hover:bg-slate-700 transition-colors"
        >
          Clear
        </button>
      </div>

      {/* Preview table */}
      <AnimatePresence>
        {rows.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
          >
            <div className="rounded-xl border border-slate-700/50 bg-slate-950/50 overflow-hidden mb-4">
              <div className="px-4 py-2 border-b border-slate-700/50 bg-slate-900/50 flex items-center justify-between">
                <span className="text-xs font-medium text-slate-400">{rows.length} job(s) queued</span>
                <button onClick={() => setRows([])} className="text-xs text-red-400/70 hover:text-red-400">Clear all</button>
              </div>
              <div className="overflow-auto max-h-48">
                <table className="w-full text-xs">
                  <thead className="bg-slate-800 sticky top-0">
                    <tr>
                      {['Task Name','Type','Agent','Schedule','Ticket'].map(h => (
                        <th key={h} className="px-3 py-2 text-left text-slate-400 font-medium whitespace-nowrap">{h}</th>
                      ))}
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {rows.map((row, i) => {
                      const tc = TASK_TYPES.find(t => t.apiType === row.task_type);
                      return (
                        <tr key={i} className="hover:bg-slate-800/30">
                          <td className="px-3 py-2 text-cyan-300 font-medium whitespace-nowrap">{row.task_name}</td>
                          <td className="px-3 py-2 text-slate-400 whitespace-nowrap">{tc?.label || row.task_type}</td>
                          <td className="px-3 py-2 text-slate-400 whitespace-nowrap">{row.agent}</td>
                          <td className="px-3 py-2 text-slate-400 max-w-[160px] truncate">{row.schedule_string || row.start_time || '—'}</td>
                          <td className="px-3 py-2 text-slate-400">{row.servicenow_ticket || '—'}</td>
                          <td className="px-3 py-2">
                            <button onClick={() => setRows(r => r.filter((_, j) => j !== i))} className="text-red-400/50 hover:text-red-400 text-[10px]">✕</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex gap-3">
              <button onClick={handleDownload} className="flex-1 px-4 py-2.5 rounded-lg font-medium text-sm bg-slate-800 text-slate-300 hover:bg-slate-700 transition-colors">
                Download Excel
              </button>
              <button onClick={handleGenerate} className="flex-1 px-4 py-2.5 rounded-lg font-medium text-sm bg-gradient-to-r from-green-600 to-emerald-600 text-white hover:shadow-[0_0_12px_rgba(34,197,94,0.4)] transition-all">
                Generate & Proceed
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Guide */}
      <details className="mt-4">
        <summary className="text-[10px] text-slate-600 cursor-pointer hover:text-slate-500 select-none">
          How to use
        </summary>
        <div className="mt-2 p-3 rounded-lg bg-slate-950/50 text-[10px] text-slate-500 space-y-1.5">
          <p>1. Select the <strong className="text-slate-400">task type</strong> above</p>
          <p>2. Paste the full job doc text into the box</p>
          <p>3. Click <strong className="text-slate-400">Add Job</strong> (or Ctrl+Enter) — repeat for more jobs</p>
          <p>4. Click <strong className="text-slate-400">Generate & Proceed</strong> to download Excel and load the pipeline</p>
          <p className="pt-1 text-slate-600">Supported schedule formats:</p>
          <p className="font-mono">AT 0330 TIMEZONE Asia/Kolkata MAXDUR 0100</p>
          <p className="font-mono">AT 0100 EVERY 1200 UNTIL 2100 TIMEZONE Asia/Jakarta</p>
          <p className="font-mono">FREQ=DAILY;INTERVAL=1</p>
        </div>
      </details>
    </div>
  );
}
