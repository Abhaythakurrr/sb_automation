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

// Idle timeout: session expires after 30 minutes of inactivity.
const SESSION_IDLE_MS = 30 * 60 * 1000;
// Absolute cap: a session cannot live longer than 8 hours even if active.
const SESSION_ABSOLUTE_MS = 8 * 60 * 60 * 1000;

// Clean up expired sessions every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [id, session] of sessions.entries()) {
    if (now - session.lastUsed > SESSION_IDLE_MS || now - session.createdAt > SESSION_ABSOLUTE_MS) {
      sessions.delete(id);
    }
  }
}, 5 * 60 * 1000);

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
  const now = Date.now();
  // Expire on idle OR absolute lifetime.
  if (now - session.lastUsed > SESSION_IDLE_MS || now - session.createdAt > SESSION_ABSOLUTE_MS) {
    sessions.delete(sessionId);
    return null;
  }
  // Refresh last used (sliding idle window)
  session.lastUsed = now;
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

  // Option 3: Server-side env token — DISABLED by default.
  // Granting access from an env token to any request without a session is a
  // serious auth-bypass risk. Only enable in trusted/internal single-tenant
  // deployments by explicitly setting ALLOW_ENV_TOKEN_FALLBACK=true.
  if (process.env.ALLOW_ENV_TOKEN_FALLBACK === 'true' && process.env.AUTH_TOKEN) {
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
