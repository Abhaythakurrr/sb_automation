/**
 * Centralized application logging.
 *
 * Built on Winston with daily file rotation. Winston is used (rather than a
 * hand-rolled logger) because it is a mature, widely-adopted library that gives
 * us structured JSON logs, multiple transports, per-file level filtering and
 * size/time-based rotation without bespoke code to maintain.
 *
 * Everything is driven by environment variables so the same build runs in
 * development and on a locked-down production server without code changes:
 *   LOG_DIRECTORY          where log files are written (default ./logs)
 *   LOG_LEVEL              lowest level written to the general log (default info)
 *   LOG_RETENTION_DAYS     how many days of rotated files to keep (default 30)
 *   LOG_MAX_FILE_SIZE      rotate a file once it reaches this size (default 20m)
 *   ENABLE_CONSOLE_LOGGING mirror logs to stdout (default: on outside production)
 *
 * Log files (stable names are symlinks to the current dated file):
 *   application.log  every event at or above LOG_LEVEL
 *   error.log        error + fatal events only
 *   api.log          HTTP request/response summaries
 *   startup.log      startup / shutdown / configuration lifecycle events
 *   audit.log        security-relevant audit trail (see middleware/auditLogger)
 */
import './env'; // ensure .env is loaded before we read logging configuration
import fs from 'fs';
import path from 'path';
import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';

// ── Configuration (all overridable via environment) ─────────────────────────
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

const LOG_LEVEL = (process.env.LOG_LEVEL || 'info').toLowerCase();
const LOG_RETENTION_DAYS = process.env.LOG_RETENTION_DAYS || '30';
const LOG_MAX_FILE_SIZE = process.env.LOG_MAX_FILE_SIZE || '20m';
// Console output defaults on in development and off in production, but an
// operator can force either way with ENABLE_CONSOLE_LOGGING=true|false.
const ENABLE_CONSOLE_LOGGING = process.env.ENABLE_CONSOLE_LOGGING
  ? process.env.ENABLE_CONSOLE_LOGGING === 'true'
  : !IS_PRODUCTION;

// Resolve the log directory and create it up front. If the directory cannot be
// created (e.g. missing permission on a hardened host) we fall back to console
// logging only rather than crashing the whole application on boot.
const LOG_DIRECTORY = process.env.LOG_DIRECTORY || './logs';
let resolvedLogDir = path.resolve(LOG_DIRECTORY);
let fileLoggingAvailable = true;
try {
  fs.mkdirSync(resolvedLogDir, { recursive: true });
} catch (err) {
  fileLoggingAvailable = false;
  // eslint-disable-next-line no-console — this is the one place we must fall
  // back to console: the logger itself cannot write to disk yet.
  console.error(
    `[logger] Could not create log directory "${resolvedLogDir}" — ` +
    `falling back to console logging only: ${(err as Error).message}`,
  );
}

export const LOG_DIR = resolvedLogDir;
export const AUDIT_LOG_FILE = path.join(resolvedLogDir, 'audit.log');
export const LOG_FILE_LOGGING_AVAILABLE = fileLoggingAvailable;
// Rotation settings reused by the dedicated audit-trail logger so it matches
// the retention/size policy of the general logs.
export const LOG_ROTATION = {
  maxSize: LOG_MAX_FILE_SIZE,
  maxFiles: `${LOG_RETENTION_DAYS}d`,
  datePattern: 'YYYY-MM-DD',
};

// ── Custom severity levels ──────────────────────────────────────────────────
// Lower number = higher severity. `fatal` is added on top of the usual set for
// unrecoverable conditions; `debug` is intended for development only.
const LEVELS = { fatal: 0, error: 1, warn: 2, info: 3, debug: 4 } as const;
type LevelName = keyof typeof LEVELS;

winston.addColors({ fatal: 'magenta', error: 'red', warn: 'yellow', info: 'green', debug: 'gray' });

// ── Sensitive-data masking ──────────────────────────────────────────────────
// Defence in depth: even though call sites avoid logging secrets, every value
// that flows through a transport is scrubbed so a stray token/password can
// never be persisted to disk.
const SENSITIVE_KEY =
  /(authorization|token|password|passwd|pwd|secret|api[-_]?key|session[-_]?id|encryption[-_]?key|bearer|cookie|signature|\bsig\b|webhook|private[-_]?key)/i;
