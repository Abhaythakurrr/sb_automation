/** Analytics Routes — failed jobs + created items queries */
import { Router, Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/session';
import axios from 'axios';

const router = Router();

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

    res.json({
      success: true,
      data: { tasks, triggers, taskCount: tasks.length, triggerCount: triggers.length, period: { startDate, endDate } },
    });
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
