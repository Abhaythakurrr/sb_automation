/**
 * Recovery store — server-side persistence of deleted-job backups so the
 * Recovery Center survives session refresh / timeout / backend restart.
 *
 * Lifecycle of an entry:
 *  - created when a job backup is taken (before deletion)
 *  - removed when the job is recovered, manually removed, or on logout
 *  - auto-expires after 7 days (weekly cleanup)
 *
 * Keyed per environment (UAC base URL) so Test and Prod never mix.
 */
import fs from 'fs';
import path from 'path';

const STORE_FILE = path.join(process.cwd(), 'recovery_store.json');
const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export interface RecoveryEntry {
  taskName: string;
  task: any;
  triggers: any[];
  savedAt: string;   // ISO timestamp
  savedBy?: string;
}

type Store = Record<string, RecoveryEntry[]>; // envKey -> entries

export function envKey(baseUrl?: string): string {
  if (!baseUrl) return '';
  try {
    const u = new URL(baseUrl);
    return `${u.protocol}//${u.host}${u.pathname}`.replace(/\/+$/, '').toLowerCase();
  } catch {
    return baseUrl.replace(/\/+$/, '').toLowerCase();
  }
}

function load(): Store {
  try {
    if (fs.existsSync(STORE_FILE)) return JSON.parse(fs.readFileSync(STORE_FILE, 'utf-8')) || {};
  } catch { /* ignore */ }
  return {};
}

function save(store: Store): void {
  try { fs.writeFileSync(STORE_FILE, JSON.stringify(store, null, 2)); } catch { /* ignore */ }
}

function notExpired(e: RecoveryEntry): boolean {
  return Date.now() - new Date(e.savedAt).getTime() < TTL_MS;
}

// Add/refresh recovery entries for an environment.
export function addEntries(baseUrl: string, entries: RecoveryEntry[]): void {
  const key = envKey(baseUrl);
  if (!key || !entries.length) return;
  const store = load();
  const existing = (store[key] || []).filter(notExpired);
  const byName = new Map(existing.map(e => [e.taskName.toLowerCase(), e]));
  for (const e of entries) {
    if (e && e.taskName) byName.set(e.taskName.toLowerCase(), e);
  }
  store[key] = Array.from(byName.values());
  save(store);
}

// List recoverable entries for an environment (auto-pruning expired ones).
export function listEntries(baseUrl: string): RecoveryEntry[] {
  const key = envKey(baseUrl);
  if (!key) return [];
  const store = load();
  const valid = (store[key] || []).filter(notExpired);
  if ((store[key] || []).length !== valid.length) { store[key] = valid; save(store); }
  return valid;
}

// Remove one entry by task name.
export function removeEntry(baseUrl: string, taskName: string): void {
  const key = envKey(baseUrl);
  if (!key) return;
  const store = load();
  if (!store[key]) return;
  store[key] = store[key].filter(e => e.taskName.toLowerCase() !== taskName.toLowerCase() && notExpired(e));
  save(store);
}

// Clear all entries for an environment (e.g. on logout).
export function clearEnv(baseUrl: string): void {
  const key = envKey(baseUrl);
  if (!key) return;
  const store = load();
  if (store[key]) { delete store[key]; save(store); }
}

// Global weekly cleanup of expired entries across all environments.
export function pruneAll(): void {
  const store = load();
  let changed = false;
  for (const k of Object.keys(store)) {
    const valid = store[k].filter(notExpired);
    if (valid.length !== store[k].length) { store[k] = valid; changed = true; }
    if (valid.length === 0) { delete store[k]; changed = true; }
  }
  if (changed) save(store);
}

// Run cleanup daily.
setInterval(pruneAll, 24 * 60 * 60 * 1000).unref?.();
