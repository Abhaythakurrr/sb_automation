'use client';
import { useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import GlobalHeader from '@/components/GlobalHeader';
import { useConnectionStore, globalApi } from '@/store/useConnectionStore';
import { playClick, playSuccess, playError, playWhoosh, playTick } from '@/utils/soundEffects';

// ── Types ─────────────────────────────────────────────────────────────────────
type SearchType = 'task' | 'trigger';
type ViewMode = 'view' | 'edit';

interface FieldEdit {
  key: string;
  original: any;
  current: any;
  modified: boolean;
}

// Read-only fields we should not allow editing
const READ_ONLY_FIELDS = new Set([
  'sysId', 'version', 'exportReleaseLevel', 'exportTable', 'retainSysIds',
  'nextScheduledTime', 'enabledBy', 'enabledTime', 'disabledBy', 'disabledTime',
  'avgRunTime', 'avgRunTimeDisplay', 'minRunTime', 'minRunTimeDisplay',
  'maxRunTimeDisplay', 'lastRunTime', 'lastRunTimeDisplay', 'runCount',
  'runTime', 'firstRun', 'lastRun', 'createdBy', 'created', 'updatedBy', 'updated',
]);

// Important fields to show first
const PRIORITY_TASK_FIELDS = ['name', 'type', 'agent', 'agentCluster', 'command', 'credentials', 'summary', 'startHeld', 'resolveNameImmediately', 'runAsSudo', 'maxRunTime', 'lfEnabled', 'lfDuration', 'exitCodes', 'opswiseGroups'];
const PRIORITY_TRIGGER_FIELDS = ['name', 'type', 'tasks', 'enabled', 'time', 'timeZone', 'timeStyle', 'timeInterval', 'timeIntervalUnits', 'dayStyle', 'simpleDateType', 'enabledStart', 'enabledEnd', 'intervalStartingDate', 'opswiseGroups'];

function sortFields(data: Record<string, any>, type: SearchType): string[] {
  const priority = type === 'task' ? PRIORITY_TASK_FIELDS : PRIORITY_TRIGGER_FIELDS;
  const allKeys = Object.keys(data);
  const sorted: string[] = [];
  // Priority fields first (in order)
  priority.forEach(k => { if (allKeys.includes(k)) sorted.push(k); });
  // Then remaining (exclude read-only and already added)
  allKeys.filter(k => !sorted.includes(k) && !READ_ONLY_FIELDS.has(k)).sort().forEach(k => sorted.push(k));
  // Read-only last
  allKeys.filter(k => READ_ONLY_FIELDS.has(k)).sort().forEach(k => sorted.push(k));
  return sorted;
}

// ── Field Renderer ────────────────────────────────────────────────────────────
function FieldRow({ fieldKey, value, isReadOnly, isEditing, onChange }: {
  fieldKey: string; value: any; isReadOnly: boolean; isEditing: boolean; onChange: (v: any) => void;
}) {
  const displayValue = value === null || value === undefined ? '' :
    typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value);
  const isBoolean = typeof value === 'boolean';
  const isArray = Array.isArray(value);
  const isObject = typeof value === 'object' && value !== null && !isArray;

  return (
    <motion.div
      layout
      className={`flex items-start gap-4 px-4 py-3 rounded-lg transition-all ${
        isReadOnly ? 'opacity-50' : 'hover:bg-slate-800/30'
      }`}
      style={{ borderBottom: '1px solid rgba(51,65,85,0.08)' }}
    >
      {/* Key */}
      <div className="w-48 shrink-0 flex items-center gap-2">
        <span className={`text-[11px] font-mono font-medium ${isReadOnly ? 'text-slate-600' : 'text-slate-400'}`}>
          {fieldKey}
        </span>
        {isReadOnly && (
          <span className="text-[8px] px-1 py-0.5 rounded bg-slate-800 text-slate-600 font-bold">RO</span>
        )}
      </div>

      {/* Value */}
      <div className="flex-1 min-w-0">
        {isEditing && !isReadOnly ? (
          isBoolean ? (
            <button onClick={() => onChange(!value)}
              className={`px-3 py-1 rounded-md text-[11px] font-bold transition-all ${
                value ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25' : 'bg-red-500/10 text-red-400 border border-red-500/20'
              }`}>
              {String(value)}
            </button>
          ) : (isObject || isArray) ? (
            <textarea
              value={typeof value === 'string' ? value : JSON.stringify(value, null, 2)}
              onChange={e => {
                try { onChange(JSON.parse(e.target.value)); }
                catch { onChange(e.target.value); }
              }}
              className="w-full rounded-lg px-3 py-2 text-[11px] font-mono text-slate-200 outline-none resize-y min-h-[60px]"
              style={{ background: 'rgba(2,8,18,0.8)', border: '1px solid rgba(6,182,212,0.15)' }}
            />
          ) : (
            <input
              value={displayValue}
              onChange={e => {
                const v = e.target.value;
                // Try to preserve type
                if (v === 'true') onChange(true);
                else if (v === 'false') onChange(false);
                else if (v !== '' && !isNaN(Number(v)) && typeof value === 'number') onChange(Number(v));
                else onChange(v);
              }}
              className="w-full rounded-lg px-3 py-2 text-[11px] font-mono text-slate-200 outline-none"
              style={{ background: 'rgba(2,8,18,0.8)', border: '1px solid rgba(6,182,212,0.15)' }}
            />
          )
        ) : (
          <span className={`text-[11px] font-mono break-all ${isReadOnly ? 'text-slate-700' : 'text-slate-300'}`}>
            {isBoolean ? (
              <span className={value ? 'text-emerald-400' : 'text-red-400'}>{String(value)}</span>
            ) : isObject || isArray ? (
              <pre className="whitespace-pre-wrap text-[10px] text-slate-500 max-h-24 overflow-auto">{JSON.stringify(value, null, 2)}</pre>
            ) : (
              displayValue || <span className="text-slate-700 italic">empty</span>
            )}
          </span>
        )}
      </div>
    </motion.div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function SearchEditPage() {
  const { connected } = useConnectionStore();
  const [searchType, setSearchType] = useState<SearchType>('task');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<Record<string, any> | null>(null);
  const [mode, setMode] = useState<ViewMode>('view');
  const [editData, setEditData] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [history, setHistory] = useState<string[]>([]);

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim() || !connected) return;
    playClick();
    setLoading(true);
    setError(null);
    setData(null);
    setMode('view');
    setSaveMsg(null);

    try {
      const res = searchType === 'task'
        ? await globalApi.searchTask(searchQuery.trim())
        : await globalApi.searchTrigger(searchQuery.trim());

      if (res.data?.success && res.data?.data) {
        setData(res.data.data);
        setEditData({ ...res.data.data });
        playSuccess();
        // Add to history
        setHistory(prev => {
          const next = [`${searchType}:${searchQuery.trim()}`, ...prev.filter(h => h !== `${searchType}:${searchQuery.trim()}`)];
          return next.slice(0, 10);
        });
      } else {
        setError(res.data?.error || 'Not found');
        playError();
      }
    } catch (e: any) {
      setError(e.response?.data?.error || e.message || 'Search failed');
      playError();
    } finally {
      setLoading(false);
    }
  }, [searchQuery, searchType, connected]);

  const handleSave = useCallback(async () => {
    if (!editData || !data) return;
    setSaving(true);
    setSaveMsg(null);

    // Build diff — only send changed fields + identity fields.
    // UAC requires `type` as the polymorphic discriminator for BOTH task and
    // trigger PUTs; always include it.
    const payload: Record<string, any> = { name: editData.name };
    if (editData.type) payload.type = editData.type;

    // Track whether anything actually changed (boolean — NOT a key count, since
    // name/type are always present in the baseline payload).
    let changed = false;

    // A name change is a rename: include the original record's sysId so UAC
    // identifies the existing object and applies the new name (otherwise it
    // can't locate the record by the new name).
    const nameChanged = editData.name !== data.name;
    if (nameChanged) {
      changed = true;
      if (data.sysId) payload.sysId = data.sysId;
    }

    Object.keys(editData).forEach(k => {
      if (READ_ONLY_FIELDS.has(k) || k === 'name' || k === 'type') return;
      if (JSON.stringify(editData[k]) !== JSON.stringify(data[k])) {
        payload[k] = editData[k];
        changed = true;
      }
    });

    if (!changed) {
      setSaveMsg('No changes to save');
      setSaving(false);
      return;
    }

    try {
      const res = searchType === 'task'
        ? await globalApi.updateTask(payload)
        : await globalApi.updateTrigger(payload);

      if (res.data?.success) {
        setData({ ...editData });
        setMode('view');
        setSaveMsg(`✓ ${searchType === 'task' ? 'Task' : 'Trigger'} updated successfully`);
        playSuccess();
      } else {
        setSaveMsg(`✗ ${res.data?.error || 'Update failed'}`);
        playError();
      }
    } catch (e: any) {
      setSaveMsg(`✗ ${e.response?.data?.error || e.message}`);
      playError();
    } finally {
      setSaving(false);
    }
  }, [editData, data, searchType]);

  const handleFieldChange = (key: string, value: any) => {
    setEditData(prev => ({ ...prev, [key]: value }));
  };

  const changedFields = data ? Object.keys(editData).filter(k => !READ_ONLY_FIELDS.has(k) && JSON.stringify(editData[k]) !== JSON.stringify(data[k])) : [];

  return (
    <div className="min-h-screen relative scan-line" style={{ background: 'var(--bg-deep)' }}>
      {/* Ambient */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <motion.div className="absolute w-[500px] h-[500px] rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(6,182,212,0.04) 0%, transparent 70%)', right: '-8%', top: '10%' }}
          animate={{ y: [0, -20, 0], scale: [1, 1.08, 1] }} transition={{ duration: 14, repeat: Infinity, ease: 'easeInOut' }} />
        <motion.div className="absolute w-[400px] h-[400px] rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(139,92,246,0.03) 0%, transparent 70%)', left: '-5%', bottom: '15%' }}
          animate={{ y: [0, 15, 0] }} transition={{ duration: 16, repeat: Infinity, ease: 'easeInOut', delay: 3 }} />
        <div className="absolute inset-0 opacity-[0.012]"
          style={{ backgroundImage: 'linear-gradient(rgba(6,182,212,0.4) 1px, transparent 1px), linear-gradient(90deg, rgba(6,182,212,0.4) 1px, transparent 1px)', backgroundSize: '64px 64px' }} />
      </div>

      <GlobalHeader title="Search & Edit" subtitle="JOB + TRIGGER LOOKUP" />

      <main className="max-w-5xl mx-auto px-6 pb-24 space-y-6 relative z-10">

        {/* Search Bar */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
          className="glass-card p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center"
              style={{ background: 'rgba(6,182,212,0.1)', border: '1px solid rgba(6,182,212,0.2)' }}>
              <svg className="w-4 h-4 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <h2 className="text-sm font-bold text-slate-200">Search Stonebranch</h2>
            <span className="text-[9px] font-mono text-slate-600 ml-auto">EXACT NAME MATCH</span>
          </div>

          <div className="flex gap-3">
            {/* Type Toggle */}
            <div className="flex rounded-xl overflow-hidden shrink-0" style={{ border: '1px solid rgba(51,65,85,0.3)' }}>
              {(['task', 'trigger'] as SearchType[]).map(t => (
                <button key={t} onClick={() => { setSearchType(t); playClick(); }}
                  className="px-4 py-2.5 text-xs font-bold capitalize transition-all"
                  style={{
                    background: searchType === t ? (t === 'task' ? 'rgba(6,182,212,0.12)' : 'rgba(139,92,246,0.12)') : 'transparent',
                    color: searchType === t ? (t === 'task' ? '#67e8f9' : '#c4b5fd') : '#475569',
                  }}>
                  {t === 'task' ? '📋 Task' : '⏰ Trigger'}
                </button>
              ))}
            </div>

            {/* Input */}
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              placeholder={searchType === 'task' ? 'Enter exact task name...' : 'Enter exact trigger name...'}
              className="flex-1 rounded-xl px-4 py-2.5 text-sm text-slate-200 font-mono outline-none placeholder:text-slate-700 focus:ring-1 focus:ring-cyan-500/30 transition-all"
              style={{ background: 'rgba(2,8,18,0.8)', border: '1px solid rgba(51,65,85,0.3)' }}
            />

            {/* Search Button */}
            <motion.button onClick={handleSearch} disabled={loading || !connected || !searchQuery.trim()}
              whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
              className="btn-primary px-6 py-2.5 rounded-xl text-xs disabled:opacity-40 flex items-center gap-2">
              {loading ? (
                <motion.div className="w-3.5 h-3.5 rounded-full border-2 border-cyan-400 border-t-transparent"
                  animate={{ rotate: 360 }} transition={{ duration: 0.7, repeat: Infinity, ease: 'linear' }} />
              ) : (
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              )}
              Search
            </motion.button>
          </div>

          {/* Recent History */}
          {history.length > 0 && (
            <div className="flex items-center gap-2 mt-3 flex-wrap">
              <span className="text-[9px] text-slate-600 font-bold uppercase">Recent:</span>
              {history.slice(0, 5).map(h => {
                const [type, name] = h.split(':');
                return (
                  <button key={h} onClick={() => { setSearchType(type as SearchType); setSearchQuery(name); }}
                    className="px-2 py-0.5 rounded text-[9px] font-mono transition-all hover:bg-slate-800/50"
                    style={{ background: 'rgba(51,65,85,0.15)', border: '1px solid rgba(51,65,85,0.2)', color: type === 'task' ? '#67e8f9' : '#c4b5fd' }}>
                    {type === 'task' ? '📋' : '⏰'} {name.length > 30 ? name.slice(0, 30) + '...' : name}
                  </button>
                );
              })}
            </div>
          )}

          {/* Connection warning */}
          {!connected && (
            <p className="text-[10px] text-amber-500/70 mt-3 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
              Connect to UAC first from the Home page
            </p>
          )}
        </motion.div>

        {/* Error */}
        <AnimatePresence>
          {error && (
            <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="rounded-xl px-5 py-3 flex items-center gap-3"
              style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)' }}>
              <svg className="w-4 h-4 text-red-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-xs text-red-400">{error}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Results */}
        <AnimatePresence>
          {data && (
            <motion.div key="result" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="glass-card overflow-hidden">

              {/* Result Header */}
              <div className="px-6 py-4 border-b flex items-center justify-between" style={{ borderColor: 'rgba(51,65,85,0.15)' }}>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                    style={{
                      background: searchType === 'task' ? 'rgba(6,182,212,0.1)' : 'rgba(139,92,246,0.1)',
                      border: searchType === 'task' ? '1px solid rgba(6,182,212,0.2)' : '1px solid rgba(139,92,246,0.2)',
                    }}>
                    <span className="text-lg">{searchType === 'task' ? '📋' : '⏰'}</span>
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-200">{data.name}</h3>
                    <p className="text-[10px] text-slate-500 font-mono">
                      {data.type} • {Object.keys(data).length} fields
                      {data.agent && ` • ${data.agent}`}
                      {data.agentCluster && ` • ${data.agentCluster}`}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {mode === 'view' ? (
                    <motion.button onClick={() => { setMode('edit'); setEditData({ ...data }); playWhoosh(); }}
                      whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                      className="px-4 py-2 rounded-lg text-[11px] font-bold flex items-center gap-1.5"
                      style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)', color: '#fbbf24' }}>
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                      Edit
                    </motion.button>
                  ) : (
                    <>
                      <button onClick={() => { setMode('view'); setEditData({ ...data }); setSaveMsg(null); }}
                        className="px-3 py-2 rounded-lg text-[11px] font-medium text-slate-500 hover:text-slate-300 transition-colors"
                        style={{ border: '1px solid rgba(51,65,85,0.3)' }}>
                        Cancel
                      </button>
                      <motion.button onClick={handleSave} disabled={saving || changedFields.length === 0}
                        whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                        className="px-4 py-2 rounded-lg text-[11px] font-bold flex items-center gap-1.5 disabled:opacity-40"
                        style={{ background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.3)', color: '#4ade80' }}>
                        {saving ? (
                          <motion.div className="w-3 h-3 rounded-full border-2 border-emerald-400 border-t-transparent"
                            animate={{ rotate: 360 }} transition={{ duration: 0.7, repeat: Infinity, ease: 'linear' }} />
                        ) : (
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                        Save {changedFields.length > 0 && `(${changedFields.length})`}
                      </motion.button>
                    </>
                  )}
                </div>
              </div>

              {/* Save message */}
              {saveMsg && (
                <div className={`px-6 py-2 text-[11px] font-medium ${saveMsg.startsWith('✓') ? 'text-emerald-400 bg-emerald-500/5' : saveMsg.startsWith('✗') ? 'text-red-400 bg-red-500/5' : 'text-slate-400'}`}>
                  {saveMsg}
                </div>
              )}

              {/* Changed fields indicator */}
              {mode === 'edit' && changedFields.length > 0 && (
                <div className="px-6 py-2 flex items-center gap-2" style={{ background: 'rgba(245,158,11,0.03)', borderBottom: '1px solid rgba(245,158,11,0.08)' }}>
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                  <span className="text-[10px] text-amber-400 font-medium">
                    {changedFields.length} field(s) modified: {changedFields.join(', ')}
                  </span>
                </div>
              )}

              {/* Fields List */}
              <div className="max-h-[600px] overflow-auto custom-scroll divide-y" style={{ divideColor: 'rgba(51,65,85,0.05)' } as React.CSSProperties}>
                {sortFields(mode === 'edit' ? editData : data, searchType).map(key => (
                  <FieldRow
                    key={key}
                    fieldKey={key}
                    value={mode === 'edit' ? editData[key] : data[key]}
                    isReadOnly={READ_ONLY_FIELDS.has(key)}
                    isEditing={mode === 'edit'}
                    onChange={(v) => handleFieldChange(key, v)}
                  />
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Empty State */}
        {!data && !loading && !error && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}
            className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
              style={{ background: 'rgba(6,182,212,0.05)', border: '1px solid rgba(6,182,212,0.1)' }}>
              <svg className="w-8 h-8 text-slate-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <p className="text-sm text-slate-600">Search for a task or trigger by exact name</p>
            <p className="text-[10px] text-slate-700 mt-1">View all fields, edit values, and save directly to UAC</p>
          </motion.div>
        )}

        <footer className="section-line mt-10" />
        <p className="text-center text-[9px] font-mono py-4"><span className="neon-text-gold">DESIGNED AND ENGINEERED BY ABHAY THAKUR</span></p>
      </main>
    </div>
  );
}
