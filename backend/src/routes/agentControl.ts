import { Router, Response, NextFunction } from 'express';
import { StoneBranchService } from '../services/stoneBranchService';
import { AuthRequest } from '../middleware/session';
import { saveJob, removeJob, listPendingJobs, PersistedJob } from '../utils/jobPersistence';
import { auditLog } from '../middleware/auditLogger';
import { createModuleLogger } from '../config/logger';

const router = Router();
const log = createModuleLogger('agentControl');

const svc = (req: AuthRequest) =>
  new StoneBranchService(
    req.token     || process.env.AUTH_TOKEN || '',
    req.sbBaseUrl || process.env.BASE_URL   || ''
  );

// In-memory timer map — rebuilt on startup from persisted jobs
const activeTimers = new Map<string, NodeJS.Timeout>();

// ── Execute a scheduled job ───────────────────────────────────────────────────
async function executeJob(job: PersistedJob): Promise<void> {
  const target = job.target || 'agent';
  log.info(`Executing scheduled ${job.action} on ${job.agents.length} ${target}(s)`, { jobId: job.jobId });
  try {
    const service = new StoneBranchService(job.token, job.baseUrl);
    if (target === 'cluster') {
      if (job.action === 'suspend') await service.suspendClusters(job.agents);
      else                          await service.resumeClusters(job.agents);
    } else {
      if (job.action === 'suspend') await service.suspendAgents(job.agents);
      else                          await service.resumeAgents(job.agents);
    }
    log.info(`Scheduled job completed`, { jobId: job.jobId });
  } catch (e: any) {
    log.error(`Scheduled job failed`, { jobId: job.jobId, error: e });
  } finally {
    removeJob(job.jobId);
    activeTimers.delete(job.jobId);
  }
}

// ── Schedule a job with persistence ──────────────────────────────────────────
function scheduleJob(job: PersistedJob): void {
  const delay = new Date(job.scheduledAt).getTime() - Date.now();
  if (delay <= 0) {
    // Scheduled time has passed — do NOT execute. An operator may already have
    // handled it manually, and firing a stale suspend/resume could disrupt uptime.
    log.warn(`Scheduled job is overdue — skipped`, { jobId: job.jobId, scheduledAt: job.scheduledAt });
    removeJob(job.jobId);
    return;
  }
  const timer = setTimeout(() => executeJob(job), delay);
  activeTimers.set(job.jobId, timer);
  log.info(`Scheduled job registered`, { jobId: job.jobId, delaySeconds: Math.round(delay / 1000), scheduledAt: job.scheduledAt });
}

// ── Restore persisted jobs on startup ─────────────────────────────────────────
export function restoreScheduledJobs(): void {
  const all     = listPendingJobs();
  const now     = Date.now();
  const future  = all.filter(j => new Date(j.scheduledAt).getTime() > now);
  const overdue = all.filter(j => new Date(j.scheduledAt).getTime() <= now);

  if (overdue.length > 0) {
    log.warn(`Overdue scheduled jobs found on startup — skipped`, {
      count: overdue.length,
      jobs: overdue.map(j => ({ jobId: j.jobId, action: j.action, agents: j.agents, scheduledAt: j.scheduledAt })),
    });
    overdue.forEach(j => removeJob(j.jobId));
  }

  if (future.length === 0) {
    log.info('No pending future scheduled jobs to restore');
    return;
  }

  log.info(`Restoring future scheduled jobs from disk`, { count: future.length });
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

// ── Suspend clusters (bulk, immediate) ────────────────────────────────────────
router.post('/clusters/suspend', async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { clusters } = req.body as { clusters: string[] };
    if (!clusters?.length) { res.status(400).json({ error: 'clusters array required' }); return; }
    const results = await svc(req).suspendClusters(clusters);
    auditLog({
      timestamp: new Date().toISOString(), requestId: (req as any).requestId || '',
      action: 'CLUSTER_SUSPEND', resource: clusters.join(','),
      result: 'success', sessionId: req.sessionId,
    });
    res.json({ success: true, data: results, timestamp: new Date().toISOString() });
  } catch (e) { next(e); }
});

// ── Resume clusters (bulk, immediate) ──────────────────────────────────────────
router.post('/clusters/resume', async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { clusters } = req.body as { clusters: string[] };
    if (!clusters?.length) { res.status(400).json({ error: 'clusters array required' }); return; }
    const results = await svc(req).resumeClusters(clusters);
    auditLog({
      timestamp: new Date().toISOString(), requestId: (req as any).requestId || '',
      action: 'CLUSTER_RESUME', resource: clusters.join(','),
      result: 'success', sessionId: req.sessionId,
    });
    res.json({ success: true, data: results, timestamp: new Date().toISOString() });
  } catch (e) { next(e); }
});

// ── Schedule suspend/resume (persisted to disk) ────────────────────────────────
router.post('/schedule', async (req: AuthRequest, res: Response, _next: NextFunction): Promise<void> => {
  try {
    const { agents, action, scheduledAt, target } = req.body as {
      agents:      string[];
      action:      'suspend' | 'resume';
      scheduledAt: string;
      target?:     'agent' | 'cluster';
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
      target: target === 'cluster' ? 'cluster' : 'agent',
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
