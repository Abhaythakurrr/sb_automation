/**
 * API knowledge — every endpoint this backend exposes.
 *
 * Used to answer "which API will receive this payload?" and "what does this
 * endpoint do?". Kept as structured data so the Copilot can also list them.
 */
import { KnowledgeChunk, PageId } from '../types';

export interface ApiSpec {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  purpose: string;
  /** Session required (X-Session-ID) or public. */
  auth: 'session' | 'public';
  body?: string;
  query?: string;
  pages: PageId[];
  source: string;
}

export const API_SPECS: ApiSpec[] = [
  // ── Connection ─────────────────────────────────────────────────────────────
  { method: 'POST', path: '/api/stonebranch/connect', auth: 'public', body: '{ token, baseUrl, username? }',
    purpose: 'Validates the UAC token against the target controller, creates a server-side session and returns only a sessionId. Rate limited to 10 attempts per 15 minutes per IP.',
    pages: ['home', 'configuration'], source: 'backend/src/routes/stoneBranch.ts' },
  { method: 'POST', path: '/api/stonebranch/disconnect', auth: 'public',
    purpose: 'Destroys the server-side session and the token held in it.',
    pages: ['home'], source: 'backend/src/routes/stoneBranch.ts' },
  { method: 'GET', path: '/api/stonebranch/validate', auth: 'session',
    purpose: 'Confirms the current session still resolves to a working UAC token.',
    pages: ['home'], source: 'backend/src/routes/stoneBranch.ts' },
  { method: 'GET', path: '/api/stonebranch/task', auth: 'session', query: 'taskname',
    purpose: 'Reads one task definition from UAC.',
    pages: ['search'], source: 'backend/src/routes/stoneBranch.ts' },
  { method: 'POST', path: '/api/stonebranch/task', auth: 'session', body: 'task payload',
    purpose: 'Creates a task in UAC. This is the endpoint that receives the generated task payload.',
    pages: ['execution', 'job-creation'], source: 'backend/src/routes/stoneBranch.ts' },
  { method: 'GET', path: '/api/stonebranch/trigger/resolve', auth: 'session', query: 'refJob',
    purpose: 'Resolves a reference job to its trigger so a new job can inherit that exact schedule, and returns the reference task maxRunTime.',
    pages: ['job-creation', 'scheduling'], source: 'backend/src/routes/stoneBranch.ts' },
  { method: 'POST', path: '/api/stonebranch/trigger', auth: 'session', body: 'trigger payload',
    purpose: 'Creates a time trigger in UAC. This is the endpoint that receives the generated trigger payload.',
    pages: ['execution', 'job-creation'], source: 'backend/src/routes/stoneBranch.ts' },
  { method: 'POST', path: '/api/stonebranch/triggers/enable', auth: 'session', body: '{ triggerNames: string[] }',
    purpose: 'Bulk-enables triggers. Run this only after verification, because every trigger is created disabled.',
    pages: ['execution', 'job-creation'], source: 'backend/src/routes/stoneBranch.ts' },

  // ── Upload ─────────────────────────────────────────────────────────────────
  { method: 'POST', path: '/api/upload', auth: 'session', body: 'multipart field "file"',
    purpose: 'Parses an .xlsx/.xls/.ods/.csv file into normalised job rows after filename and magic-byte content checks. 30 per minute per IP, MAX_FILE_SIZE cap.',
    pages: ['upload', 'job-creation'], source: 'backend/src/routes/fileUpload.ts' },

  // ── Execution ──────────────────────────────────────────────────────────────
  { method: 'POST', path: '/api/execution/preview', auth: 'session', body: '{ rows, resolvedRefs }',
    purpose: 'Dry run. Returns the exact task and trigger JSON that would be sent to UAC plus a plain-English schedule summary. Creates nothing.',
    pages: ['preview', 'validation'], source: 'backend/src/routes/execution.ts' },
  { method: 'POST', path: '/api/execution/stream', auth: 'session', body: '{ rows, resolvedRefs }',
    purpose: 'Creates tasks and triggers, streaming one Server-Sent Event per job so progress is live. Task is created before its trigger.',
    pages: ['execution'], source: 'backend/src/routes/execution.ts' },
  { method: 'POST', path: '/api/execution/batch', auth: 'session', body: '{ rows, resolvedRefs }',
    purpose: 'Non-streaming bulk create. Same result as /stream but returns once when the whole batch is done.',
    pages: ['execution'], source: 'backend/src/routes/execution.ts' },
  { method: 'GET', path: '/api/execution/qualifying-times', auth: 'session', query: 'triggername, count',
    purpose: 'Asks UAC for the next N dates a trigger will fire. The authoritative way to confirm a schedule.',
    pages: ['execution', 'scheduling', 'validation'], source: 'backend/src/routes/execution.ts' },
  { method: 'POST', path: '/api/execution/verify', auth: 'session', body: '{ taskName }',
    purpose: 'Re-fetches the created task and its -TR001 trigger from UAC and returns pass/warn/fail checks on the key fields.',
    pages: ['execution', 'validation'], source: 'backend/src/routes/execution.ts' },

  // ── Agents ─────────────────────────────────────────────────────────────────
  { method: 'GET', path: '/api/agents/list', auth: 'session',
    purpose: 'Lists UAC agents with their current status.', pages: ['agent-control'], source: 'backend/src/routes/agentControl.ts' },
  { method: 'POST', path: '/api/agents/suspend', auth: 'session', body: '{ agents: string[] }',
    purpose: 'Suspends one or more agents so they stop accepting new work.', pages: ['agent-control'], source: 'backend/src/routes/agentControl.ts' },
  { method: 'POST', path: '/api/agents/resume', auth: 'session', body: '{ agents: string[] }',
    purpose: 'Resumes suspended agents.', pages: ['agent-control'], source: 'backend/src/routes/agentControl.ts' },
  { method: 'POST', path: '/api/agents/clusters/suspend', auth: 'session', body: '{ clusters: string[] }',
    purpose: 'Suspends agent clusters.', pages: ['agent-control'], source: 'backend/src/routes/agentControl.ts' },
  { method: 'POST', path: '/api/agents/clusters/resume', auth: 'session', body: '{ clusters: string[] }',
    purpose: 'Resumes agent clusters.', pages: ['agent-control'], source: 'backend/src/routes/agentControl.ts' },
  { method: 'POST', path: '/api/agents/schedule', auth: 'session', body: '{ agents, action, scheduledAt, target }',
    purpose: 'Schedules a suspend or resume for a future time. Persisted with the token encrypted and restored after a backend restart.',
    pages: ['agent-control'], source: 'backend/src/routes/agentControl.ts' },
  { method: 'GET', path: '/api/agents/schedule', auth: 'session',
    purpose: 'Lists pending scheduled agent actions.', pages: ['agent-control'], source: 'backend/src/routes/agentControl.ts' },
  { method: 'DELETE', path: '/api/agents/schedule/:jobId', auth: 'session',
    purpose: 'Cancels a pending scheduled agent action.', pages: ['agent-control'], source: 'backend/src/routes/agentControl.ts' },

  // ── Monitoring ─────────────────────────────────────────────────────────────
  { method: 'POST', path: '/api/monitoring/start', auth: 'session', body: '{ pollIntervalMinutes, monitorAgents, monitorJobs, environment, teamsWebhookUrl? }',
    purpose: 'Starts the polling monitor for this session. Calling it again while running reconfigures it live.',
    pages: ['monitoring'], source: 'backend/src/routes/monitoring.ts' },
  { method: 'POST', path: '/api/monitoring/stop', auth: 'session',
    purpose: 'Stops the monitor.', pages: ['monitoring'], source: 'backend/src/routes/monitoring.ts' },
  { method: 'GET', path: '/api/monitoring/status', auth: 'session',
    purpose: 'Reports whether the monitor is running, its config, last run time and last cycle counts.', pages: ['monitoring'], source: 'backend/src/routes/monitoring.ts' },
  { method: 'POST', path: '/api/monitoring/run-now', auth: 'session',
    purpose: 'Forces one monitoring cycle immediately.', pages: ['monitoring'], source: 'backend/src/routes/monitoring.ts' },
  { method: 'GET', path: '/api/monitoring/failures', auth: 'session',
    purpose: 'Lists job instances that failed today.', pages: ['monitoring'], source: 'backend/src/routes/monitoring.ts' },
  { method: 'GET', path: '/api/monitoring/alerts', auth: 'session',
    purpose: 'Returns the alert history for the session, including incident numbers and ServiceNow links.', pages: ['monitoring'], source: 'backend/src/routes/monitoring.ts' },
  { method: 'POST', path: '/api/monitoring/clear-state', auth: 'session',
    purpose: 'Clears alert dedupe state and history, which makes previously seen alerts eligible to fire again.', pages: ['monitoring'], source: 'backend/src/routes/monitoring.ts' },
  { method: 'GET', path: '/api/monitoring/audit', auth: 'session',
    purpose: 'Returns the audit log of state-changing operations.', pages: ['logs', 'monitoring'], source: 'backend/src/routes/monitoring.ts' },

  // ── Deletion & recovery ────────────────────────────────────────────────────
  { method: 'GET', path: '/api/deletion/inspect', auth: 'session', query: 'taskname',
    purpose: 'Pre-deletion inspection: the task, every trigger referencing it, and any active instances that would block deletion.',
    pages: ['job-deletion'], source: 'backend/src/routes/jobDeletion.ts' },
  { method: 'POST', path: '/api/deletion/backup', auth: 'session', body: '{ tasknames: string[] }',
    purpose: 'Snapshots tasks and their triggers into the recovery store before deletion. This is what Job Recovery restores from.',
    pages: ['job-deletion', 'recovery'], source: 'backend/src/routes/jobDeletion.ts' },
  { method: 'POST', path: '/api/deletion/force-finish', auth: 'session', body: '{ taskname }',
    purpose: 'Force-finishes active instances that are blocking a deletion.', pages: ['job-deletion'], source: 'backend/src/routes/jobDeletion.ts' },
  { method: 'DELETE', path: '/api/deletion/job', auth: 'session', body: '{ taskname }',
    purpose: 'Deletes one job: disables and removes its triggers, then removes the task. Audited.', pages: ['job-deletion'], source: 'backend/src/routes/jobDeletion.ts' },
  { method: 'DELETE', path: '/api/deletion/jobs', auth: 'session', body: '{ tasknames: string[] }',
    purpose: 'Bulk deletion with per-job result reporting.', pages: ['job-deletion'], source: 'backend/src/routes/jobDeletion.ts' },
  { method: 'GET', path: '/api/deletion/recovery', auth: 'session',
    purpose: 'Lists recoverable jobs for the connected UAC environment. 7-day retention.', pages: ['recovery'], source: 'backend/src/routes/jobDeletion.ts' },
  { method: 'POST', path: '/api/deletion/recover', auth: 'session', body: '{ task, triggers }',
    purpose: 'Recreates a task and its triggers from a backup snapshot.', pages: ['recovery'], source: 'backend/src/routes/jobDeletion.ts' },
  { method: 'DELETE', path: '/api/deletion/recovery', auth: 'session', body: '{ taskname? }',
    purpose: 'Removes one recovery entry, or clears the environment when no taskname is given.', pages: ['recovery'], source: 'backend/src/routes/jobDeletion.ts' },

  // ── Search ─────────────────────────────────────────────────────────────────
  { method: 'GET', path: '/api/search/task', auth: 'session', query: 'name',
    purpose: 'Exact-name task lookup returning every field.', pages: ['search'], source: 'backend/src/routes/search.ts' },
  { method: 'GET', path: '/api/search/trigger', auth: 'session', query: 'name',
    purpose: 'Exact-name trigger lookup returning every field.', pages: ['search'], source: 'backend/src/routes/search.ts' },
  { method: 'PUT', path: '/api/search/task', auth: 'session', body: 'task payload',
    purpose: 'Updates a task in UAC. Read-only UAC-managed fields are rejected. Audited.', pages: ['search'], source: 'backend/src/routes/search.ts' },
  { method: 'PUT', path: '/api/search/trigger', auth: 'session', body: 'trigger payload',
    purpose: 'Updates a trigger in UAC. Read-only fields are rejected. Audited.', pages: ['search'], source: 'backend/src/routes/search.ts' },

  // ── Ad-hoc ─────────────────────────────────────────────────────────────────
  { method: 'GET', path: '/api/adhoc/search', auth: 'session', query: 'q',
    purpose: 'Partial-name search across tasks, workflows and triggers.', pages: ['adhoc-launch'], source: 'backend/src/routes/adhoc.ts' },
  { method: 'POST', path: '/api/adhoc/launch', auth: 'session', body: '{ kind, name }',
    purpose: 'Launches a task or workflow, or fires a trigger, immediately. Does not change any schedule.', pages: ['adhoc-launch'], source: 'backend/src/routes/adhoc.ts' },
  { method: 'POST', path: '/api/adhoc/instance/status', auth: 'session', body: '{ instances: [{ id, name }] }',
    purpose: 'Polls live instance status.', pages: ['adhoc-launch'], source: 'backend/src/routes/adhoc.ts' },
  { method: 'POST', path: '/api/adhoc/instance/op', auth: 'session', body: '{ op, id, name }',
    purpose: 'Acts on a running instance: cancel, force-finish, halt, rerun, hold or release.', pages: ['adhoc-launch'], source: 'backend/src/routes/adhoc.ts' },

  // ── Job doc & schedule AI ──────────────────────────────────────────────────
  { method: 'POST', path: '/api/jobdoc/push', auth: 'session', body: '{ rows }',
    purpose: 'Forwards created rows to the Power Automate flow that appends them to the shared job documentation Excel.', pages: ['job-creation'], source: 'backend/src/routes/jobDoc.ts' },
  { method: 'POST', path: '/api/schedule-ai/recommend', auth: 'public', body: '{ input }',
    purpose: 'Rule-based natural-language schedule recommendation. Returns starttime, frequency, timezone and a confidence score.', pages: ['scheduling'], source: 'backend/src/routes/scheduleAI.ts' },
  { method: 'POST', path: '/api/schedule-ai/analyze', auth: 'public', body: '{ schedules: string[] }',
    purpose: 'Analyses a set of schedule strings and reports the pattern distribution.', pages: ['scheduling'], source: 'backend/src/routes/scheduleAI.ts' },
  { method: 'POST', path: '/api/schedule-ai/recommend-batch', auth: 'public', body: '{ inputs: string[] }',
    purpose: 'Batch schedule recommendation with a success-rate summary.', pages: ['scheduling'], source: 'backend/src/routes/scheduleAI.ts' },

  // ── Copilot ────────────────────────────────────────────────────────────────
  { method: 'POST', path: '/api/copilot/ask', auth: 'session', body: '{ question, context? }',
    purpose: 'Asks the Copilot a question. Answers from the application knowledge base plus your session context only.', pages: ['home'], source: 'backend/src/routes/copilot.ts' },
  { method: 'POST', path: '/api/copilot/context', auth: 'session', body: '{ context, upload?, payloads?, executions? }',
    purpose: 'Tells the Copilot what page you are on and shares session state (upload, payloads, execution results) so later questions need no repetition.', pages: ['home'], source: 'backend/src/routes/copilot.ts' },
  { method: 'GET', path: '/api/copilot/suggestions', auth: 'session', query: 'page',
    purpose: 'Returns context-aware suggestions and findings for the current page.', pages: ['home'], source: 'backend/src/routes/copilot.ts' },
  { method: 'POST', path: '/api/copilot/analyze', auth: 'session', body: '{ rows? }',
    purpose: 'Analyses the uploaded rows for missing fields, invalid values, duplicate names and schedule conflicts.', pages: ['upload', 'validation'], source: 'backend/src/routes/copilot.ts' },
  { method: 'POST', path: '/api/copilot/explain', auth: 'session', body: '{ subject, name?, field?, error?, payload? }',
    purpose: 'Explains a payload, a single field, or an error message, grounded in the actual implementation.', pages: ['preview', 'validation'], source: 'backend/src/routes/copilot.ts' },
  { method: 'POST', path: '/api/copilot/schedule', auth: 'session', body: '{ input, timezone? }',
    purpose: 'Turns plain English into a valid trigger configuration and explains the result in plain English.', pages: ['scheduling'], source: 'backend/src/routes/copilot.ts' },
  { method: 'POST', path: '/api/copilot/wizard', auth: 'session', body: '{ action, answer? }',
    purpose: 'Drives the Inline Assistant: start, answer, skip, back, cancel. Collects one field at a time and ends with a summary for confirmation.', pages: ['job-creation'], source: 'backend/src/routes/copilot.ts' },
  { method: 'GET', path: '/api/copilot/health', auth: 'public',
    purpose: 'Reports whether the Copilot is enabled, which provider is configured and how many knowledge chunks are indexed.', pages: ['configuration'], source: 'backend/src/routes/copilot.ts' },
];

