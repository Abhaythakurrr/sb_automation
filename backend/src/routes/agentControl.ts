import { Router, Response, NextFunction } from 'express';
import { StoneBranchService } from '../services/stoneBranchService';
import { AuthRequest } from '../middleware/session';
import { saveJob, removeJob, listPendingJobs, PersistedJob } from '../utils/jobPersistence';
import { auditLog } from '../middleware/auditLogger';

const router = Router();

const svc = (req: AuthRequest) =>
  new StoneBranchService(
    req.token     || process.env.AUTH_TOKEN || '',
    req.sbBaseUrl || process.env.BASE_URL   || 'https://adient.stonebranch.cloud'
  );

// In-memory timer map — rebuilt on startup from persisted jobs
const activeTimers = new Map<string, NodeJS.Timeout>();

// ── Execute a scheduled job ───────────────────────────────────────────────────
async function executeJob(job: PersistedJob): Promise<void> {
  console.log(`[SCHEDULE] Executing ${job.action} for ${job.agents.length} agent(s) — Job: ${job.jobId}`);
  try {
    const service = new StoneBranchService(job.token, job.baseUrl);
    if (job.action === 'suspend') await service.suspendAgents(job.agents);
    else                          await service.resumeAgents(job.agents);
    console.log(`[SCHEDULE] Job ${job.jobId} completed successfully`);
  } catch (e: any) {
    console.error(`[SCHEDULE] Job ${job.jobId} failed:`, e.message);
  } finally {
    removeJob(job.jobId);
    activeTimers.delete(job.jobId);
  }
}

// ── Schedule a job with persistence ──────────────────────────────────────────
function scheduleJob(job: PersistedJob): void {
  const delay = new Date(job.scheduledAt).getTime() - Date.now();
  if (delay <= 0) {
    // Scheduled time has passed — DO NOT execute.
    // Admin may have already handled it manually. Executing now could affect server uptime.
    console.warn(`[SCHEDULE] Job ${job.jobId} is overdue (was due ${job.scheduledAt}) — SKIPPED. Remove manually if needed.`);
    removeJob(job.jobId);
    return;
  }
  const timer = setTimeout(() => executeJob(job), delay);
  activeTimers.set(job.jobId, timer);
  console.log(`[SCHEDULE] Job ${job.jobId} scheduled in ${Math.round(delay / 1000)}s (${job.scheduledAt})`);
}

// ── Restore persisted jobs on startup ─────────────────────────────────────────
export function restoreScheduledJobs(): void {
  const all     = listPendingJobs();
  const now     = Date.now();
  const future  = all.filter(j => new Date(j.scheduledAt).getTime() > now);
  const overdue = all.filter(j => new Date(j.scheduledAt).getTime() <= now);

  if (overdue.length > 0) {
    console.warn(`[SCHEDULE] ${overdue.length} overdue job(s) found — SKIPPED (may have been handled manually):`);
    overdue.forEach(j => {
      console.warn(`  - ${j.jobId}: ${j.action} on [${j.agents.join(', ')}] was due ${j.scheduledAt}`);
      removeJob(j.jobId);
    });
  }

  if (future.length === 0) {
    console.log('[SCHEDULE] No pending future jobs to restore');
    return;
  }

  console.log(`[SCHEDULE] Restoring ${future.length} future job(s) from disk`);
  future.forEach(job => scheduleJob(job));
}

// ── List all agents ────────────────────────────────────────────────────────────
router.get('/list', async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const service = svc(req);
    const [agents, clusters] = await Promise.all([
      service.listAgents(),
      service.listAgentClusters(),
    ]);
    res.json({
      success: true,
      data: { agents, clusters, agentCount: agents.length, clusterCount: clusters.length },
      timestamp: new Date().toISOString(),
    });
  } catch (e) { next(e); }
});

// ── Suspend agents (bulk, immediate) ──────────────────────────────────────────
router.post('/suspend', async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { agents } = req.body as { agents: string[] };
    if (!agents?.length) { res.status(400).json({ error: 'agents array required' }); return; }
    try {
      const results = await svc(req).suspendAgents(agents);
      auditLog({
        timestamp: new Date().toISOString(),
        requestId: (req as any).requestId || '',
        action: 'AGENT_SUSPEND',
        resource: agents.join(','),
        result: 'success',
        sessionId: req.sessionId,
      });
      res.json({ success: true, data: results, timestamp: new Date().toISOString() });
    } catch (e) {
      auditLog({
        timestamp: new Date().toISOString(),
        requestId: (req as any).requestId || '',
        action: 'AGENT_SUSPEND',
        resource: agents.join(','),
        result: 'failure',
        sessionId: req.sessionId,
      });
      throw e;
    }
  } catch (e) { next(e); }
});

