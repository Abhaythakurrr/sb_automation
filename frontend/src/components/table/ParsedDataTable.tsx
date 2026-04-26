'use client';

import { useState } from 'react';
import { useJobStore } from '@/store/useJobStore';
import { JobRow } from '@/types';

export default function ParsedDataTable() {
  const { parsedData, selectedRowIndex, setSelectedRowIndex, setTaskPreview, setTriggerPreview } =
    useJobStore();
  const [page, setPage] = useState(0);
  const rowsPerPage = 10;

  if (!parsedData?.rows || parsedData.rows.length === 0) {
    return (
      <div className="p-8 text-center text-slate-500">
        <p>No data to display. Please upload a file first.</p>
      </div>
    );
  }

  const paginatedRows = parsedData.rows.slice(
    page * rowsPerPage,
    (page + 1) * rowsPerPage
  );

  const handleRowClick = (row: JobRow, index: number) => {
    setSelectedRowIndex(index);
    setTaskPreview({
      name: row.task_name,
      type: row.task_type,
      agent: row.agent,
      command: row.command,
      description: row.description,
      enabled: row.enabled === 'true',
    });
    setTriggerPreview({
      name: `${row.task_name}_TR001`,
      type: 'triggerTime',
      taskname: row.task_name,
      enabled: row.enabled === 'true',
    });
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-slate-200">
          Parsed Data ({parsedData.rows.length} rows)
        </h3>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPage(Math.max(0, page - 1))}
            disabled={page === 0}
            className="px-3 py-1 text-sm rounded bg-slate-800 text-slate-300 disabled:opacity-50 hover:bg-slate-700"
          >
            Previous
          </button>
          <span className="text-sm text-slate-400">
            Page {page + 1} of {Math.ceil(parsedData.rows.length / rowsPerPage)}
          </span>
          <button
            onClick={() =>
              setPage(Math.min(Math.ceil(parsedData.rows.length / rowsPerPage) - 1, page + 1))
            }
            disabled={(page + 1) * rowsPerPage >= parsedData.rows.length}
            className="px-3 py-1 text-sm rounded bg-slate-800 text-slate-300 disabled:opacity-50 hover:bg-slate-700"
          >
            Next
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto rounded-lg border border-slate-700 bg-slate-900/50">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-800 sticky top-0">
            <tr>
              <th className="px-4 py-3 text-slate-400 font-medium">Task Name</th>
              <th className="px-4 py-3 text-slate-400 font-medium">Type</th>
              <th className="px-4 py-3 text-slate-400 font-medium">Agent</th>
              <th className="px-4 py-3 text-slate-400 font-medium">Command</th>
              <th className="px-4 py-3 text-slate-400 font-medium">Enabled</th>
              <th className="px-4 py-3 text-slate-400 font-medium">Ref Job</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {paginatedRows.map((row: JobRow, idx: number) => {
              const actualIndex = page * rowsPerPage + idx;
              const isSelected = selectedRowIndex === actualIndex;
              return (
                <tr
                  key={actualIndex}
                  onClick={() => handleRowClick(row, actualIndex)}
                  className={`
                    cursor-pointer transition-colors
                    ${isSelected ? 'bg-cyan-500/10' : 'hover:bg-slate-800/50'}
                  `}
                >
                  <td className="px-4 py-3 text-slate-300 font-medium">{row.task_name}</td>
                  <td className="px-4 py-3 text-slate-400">{row.task_type}</td>
                  <td className="px-4 py-3 text-slate-400">{row.agent}</td>
                  <td className="px-4 py-3 text-slate-400 truncate max-w-[200px]">
                    {row.command}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`px-2 py-1 rounded text-xs ${
                        row.enabled === 'true' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                      }`}
                    >
                      {row.enabled}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-400">{row.ref_job || '-'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
