import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { AuthRequest } from '../middleware/session';
import { runMonitoringCycle, MonitorConfig, loadAlertHistory, resolveWebhook } from '../services/monitoringService';
import fs   from 'fs';
import path from 'path';
import { auditLog, auditLogPath } from '../middleware/auditLogger';
import { createModuleLogger } from '../config/logger';

const router = Router();
const log = createModuleLogger('monitoring');

// Session IDs are opaque handles — keep only a short prefix in operational logs.
const shortSession = (id?: string) => (id ? id.slice(0, 8) : 'unknown');

// Zod schema for /start request body
const StartMonitoringSchema = z.object({
  teamsWebhookUrl:     z.string().url().optional(),
  pollIntervalMinutes: z.number().int().min(1).max(60).default(5),
  monitorAgents:       z.boolean().default(true),
  monitorJobs:         z.boolean().default(true),
  environment:         z.string().default('Production'),
});

// Active monitor config + timer per session
const activeConfigs = new Map<string, { config: MonitorConfig; timer: NodeJS.Timeout }>();
let lastRunAtBySession = new Map<string, string | null>();
let lastResultBySession = new Map<string, any>();

const CONFIG_DIR = path.join(process.cwd(), 'monitor_configs');
const STATE_DIR  = path.join(process.cwd(), 'monitor_states');
const HISTORY_DIR = path.join(process.cwd(), 'monitor_history');

