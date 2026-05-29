import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { AuthRequest } from '../middleware/session';
import { runMonitoringCycle, MonitorConfig, loadAlertHistory } from '../services/monitoringService';
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

    // Webhook URL: env var is the default; request body can override for flexibility
    const resolvedWebhookUrl = teamsWebhookUrl || process.env.TEAMS_WEBHOOK_URL || '';

    if (!resolvedWebhookUrl) {
      res.status(400).json({ error: 'Teams webhook URL not configured. Set TEAMS_WEBHOOK_URL env var.' });
      return;
    }

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
router.get('/status', (_req: AuthRequest, res: Response): void => {
  res.json({
    success: true,
    data: {
      running:     monitorRunning,
      lastRunAt,
      lastResult,
      config: activeConfig ? {
        environment:        activeConfig.environment,
        pollIntervalMs:     activeConfig.pollIntervalMs,
        monitorAgents:      activeConfig.monitorAgents,
        monitorJobs:        activeConfig.monitorJobs,
        sbBaseUrl:          activeConfig.sbBaseUrl,
        // Never expose token in status
      } : null,
    },
    timestamp: new Date().toISOString(),
  });
});

// ── Run one cycle manually ─────────────────────────────────────────────────────
router.post('/run-now', async (_req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!activeConfig) { res.status(400).json({ error: 'Monitoring not configured. Start it first.' }); return; }
    await runCycle();
    res.json({ success: true, data: lastResult, timestamp: new Date().toISOString() });
  } catch (e) { next(e); }
});

// ── Clear alert state (reset deduplication) ────────────────────────────────────
router.post('/clear-state', (_req: AuthRequest, res: Response): void => {
  const stateFile = path.join(process.cwd(), 'monitor_state.json');
  try { fs.unlinkSync(stateFile); } catch { /* ignore */ }
  res.json({ success: true, message: 'Alert state cleared', timestamp: new Date().toISOString() });
});

// ── Alert history ──────────────────────────────────────────────────────────────
router.get('/alerts', (_req: AuthRequest, res: Response): void => {
  const history = loadAlertHistory();
  res.json({
    success: true,
    data: { total: history.length, alerts: history.slice().reverse() }, // newest first
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