// ── Resume agents (bulk, immediate) ───────────────────────────────────────────
router.post('/resume', async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { agents } = req.body as { agents: string[] };
    if (!agents?.length) { res.status(400).json({ error: 'agents array required' }); return; }
    try {
      const results = await svc(req).resumeAgents(agents);
      auditLog({
        timestamp: new Date().toISOString(),
        requestId: (req as any).requestId || '',
        action: 'AGENT_RESUME',
        resource: agents.join(','),
        result: 'success',
        sessionId: req.sessionId,
      });
      res.json({ success: true, data: results, timestamp: new Date().toISOString() });
    } catch (e) {
      auditLog({
        timestamp: new Date().toISOString(),
        requestId: (req as any).requestId || '',
        action: 'AGENT_RESUME',
        resource: agents.join(','),
        result: 'failure',
        sessionId: req.sessionId,
      });
      throw e;
    }
  } catch (e) { next(e); }
});

// ── Schedule suspend/resume (persisted to disk) ────────────────────────────────
router.post('/schedule', async (req: AuthRequest, res: Response, _next: NextFunction): Promise<void> => {
  try {
    const { agents, action, scheduledAt } = req.body as {
      agents:      string[];
      action:      'suspend' | 'resume';
      scheduledAt: string;
    };

    if (!agents?.length)  { res.status(400).json({ error: 'agents required' }); return; }
    if (!action)          { res.status(400).json({ error: 'action required (suspend|resume)' }); return; }
    if (!scheduledAt)     { res.status(400).json({ error: 'scheduledAt required (ISO datetime)' }); return; }

    const runAt = new Date(scheduledAt).getTime();
    if (runAt <= Date.now()) {
      res.status(400).json({ error: 'scheduledAt must be in the future' });
      return;
    }

    const jobId = `${action}-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
    const token    = req.token     || process.env.AUTH_TOKEN || '';
    const baseUrl  = req.sbBaseUrl || process.env.BASE_URL   || '';

    const job: PersistedJob = {
      jobId,
      action,
      agents,
      scheduledAt,
      token,
      baseUrl,
      createdAt: new Date().toISOString(),
    };

    // Persist to disk FIRST — then schedule in memory
    saveJob(job);
    scheduleJob(job);

    const delayMs = runAt - Date.now();
    const delayMin = Math.round(delayMs / 60000);

    auditLog({
      timestamp: new Date().toISOString(),
      requestId: (req as any).requestId || '',
      action: 'AGENT_SCHEDULE',
      resource: agents.join(','),
      details: `${action} at ${scheduledAt}`,
      result: 'success',
      sessionId: req.sessionId,
    });

    res.json({
      success: true,
      data: {
        jobId,
        action,
        agents,
        scheduledAt,
        delayMs,
        message: `${action} scheduled for ${agents.length} agent(s) at ${scheduledAt} (~${delayMin} min from now). Job persisted — will survive backend restarts.`,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Cancel scheduled job ───────────────────────────────────────────────────────
router.delete('/schedule/:jobId', (req: AuthRequest, res: Response): void => {
  const { jobId } = req.params;
  const timer = activeTimers.get(jobId);
  if (!timer) {
    // Check if it exists on disk but timer was lost (e.g. after restart)
    const pending = listPendingJobs();
    const job = pending.find(j => j.jobId === jobId);
    if (!job) { res.status(404).json({ error: 'Scheduled job not found' }); return; }
    removeJob(jobId);
    res.json({ success: true, message: `Job ${jobId} removed from disk`, timestamp: new Date().toISOString() });
    return;
  }
  clearTimeout(timer);
  activeTimers.delete(jobId);
  removeJob(jobId);
  res.json({ success: true, message: `Job ${jobId} cancelled`, timestamp: new Date().toISOString() });
});

// ── List scheduled jobs (from disk — survives restarts) ────────────────────────
router.get('/schedule', (_req: AuthRequest, res: Response): void => {
  const pending = listPendingJobs();
  res.json({
    success: true,
    data: {
      total:  pending.length,
      active: activeTimers.size,
      jobs:   pending.map(j => ({
        jobId:       j.jobId,
        action:      j.action,
        agents:      j.agents,
        scheduledAt: j.scheduledAt,
        createdAt:   j.createdAt,
        inMemory:    activeTimers.has(j.jobId),
      })),
    },
    timestamp: new Date().toISOString(),
  });
});

export { router as agentControlRouter };
