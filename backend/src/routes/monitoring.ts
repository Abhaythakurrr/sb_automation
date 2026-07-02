import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { AuthRequest } from '../middleware/session';
import { runMonitoringCycle, MonitorConfig, loadAlertHistory, resolveWebhook } from '../services/monitoringService';
import fs   from 'fs';
import path from 'path';
import { auditLog } from '../middleware/auditLogger';

const router = Router();

// Zod schema for /start request body
const StartMonitoringSchema = z.object({
  teamsWebhookUrl:     z.string().url().optional(),
  pollIntervalMinutes: z.number().int().min(1).max(60).default(5),
  monitorAgents:       z.boolean().default(true),
  monitorJobs:         z.boolean().default(true),
  environment:         z.string().default('Production'),
});

// Active monitor config + timer
let activeConfig: MonitorConfig | null = null;
let monitorTimer: NodeJS.Timeout | null = null;
let monitorRunning = false;
let lastRunAt: string | null = null;
let lastResult: any = null;

const CONFIG_FILE = path.join(process.cwd(), 'monitor_config.json');

function loadConfig(): MonitorConfig | null {
  try {
    if (fs.existsSync(CONFIG_FILE)) return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
  } catch { /* ignore */ }
  return null;
}

function saveConfig(cfg: MonitorConfig): void {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2));
}

// Normalize a base URL for stable per-environment comparison.
function envKey(baseUrl?: string): string {
  if (!baseUrl) return '';
  try {
    const u = new URL(baseUrl);
    return `${u.protocol}//${u.host}${u.pathname}`.replace(/\/+$/, '').toLowerCase();
  } catch {
    return baseUrl.replace(/\/+$/, '').toLowerCase();
  }
}

// Keep the running monitor's TOKEN in sync with the latest authenticated session
// — but ONLY when the session is for the SAME environment the monitor runs in.
// We must never silently re-point the monitor at a different environment.
function refreshMonitorAuth(req: AuthRequest): void {
  if (!activeConfig || !req.token) return;
  if (envKey(req.sbBaseUrl) !== envKey(activeConfig.sbBaseUrl)) return; // different env — leave it alone
  if (activeConfig.sbToken !== req.token) {
    activeConfig.sbToken = req.token;
    saveConfig(activeConfig);
    console.log('[MONITOR] Refreshed monitoring token from active session (same environment)');
  }
}

async function runCycle(): Promise<void> {
  if (!activeConfig) return;
  try {
    lastRunAt = new Date().toISOString();
    lastResult = await runMonitoringCycle(activeConfig);
    console.log(`[MONITOR] Cycle complete — agents: ${lastResult.agentAlerts}, jobs: ${lastResult.jobAlerts}`);
    if (lastResult.errors.length > 0) {
      console.warn('[MONITOR] Errors:', lastResult.errors);
    }
  } catch (e: any) {
    console.error('[MONITOR] Cycle error:', e.message);
  }
}

function startMonitor(config: MonitorConfig): void {
  stopMonitor();
  activeConfig   = config;
  monitorRunning = true;
  saveConfig(config);
  // Run immediately then on interval
  runCycle();
  monitorTimer = setInterval(runCycle, config.pollIntervalMs);
  console.log(`[MONITOR] Started — interval: ${config.pollIntervalMs / 1000}s, agents: ${config.monitorAgents}, jobs: ${config.monitorJobs}`);
}

function stopMonitor(): void {
  if (monitorTimer) { clearInterval(monitorTimer); monitorTimer = null; }
  monitorRunning = false;
  console.log('[MONITOR] Stopped');
}

