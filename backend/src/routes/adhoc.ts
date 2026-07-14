/**
 * Ad-hoc Launch & Live Monitor.
 * - Global search across tasks, workflows and triggers.
 * - Launch a task/workflow (task/launch) or fire a trigger (trigger/triggernow).
 * - Poll launched instance status in real time until terminal.
 * - Instance operations: cancel, force-finish, halt+force-finish, rerun, hold, release, skip, unskip.
 */
import { Router, Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/session';
import axios from 'axios';
import { auditLog } from '../middleware/auditLogger';
import { createModuleLogger } from '../config/logger';

const router = Router();
const log = createModuleLogger('adhoc');

function sbClient(req: AuthRequest) {
  return axios.create({
    baseURL: req.sbBaseUrl || process.env.BASE_URL || '',
    headers: {
      Authorization: `Bearer ${req.token || process.env.AUTH_TOKEN || ''}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    timeout: 20000,
  });
}

// Terminal statuses — once reached, monitoring stops.
const TERMINAL = new Set(['success', 'failed', 'finished', 'cancelled', 'canceled', 'skipped', 'start failure', 'rejected']);
const FAILED_LIKE = new Set(['failed', 'start failure', 'cancelled', 'canceled', 'rejected']);

function norm(s: string): string { return String(s || '').trim().toLowerCase(); }
function isTerminal(status: string): boolean { return TERMINAL.has(norm(status)); }

function statusKind(status: string): 'success' | 'failed' | 'running' | 'other' {
  const s = norm(status);
  if (s === 'success' || s === 'finished') return 'success';
  if (FAILED_LIKE.has(s)) return 'failed';
  if (TERMINAL.has(s)) return 'other';
  return 'running';
}

// ── Global search: tasks/workflows + triggers ───────────────────────────────
router.get('/search', async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const q = String(req.query.q || '').trim();
    if (!q) { res.json({ success: true, data: { results: [] } }); return; }
    const client = sbClient(req);
    const wild = `*${q}*`;

    const asArray = (d: any, ...keys: string[]) => {
      if (Array.isArray(d)) return d;
      for (const k of keys) if (Array.isArray(d?.[k])) return d[k];
      return [];
    };

    // Tasks/workflows — POST /resources/task/list (name supports wildcards).
    // Fall back to GET listadv if the POST form is unavailable.
    const fetchTasks = async (): Promise<any[]> => {
      try {
        const r = await client.post('/resources/task/list', { name: wild });
        const arr = asArray(r.data, 'task', 'tasks');
        if (arr.length) return arr;
      } catch (e: any) { log.warn('task/list lookup failed', { status: e.response?.status, error: e.response?.data || e.message }); }
      try {
        const r = await client.get('/resources/task/listadv', { params: { taskname: wild } });
        return asArray(r.data, 'task', 'tasks');
      } catch (e: any) { log.warn('task/listadv lookup failed', { status: e.response?.status, error: e.response?.data || e.message }); return []; }
    };

    // Triggers — POST /resources/trigger/list (name supports wildcards).
    const fetchTriggers = async (): Promise<any[]> => {
      try {
        const r = await client.post('/resources/trigger/list', { name: wild });
        const arr = asArray(r.data, 'trigger', 'triggers');
        if (arr.length) return arr;
      } catch (e: any) { log.warn('trigger/list lookup failed', { status: e.response?.status, error: e.response?.data || e.message }); }
      try {
        const r = await client.get('/resources/trigger/listadv', { params: { triggername: wild } });
        return asArray(r.data, 'trigger', 'triggers');
      } catch (e: any) { log.warn('trigger/listadv lookup failed', { status: e.response?.status, error: e.response?.data || e.message }); return []; }
    };

    const [taskList, trigList] = await Promise.all([fetchTasks(), fetchTriggers()]);

    const results: any[] = [];
    for (const t of taskList) {
      if (!t?.name) continue;
      const isWf = /workflow/i.test(t.type || '');
      results.push({ kind: isWf ? 'workflow' : 'task', name: t.name, type: t.type || '', agent: t.agentCluster || t.agent || '' });
    }
    for (const t of trigList) {
      if (!t?.name) continue;
      results.push({ kind: 'trigger', name: t.name, type: t.type || '', enabled: t.enabled === true, tasks: t.tasks || [] });
    }
    // Exact-match first, then alphabetical; cap to 50.
    const ql = q.toLowerCase();
    results.sort((a, b) => {
      const ax = a.name.toLowerCase() === ql ? 0 : 1;
      const bx = b.name.toLowerCase() === ql ? 0 : 1;
      return ax - bx || a.name.localeCompare(b.name);
    });
    res.json({ success: true, data: { results: results.slice(0, 50), count: results.length } });
  } catch (e) { next(e); }
});

// ── Find the newest task instance for a task name ───────────────────────────
async function newestInstance(client: any, taskName: string): Promise<any | null> {
  try {
    const r = await client.post('/resources/taskinstance/list', {
      name: taskName, sort: { field: 'startTime', direction: 'DESC' },
    });
    const list = Array.isArray(r.data) ? r.data : (r.data?.taskInstance ?? []);
    return list[0] || null;
  } catch { return null; }
}

// ── Launch ───────────────────────────────────────────────────────────────────
router.post('/launch', async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { kind, name } = req.body as { kind: string; name: string };
    if (!kind || !name) { res.status(400).json({ success: false, error: 'kind and name required' }); return; }
    const client = sbClient(req);
    const instances: { id: string; name: string }[] = [];

    if (kind === 'trigger') {
      const r = await client.post('/resources/trigger/triggernow', { name, launchReason: 'Ad-hoc launch via Self-Service' },
        { params: { includeTaskInstanceIds: true } });
      const ids = r.data?.taskInstanceIds || r.data?.taskInstanceId || [];
      const arr = Array.isArray(ids) ? ids : [ids];
      arr.filter(Boolean).forEach((id: any) => instances.push({ id: String(id), name }));
      // If UAC didn't return ids, fall back to newest instances of the trigger's tasks.
      if (!instances.length) { const inst = await newestInstance(client, name); if (inst?.sysId) instances.push({ id: inst.sysId, name: inst.name || name }); }
    } else {
      // task or workflow
      const r = await client.post('/resources/task/launch', { name, launchReason: 'Ad-hoc launch via Self-Service' });
      let id = r.data?.sysId || (typeof r.data === 'string' ? (r.data.match(/[0-9a-zA-Z]{32}/)?.[0]) : '');
      if (!id) { const inst = await newestInstance(client, name); id = inst?.sysId || ''; }
      instances.push({ id: id || '', name });
    }

    auditLog({
      timestamp: new Date().toISOString(), requestId: (req as any).requestId || '',
      action: 'ADHOC_LAUNCH', resource: name, details: kind, result: 'success', sessionId: req.sessionId,
    });
    res.json({ success: true, data: { instances }, timestamp: new Date().toISOString() });
  } catch (e: any) {
    const msg = e.response?.data || e.message;
    res.status(e.response?.status || 500).json({ success: false, error: typeof msg === 'string' ? msg : JSON.stringify(msg) });
  }
});

// ── Instance status (poll) ───────────────────────────────────────────────────
router.post('/instance/status', async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { instances } = req.body as { instances: { id: string; name: string }[] };
    if (!Array.isArray(instances)) { res.status(400).json({ success: false, error: 'instances array required' }); return; }
    const client = sbClient(req);

    const out = await Promise.all(instances.map(async (inst) => {
      let data: any = null;
      try {
        if (inst.id) {
          const r = await client.get('/resources/taskinstance', { params: { taskinstanceid: inst.id } });
          data = r.data;
        }
      } catch { /* fall through */ }
      if (!data && inst.name) data = await newestInstance(client, inst.name);
      const status = data?.status || 'Unknown';
      return {
        id: inst.id || data?.sysId || '',
        name: data?.name || inst.name,
        status,
        kind: statusKind(status),
        terminal: isTerminal(status),
        agent: data?.agent || data?.agentName || '',
        startTime: data?.startTime || '',
        endTime: data?.endTime || '',
        exitCode: data?.exitCode != null ? String(data.exitCode) : '',
        statusDescription: data?.statusDescription || '',
      };
    }));
    res.json({ success: true, data: { instances: out }, timestamp: new Date().toISOString() });
  } catch (e) { next(e); }
});

// ── Instance operations ───────────────────────────────────────────────────────
const OP_ENDPOINTS: Record<string, { url: string; body?: (id: string, name: string) => any }> = {
  cancel:          { url: '/resources/taskinstance/cancel' },
  forcefinish:     { url: '/resources/taskinstance/forcefinish' },
  halt:            { url: '/resources/taskinstance/forcefinish', body: (id) => ({ id, halt: true }) },
  forcefinishcancel: { url: '/resources/taskinstance/forcefinishcancel' },
  rerun:           { url: '/resources/taskinstance/rerun' },
  hold:            { url: '/resources/taskinstance/hold' },
  release:         { url: '/resources/taskinstance/release' },
  skip:            { url: '/resources/taskinstance/skip' },
  unskip:          { url: '/resources/taskinstance/unskip' },
};

router.post('/instance/op', async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { op, id, name } = req.body as { op: string; id?: string; name?: string };
    const def = OP_ENDPOINTS[op];
    if (!def) { res.status(400).json({ success: false, error: `Unsupported operation: ${op}` }); return; }
    if (!id && !name) { res.status(400).json({ success: false, error: 'id or name required' }); return; }
    const client = sbClient(req);
    const body = def.body ? def.body(id || '', name || '') : (id ? { id } : { name });
    try {
      const r = await client.post(def.url, body);
      auditLog({
        timestamp: new Date().toISOString(), requestId: (req as any).requestId || '',
        action: `ADHOC_${op.toUpperCase()}`, resource: name || id || '', result: 'success', sessionId: req.sessionId,
      });
      const msg = typeof r.data === 'string' ? r.data : (r.data?.message || 'OK');
      res.json({ success: true, data: { message: msg }, timestamp: new Date().toISOString() });
    } catch (e: any) {
      const msg = e.response?.data || e.message;
      res.status(e.response?.status || 502).json({ success: false, error: typeof msg === 'string' ? msg : JSON.stringify(msg) });
    }
  } catch (e) { next(e); }
});

export { router as adhocRouter };
