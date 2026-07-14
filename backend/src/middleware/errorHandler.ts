import { Request, Response, NextFunction } from 'express';
import { createModuleLogger } from '../config/logger';

const log = createModuleLogger('errorHandler');

export interface ApiError extends Error {
  status?: number;
  code?: string;
}

/**
 * Terminal Express error handler. The full error (with stack) is recorded
 * server-side, while the client only receives a safe message — internal
 * details of 5xx errors are never leaked outside development.
 */
export function errorHandler(err: ApiError, req: Request, res: Response, _next: NextFunction): void {
  const status = err.status || 500;
  const isDev = process.env.NODE_ENV !== 'production';

  log.error(`${status}: ${err.message}`, {
    requestId: (req as Request & { requestId?: string }).requestId,
    endpoint: `${req.method} ${req.originalUrl}`,
    status,
    code: err.code,
    error: err,
  });

  res.status(status).json({
    success: false,
    error: isDev ? err.message : status < 500 ? err.message : 'An internal error occurred',
    ...(isDev && err.code ? { code: err.code } : {}),
    timestamp: new Date().toISOString(),
  });
}