// ── Start monitoring ───────────────────────────────────────────────────────────
router.post('/start', async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const parsed = StartMonitoringSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: 'Invalid request body',
        details: parsed.error.flatten().fieldErrors,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const {
      teamsWebhookUrl,
      pollIntervalMinutes,
      monitorAgents,
      monitorJobs,
      environment,
    } = parsed.data;

    // Webhook: explicit request → env → hardcoded default (always linked).
    const resolvedWebhookUrl = resolveWebhook(teamsWebhookUrl);

    const config: MonitorConfig = {
      sbBaseUrl:       req.sbBaseUrl || process.env.BASE_URL || '',
      sbToken:         req.token     || process.env.AUTH_TOKEN || '',
      teamsWebhookUrl: resolvedWebhookUrl,
      pollIntervalMs:  pollIntervalMinutes * 60 * 1000,
      monitorAgents,
      monitorJobs,
      environment,
    };

    startMonitor(config);

    auditLog({
      timestamp: new Date().toISOString(),
      requestId: (req as any).requestId || '',
      action: 'MONITORING_START',
      resource: 'monitoring',
      details: `interval:${pollIntervalMinutes}m`,
      result: 'success',
      sessionId: req.sessionId,
    });

    res.json({
      success: true,
      data: {
        message:   `Monitoring started — polling every ${pollIntervalMinutes} minute(s)`,
        monitorAgents,
        monitorJobs,
        environment,
        pollIntervalMinutes,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (e) { next(e); }
});

// ── Per-session failed task instances (used by Self-Service bot, per env) ──────
router.get('/failures', async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const token   = req.token     || '';
    const baseUrl = req.sbBaseUrl  || '';
    if (!baseUrl) { res.status(400).json({ success: false, error: 'No base URL for this session' }); return; }
    const client = (await import('axios')).default.create({
      baseURL: baseUrl,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      timeout: 20000,
    });
    let instances: any[] = [];
    try {
      const r = await client.post('/resources/taskinstance/list', {
        name: '*', status: '140,120', updatedTimeType: 'Today',
      });
      instances = Array.isArray(r.data) ? r.data : (r.data?.taskInstance ?? []);
    } catch (e: any) {
      const msg = typeof e.response?.data === 'string' ? e.response.data : (e.message || 'query failed');
      res.status(502).json({ success: false, error: msg });
      return;
    }
    const jobs = instances.map((i: any) => ({
      name: i.name || i.taskName || '',
      status: i.status || 'Failed',
      agent: i.agent || i.agentName || '',
      startTime: i.startTime || i.triggerTime || '',
      endTime: i.endTime || '',
      sysId: i.sysId || i.id || '',
      exitCode: i.exitCode != null ? String(i.exitCode) : '',
    }));
    res.json({ success: true, data: { jobs, count: jobs.length }, timestamp: new Date().toISOString() });
  } catch (e) { next(e); }
});

// ── Stop monitoring ────────────────────────────────────────────────────────────
router.post('/stop', (_req: AuthRequest, res: Response): void => {
  stopMonitor();
  auditLog({
    timestamp: new Date().toISOString(),
    requestId: (_req as any).requestId || '',
    action: 'MONITORING_STOP',
    resource: 'monitoring',
    result: 'success',
    sessionId: _req.sessionId,
  });
  res.json({ success: true, message: 'Monitoring stopped', timestamp: new Date().toISOString() });
});

// ── Status ─────────────────────────────────────────────────────────────────────
router.get('/status', (req: AuthRequest, res: Response): void => {
  // Keep the background monitor's token fresh from the live session.
  refreshMonitorAuth(req);
  // Determine whether the running monitor belongs to the environment the caller
  // is currently connected to. If not, its stats/alerts are NOT for this env.
  const matchesConnectedEnv = !!activeConfig &&
    envKey(req.sbBaseUrl) === envKey(activeConfig.sbBaseUrl);
  res.json({
    success: true,
    data: {
      // Only report "running" for THIS environment when it actually matches.
      running:     monitorRunning && matchesConnectedEnv,
      runningAnyEnv: monitorRunning,
      matchesConnectedEnv,
      connectedBaseUrl: req.sbBaseUrl || '',
      lastRunAt:   matchesConnectedEnv ? lastRunAt : null,
      lastResult:  matchesConnectedEnv ? lastResult : null,
      config: activeConfig ? {
        environment:        activeConfig.environment,
        pollIntervalMs:     activeConfig.pollIntervalMs,
        monitorAgents:      activeConfig.monitorAgents,
        monitorJobs:        activeConfig.monitorJobs,
        sbBaseUrl:          activeConfig.sbBaseUrl,
        webhookConfigured:  !!activeConfig.teamsWebhookUrl,
        // Never expose token or the raw webhook URL in status
      } : null,
      webhookEnvConfigured: !!process.env.TEAMS_WEBHOOK_URL,
    },
    timestamp: new Date().toISOString(),
  });
});

