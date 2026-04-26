import { Router, Response, NextFunction } from 'express';
import { StoneBranchService } from '../services/stoneBranchService';
import { AuthRequest } from '../middleware/auth';

const router = Router();

// Build service using token + baseUrl from request (both come from UI)
const svc = (req: AuthRequest) =>
  new StoneBranchService(
    req.token   || process.env.AUTH_TOKEN || '',
    req.sbBaseUrl || process.env.BASE_URL   || 'https://adient.stonebranch.cloud'
  );

// ── Validate token ─────────────────────────────────────────────────────────
router.get('/validate', async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const valid = await svc(req).validateToken();
    res.json({ success: valid, timestamp: new Date().toISOString() });
  } catch (e) { next(e); }
});

// ── Get task ───────────────────────────────────────────────────────────────
router.get('/task', async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { taskname } = req.query;
    if (!taskname) { res.status(400).json({ error: 'taskname required' }); return; }
    const data = await svc(req).getTask(taskname as string);
    res.json({ success: true, data, timestamp: new Date().toISOString() });
  } catch (e) { next(e); }
});

// ── Create task ────────────────────────────────────────────────────────────
router.post('/task', async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await svc(req).createTask(req.body);
    res.json({ success: true, data, timestamp: new Date().toISOString() });
  } catch (e) { next(e); }
});

// ── Resolve ref_job TIME trigger ───────────────────────────────────────────
router.get('/trigger/resolve', async (req: AuthRequest, res: Response, _next: NextFunction): Promise<void> => {
  try {
    const { refJob } = req.query;
    if (!refJob) { res.status(400).json({ error: 'refJob required' }); return; }

    const logs: string[] = [];
    const resolved = await svc(req).resolveRefJob(refJob as string, (msg) => logs.push(msg));
    res.json({ success: true, data: resolved, logs, timestamp: new Date().toISOString() });
  } catch (e: any) {
    res.status(404).json({ success: false, error: e.message, timestamp: new Date().toISOString() });
  }
});

// ── Create trigger ─────────────────────────────────────────────────────────
router.post('/trigger', async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await svc(req).createTrigger(req.body);
    res.json({ success: true, data, timestamp: new Date().toISOString() });
  } catch (e) { next(e); }
});

export { router as stoneBranchRouter };
