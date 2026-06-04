/** Analytics Routes — failed jobs + created items queries */
import { Router, Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/session';
import axios from 'axios';
import fs from 'fs';
import path from 'path';

const router = Router();

const CREATION_LOG_FILE = path.join(process.cwd(), 'creation_log.json');

interface CreationLogEntry {
  name: string;
  type: string;  // 'task' | 'trigger'
  createdTime: string;
  createdBy: string;
}

function loadCreationLog(): CreationLogEntry[] {
  try {
    if (fs.existsSync(CREATION_LOG_FILE)) return JSON.parse(fs.readFileSync(CREATION_LOG_FILE, 'utf-8'));
  } catch { /* ignore */ }
  return [];
}

function appendCreationLog(items: CreationLogEntry[]): void {
  const history = loadCreationLog();
  history.push(...items);
  const trimmed = history.slice(-500);
  fs.writeFileSync(CREATION_LOG_FILE, JSON.stringify(trimmed, null, 2));
}

function sbClient(req: AuthRequest) {
  return axios.create({
    baseURL: req.sbBaseUrl || process.env.BASE_URL || '',
    headers: {
      Authorization: `Bearer ${req.token || process.env.AUTH_TOKEN || ''}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    timeout: 60000,
  });
}

// ── Failed Jobs for date range ────────────────────────────────────────────────
router.post('/failed-jobs', async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { startDate, endDate } = req.body;
    if (!startDate || !endDate) {
      res.status(400).json({ success: false, error: 'startDate and endDate required' });
      return;
    }

    const client = sbClient(req);
    const jobs: any[] = [];

    // Fetch failed task instances using UAC API
    // UAC POST /resources/taskinstance/list requires `name` — use GET listadv instead
    try {
      const r = await client.get('/resources/taskinstance/listadv', {
        params: {
          status: 'Failed',
          startedge: startDate,
          startle: endDate,
        },
        timeout: 60000,
      });
      const list = Array.isArray(r.data) ? r.data : (r.data?.taskInstance ?? []);
      list.forEach((inst: any) => {
        jobs.push({
          name: inst.name || inst.taskName || '',
          status: inst.status || 'Failed',
          startTime: inst.startTime || inst.triggerTime || '',
          endTime: inst.endTime || '',
          agent: inst.agent || inst.agentCluster || '',
          exitCode: inst.exitCode != null ? String(inst.exitCode) : '',
          type: inst.type || '',
        });
      });

      // Also fetch "Start Failure" status
      try {
        const r2 = await client.get('/resources/taskinstance/listadv', {
          params: {
            status: 'Start Failure',
            startedge: startDate,
            startle: endDate,
          },
          timeout: 60000,
        });
        const list2 = Array.isArray(r2.data) ? r2.data : (r2.data?.taskInstance ?? []);
        list2.forEach((inst: any) => {
          jobs.push({
            name: inst.name || inst.taskName || '',
            status: inst.status || 'Start Failure',
            startTime: inst.startTime || inst.triggerTime || '',
            endTime: inst.endTime || '',
            agent: inst.agent || inst.agentCluster || '',
            exitCode: inst.exitCode != null ? String(inst.exitCode) : '',
            type: inst.type || '',
          });
        });
      } catch { /* Start Failure may not have results */ }
    } catch (e: any) {
      // Fallback: try with updatedTime param
      try {
        const r = await client.get('/resources/taskinstance/listadv', {
          params: {
            status: 'Failed',
            updatedTime: startDate,
          },
          timeout: 60000,
        });
        const list = Array.isArray(r.data) ? r.data : (r.data?.taskInstance ?? []);
        list.forEach((inst: any) => {
          jobs.push({
            name: inst.name || inst.taskName || '',
            status: inst.status || 'Failed',
            startTime: inst.startTime || '',
            endTime: inst.endTime || '',
            agent: inst.agent || '',
            exitCode: inst.exitCode != null ? String(inst.exitCode) : '',
            type: inst.type || '',
          });
        });
      } catch { /* no data available */ }
    }

    res.json({ success: true, data: { jobs, count: jobs.length, period: { startDate, endDate } } });
  } catch (e) { next(e); }
});

// ── Created tasks/triggers for date range ─────────────────────────────────────
router.post('/created-items', async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { startDate, endDate } = req.body;
    if (!startDate || !endDate) {
      res.status(400).json({ success: false, error: 'startDate and endDate required' });
      return;
    }

    const client = sbClient(req);
    const tasks: any[] = [];
    const triggers: any[] = [];

    // Fetch tasks created in date range
    try {
      const r = await client.get('/resources/task/listadv', {
        params: { createdge: startDate, createdle: endDate },
        timeout: 30000,
      });
      const list = Array.isArray(r.data) ? r.data : (r.data?.task ?? []);
      list.forEach((t: any) => {
        tasks.push({
          name: t.name || '',
          type: t.type || '',
          createdTime: t.createTime || t.createdTime || '',
          createdBy: t.createdBy || '',
        });
      });
    } catch { /* not all UAC versions support createdge filter */ }

    // Fetch triggers created in date range
    try {
      const r = await client.get('/resources/trigger/listadv', {
        params: { createdge: startDate, createdle: endDate },
        timeout: 30000,
      });
      const list = Array.isArray(r.data) ? r.data : (r.data?.trigger ?? []);
      list.forEach((t: any) => {
        triggers.push({
          name: t.name || '',
          type: t.type || '',
          createdTime: t.createTime || t.createdTime || '',
          createdBy: t.createdBy || '',
        });
      });
    } catch { /* not all UAC versions support this */ }

    // Merge local creation log entries
    const localEntries = loadCreationLog();
    const filteredLocal = localEntries.filter(e => e.createdTime >= startDate && e.createdTime <= endDate + 'T23:59:59Z');
    filteredLocal.forEach(entry => {
      const item = { name: entry.name, type: entry.type, createdTime: entry.createdTime, createdBy: entry.createdBy };
      if (entry.type === 'task' || entry.type.includes('task')) {
        tasks.push(item);
      } else {
        triggers.push(item);
      }
    });

    res.json({
      success: true,
      data: { tasks, triggers, taskCount: tasks.length, triggerCount: triggers.length, period: { startDate, endDate } },
    });
  } catch (e) { next(e); }
});

// ── Log creation entries locally ──────────────────────────────────────────────
router.post('/log-creation', async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { items } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      res.status(400).json({ success: false, error: 'items array required' });
      return;
    }
    const entries: CreationLogEntry[] = items.map((item: any) => ({
      name: item.name || '',
      type: item.type || 'task',
      createdTime: item.createdTime || new Date().toISOString(),
      createdBy: item.createdBy || '',
    }));
    appendCreationLog(entries);
    res.json({ success: true, data: { logged: entries.length } });
  } catch (e) { next(e); }
});

// ── Retrieve creation log entries ─────────────────────────────────────────────
router.get('/creation-log', async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const startDate = req.query.startDate as string | undefined;
    const endDate = req.query.endDate as string | undefined;
    let entries = loadCreationLog();
    if (startDate) entries = entries.filter(e => e.createdTime >= startDate);
    if (endDate) entries = entries.filter(e => e.createdTime <= endDate + 'T23:59:59Z');
    res.json({ success: true, data: { entries, count: entries.length } });
  } catch (e) { next(e); }
});

// ── Operations summary — overall stats ────────────────────────────────────────
router.get('/summary', async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const client = sbClient(req);
    const summary: any = { agents: 0, tasks: 0, triggers: 0, activeInstances: 0 };

    // Count agents
    try {
      const r = await client.get('/resources/agent/list');
      const list = Array.isArray(r.data) ? r.data : (r.data?.agent ?? []);
      summary.agents = list.length;
    } catch {}

    // Count active task instances
    try {
      const r = await client.post('/resources/taskinstance/list', { status: 'Running' });
      const list = Array.isArray(r.data) ? r.data : (r.data?.taskInstance ?? []);
      summary.activeInstances = list.length;
    } catch {}

    res.json({ success: true, data: summary });
  } catch (e) { next(e); }
});

export { router as analyticsRouter };
