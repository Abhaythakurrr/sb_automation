import { Request, Response, NextFunction } from 'express';

export interface AuthRequest extends Request {
  token?:     string;
  sbBaseUrl?: string;   // renamed to avoid conflict with Express req.baseUrl
}

export function authMiddleware(req: AuthRequest, _res: Response, next: NextFunction): void {
  // Token — from Authorization header
  const header = req.headers.authorization;
  if (header) {
    const m = header.match(/^Bearer\s+(.+)$/i);
    req.token = m ? m[1] : header;
  } else {
    req.token = process.env.AUTH_TOKEN || '';
  }

  // Base URL — from X-SB-Base-URL header sent by UI
  req.sbBaseUrl = (req.headers['x-sb-base-url'] as string)?.trim()
    || process.env.BASE_URL
    || process.env.SB_API_BASE_URL
    || 'https://adient.stonebranch.cloud';

  next();
}
