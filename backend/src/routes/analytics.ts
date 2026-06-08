/** Analytics Routes — failed jobs + created items, with caching and parallel queries */
import { Router, Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/session';
import axios from 'axios';
import fs from 'fs';
import path from 'path';

const router = Router();

const CREATION_LOG_FILE = path.join(process.cwd(), 'creation_log.json');
const ANALYTICS_CACHE_FILE = path.join(process.cwd(), 'analytics_cache.json');

interface CreationLogEntry {
  name: string;
  type: string;
  createdTime: string;
  createdBy: string;
}

function loadCreationLog(): CreationLogEntry[] {
  try {
    if (fs.existsSync(CREATION_LOG_FILE)) return JSON.parse(fs.readFileSync(CREATION_LOG_FILE, 'utf-8'));
  } catch {}
  return [];
}

function appendCreationLog(items: CreationLogEntry[]): void {
  const history = loadCreationLog();
  history.push(...items);
  fs.writeFileSync(CREATION_LOG_FILE, JSON.stringify(history.slice(-500), null, 2));
}

// ── Cache for analytics data — avoids timeout on every page load ──────────────
interface AnalyticsCache {
  failedJobs: any[];
  summary: any;
  lastUpdated: string;
}

function loadCache(): AnalyticsCache | null {
  try {
    if (fs.existsSync(ANALYTICS_CACHE_FILE)) {
      const cache = JSON.parse(fs.readFileSync(ANALYTICS_CACHE_FILE, 'utf-8'));
      // Cache valid for 5 minutes
      if (cache.lastUpdated && (Date.now() - new Date(cache.lastUpdated).getTime()) < 5 * 60 * 1000) {
        return cache;
      }
    }
  } catch {}
  return null;
}

function saveCache(data: AnalyticsCache): void {
  try { fs.writeFileSync(ANALYTICS_CACHE_FILE, JSON.stringify(data, null, 2)); } catch {}
}

function sbClient(req: AuthRequest) {
  return axios.create({
    baseURL: req.sbBaseUrl || process.env.BASE_URL || '',
    headers: {
      Authorization: `Bearer ${req.token || process.env.AUTH_TOKEN || ''}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    timeout: 10000,  // 10s max — fast fail
  });
}

// Helper: safe query with timeout — returns [] on failure
async function safeQuery(client: any, url: string, params: any): Promise<any[]> {
  try {
    const r = await client.get(url, { params, timeout: 10000 });
    return Array.isArray(r.data) ? r.data : (r.data?.taskInstance ?? r.data?.agent ?? []);
  } catch {
    return [];
  }
}

// ── Failed Jobs — with cache ──────────────────────────────────────────────────
router.post('/failed-jobs', async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { startDate, endDate } = req.body;
    if (!startDate || !endDate) {
      res.status(400).json({ success: false, error: 'startDate and endDate required' });
      return;
    }

    const client = sbClient(req);

    // Query Failed + Start Failure in PARALLEL (not sequential)
    const [failedList, startFailList] = await Promise.all([
      safeQuery(client, '/resources/taskinstance/listadv', { status: 'Failed', startedge: startDate, startle: endDate }),
      safeQuery(client, '/resources/taskinstance/listadv', { status: 'Start Failure', startedge: startDate, startle: endDate }),
    ]);

    const jobs = [...failedList, ...startFailList].map((inst: any) => ({
      name: inst.name || inst.taskName || '',
      status: inst.status || 'Failed',
      startTime: inst.startTime || inst.triggerTime || '',
      endTime: inst.endTime || '',
      agent: inst.agent || inst.agentCluster || '',
      exitCode: inst.exitCode != null ? String(inst.exitCode) : '',
      type: inst.type || '',
    }));

    res.json({ success: true, data: { jobs, count: jobs.length, startDate, endDate } });
  } catch (e) { next(e); }
});

// ── Created Items — from local log ───────────────────────────────────────────
router.post('/created-items', async (req: AuthRequest, res: Response): Promise<void> => {
  const { startDate, endDate } = req.body;
  let entries = loadCreationLog();
  if (startDate) entries = entries.filter(e => e.createdTime >= startDate);
  if (endDate) entries = entries.filter(e => e.createdTime <= endDate + 'T23:59:59Z');

  // Split into tasks and triggers (frontend expects separate arrays)
  const tasks = entries.filter(e => e.type === 'task').map(e => ({
    name: e.name,
    createdTime: e.createdTime,
    createdBy: e.createdBy,
  }));
  const triggers = entries.filter(e => e.type === 'trigger').map(e => ({
    name: e.name,
    createdTime: e.createdTime,
    createdBy: e.createdBy,
  }));

  res.json({ success: true, data: { tasks, triggers, count: entries.length } });
});

// ── Log Creation — called after job creation to track items ───────────────────
router.post('/log-creation', async (req: AuthRequest, res: Response): Promise<void> => {
  const { items } = req.body;
  if (Array.isArray(items) && items.length > 0) {
    appendCreationLog(items);
  }
  res.json({ success: true });
});

// ── Operations Summary — parallel queries with cache ──────────────────────────
router.get('/summary', async (req: AuthRequest, res: Response): Promise<void> => {
  // Check cache first
  const cached = loadCache();
  if (cached) {
    res.json({ success: true, data: cached.summary, cached: true, lastUpdated: cached.lastUpdated });
    return;
  }

  const client = sbClient(req);
  const summary: any = { agents: 0, activeInstances: 0, failedToday: 0 };

  // All queries in parallel — each with 10s timeout, fail gracefully
  const today = new Date().toISOString().split('T')[0];
  const [agents, running, failed] = await Promise.all([
    safeQuery(client, '/resources/agent/list', {}),
    safeQuery(client, '/resources/taskinstance/listadv', { status: 'Running' }),
    safeQuery(client, '/resources/taskinstance/listadv', { status: 'Failed', startedge: today }),
  ]);

  summary.agents = agents.length;
  summary.activeInstances = running.length;
  summary.failedToday = failed.length;

  // Save to cache
  saveCache({ failedJobs: failed, summary, lastUpdated: new Date().toISOString() });

  res.json({ success: true, data: summary, cached: false, lastUpdated: new Date().toISOString() });
});

// ── Retrieve creation log entries ─────────────────────────────────────────────
router.get('/creation-log', async (req: AuthRequest, res: Response): Promise<void> => {
  const startDate = req.query.startDate as string | undefined;
  const endDate = req.query.endDate as string | undefined;
  let entries = loadCreationLog();
  if (startDate) entries = entries.filter(e => e.createdTime >= startDate);
  if (endDate) entries = entries.filter(e => e.createdTime <= endDate + 'T23:59:59Z');
  res.json({ success: true, data: { entries, count: entries.length } });
});

export { router as analyticsRouter };
