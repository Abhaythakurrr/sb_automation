/** Session management — short-lived server-side sessions keyed by UUID */
import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';

interface Session {
  token:     string;
  sbBaseUrl: string;
  createdAt: number;
  lastUsed:  number;
}

// In-memory session store — sessions never written to disk
const sessions = new Map<string, Session>();

const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours

// Clean up expired sessions every 30 minutes
setInterval(() => {
  const now = Date.now();
  for (const [id, session] of sessions.entries()) {
    if (now - session.lastUsed > SESSION_TTL_MS) {
      sessions.delete(id);
    }
  }
}, 30 * 60 * 1000);

export function createSession(token: string, sbBaseUrl: string): string {
  const sessionId = randomUUID();
  sessions.set(sessionId, {
    token,
    sbBaseUrl,
    createdAt: Date.now(),
    lastUsed:  Date.now(),
  });
  return sessionId;
}

export function getSession(sessionId: string): Session | null {
  const session = sessions.get(sessionId);
  if (!session) return null;
  if (Date.now() - session.lastUsed > SESSION_TTL_MS) {
    sessions.delete(sessionId);
    return null;
  }
  // Refresh last used
  session.lastUsed = Date.now();
  return session;
}

export function deleteSession(sessionId: string): void {
  sessions.delete(sessionId);
}

export function sessionCount(): number {
  return sessions.size;
}

/**
 * Session middleware — reads X-Session-ID header, resolves token from server-side store
 * Falls back to direct Bearer token for backward compatibility during transition
 */
export interface AuthRequest extends Request {
  token?:     string;
  sbBaseUrl?: string;
  sessionId?: string;
}

export function sessionMiddleware(req: AuthRequest, res: Response, next: NextFunction): void {
  // Option 1: Session ID (preferred — token never in browser)
  const sessionId = req.headers['x-session-id'] as string;
  if (sessionId) {
    const session = getSession(sessionId);
    if (!session) {
      res.status(401).json({
        success: false,
        error: 'Session expired or invalid. Please reconnect.',
        code: 'SESSION_EXPIRED',
        timestamp: new Date().toISOString(),
      });
      return;
    }
    req.token     = session.token;
    req.sbBaseUrl = session.sbBaseUrl;
    req.sessionId = sessionId;
    next();
    return;
  }

  // Option 2: Direct Bearer token (fallback — still works but token visible in network)
  const header = req.headers.authorization;
  if (header) {
    const m = header.match(/^Bearer\s+(.+)$/i);
    const token = m ? m[1].trim() : header.trim();
    if (token) {
      req.token     = token;
      req.sbBaseUrl = (req.headers['x-sb-base-url'] as string)?.trim() || process.env.BASE_URL || '';
      next();
      return;
    }
  }

  // Option 3: Server-side env token (for monitoring service auto-restore)
  if (process.env.AUTH_TOKEN) {
    req.token     = process.env.AUTH_TOKEN;
    req.sbBaseUrl = process.env.BASE_URL || '';
    next();
    return;
  }

  res.status(401).json({
    success: false,
    error: 'Authorization required. Please connect first.',
    timestamp: new Date().toISOString(),
  });
}
