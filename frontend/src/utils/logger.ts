/**
 * Lightweight client-side logger.
 *
 * The browser bundle cannot use the backend's Winston logger (that is a
 * Node-only, file-based framework), so this provides a single, consistent entry
 * point for client logging instead of scattered `console.*` calls.
 *
 * Verbose levels (debug/info) are emitted only in development or when
 * NEXT_PUBLIC_ENABLE_CONSOLE_LOGGING=true, keeping the production console quiet.
 * Warnings and errors are always surfaced because they aid live support.
 */
const VERBOSE =
  process.env.NODE_ENV !== 'production' ||
  process.env.NEXT_PUBLIC_ENABLE_CONSOLE_LOGGING === 'true';

export interface ClientLogger {
  debug: (message: string, ...meta: unknown[]) => void;
  info: (message: string, ...meta: unknown[]) => void;
  warn: (message: string, ...meta: unknown[]) => void;
  error: (message: string, ...meta: unknown[]) => void;
}

/** Create a logger scoped to a component/module name. */
export function createLogger(moduleName: string): ClientLogger {
  const tag = `[${moduleName}]`;
  return {
    debug: (message, ...meta) => { if (VERBOSE) console.debug(tag, message, ...meta); },
    info: (message, ...meta) => { if (VERBOSE) console.info(tag, message, ...meta); },
    warn: (message, ...meta) => console.warn(tag, message, ...meta),
    error: (message, ...meta) => console.error(tag, message, ...meta),
  };
}

export const logger = createLogger('app');
