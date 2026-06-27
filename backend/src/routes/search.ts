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

// Read-only fields to strip before PUT update.
// NOTE: `sysId` is intentionally NOT stripped — it is the record identifier UAC
// needs to apply a rename (changing the `name` field). It is only sent by the
// client when a rename is requested.
const READ_ONLY = ['version','exportReleaseLevel','exportTable','retainSysIds',
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
    // UAC requires the polymorphic `type` discriminator (e.g. taskUnix). If the
    // caller sent a partial diff without it, recover it from the current task.
    if (!payload.type) {
      try {
        const cur = await client.get('/resources/task', { params: { taskname: payload.name } });
        if (cur.data?.type) payload.type = cur.data.type;
      } catch { /* fall through — UAC will report if still missing */ }
    }
    if (!payload.type) {
      res.status(400).json({ success: false, error: 'Task "type" is required by UAC and could not be determined. Re-open the task and try again.' });
      return;
    }
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
    // Recover the `type` discriminator (e.g. triggerTime) if a partial diff omitted it.
    if (!payload.type) {
      try {
        const cur = await client.get('/resources/trigger', { params: { triggername: payload.name } });
        if (cur.data?.type) payload.type = cur.data.type;
      } catch { /* fall through */ }
    }
    if (!payload.type) {
      res.status(400).json({ success: false, error: 'Trigger "type" is required by UAC and could not be determined. Re-open the trigger and try again.' });
      return;
    }
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
