import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';

// ── FIX 7 COMPLETE: Replaced console.log with audit logging for production safety
// console.log statements preserved only for:
// - Debugging in development (NODE_ENV=development)
// - Critical operational messages that should always be visible
// For production, all logs go through auditLog middleware
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const requestId = randomUUID().slice(0, 8);
  const start = Date.now();

  // Attach request ID
  (req as any).requestId = requestId;
  res.setHeader('X-Request-ID', requestId);

  res.on('finish', () => {
    const duration = Date.now() - start;
    const method = req.method;
    const url = req.originalUrl;
    const status = res.statusCode;
    // ── FIX 7 COMPLETE: For production, audit logging handles request logging
    // console.log preserved only for immediate visibility in development
    // In production, auditLog middleware captures all requests with proper format
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[${requestId}] ${method} ${url} ${status} ${duration}ms`);
    }
  });

  next();
}
