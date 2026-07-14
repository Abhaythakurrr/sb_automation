import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { createModuleLogger } from '../config/logger';

const log = createModuleLogger('http');

/**
 * Assigns a short correlation ID to every request, echoes it back in the
 * `X-Request-ID` response header, and records a one-line request/response
 * summary (method, path, status, duration, client IP) in the API log once the
 * response finishes. Request bodies are never logged, so credentials submitted
 * to the connect endpoint never reach disk.
 */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const requestId = randomUUID().slice(0, 8);
  const start = Date.now();

  (req as Request & { requestId?: string }).requestId = requestId;
  res.setHeader('X-Request-ID', requestId);

  res.on('finish', () => {
    // The health probe is high-frequency and low-value — skip to reduce noise.
    if (req.originalUrl === '/health') return;

    const durationMs = Date.now() - start;
    const status = res.statusCode;
    const context = {
      requestId,
      component: 'http',
      endpoint: `${req.method} ${req.originalUrl}`,
      status,
      durationMs,
      ip: req.ip,
    };
    const message = `${req.method} ${req.originalUrl} ${status} ${durationMs}ms`;

    if (status >= 500) log.error(message, context);
    else if (status >= 400) log.warn(message, context);
    else log.info(message, context);
  });

  next();
}