const REDACTED = '***REDACTED***';

// Scrub secrets that appear inline inside free-text strings (bearer tokens and
// signed URL query parameters are the common cases here).
function scrubString(value: string): string {
  return value
    .replace(/(bearer\s+)[A-Za-z0-9._~+/=-]+/gi, `$1${REDACTED}`)
    .replace(/([?&](?:sig|token|key|password|secret|code)=)[^&\s"']+/gi, `$1${REDACTED}`);
}

function maskValue(key: string, value: unknown, seen: WeakSet<object>): unknown {
  if (SENSITIVE_KEY.test(key)) {
    // Only strings/objects can carry a secret. Booleans and numbers under a
    // sensitive-looking key (e.g. `webhookConfigured: true`) are safe to keep.
    if (typeof value === 'boolean' || typeof value === 'number') return value;
    return REDACTED;
  }
  if (typeof value === 'string') return scrubString(value);
  if (value && typeof value === 'object') return maskObject(value as Record<string, unknown>, seen);
  return value;
}

function maskObject(obj: Record<string, unknown>, seen: WeakSet<object>): unknown {
  if (seen.has(obj)) return '[Circular]';
  seen.add(obj);
  if (Array.isArray(obj)) {
    return obj.map(item =>
      item && typeof item === 'object'
        ? maskObject(item as Record<string, unknown>, seen)
        : typeof item === 'string' ? scrubString(item) : item,
    );
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) out[k] = maskValue(k, v, seen);
  return out;
}

// Fields that identify the log entry and are never secret — kept as-is (but
// still string-scrubbed) so they stay searchable.
const STRUCTURAL_KEYS = new Set(['level', 'message', 'timestamp', 'module', 'requestId', 'user', 'endpoint', 'component', 'stack']);

const maskFormat = winston.format(info => {
  if (typeof info.message === 'string') info.message = scrubString(info.message);
  const seen = new WeakSet<object>();
  for (const key of Object.keys(info)) {
    const current = (info as Record<string, unknown>)[key];
    if (STRUCTURAL_KEYS.has(key)) {
      if (typeof current === 'string') (info as Record<string, unknown>)[key] = scrubString(current);
      continue;
    }
    (info as Record<string, unknown>)[key] = maskValue(key, current, seen);
  }
  return info;
});

// ── Formats ─────────────────────────────────────────────────────────────────
const fileFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  winston.format.errors({ stack: true }),
  maskFormat(),
  winston.format.json(),
);

const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  maskFormat(),
  winston.format.colorize({ level: true }),
  winston.format.printf(info => {
    const { timestamp, level, message, module, requestId, user, endpoint, stack, component, ...rest } =
      info as Record<string, unknown>;
    let line = `${timestamp} ${level} [${(module as string) || 'app'}]`;
    if (requestId) line += ` (req:${requestId})`;
    if (user) line += ` (user:${user})`;
    line += ` ${message as string}`;
    if (endpoint) line += ` {${endpoint}}`;
    const extras = { ...rest };
    delete (extras as Record<string, unknown>).level;
    const extraKeys = Object.keys(extras);
    if (extraKeys.length) line += ` ${JSON.stringify(extras)}`;
    if (stack) line += `\n${stack}`;
    return line;
  }),
);

// ── Transport helpers ───────────────────────────────────────────────────────
function rotateFile(basename: string, level: LevelName, extraFormat?: winston.Logform.Format): DailyRotateFile {
  return new DailyRotateFile({
    level,
    dirname: resolvedLogDir,
    filename: `${basename}-%DATE%.log`,
    datePattern: 'YYYY-MM-DD',
    maxSize: LOG_MAX_FILE_SIZE,
    maxFiles: `${LOG_RETENTION_DAYS}d`,
    zippedArchive: true,
    // Keep the rotation bookkeeping file under a predictable name instead of a
    // random hash, so the log directory stays tidy.
    auditFile: path.join(resolvedLogDir, `.${basename}-rotate.json`),
    // Keep a stable, un-dated filename (e.g. application.log) pointing at the
    // current file so operators always know where to look.
    createSymlink: true,
    symlinkName: `${basename}.log`,
    format: extraFormat ? winston.format.combine(extraFormat, fileFormat) : fileFormat,
  });
}

// Only let entries tagged with a given component reach a transport.
const onlyComponent = (name: string) =>
  winston.format(info => (info.component === name ? info : false))();

