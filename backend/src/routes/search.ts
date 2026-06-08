/** Search & Edit Routes — quick job/trigger lookup and inline editing */
import { Router, Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/session';
import axios from 'axios';
import { auditLog } from '../middleware/auditLogger';

const router = Router();

function sbClient(req: AuthRequest) {
  return axios.create({
    baseURL: req.sbBaseUrl || '',
    headers: {
      Authorization: `Bearer ${req.token || ''}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    timeout: 15000,
  });
}

// Read-only fields to strip before PUT update
const READ_ONLY = ['sysId','version','exportReleaseLevel','exportTable','retainSysIds',
  'nextScheduledTime','enabledBy','enabledTime','disabledBy','disabledTime',
  'avgRunTime','avgRunTimeDisplay','minRunTime','minRunTimeDisplay',
  'maxRunTimeDisplay','lastRunTime','lastRunTimeDisplay','runCount','runTime','firstRun','lastRun',
  'createdBy','created','updatedBy','updated'];

// ── Search Task ───────────────────────────────────────────────────────────────
router.get('/task', async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { name } = req.query;
    if (!name) { res.status(400).json({ success: false, error: 'name query param required' }); return; }
    const client = sbClient(req);
    const r = await client.get('/resources/task', { params: { taskname: name } });
    res.json({ success: true, data: r.data });
  } catch (e: any) {
    const msg = e.response?.data || e.message;
    res.status(e.response?.status || 500).json({ success: false, error: typeof msg === 'string' ? msg : JSON.stringify(msg) });
  }
});

// ── Search Trigger ────────────────────────────────────────────────────────────
router.get('/trigger', async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { name } = req.query;
    if (!name) { res.status(400).json({ success: false, error: 'name query param required' }); return; }
    const client = sbClient(req);
    const r = await client.get('/resources/trigger', { params: { triggername: name } });
    res.json({ success: true, data: r.data });
  } catch (e: any) {
    const msg = e.response?.data || e.message;
    res.status(e.response?.status || 500).json({ success: false, error: typeof msg === 'string' ? msg : JSON.stringify(msg) });
  }
});

// ── Update Task ───────────────────────────────────────────────────────────────
router.put('/task', async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const payload = { ...req.body };
    if (!payload.name) { res.status(400).json({ success: false, error: 'name required in body' }); return; }
    // Strip read-only fields
    READ_ONLY.forEach(f => delete payload[f]);
    const client = sbClient(req);
    const r = await client.put('/resources/task', payload);
    auditLog({
      timestamp: new Date().toISOString(),
      requestId: (req as any).requestId || '',
      action: 'TASK_UPDATE',
      resource: payload.name,
      result: 'success',
      sessionId: req.sessionId,
    });
    res.json({ success: true, data: r.data, message: `Task ${payload.name} updated` });
  } catch (e: any) {
    const msg = e.response?.data || e.message;
    res.status(e.response?.status || 500).json({ success: false, error: typeof msg === 'string' ? msg : JSON.stringify(msg) });
  }
});

// ── Update Trigger ────────────────────────────────────────────────────────────
router.put('/trigger', async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const payload = { ...req.body };
    if (!payload.name) { res.status(400).json({ success: false, error: 'name required in body' }); return; }
    READ_ONLY.forEach(f => delete payload[f]);
    const client = sbClient(req);
    const r = await client.put('/resources/trigger', payload);
    auditLog({
      timestamp: new Date().toISOString(),
      requestId: (req as any).requestId || '',
      action: 'TRIGGER_UPDATE',
      resource: payload.name,
      result: 'success',
      sessionId: req.sessionId,
    });
    res.json({ success: true, data: r.data, message: `Trigger ${payload.name} updated` });
  } catch (e: any) {
    const msg = e.response?.data || e.message;
    res.status(e.response?.status || 500).json({ success: false, error: typeof msg === 'string' ? msg : JSON.stringify(msg) });
  }
});

export { router as searchRouter };