// Ensure directories exist
[CONFIG_DIR, STATE_DIR, HISTORY_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// Cleanup old single-session file if exists (migration)
const OLD_CONFIG_FILE = path.join(process.cwd(), 'monitor_config.json');
if (fs.existsSync(OLD_CONFIG_FILE)) {
  try {
    const oldConfig = JSON.parse(fs.readFileSync(OLD_CONFIG_FILE, 'utf-8'));
    // If there's no session ID in old config, create one from environment
    if (!oldConfig.sessionId) {
      oldConfig.sessionId = 'legacy';
      saveConfig('legacy', oldConfig);
    }
    fs.unlinkSync(OLD_CONFIG_FILE);
    log.info('Migrated legacy monitor config to session-scoped storage');
  } catch { /* ignore */ }
}

function getConfigFile(sessionId: string): string {
  return path.join(CONFIG_DIR, `monitor_config_${sessionId}.json`);
}

function getStateFile(sessionId: string): string {
  return path.join(STATE_DIR, `monitor_state_${sessionId}.json`);
}

function getHistoryFile(sessionId: string): string {
  return path.join(HISTORY_DIR, `alert_history_${sessionId}.json`);
}

function loadConfig(sessionId: string): MonitorConfig | null {
  try {
    const configFile = getConfigFile(sessionId);
    if (fs.existsSync(configFile)) return JSON.parse(fs.readFileSync(configFile, 'utf-8'));
  } catch { /* ignore */ }
  return null;
}

function saveConfig(sessionId: string, cfg: MonitorConfig): void {
  const configFile = getConfigFile(sessionId);
  fs.writeFileSync(configFile, JSON.stringify(cfg, null, 2));
}

function loadState(sessionId: string): any {
  try {
    const stateFile = getStateFile(sessionId);
    if (fs.existsSync(stateFile)) return JSON.parse(fs.readFileSync(stateFile, 'utf-8'));
  } catch { /* ignore */ }
  return { offlineAgents: {}, failedJobs: {} };
}

function saveState(sessionId: string, state: any): void {
  const stateFile = getStateFile(sessionId);
  fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
}

function loadAlertHistoryForSession(sessionId: string): any[] {
  try {
    const historyFile = getHistoryFile(sessionId);
    if (fs.existsSync(historyFile)) return JSON.parse(fs.readFileSync(historyFile, 'utf-8'));
  } catch { /* ignore */ }
  return [];
}

function appendAlert(sessionId: string, alert: any): void {
  const history = loadAlertHistoryForSession(sessionId);
  history.push(alert);
  // Keep last 200
  const trimmed = history.slice(-200);
  const historyFile = getHistoryFile(sessionId);
  fs.writeFileSync(historyFile, JSON.stringify(trimmed, null, 2));
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
  const sessionId = req.sessionId;
  if (!sessionId) return;
  
  const active = activeConfigs.get(sessionId);
  if (!active || !req.token) return;
  
  const config = active.config;
  if (envKey(req.sbBaseUrl) !== envKey(config.sbBaseUrl)) return; // different env — leave it alone
  if (config.sbToken !== req.token) {
    config.sbToken = req.token;
    saveConfig(sessionId, config);
    log.debug('Refreshed monitoring token from active session', { session: shortSession(sessionId) });
  }
}

// Start a new monitor for the session
function startMonitor(sessionId: string, config: MonitorConfig): void {
  // Stop any existing monitor for this session
  stopMonitor(sessionId);
  
  activeConfigs.set(sessionId, {
    config,
    timer: setInterval(() => runCycle(sessionId), config.pollIntervalMs),
  });
  
  // Run immediately then on interval
  runCycle(sessionId);
  saveConfig(sessionId, config);

  log.info('Monitoring started', {
    session: shortSession(sessionId),
    intervalSeconds: config.pollIntervalMs / 1000,
    monitorAgents: config.monitorAgents,
    monitorJobs: config.monitorJobs,
  });
}

// Stop monitor for a specific session
function stopMonitor(sessionId: string): void {
  const active = activeConfigs.get(sessionId);
  if (active) {
    clearInterval(active.timer);
    activeConfigs.delete(sessionId);
    log.info('Monitoring stopped', { session: shortSession(sessionId) });
  }
}

// Get status for a specific session
function getStatus(sessionId: string): {
  running: boolean;
  config: MonitorConfig | null;
  lastRunAt: string | null;
  lastResult: any;
} {
  const active = activeConfigs.get(sessionId);
  return {
    running: !!active,
    config: active ? active.config : null,
    lastRunAt: lastRunAtBySession.get(sessionId) || null,
    lastResult: lastResultBySession.get(sessionId) || null,
  };
}

async function runCycle(sessionId: string): Promise<void> {
  const active = activeConfigs.get(sessionId);
  if (!active) return;
  
  try {
    const result = await runMonitoringCycle(active.config);
    lastRunAtBySession.set(sessionId, new Date().toISOString());
    lastResultBySession.set(sessionId, result);
    log.info('Monitoring cycle complete', {
      session: shortSession(sessionId),
      agentAlerts: result.agentAlerts,
      jobAlerts: result.jobAlerts,
    });
    if (result.errors.length > 0) {
      log.warn('Monitoring cycle reported errors', { session: shortSession(sessionId), errors: result.errors });
    }
  } catch (e: any) {
    log.error('Monitoring cycle failed', { session: shortSession(sessionId), error: e });
  }
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

    const sessionId = req.sessionId || 'unknown';
    const config: MonitorConfig = {
      sessionId,
      sbBaseUrl:       req.sbBaseUrl || process.env.BASE_URL || '',
      sbToken:         req.token     || process.env.AUTH_TOKEN || '',
      teamsWebhookUrl: resolvedWebhookUrl,
      pollIntervalMs:  pollIntervalMinutes * 60 * 1000,
      monitorAgents,
      monitorJobs,
      environment,
    };

    startMonitor(sessionId, config);

    auditLog({
      timestamp: new Date().toISOString(),
      requestId: (req as any).requestId || '',
      action: 'MONITORING_START',
      resource: 'monitoring',
      details: `interval:${pollIntervalMinutes}m`,
      result: 'success',
      sessionId: sessionId,
    });

    res.json({
      success: true,
      data: {
        message:   `Monitoring started for session ${sessionId} — polling every ${pollIntervalMinutes} minute(s)`,
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
router.post('/stop', (req: AuthRequest, res: Response): void => {
  const sessionId = req.sessionId || 'unknown';
  stopMonitor(sessionId);
  auditLog({
    timestamp: new Date().toISOString(),
    requestId: (req as any).requestId || '',
    action: 'MONITORING_STOP',
    resource: 'monitoring',
    result: 'success',
    sessionId: sessionId,
  });
  res.json({ success: true, message: 'Monitoring stopped', timestamp: new Date().toISOString() });
});

// ── Status ─────────────────────────────────────────────────────────────────────
router.get('/status', (req: AuthRequest, res: Response): void => {
  const sessionId = req.sessionId || 'unknown';
  
  // Keep the background monitor's token fresh from the live session.
  refreshMonitorAuth(req);
  
  const status = getStatus(sessionId);
  
  res.json({
    success: true,
    data: {
      running:     status.running,
      runningAnyEnv: activeConfigs.size > 0,
      matchesConnectedEnv: true, // For session-scoped monitoring, we're always matching
      connectedBaseUrl: req.sbBaseUrl || '',
      lastRunAt:   status.lastRunAt,
      lastResult:  status.lastResult,
      config: status.config ? {
        environment:        status.config.environment,
        pollIntervalMs:     status.config.pollIntervalMs,
        monitorAgents:      status.config.monitorAgents,
        monitorJobs:        status.config.monitorJobs,
        sbBaseUrl:          status.config.sbBaseUrl,
        webhookConfigured:  !!status.config.teamsWebhookUrl,
      } : null,
      webhookEnvConfigured: !!process.env.TEAMS_WEBHOOK_URL,
    },
    timestamp: new Date().toISOString(),
  });
});

// ── Run one cycle manually ─────────────────────────────────────────────────────
router.post('/run-now', async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const sessionId = req.sessionId || 'unknown';
    const status = getStatus(sessionId);
    
    if (!status.running) { 
      res.status(400).json({ error: 'Monitoring not configured. Start it first.' }); 
      return; 
    }
    
    // Run Now always checks the environment the user is currently connected to —
    // retarget the monitor to the live session's token + base URL.
    if (req.token) status.config!.sbToken = req.token;
    if (req.sbBaseUrl) status.config!.sbBaseUrl = req.sbBaseUrl;
    saveConfig(sessionId, status.config!);
    
    await runCycle(sessionId);
    res.json({ success: true, data: lastResultBySession.get(sessionId), timestamp: new Date().toISOString() });
  } catch (e) { next(e); }
});

// ── Clear alert state + history (reset dedup and wipe old alerts) ───────────────
router.post('/clear-state', (req: AuthRequest, res: Response): void => {
  const sessionId = req.sessionId || 'unknown';
  try { fs.unlinkSync(getStateFile(sessionId)); } catch { /* ignore */ }
  try { fs.unlinkSync(getHistoryFile(sessionId)); } catch { /* ignore */ }
  res.json({ success: true, message: 'Alert state and history cleared', timestamp: new Date().toISOString() });
});

// ── Alert history (scoped to the connected session) ─────────────────────────
router.get('/alerts', (req: AuthRequest, res: Response): void => {
  const sessionId = req.sessionId || 'unknown';
  refreshMonitorAuth(req);
  
  let history = loadAlertHistoryForSession(sessionId);
  // Only show alerts that belong to the environment the user is connected to.
  const key = envKey(req.sbBaseUrl);
  if (key) history = history.filter(a => envKey(a.baseUrl) === key);
  
  res.json({
    success: true,
    data: { total: history.length, alerts: history.slice().reverse(), environment: req.sbBaseUrl || '' }, // newest first
    timestamp: new Date().toISOString(),
  });
});

// ── Audit log ──────────────────────────────────────────────────────────────
router.get('/audit', (_req: AuthRequest, res: Response): void => {
  const auditFile = auditLogPath();
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
  // Monitoring is not auto-restored on startup: a live cycle needs a valid user
  // token, which only exists after the user reconnects. Users restart monitoring
  // manually after reconnecting.
  log.info('Monitoring auto-restore disabled — requires user reconnection with a valid token');
}

export { router as monitoringRouter };
