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
import { analyticsRouter } from './routes/analytics';
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

// Security headers
app.use(helmet({
  contentSecurityPolicy: false, // disabled — API server, not serving HTML
  crossOriginEmbedderPolicy: false,
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
  message: { success: false, error: 'Execution rate limit exceeded' },
});
app.use('/api/execution', executionLimiter);
app.use('/api/deletion', executionLimiter);

// Strict rate limit for auth endpoint — prevent brute force
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
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
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
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
app.use('/api/analytics',   sessionMiddleware, analyticsRouter);

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
