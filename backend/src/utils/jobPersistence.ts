/**
 * Scheduled Job Persistence.
 * Saves scheduled agent-control jobs to disk so they survive backend restarts.
 * Tokens are encrypted at rest with AES-256-GCM so a disk leak does not expose
 * UAC credentials alongside the scheduled operation.
 */

import '../config/env'; // ensure .env is loaded before we read ENCRYPTION_KEY
import fs   from 'fs';
import path from 'path';
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

export interface PersistedJob {
  jobId:       string;
  action:      'suspend' | 'resume';
  agents:      string[];
  target?:     'agent' | 'cluster';  // what `agents` refers to (default 'agent')
  scheduledAt: string;   // ISO UTC string
  token:       string;
  baseUrl:     string;
  createdAt:   string;
}

const JOBS_FILE = path.join(process.cwd(), 'scheduled_jobs.json');

// The encryption key must be supplied via the environment — there is no default
// fallback, so a misconfigured deployment fails fast at startup rather than
// silently encrypting persisted tokens with a well-known key.
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length < 32) {
  throw new Error('[PERSISTENCE] FATAL: ENCRYPTION_KEY environment variable must be set and minimum 32 characters');
}

const KEY = scryptSync(ENCRYPTION_KEY, 'salt', 32);

function encrypt(text: string): string {
  const iv = randomBytes(16);
  const cipher = createCipheriv('aes-256-gcm', KEY, iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return iv.toString('hex') + ':' + tag.toString('hex') + ':' + encrypted.toString('hex');
}

function decrypt(text: string): string {
  try {
    const [ivHex, tagHex, encHex] = text.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');
    const encrypted = Buffer.from(encHex, 'hex');
    const decipher = createDecipheriv('aes-256-gcm', KEY, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
  } catch {
    return text; // fallback for unencrypted legacy entries
  }
}

// ── Read all persisted jobs ───────────────────────────────────────────────────
export function loadJobs(): PersistedJob[] {
  try {
    if (!fs.existsSync(JOBS_FILE)) return [];
    const raw = fs.readFileSync(JOBS_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as PersistedJob[];
    return parsed.map((j: PersistedJob) => ({ ...j, token: decrypt(j.token) }));
  } catch {
    return [];
  }
}

// ── Save a new job ────────────────────────────────────────────────────────────
export function saveJob(job: PersistedJob): void {
  const jobs = loadJobs();
  const jobToSave = { ...job, token: encrypt(job.token) };
  // Re-encrypt all tokens when writing back (loadJobs decrypts them)
  const jobsToWrite = jobs.map(j => ({ ...j, token: encrypt(j.token) }));
  jobsToWrite.push(jobToSave);
  fs.writeFileSync(JOBS_FILE, JSON.stringify(jobsToWrite, null, 2));
}

// ── Remove a job by ID ────────────────────────────────────────────────────────
export function removeJob(jobId: string): void {
  const jobs = loadJobs().filter(j => j.jobId !== jobId);
  // Re-encrypt tokens when writing back
  const jobsToWrite = jobs.map(j => ({ ...j, token: encrypt(j.token) }));
  fs.writeFileSync(JOBS_FILE, JSON.stringify(jobsToWrite, null, 2));
}

// ── List pending jobs (future only) ──────────────────────────────────────────
export function listPendingJobs(): PersistedJob[] {
  const now = Date.now();
  return loadJobs().filter(j => new Date(j.scheduledAt).getTime() > now);
}
