/**
 * Self-contained recovery package — versioned portable backup format.
 *
 * Root cause this fixes
 * ─────────────────────
 * The previous "Upload to Restore" flow read task/trigger objects from
 * component state (backupData / serverJobs).  When the session expired,
 * the browser was refreshed, or the server restarted, that state was gone
 * and the upload handler could not reconstruct anything — it had only task
 * names from the spreadsheet, not the full UAC objects the /recover endpoint
 * requires.
 *
 * Architecture after this fix
 * ────────────────────────────
 * The downloaded .json file IS the complete recovery archive.  It embeds the
 * full UAC task object and every trigger object as returned by the
 * Stonebranch API at backup time.  The upload handler reads that JSON
 * directly and calls /api/deletion/recover for each job — no server memory,
 * no session, no browser state is consulted.
 *
 * Versioning
 * ──────────
 * formatVersion is checked on every upload.  Bumping it in the future lets
 * the application detect old packages and show a clear compatibility message
 * rather than failing silently.
 */

/** Current schema version — bump when the `jobs` shape changes in a breaking way. */
export const RECOVERY_FORMAT_VERSION = '1.0' as const;

/** Application version embedded in every package for traceability. */
const TOOL_VERSION = '2.0.0';

// ── Schema types ──────────────────────────────────────────────────────────────

export interface RecoveryJobEntry {
  /** UAC task name — used as the primary identifier. */
  taskName:  string;
  /** Full UAC task object as returned by GET /resources/task. */
  task:      Record<string, unknown>;
  /** Full UAC trigger objects as returned by GET /resources/trigger. */
  triggers:  Record<string, unknown>[];
  /** ISO timestamp when this backup was taken. */
  savedAt:   string;
}

export interface RecoveryPackage {
  /** Schema version — used to detect incompatible future formats. */
  formatVersion:    typeof RECOVERY_FORMAT_VERSION;
  /** Tool version that created this file — for support/traceability. */
  toolVersion:      string;
  /** ISO timestamp when the package was generated. */
  createdAt:        string;
  /** UAC base URL (without token) so the operator can confirm the environment. */
  environment:      string;
  /** Total job count — quick sanity check without parsing the full array. */
  jobCount:         number;
  /** The actual backup data. */
  jobs:             RecoveryJobEntry[];
}

// ── Validation ────────────────────────────────────────────────────────────────

export interface ParseResult {
  ok:       true;
  pkg:      RecoveryPackage;
  warnings: string[];
}

export interface ParseError {
  ok:      false;
  message: string;
}

/**
 * Parse and validate a recovery package file.
 *
 * Accepts only .json files.  Validates schema version and required fields.
 * Returns a typed result rather than throwing so call sites can surface a
 * user-friendly message rather than a raw exception.
 */
export async function parseRecoveryFile(file: File): Promise<ParseResult | ParseError> {
  if (!file.name.toLowerCase().endsWith('.json')) {
    return { ok: false, message: 'Recovery packages must be .json files. Upload the file downloaded during deletion.' };
  }

  let raw: string;
  try {
    raw = await file.text();
  } catch {
    return { ok: false, message: 'Could not read the file.' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, message: 'File is not valid JSON.' };
  }

  if (!parsed || typeof parsed !== 'object') {
    return { ok: false, message: 'File is empty or not a JSON object.' };
  }

  const obj = parsed as Record<string, unknown>;

  // Schema version check — mandatory field; must match the supported version.
  if (!obj.formatVersion) {
    return { ok: false, message: 'Missing formatVersion — this does not appear to be a recovery package.' };
  }
  if (obj.formatVersion !== RECOVERY_FORMAT_VERSION) {
    return {
      ok: false,
      message: `Unsupported recovery package version "${obj.formatVersion}". This tool supports version "${RECOVERY_FORMAT_VERSION}". Re-export from the current tool version.`,
    };
  }

  if (!Array.isArray(obj.jobs)) {
    return { ok: false, message: 'Recovery package has no jobs array.' };
  }

  if (obj.jobs.length === 0) {
    return { ok: false, message: 'Recovery package contains zero jobs.' };
  }

  const warnings: string[] = [];

  // Validate individual job entries — soft-fail on malformed entries (warn, skip later).
  for (let i = 0; i < obj.jobs.length; i++) {
    const job = obj.jobs[i] as Record<string, unknown>;
    if (!job.taskName || typeof job.taskName !== 'string') {
      warnings.push(`Entry at index ${i} is missing taskName — it will be skipped.`);
    }
    if (!job.task || typeof job.task !== 'object') {
      warnings.push(`Entry "${job.taskName ?? i}" has no task object — it will be skipped.`);
    }
    if (!Array.isArray(job.triggers)) {
      warnings.push(`Entry "${job.taskName ?? i}" has no triggers array — triggers will not be restored.`);
    }
  }

  return {
    ok:       true,
    pkg:      obj as unknown as RecoveryPackage,
    warnings,
  };
}

// ── Download helpers ──────────────────────────────────────────────────────────

/**
 * Build a RecoveryPackage from raw backup data returned by the backend's
 * /api/deletion/backup endpoint, then trigger a browser download.
 *
 * @param backups      Array of backup objects from the API response.
 * @param environment  UAC base URL (token intentionally omitted).
 */
export function downloadRecoveryPackage(
  backups: Array<{ taskName: string; task: any; triggers: any[]; error?: string }>,
  environment: string,
): void {
  const now = new Date().toISOString();

  const jobs: RecoveryJobEntry[] = backups
    .filter(b => b.task && !b.error)
    .map(b => ({
      taskName: b.taskName,
      task:     b.task,
      triggers: b.triggers ?? [],
      savedAt:  now,
    }));

  const pkg: RecoveryPackage = {
    formatVersion: RECOVERY_FORMAT_VERSION,
    toolVersion:   TOOL_VERSION,
    createdAt:     now,
    environment:   sanitiseEnvironmentUrl(environment),
    jobCount:      jobs.length,
    jobs,
  };

  const blob = new Blob([JSON.stringify(pkg, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `recovery_${now.slice(0, 10)}_${jobs.length}jobs.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Strip the token-bearing query string and any trailing slash from a UAC
 * base URL before embedding it in the package.  The URL is informational
 * only (helps the operator verify which environment the backup came from)
 * and must never carry authentication material.
 */
function sanitiseEnvironmentUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}${u.pathname}`.replace(/\/+$/, '');
  } catch {
    return url.replace(/\/+$/, '');
  }
}