/** One chunk per endpoint, plus a catalogue chunk grouping them by area. */
export const API_CHUNKS: KnowledgeChunk[] = [
  ...API_SPECS.map<KnowledgeChunk>(spec => ({
    id: `api.${spec.method.toLowerCase()}.${spec.path.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '')}`,
    kind: 'api',
    title: `${spec.method} ${spec.path}`,
    pages: spec.pages,
    keywords: [
      spec.path,
      ...spec.path.split(/[/:]/).filter(Boolean),
      spec.auth === 'public' ? 'public endpoint' : 'requires session',
    ],
    source: spec.source,
    body: `${spec.method} ${spec.path}
Auth: ${spec.auth === 'session' ? 'requires a valid session (X-Session-ID header)' : 'public — no session required'}
${spec.body ? `Body: ${spec.body}\n` : ''}${spec.query ? `Query: ${spec.query}\n` : ''}${spec.purpose}`,
  })),
  {
    id: 'api.catalogue',
    kind: 'api',
    title: 'API catalogue — all endpoints by area',
    pages: ['configuration'],
    keywords: ['api list', 'all endpoints', 'catalogue', 'catalog', 'routes', 'what apis'],
    source: 'backend/src/index.ts, docs/11_API_CATALOG.md',
    body: `The backend mounts these route groups on port 3001:
/api/stonebranch — connect, disconnect, validate, task read/create, trigger resolve/create/enable
/api/upload — spreadsheet parsing
/api/execution — preview, stream, batch, qualifying-times, verify
/api/agents — list, suspend, resume, cluster suspend/resume, schedule CRUD
/api/monitoring — start, stop, status, run-now, failures, alerts, clear-state, audit
/api/deletion — inspect, backup, force-finish, delete job/jobs, recovery list/recover/remove
/api/search — task and trigger read and update
/api/adhoc — search, launch, instance status, instance op
/api/jobdoc — push to Power Automate
/api/schedule-ai — rule-based schedule recommendation
/api/copilot — the AI Operations Copilot
/health — liveness

Everything except connect, disconnect, /api/schedule-ai and /health requires a session. Global rate limit is 200 requests per minute per IP; uploads 30/min; connect 10 per 15 minutes.`,
  },
];