// ── Build the transport list ────────────────────────────────────────────────
const transports: winston.transport[] = [];

if (fileLoggingAvailable) {
  transports.push(
    rotateFile('application', LOG_LEVEL as LevelName),
    rotateFile('error', 'error'),
    rotateFile('api', LOG_LEVEL as LevelName, onlyComponent('http')),
    rotateFile('startup', LOG_LEVEL as LevelName, onlyComponent('startup')),
  );
}

if (ENABLE_CONSOLE_LOGGING || !fileLoggingAvailable) {
  transports.push(new winston.transports.Console({ level: LOG_LEVEL as LevelName, format: consoleFormat }));
}

// The logger itself is set to the most verbose level; each transport applies
// its own level filter. This keeps level control predictable and per-file.
const baseLogger = winston.createLogger({
  levels: LEVELS,
  level: 'debug',
  transports,
  exitOnError: false,
});

// ── Public API ──────────────────────────────────────────────────────────────
export interface LogContext {
  requestId?: string;
  user?: string;
  endpoint?: string;
  component?: string;
  /** Attach an Error to capture its stack trace and message. */
  error?: unknown;
  [key: string]: unknown;
}

function emit(level: LevelName, moduleName: string, message: string, context: LogContext = {}): void {
  const { error, ...rest } = context;
  const meta: Record<string, unknown> = { module: moduleName, ...rest };
  if (error instanceof Error) {
    meta.stack = error.stack;
    if (!message) message = error.message;
    else if (!meta.errorMessage) meta.errorMessage = error.message;
  } else if (error !== undefined && error !== null) {
    meta.errorMessage = typeof error === 'string' ? error : JSON.stringify(error);
  }
  // Underlying winston logger exposes custom levels dynamically.
  (baseLogger as unknown as Record<string, (msg: string, meta: object) => void>)[level](message, meta);
}

export interface ModuleLogger {
  fatal: (message: string, context?: LogContext) => void;
  error: (message: string, context?: LogContext) => void;
  warn: (message: string, context?: LogContext) => void;
  info: (message: string, context?: LogContext) => void;
  debug: (message: string, context?: LogContext) => void;
}

/**
 * Create a logger bound to a module/service name. The name is attached to every
 * entry so logs can be filtered by their origin.
 *
 *   const log = createModuleLogger('execution');
 *   log.info('Batch started', { requestId, user, endpoint: 'POST /api/execution/batch' });
 */
export function createModuleLogger(moduleName: string): ModuleLogger {
  return {
    fatal: (message, context) => emit('fatal', moduleName, message, context),
    error: (message, context) => emit('error', moduleName, message, context),
    warn: (message, context) => emit('warn', moduleName, message, context),
    info: (message, context) => emit('info', moduleName, message, context),
    debug: (message, context) => emit('debug', moduleName, message, context),
  };
}

/** Default logger for code without a more specific module context. */
export const logger = createModuleLogger('app');

/** Log a startup/shutdown/configuration lifecycle event (also lands in startup.log). */
export function logLifecycle(message: string, context: LogContext = {}): void {
  emit('info', context.component === 'startup' ? 'startup' : (context.module as string) || 'startup', message, {
    ...context,
    component: 'startup',
  });
}

/** Effective logging configuration, for a one-line startup summary (no secrets). */
export function getLoggingConfig() {
  return {
    logDirectory: resolvedLogDir,
    level: LOG_LEVEL,
    retentionDays: LOG_RETENTION_DAYS,
    maxFileSize: LOG_MAX_FILE_SIZE,
    consoleLogging: ENABLE_CONSOLE_LOGGING,
    fileLogging: fileLoggingAvailable,
  };
}

// ── Global safety net ───────────────────────────────────────────────────────
// Capture anything that escapes normal handling so it is recorded before the
// process reacts. Uncaught exceptions leave the process in an undefined state,
// so we log fatally and let the process exit (PM2 restarts it). Unhandled
// rejections are logged but non-fatal to keep the API available.
process.on('uncaughtException', err => {
  emit('fatal', 'process', 'Uncaught exception — process will exit', { error: err });
  setTimeout(() => process.exit(1), 500);
});

process.on('unhandledRejection', reason => {
  emit('error', 'process', 'Unhandled promise rejection', { error: reason });
});