// ── Run one cycle manually ─────────────────────────────────────────────────────
router.post('/run-now', async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!activeConfig) { res.status(400).json({ error: 'Monitoring not configured. Start it first.' }); return; }
    // Run Now always checks the environment the user is currently connected to —
    // retarget the monitor to the live session's token + base URL.
    if (req.token) activeConfig.sbToken = req.token;
    if (req.sbBaseUrl) activeConfig.sbBaseUrl = req.sbBaseUrl;
    saveConfig(activeConfig);
    await runCycle();
    res.json({ success: true, data: lastResult, timestamp: new Date().toISOString() });
  } catch (e) { next(e); }
});

// ── Clear alert state + history (reset dedup and wipe old alerts) ───────────────
router.post('/clear-state', (_req: AuthRequest, res: Response): void => {
  const stateFile   = path.join(process.cwd(), 'monitor_state.json');
  const historyFile = path.join(process.cwd(), 'alert_history.json');
  try { fs.unlinkSync(stateFile); } catch { /* ignore */ }
  try { fs.unlinkSync(historyFile); } catch { /* ignore */ }
  res.json({ success: true, message: 'Alert state and history cleared', timestamp: new Date().toISOString() });
});

// ── Alert history (scoped to the connected environment) ─────────────────────────
router.get('/alerts', (req: AuthRequest, res: Response): void => {
  refreshMonitorAuth(req);
  const key = envKey(req.sbBaseUrl);
  let history = loadAlertHistory();
  // Only show alerts that belong to the environment the user is connected to.
  if (key) history = history.filter(a => envKey(a.baseUrl) === key);
  res.json({
    success: true,
    data: { total: history.length, alerts: history.slice().reverse(), environment: req.sbBaseUrl || '' }, // newest first
    timestamp: new Date().toISOString(),
  });
});

// ── Audit log ──────────────────────────────────────────────────────────────
router.get('/audit', (_req: AuthRequest, res: Response): void => {
  const auditFile = path.join(process.cwd(), 'audit.log');
  try {
    if (!fs.existsSync(auditFile)) {
      res.json({ success: true, data: { entries: [] }, timestamp: new Date().toISOString() });
      return;
    }
    const lines = fs.readFileSync(auditFile, 'utf-8')
      .split('\n')
      .filter(Boolean)
      .map(l => { try { return JSON.parse(l); } catch { return null; } })
      .filter(Boolean)
      .reverse() // newest first
      .slice(0, 500); // last 500 entries
    res.json({ success: true, data: { total: lines.length, entries: lines }, timestamp: new Date().toISOString() });
  } catch (e: any) {
    res.status(500).json({ success: false, error: 'Could not read audit log', timestamp: new Date().toISOString() });
  }
});

// ── Auto-restore on startup ────────────────────────────────────────────────────
export function restoreMonitoring(): void {
  const cfg = loadConfig();
  if (!cfg) { console.log('[MONITOR] No saved config to restore'); return; }
  console.log(`[MONITOR] Restoring monitoring config for ${cfg.environment}`);
  startMonitor(cfg);
}

export { router as monitoringRouter };
