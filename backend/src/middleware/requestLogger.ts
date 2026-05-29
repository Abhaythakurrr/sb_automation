import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';

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
    // Never log Authorization header or token values
    console.log(`[${requestId}] ${method} ${url} ${status} ${duration}ms`);
  });

  next();
}
