import { Request, Response, NextFunction } from 'express';

export interface ApiError extends Error {
  status?: number;
  code?: string;
}

export function errorHandler(err: ApiError, _req: Request, res: Response, _next: NextFunction): void {
  const status = err.status || 500;
  const isDev = process.env.NODE_ENV !== 'production';

  // Always log full error server-side
  console.error(`[Error] ${status}: ${err.message}`);
  if (isDev) console.error(err.stack);

  // Only send safe info to client
  res.status(status).json({
    success: false,
    error: isDev ? err.message : (status < 500 ? err.message : 'An internal error occurred'),
    ...(isDev && err.code ? { code: err.code } : {}),
    timestamp: new Date().toISOString(),
  });
}
