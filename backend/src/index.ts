import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
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
import { errorHandler } from './middleware/errorHandler';
import { sessionMiddleware } from './middleware/session';
import { requestLogger } from './middleware/requestLogger';

dotenv.config();

// Validate required environment variables at startup
const requiredEnvVars = ['BACKEND_PORT'];
const missingVars = requiredEnvVars.filter(v => !process.env[v]);
if (missingVars.length > 0) {
  console.warn(`[CONFIG] Missing optional env vars: ${missingVars.join(', ')} — using defaults`);
}
// Log startup config (never log tokens)
console.log(`[CONFIG] Environment: ${process.env.NODE_ENV || 'development'}`);
console.log(`[CONFIG] Port: ${process.env.BACKEND_PORT || 3001}`);
console.log(`[CONFIG] Base URL configured: ${!!process.env.BASE_URL}`);
console.log(`[CONFIG] Teams webhook configured: ${!!process.env.TEAMS_WEBHOOK_URL}`);

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

app.use(cors({
  origin: (origin, cb) => {
    // Allow same-origin / server-to-server / curl (no Origin header).
    if (!origin) return cb(null, true);
    if (allowedOrigins.includes(origin)) return cb(null, true);
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

// Strict rate limit for auth endpoint — prevent brute force
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many connection attempts. Please wait 15 minutes.' },
});
app.use('/api/stonebranch/connect', authLimiter);

// Ensure uploads directory exists
const uploadDir = process.env.UPLOAD_DIR || './uploads';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
  console.log(`Created uploads directory: ${uploadDir}`);
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

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handling
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Backend server running on port ${PORT}`);
  // Restore any scheduled jobs that were persisted before restart
  restoreScheduledJobs();
  restoreMonitoring();
});
