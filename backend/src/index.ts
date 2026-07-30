// Load environment before anything else so configuration is available while
// the modules below initialise (see config/env for the load order).
import './config/env';

import express from 'express';
import cors from 'cors';
import fs from 'fs';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { fileUploadRouter } from './routes/fileUpload';
import { stoneBranchRouter } from './routes/stoneBranch';
import { executionRouter } from './routes/execution';
import { agentControlRouter, restoreScheduledJobs } from './routes/agentControl';
import { monitoringRouter, restoreMonitoring } from './routes/monitoring';
import { jobDeletionRouter } from './routes/jobDeletion';
import { jobDocRouter } from './routes/jobDoc';
import { searchRouter } from './routes/search';
import { adhocRouter } from './routes/adhoc';
import { scheduleAIRouter } from './routes/scheduleAI';
import { copilotRouter } from './routes/copilot';
import { errorHandler } from './middleware/errorHandler';
import { sessionMiddleware } from './middleware/session';
import { requestLogger } from './middleware/requestLogger';
import { createModuleLogger, logLifecycle, getLoggingConfig } from './config/logger';

const log = createModuleLogger('server');

// Surface the effective configuration at boot (never the secret values
// themselves — only whether they are present).
logLifecycle('Backend starting', {
  environment: process.env.NODE_ENV || 'development',
  port: process.env.BACKEND_PORT || 3001,
  baseUrlConfigured: !!process.env.BASE_URL,
  teamsWebhookConfigured: !!process.env.TEAMS_WEBHOOK_URL,
  logging: getLoggingConfig(),
});

const app = express();
const PORT = process.env.BACKEND_PORT || 3001;

// Behind nginx/reverse proxy — trust the first proxy hop so rate limiting and
// logging use the real client IP (X-Forwarded-For) rather than the proxy IP.
app.set('trust proxy', 1);
// Do not advertise the framework.
app.disable('x-powered-by');

// Security headers
app.use(helmet({
  contentSecurityPolicy: false, // disabled — API server, not serving HTML
  crossOriginEmbedderPolicy: false,
}));

// ── CORS — restrict to known frontend origin(s) ────────────────────────────
// Set CORS_ORIGINS in env as a comma-separated allow-list. Defaults to the
// local dev frontend. A wildcard ('*') is intentionally NOT the default so a
// malicious site cannot drive the API from a victim's browser.
const allowedOrigins = (process.env.CORS_ORIGINS ||
  'http://localhost:3000,http://127.0.0.1:3000')
  .split(',').map(o => o.trim()).filter(Boolean);

logLifecycle('CORS allow-list configured', { allowedOrigins });

app.use(cors({
  origin: (origin, cb) => {
    // Allow same-origin / server-to-server / curl (no Origin header).
    if (!origin) return cb(null, true);
    if (allowedOrigins.includes(origin)) return cb(null, true);
    log.warn('Blocked request from disallowed CORS origin', { origin, component: 'security' });
    return cb(new Error('Not allowed by CORS'));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Session-ID', 'X-SB-Base-URL'],
  maxAge: 600,
}));

// Rate limiting — 200 requests per minute per IP
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests, please slow down' },
});
app.use(limiter);

// Stricter limit for execution endpoints — but allow bulk operations
const executionLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,  // same as global — bulk ops need many calls per job
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Execution rate limit exceeded' },
});
app.use('/api/execution', executionLimiter);
app.use('/api/deletion', executionLimiter);

// Upload limiter — uploads are heavier; cap them per IP.
const uploadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many uploads, please slow down' },
});
app.use('/api/upload', uploadLimiter);

// Copilot limiter — a model-backed answer is comparatively expensive, and the
// UI only ever asks on an explicit user action.
const copilotLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Copilot rate limit exceeded, please slow down' },
});
app.use('/api/copilot/ask', copilotLimiter);

// Strict rate limit for the connect endpoint — throttles brute-force attempts
// against token validation (10 attempts per 15 minutes per IP).
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many connection attempts. Please wait 15 minutes.' },
});
app.use('/api/stonebranch/connect', authLimiter);

// ── Ensure uploads directory exists ──────────────────────────────────────────
const uploadDir = process.env.UPLOAD_DIR || './uploads';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
  logLifecycle('Created uploads directory', { uploadDir });
}

// Middleware
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ limit: '15mb', extended: true }));
app.use(requestLogger);

// Routes
// Connect/disconnect are public — no session required (they create/destroy sessions)
// All other routes require a valid session
app.use('/api/stonebranch', stoneBranchRouter);   // connect + disconnect are public inside this router
app.use('/api/upload',      sessionMiddleware, fileUploadRouter);
app.use('/api/execution',   sessionMiddleware, executionRouter);
app.use('/api/agents',      sessionMiddleware, agentControlRouter);
app.use('/api/monitoring',  sessionMiddleware, monitoringRouter);
app.use('/api/deletion',    sessionMiddleware, jobDeletionRouter);
app.use('/api/jobdoc',      sessionMiddleware, jobDocRouter);
app.use('/api/search',      sessionMiddleware, searchRouter);
app.use('/api/adhoc',       sessionMiddleware, adhocRouter);
app.use('/api/schedule-ai', scheduleAIRouter); // Public - no session required
// Copilot applies sessionMiddleware internally so its /health probe stays
// public — the UI checks it before the user has connected.
app.use('/api/copilot',     copilotRouter);

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handling
app.use(errorHandler);

const server = app.listen(PORT, () => {
  logLifecycle(`Backend server listening on port ${PORT}`, { port: PORT });
  // Restore any scheduled agent jobs that were persisted before a restart.
  restoreScheduledJobs();
  // Monitoring is intentionally not auto-restored: it needs a live user token.
  restoreMonitoring();
});

// ── Graceful shutdown ───────────────────────────────────────────────────────
// PM2 and container orchestrators signal termination with SIGTERM/SIGINT.
// Record the shutdown, stop accepting new connections, then exit.
function shutdown(signal: string): void {
  logLifecycle(`Received ${signal} — shutting down`, { signal });
  server.close(() => process.exit(0));
  // Safety net if connections do not drain promptly.
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
