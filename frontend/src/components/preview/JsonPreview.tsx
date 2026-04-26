'use client';

import dynamic from 'next/dynamic';
import { useJobStore } from '@/store/useJobStore';
import { useState } from 'react';

const MonacoEditor = dynamic(() => import('@monaco-editor/react'), { ssr: false });

export default function JsonPreview() {
  const { taskPreview, triggerPreview, refJobData, comparisonData } = useJobStore();
  const [activeTab, setActiveTab] = useState<'task' | 'trigger'>('task');

  const taskJson = taskPreview
    ? JSON.stringify(
        {
          name: taskPreview.name,
          type: taskPreview.type,
          agent: taskPreview.agent,
          command: taskPreview.command,
          description: taskPreview.description,
          enabled: taskPreview.enabled,
        },
        null,
        2
      )
    : '{}';

  const triggerJson = triggerPreview
    ? JSON.stringify(
        {
          name: triggerPreview.name,
          type: triggerPreview.type,
          taskname: triggerPreview.taskname,
          enabled: triggerPreview.enabled,
        },
        null,
        2
      )
    : '{}';

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 mb-4">
        <button
          onClick={() => setActiveTab('task')}
          className={`
            px-4 py-2 rounded-lg text-sm font-medium transition-colors
            ${activeTab === 'task' ? 'bg-cyan-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}
          `}
        >
          Task JSON
        </button>
        <button
          onClick={() => setActiveTab('trigger')}
          className={`
            px-4 py-2 rounded-lg text-sm font-medium transition-colors
            ${activeTab === 'trigger' ? 'bg-cyan-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}
          `}
        >
          Trigger JSON
        </button>
      </div>

      <div className="flex-1 rounded-lg border border-slate-700 bg-slate-950 overflow-hidden">
        <div className="h-full">
          <MonacoEditor
            language="json"
            value={activeTab === 'task' ? taskJson : triggerJson}
            theme="vs-dark"
            options={{
              minimap: { enabled: false },
              fontSize: 13,
              lineHeight: 20,
              padding: { top: 16, bottom: 16 },
              scrollBeyondLastLine: false,
              automaticLayout: true,
            }}
          />
        </div>
      </div>

      {refJobData && comparisonData && comparisonData.length > 0 && (
        <div className="mt-4 p-4 rounded-lg border border-slate-700 bg-slate-900/50">
          <h4 className="text-sm font-semibold text-slate-300 mb-3">Reference Job Comparison</h4>
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-400">
                  <th className="px-3 py-2">Field</th>
                  <th className="px-3 py-2">Input</th>
                  <th className="px-3 py-2">Ref Job</th>
                  <th className="px-3 py-2">Final</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {comparisonData.map((item, idx) => (
                  <tr key={idx} className="text-slate-300">
                    <td className="px-3 py-2">{item.field}</td>
                    <td className="px-3 py-2">
                      {item.inputValue ? (
                        <span className="text-cyan-400">{item.inputValue}</span>
                      ) : (
                        <span className="text-slate-500 italic">-</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {item.referenceValue ? (
                        <span className="text-purple-400">{item.referenceValue}</span>
                      ) : (
                        <span className="text-slate-500 italic">-</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <span className="text-green-400">{item.finalValue}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
