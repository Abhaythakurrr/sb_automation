import { Router, Response, NextFunction } from 'express';
import { StoneBranchService } from '../services/stoneBranchService';
import { AuthRequest } from '../middleware/session';
import { createSession, deleteSession, sessionMiddleware } from '../middleware/session';
import { auditLog } from '../middleware/auditLogger';

const router = Router();

// Build service using token + baseUrl from request (resolved by sessionMiddleware)
const svc = (req: AuthRequest) =>
  new StoneBranchService(
    req.token     || process.env.AUTH_TOKEN || '',
    req.sbBaseUrl || process.env.BASE_URL   || ''
  );

// ── PUBLIC: Create session ─────────────────────────────────────────────────
// Token sent ONCE here — backend validates and returns a session ID only
router.post('/connect', async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { token, baseUrl, username } = req.body;
    if (!token || !baseUrl) {
      res.status(400).json({ success: false, error: 'token and baseUrl are required' });
      return;
    }
    const service = new StoneBranchService(token.trim(), baseUrl.trim());
    const valid = await service.validateToken();
    if (!valid) {
      auditLog({
        timestamp: new Date().toISOString(),
        requestId: (req as any).requestId || '',
        action: 'SESSION_CREATE',
        resource: baseUrl.trim(),
        result: 'failure',
        baseUrl: baseUrl.trim(),
      });
      res.status(401).json({ success: false, error: 'Token validation failed — verify the token and base URL' });
      return;
    }
    const sessionId = createSession(token.trim(), baseUrl.trim());
    auditLog({
      timestamp: new Date().toISOString(),
      requestId: (req as any).requestId || '',
      action: 'SESSION_CREATE',
      resource: baseUrl.trim(),
      result: 'success',
      sessionId,
      baseUrl: baseUrl.trim(),
    });
    res.json({
      success: true,
      data: {
        sessionId,
        username: username?.trim() || 'Operator',
        message: 'Connected. Use X-Session-ID for all subsequent requests.',
        expiresIn: '8 hours',
      },
      timestamp: new Date().toISOString(),
    });
  } catch (e) { next(e); }
});

// ── PUBLIC: Destroy session ────────────────────────────────────────────────
router.post('/disconnect', (req: AuthRequest, res: Response): void => {
  const sessionId = req.headers['x-session-id'] as string;
  if (sessionId) deleteSession(sessionId);
  auditLog({
    timestamp: new Date().toISOString(),
    requestId: (req as any).requestId || '',
    action: 'SESSION_DESTROY',
    resource: 'session',
    result: 'success',
    sessionId,
  });
  res.json({ success: true, message: 'Disconnected', timestamp: new Date().toISOString() });
});

// ── All routes below require a valid session ───────────────────────────────
router.use(sessionMiddleware);

// ── Validate (legacy) ──────────────────────────────────────────────────────
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

// ── Enable triggers (bulk) — called after user verifies jobs ───────────────
router.post('/triggers/enable', async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { triggerNames } = req.body as { triggerNames: string[] };
    if (!triggerNames?.length) { res.status(400).json({ error: 'triggerNames array required' }); return; }

    const service = svc(req);
    const results: any[] = [];

    for (const name of triggerNames) {
      try {
        await service.enableTrigger(name);
        results.push({ name, status: 'enabled' });
      } catch (e: any) {
        results.push({ name, status: 'failed', error: e.response?.data ?? e.message });
      }
    }

    auditLog({
      timestamp: new Date().toISOString(),
      requestId: (req as any).requestId || '',
      action: 'TRIGGERS_ENABLE',
      resource: triggerNames.join(','),
      details: `${results.filter(r => r.status === 'enabled').length}/${triggerNames.length} enabled`,
      result: 'success',
      sessionId: req.sessionId,
    });

    res.json({ success: true, data: { results }, timestamp: new Date().toISOString() });
  } catch (e) { next(e); }
});

export { router as stoneBranchRouter };
