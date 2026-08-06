/**
 * Serves the built web interface from the same process as the API.
 *
 * WHY THIS EXISTS
 *
 * The application used to run as two Node processes — an API on one port and a
 * Next.js server on another — with a reverse proxy in front to present them as
 * one site, and a process manager to keep both alive. Four things to install,
 * configure and supervise.
 *
 * Every page in the interface is static, so the Next.js runtime was doing nothing
 * a file server cannot. Serving the exported build from here collapses all of it:
 * one process, one port, one thing to start. No proxy to configure, and no CORS to
 * get wrong, because the page and the API now share an origin.
 *
 * The build is optional. If it is absent the API still runs and this module says
 * so plainly rather than failing at boot — an API-only deployment is legitimate,
 * and a missing directory should not take the service down.
 */
import express, { Express, Request, Response, NextFunction } from 'express';
import fs from 'fs';
import path from 'path';
import { createModuleLogger } from './config/logger';

const log = createModuleLogger('web');

/**
 * Where the exported interface lives.
 *
 * Checked in order: an explicit override, the packaged layout (`web/` beside
 * `dist/`), then the development layout (`frontend/out`). Returning null rather
 * than guessing means the caller can report the truth.
 */
export function findWebRoot(): string | null {
  const candidates = [
    process.env.WEB_ROOT,
    path.join(process.cwd(), 'web'),
    path.join(__dirname, '..', 'web'),
    path.join(process.cwd(), '..', 'frontend', 'out'),
  ].filter(Boolean) as string[];

  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, 'index.html'))) return path.resolve(dir);
  }
  return null;
}

/**
 * Content-Security-Policy for the interface.
 *
 * `connect-src 'self'` is the notable one. It used to have to name the customer's
 * controller hostname, because the policy was written when it looked like the
 * browser might talk to the controller directly. It does not: every call to the
 * controller is made by this server, which is also what keeps the access token off
 * the browser. So the browser only ever needs to reach its own origin, and this
 * policy needs to know nothing about who is deploying it.
 *
 * 'unsafe-inline' and 'unsafe-eval' on script-src are required by the framework's
 * hydration bundle. Narrowing them needs a nonce, which needs a template step the
 * static export does not have.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "form-action 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
].join('; ');

const SECURITY_HEADERS: Record<string, string> = {
  'Content-Security-Policy': CSP,
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'X-DNS-Prefetch-Control': 'on',
};

export interface WebMountResult {
  mounted: boolean;
  root: string | null;
  reason: string;
}

/**
 * Mounts the interface. Call after the API routes so `/api/*` always wins.
 */
export function mountWeb(app: Express): WebMountResult {
  const root = findWebRoot();

  if (!root) {
    const reason = 'No web build found — running as an API-only service. '
      + 'Expected web/index.html beside the server, or set WEB_ROOT.';
    log.warn(reason);
    return { mounted: false, root: null, reason };
  }

  // Security headers on documents. Applied here rather than in the framework
  // config because an exported build has no server to apply them.
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (!req.path.startsWith('/api/')) {
      for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v);
    }
    next();
  });

  // Fingerprinted assets are immutable and safe to cache hard. Documents are not:
  // they must be revalidated or an upgrade leaves stale HTML pointing at bundles
  // that no longer exist.
  app.use('/_next/static', express.static(path.join(root, '_next', 'static'), {
    immutable: true,
    maxAge: '1y',
    fallthrough: true,
  }));

  app.use(express.static(root, {
    extensions: ['html'],
    index: 'index.html',
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
    },
  }));

  // Anything left that is not an API call is a page request. Directory-style
  // exports mean /about-tool resolves to about-tool/index.html; fall back to the
  // exported 404 document, and finally to the app shell.
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    if (req.path.startsWith('/api/')) return next();

    const nested = path.join(root, req.path, 'index.html');
    if (fs.existsSync(nested)) return res.sendFile(nested);

    const notFound = path.join(root, '404.html');
    if (fs.existsSync(notFound)) return res.status(404).sendFile(notFound);

    return res.sendFile(path.join(root, 'index.html'));
  });

  log.info('Web interface mounted', { root });
  return { mounted: true, root, reason: 'Serving the interface and the API from one origin.' };
}
