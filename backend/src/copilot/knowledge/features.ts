/**
 * Feature, workflow, concept and integration knowledge.
 *
 * Every entry here describes behaviour that actually exists in this repo. The
 * `source` field points at the implementation so any answer can be audited.
 */
import { KnowledgeChunk } from '../types';

export const FEATURE_CHUNKS: KnowledgeChunk[] = [
  // ── Concepts ───────────────────────────────────────────────────────────────
  {
    id: 'concept.what-is-this-app',
    kind: 'concept',
    title: 'What this application does',
    pages: ['home', 'dashboard'],
    keywords: ['overview', 'purpose', 'what is this', 'portal', 'tool', 'platform'],
    source: 'frontend/src/automations/registry.ts, backend/src/index.ts',
    body: `This is a Stonebranch Universal Automation Center (UAC) operations portal. It automates work that is otherwise done by hand in the UAC web UI.

It ships eight live automations: Ad-hoc Launch, Job Creation, Agent Control, Monitoring & Alerts, Job Deletion, Job Recovery, Search & Edit, and the AI Operations Copilot (Beta). Bulk Job Update is listed but is in maintenance status and is not usable.

Architecture: a Next.js 14 frontend (App Router, dark theme, tab-based workspace) talks to an Express backend on port 3001. The backend is the only component that talks to UAC. All UAC calls go out over the REST API using a per-session bearer token that is held server-side and never returned to the browser.`,
  },
  {
    id: 'concept.task-vs-trigger',
    kind: 'concept',
    title: 'Task vs trigger — the two objects every job is made of',
    pages: ['job-creation', 'preview', 'search', 'job-deletion', 'scheduling'],
    keywords: ['task', 'trigger', 'difference', 'job', 'what is a job', 'TR001'],
    source: 'backend/src/utils/payloadMapper.ts',
    body: `In UAC a "job" as users describe it is always two separate objects.

The TASK is the unit of work: what runs, where it runs, and how failure is handled. It carries type (taskUnix, taskWindows, taskSql, …), name, command, agent or agentCluster, credentials, exit-code handling, retry settings and maxRunTime.

The TRIGGER is the schedule: when the task runs. This application only creates time triggers (type triggerTime). The trigger holds the time/interval, the day pattern, the timezone, the calendar and the list of tasks it launches.

This application always names the trigger after the task with a -TR001 suffix. A task named PAY_DAILY_LOAD gets a trigger named PAY_DAILY_LOAD-TR001. That naming is fixed in code and is how Job Deletion, Verify and Search find a job's trigger without being told.

A task with no trigger simply never runs on a schedule; it can still be launched on demand from Ad-hoc Launch.`,
  },
  {
    id: 'concept.session-and-connection',
    kind: 'concept',
    title: 'Connecting, sessions and idle timeout',
    pages: ['home', 'configuration'],
    keywords: ['connect', 'login', 'token', 'session', 'expired', 'reconnect', 'disconnect', 'auth', '401'],
    source: 'backend/src/middleware/session.ts, backend/src/routes/stoneBranch.ts, frontend/src/store/useConnectionStore.ts',
    body: `You must connect before any automation will work. Connecting posts your UAC base URL and token once to POST /api/stonebranch/connect. The backend validates the token against UAC, stores it in an in-memory session and returns only a session id.

From then on the browser sends the session id in the X-Session-ID header. The token is never stored in the browser and never sent again.

Sessions expire two ways: after 15 minutes of inactivity, and after 2 hours absolutely regardless of activity. The frontend applies its own 30-minute idle disconnect. When a session dies the API returns 401 with code SESSION_EXPIRED, the UI clears its state and you have to reconnect. Sessions live in memory only, so a backend restart drops every session.

Connect is rate limited to 10 attempts per 15 minutes per IP to throttle token guessing.`,
  },
  {
    id: 'concept.tab-workspace',
    kind: 'concept',
    title: 'Tab workspace — why your work is not lost when you switch pages',
    pages: ['home', 'dashboard'],
    keywords: ['tab', 'navigation', 'switch', 'lost work', 'state', 'workspace'],
    source: 'frontend/src/components/WorkspaceLayout.tsx, frontend/src/store/useWorkspaceStore.ts',
    body: `Automations open as tabs in a VS Code style workspace rather than as separate pages. Every tab you open stays mounted; only the active one is visible. That means an upload, a parsed grid or a half-finished execution survives switching to another automation and back.

Closing a tab discards that automation's state. The Home tab cannot be closed.`,
  },

  // ── Job Creation ───────────────────────────────────────────────────────────
  {
    id: 'feature.job-creation',
    kind: 'feature',
    title: 'Job Creation — bulk task and trigger creation from a spreadsheet',
    pages: ['job-creation', 'upload', 'preview', 'execution'],
    keywords: ['create job', 'bulk', 'excel', 'csv', 'ods', 'new job', 'pipeline'],
    source: 'frontend/src/components/PipelinePage.tsx, backend/src/routes/execution.ts',
    body: `Job Creation turns a spreadsheet into real UAC tasks and time triggers. It accepts .xlsx, .xls, .ods and .csv.

The pipeline has five stages: Upload, Parse, Preview, Execute, Verify.

Capabilities: bulk task plus trigger creation, ref_job schedule inheritance, AT/EVERY/UNTIL schedule parsing, automatic agent vs agent-cluster resolution, Business Services mapping to opswiseGroups, and Job Builder Chat for building a row from a pasted job document instead of a spreadsheet.

Hard limits from the execution queue: 100 jobs per run, 2 concurrent UAC calls, 300 ms delay between calls. Uploads are capped at MAX_FILE_SIZE (10 MB by default) and 30 uploads per minute per IP.

Every trigger is created disabled. Nothing runs on a schedule until you explicitly enable triggers after verification.`,
  },
  {
    id: 'workflow.job-creation-steps',
    kind: 'workflow',
    title: 'Workflow: creating jobs from a file, step by step',
    pages: ['job-creation', 'upload', 'preview', 'execution', 'validation'],
    keywords: ['how to create', 'steps', 'procedure', 'pipeline', 'workflow'],
    source: 'frontend/src/components/PipelinePage.tsx, backend/src/routes/execution.ts',
    body: `1. Connect to the target UAC environment.
2. Upload the spreadsheet. POST /api/upload parses it and returns normalised rows. Header names are normalised, so "Job Name" and "task_name" both land on task_name.
3. If any row has a ref_job, resolve it. GET /api/stonebranch/trigger/resolve looks up that reference job's trigger so the new job inherits its exact schedule and its maxRunTime.
4. Preview. POST /api/execution/preview returns the exact task and trigger JSON that will be sent to UAC, plus a plain-English schedule summary. Nothing has been created at this point.
5. Execute. POST /api/execution/stream creates the objects and streams one event per job so you watch it happen live. POST /api/execution/batch is the non-streaming equivalent.
6. Verify. POST /api/execution/verify re-fetches the created task and trigger from UAC and checks the key fields. GET /api/execution/qualifying-times shows the next run dates UAC itself calculates.
7. Enable triggers. POST /api/stonebranch/triggers/enable flips the verified triggers to enabled. Only do this after the qualifying times look right.
8. Optionally push the job documentation to the shared Excel via POST /api/jobdoc/push.

Order matters: task first, then trigger. A trigger cannot reference a task that does not exist yet.`,
  },
  {
    id: 'feature.job-builder-chat',
    kind: 'feature',
    title: 'Job Builder Chat — build a job row from a pasted job document',
    pages: ['job-creation'],
    keywords: ['job builder', 'chat', 'paste', 'job doc', 'jobdoc', 'single job', 'manual'],
    source: 'frontend/src/components/JobBuilderChat.tsx, frontend/src/utils/jobDocParser.ts',
    body: `Job Builder Chat lets you create one job without a spreadsheet. Paste the job request document (the "Job Name = … / Job Script = … / Scheduled Frequency = …" block) and it extracts the fields into a row that feeds the same preview and execute path.

It is a deterministic text parser, not a language model. The whole pasted text is also kept in the job_doc column, and when job_doc is present it is written verbatim into the notes of both the task and the trigger instead of being reconstructed field by field.`,
  },
  {
    id: 'feature.ref-job-inheritance',
    kind: 'feature',
    title: 'Reference job (ref_job) schedule inheritance',
    pages: ['job-creation', 'preview', 'scheduling'],
    keywords: ['ref_job', 'reference job', 'inherit', 'copy schedule', 'like another job', 'clone'],
    source: 'backend/src/routes/stoneBranch.ts, backend/src/utils/payloadMapper.ts',
    body: `Put an existing job's name in the ref_job column and the new job copies that job's schedule exactly instead of parsing your schedule text.

GET /api/stonebranch/trigger/resolve finds the reference job's trigger and returns it. Only schedule fields are copied: time, timeZone, timeInterval, timeIntervalUnits, timeStyle, startingAt, dayStyle, dayInterval, intervalStartingDate, simpleDateType, the day flags, businessDays, the date adjective/noun/qualifier set, nthAmount, restriction fields, restrictedTimes, enabledStart, enabledEnd, calendar and forecast.

Nothing else is inherited. The name, command, agent, credentials and notes always come from your row. maxRunTime is also picked up from the reference task when your row does not set max_runtime.

When ref_job is used, the schedule text in schedule_string and frequency_type is ignored for that row.`,
  },

  // ── Upload ─────────────────────────────────────────────────────────────────
  {
    id: 'feature.upload',
    kind: 'feature',
    title: 'Upload — file parsing and security checks',
    pages: ['upload', 'job-creation'],
    keywords: ['upload', 'file', 'excel', 'xlsx', 'csv', 'ods', 'parse', 'headers', 'columns'],
    source: 'backend/src/routes/fileUpload.ts, backend/src/services/fileParserService.ts, backend/src/utils/fileSecurity.ts',
    body: `POST /api/upload takes a single multipart field named "file" and returns parsed rows.

Accepted formats: .xlsx, .xls, .ods, .csv. The upload is checked twice: the filename must be safe (no path traversal, no odd characters) and the file content is verified against its extension by magic bytes, so a renamed executable is rejected even if the extension looks fine.

Column headers are normalised, so a wide range of spellings map onto the canonical column names. Rows are validated as they are parsed and unusable rows are reported rather than silently dropped.

Limits: MAX_FILE_SIZE, 10 MB by default, and 30 uploads per minute per IP. Files land in UPLOAD_DIR (./uploads by default).`,
  },

  // ── Execution ──────────────────────────────────────────────────────────────
  {
    id: 'feature.execution',
    kind: 'feature',
    title: 'Execution — preview, streaming create, verify',
    pages: ['execution', 'preview', 'job-creation'],
    keywords: ['execute', 'run', 'create', 'stream', 'sse', 'verify', 'qualifying times', 'dry run'],
    source: 'backend/src/routes/execution.ts, backend/src/utils/executionQueue.ts',
    body: `Preview (POST /api/execution/preview) is a true dry run. It builds the payloads with the same code that execution uses and returns them, without calling UAC.

Streaming execution (POST /api/execution/stream) is what the UI uses. It is Server-Sent Events: the backend emits an event per job as the task and then the trigger are created, so the dashboard updates live instead of waiting for the whole batch.

Throughput is deliberately conservative — 2 concurrent UAC calls with a 300 ms gap and a hard cap of 100 jobs per run — so a bulk load cannot overwhelm UAC.

Verify (POST /api/execution/verify) re-reads the created task and trigger back out of UAC and returns pass/warn/fail checks on the key fields. Qualifying times (GET /api/execution/qualifying-times) asks UAC for the next N run dates, which is the only reliable way to confirm a schedule is what you intended.`,
  },

  // ── Monitoring ─────────────────────────────────────────────────────────────
  {
    id: 'feature.monitoring',
    kind: 'feature',
    title: 'Monitoring & Alerts — agent offline and job failure detection',
    pages: ['monitoring'],
    keywords: ['monitoring', 'alerts', 'teams', 'failure', 'offline', 'poll', 'servicenow', 'webhook'],
    source: 'backend/src/routes/monitoring.ts, backend/src/services/monitoringService.ts, frontend/src/components/MonitoringPage.tsx',
    body: `Monitoring polls UAC on a timer and pushes alerts to Microsoft Teams as Adaptive Cards.

It watches two things, each independently toggleable: agents going offline, and job instances that failed today. Poll interval is selectable at 1, 5, 10 or 15 minutes and can be changed while running — changing it restarts the cycle with the new settings.

Alerts are deduplicated, so a job that stays failed does not re-alert every cycle. The service reads the operational memo on a failed instance, extracts ServiceNow incident numbers from it and builds deep links using SERVICENOW_PROD_HOST / SERVICENOW_NONPROD_HOST.

Monitoring is owned by the session that started it, because it needs a live token to call UAC. If someone else started it you will see a warning; stop it and start it with your own session. "Run Now" forces one cycle immediately. "Clear" wipes the alert state and history, which makes previously seen alerts eligible to fire again.

State is on disk under backend/monitor_configs, monitor_states and monitor_history, so it survives a restart. The webhook comes from the request or falls back to TEAMS_WEBHOOK_URL.`,
  },
  {
    id: 'workflow.monitoring-failure-triage',
    kind: 'workflow',
    title: 'Workflow: triaging a job failure alert',
    pages: ['monitoring', 'adhoc-launch', 'logs'],
    keywords: ['failure', 'failed job', 'troubleshoot', 'triage', 'recover', 'rerun', 'what do i do'],
    source: 'backend/src/services/monitoringService.ts, backend/src/routes/adhoc.ts',
    body: `When a job failure alert arrives:
1. Read the alert. It carries the task name, status, time, environment and the operational memo, plus any ServiceNow incident numbers found in the memo.
2. Open the incident link if one was extracted, so you are working the existing ticket rather than raising a duplicate.
3. Look up the job. Search & Edit shows the full task definition; the notes field holds the job documentation including the Recovery1 and Recovery2 instructions written by the requester. Those recovery notes are the authoritative first response for that job.
4. Check the agent. If Monitoring also reported the agent offline, the job failure is a symptom, not the cause — fix the agent first via Agent Control.
5. Re-run when the cause is cleared. Ad-hoc Launch can rerun the failed instance, or hold, release, cancel, halt or force-finish it.
6. If the instance is stuck and blocking, force-finish is available from both Ad-hoc Launch and the Job Deletion inspect screen.`,
  },

  // ── Agent Control ──────────────────────────────────────────────────────────
  {
    id: 'feature.agent-control',
    kind: 'feature',
    title: 'Agent Control — suspend and resume agents and clusters',
    pages: ['agent-control'],
    keywords: ['agent', 'cluster', 'suspend', 'resume', 'maintenance', 'patching', 'schedule action'],
    source: 'backend/src/routes/agentControl.ts, frontend/src/components/AgentControlPage.tsx',
    body: `Agent Control suspends and resumes UAC agents and agent clusters, one at a time or in bulk. Typical use is a maintenance or patching window.

Actions can run immediately or be scheduled for a date and time. Scheduled actions are persisted to disk with the token encrypted using ENCRYPTION_KEY, and they are restored automatically when the backend restarts — so a scheduled resume still fires after a deploy.

Endpoints: GET /api/agents/list, POST /api/agents/suspend, POST /api/agents/resume, POST /api/agents/clusters/suspend, POST /api/agents/clusters/resume, POST /api/agents/schedule, GET /api/agents/schedule, DELETE /api/agents/schedule/:jobId.

Suspending an agent stops it accepting new work. Jobs targeted at a suspended agent queue rather than fail. Always schedule the resume at the same time you schedule the suspend, otherwise the agent stays suspended and work silently piles up.`,
  },

  // ── Job Deletion ───────────────────────────────────────────────────────────
  {
    id: 'feature.job-deletion',
    kind: 'feature',
    title: 'Job Deletion — safe removal in the correct sequence',
    pages: ['job-deletion'],
    keywords: ['delete', 'remove', 'decommission', 'inspect', 'backup', 'force finish'],
    source: 'backend/src/routes/jobDeletion.ts, frontend/src/components/JobDeletionPage.tsx',
    body: `Job Deletion removes a task and its triggers in the order UAC requires, with a full audit trail.

The safe sequence, which this automation enforces: inspect, back up, disable the trigger, delete the trigger, then delete the task. Deleting a task while a trigger still points at it leaves a broken trigger behind.

GET /api/deletion/inspect shows the task, every trigger that references it, and any active instances. Active instances block deletion; POST /api/deletion/force-finish clears a stuck instance.

POST /api/deletion/backup snapshots the task and its triggers before anything is removed, and that snapshot is what Job Recovery restores from. Take the backup every time.

DELETE /api/deletion/job removes one job, DELETE /api/deletion/jobs removes many with per-job result reporting. Every deletion is written to the audit log.`,
  },
  {
    id: 'feature.job-recovery',
    kind: 'feature',
    title: 'Job Recovery — restore deleted jobs',
    pages: ['recovery'],
    keywords: ['recovery', 'restore', 'undelete', 'backup', 'rollback', 'oops'],
    source: 'backend/src/routes/jobDeletion.ts, backend/src/utils/recoveryStore.ts, frontend/src/components/JobRecoveryPage.tsx',
    body: `Job Recovery restores jobs that Job Deletion removed. Two sources: the server-side backup store, or an Excel backup file you upload.

The server store is per UAC environment and keeps entries for 7 days, then prunes them. GET /api/deletion/recovery lists what is recoverable for the environment you are connected to, POST /api/deletion/recover recreates the task and its triggers, DELETE /api/deletion/recovery removes an entry or clears the environment.

Recovery recreates the trigger too. Restored triggers should be verified and enabled the same way newly created ones are. A job deleted more than 7 days ago is not in the server store — you need the Excel backup that was taken at deletion time.`,
  },

  // ── Search & Edit ──────────────────────────────────────────────────────────
  {
    id: 'feature.search-edit',
    kind: 'feature',
    title: 'Search & Edit — look up and change a task or trigger',
    pages: ['search'],
    keywords: ['search', 'edit', 'lookup', 'find', 'update', 'change', 'modify', 'fields'],
    source: 'backend/src/routes/search.ts, frontend/src/components/SearchEditPage.tsx',
    body: `Search & Edit looks up a task or trigger by exact name, shows every field, and lets you edit values and save them straight back to UAC.

Endpoints: GET /api/search/task, GET /api/search/trigger, PUT /api/search/task, PUT /api/search/trigger.

Read-only fields are protected — the API refuses to write sysId, version, nextScheduledTime, avgRunTime, lastRunTime, runCount and the other UAC-managed fields. Every update is written to the audit log.

Lookup is by exact name, not a wildcard search. For fuzzy searching across tasks, workflows and triggers use Ad-hoc Launch, whose search endpoint matches partial names.`,
  },
  {
    id: 'feature.adhoc-launch',
    kind: 'feature',
    title: 'Ad-hoc Launch — search, launch on demand, control the live instance',
    pages: ['adhoc-launch'],
    keywords: ['adhoc', 'ad-hoc', 'launch', 'run now', 'trigger now', 'instance', 'cancel', 'halt', 'rerun', 'hold', 'release'],
    source: 'backend/src/routes/adhoc.ts, frontend/src/components/AdhocLaunchPage.tsx',
    body: `Ad-hoc Launch is the on-demand operations console. GET /api/adhoc/search does a partial-name search across tasks, workflows and triggers. POST /api/adhoc/launch runs the selected object immediately.

Once launched, the instance is polled via POST /api/adhoc/instance/status and you can act on it with POST /api/adhoc/instance/op: cancel, force-finish, halt, rerun, hold, release.

Launching a task here runs it once, right now, and does not touch its schedule. This is the safe way to test a newly created job before enabling its trigger.`,
  },

  // ── Cross-cutting ──────────────────────────────────────────────────────────
  {
    id: 'feature.logs-audit',
    kind: 'feature',
    title: 'Logs and audit trail',
    pages: ['logs', 'configuration'],
    keywords: ['log', 'logs', 'audit', 'history', 'who did', 'winston', 'rotation', 'trace'],
    source: 'backend/src/config/logger.ts, backend/src/middleware/auditLogger.ts',
    body: `Logging is Winston with daily rotation. Streams are written under LOG_DIRECTORY: application, api, error, audit and startup, rotated daily and gzipped, retained for LOG_RETENTION_DAYS.

The audit log records the state-changing operations — job creation, deletion, recovery, field edits, agent suspend/resume — and is also exposed at GET /api/monitoring/audit.

Secrets are never logged. At boot the server logs only whether a secret is configured, not its value.`,
  },
  {
    id: 'feature.configuration',
    kind: 'feature',
    title: 'Configuration — environment variables that change behaviour',
    pages: ['configuration'],
    keywords: ['config', 'env', 'environment variable', 'setup', 'settings', '.env'],
    source: 'backend/src/config/env.ts, .env.example',
    body: `Configuration is environment variables, loaded from backend/.env then the repo root .env.

Connectivity: BASE_URL, BACKEND_PORT (3001), CORS_ORIGINS (an allow-list, never a wildcard by default), NEXT_PUBLIC_API_BASE_URL, NEXT_PUBLIC_SB_BASE_URL.
Uploads: UPLOAD_DIR, MAX_FILE_SIZE.
Integrations: TEAMS_WEBHOOK_URL, POWER_AUTOMATE_URL, SERVICENOW_PROD_HOST, SERVICENOW_NONPROD_HOST.
Security: ENCRYPTION_KEY (required, at least 32 characters, encrypts persisted scheduled-job tokens), ALLOW_ENV_TOKEN_FALLBACK (false by default — turning it on lets any request without a session use the server's own token, which is an auth bypass outside a trusted single-tenant deployment).
Logging: LOG_DIRECTORY, LOG_LEVEL, LOG_RETENTION_DAYS, LOG_MAX_FILE_SIZE, ENABLE_CONSOLE_LOGGING.
Copilot: COPILOT_ENABLED, COPILOT_PROVIDER, COPILOT_MODEL, COPILOT_API_KEY, COPILOT_BASE_URL, COPILOT_MAX_TOKENS, COPILOT_TEMPERATURE.`,
  },

  // ── Integrations ───────────────────────────────────────────────────────────
  {
    id: 'integration.uac',
    kind: 'integration',
    title: 'Integration: Stonebranch UAC REST API',
    pages: ['configuration', 'job-creation', 'execution'],
    keywords: ['uac', 'stonebranch', 'rest', 'api', 'universal controller', 'which api'],
    source: 'backend/src/services/stoneBranchService.ts',
    body: `Every UAC call goes through StoneBranchService, an axios client bound to the session's base URL and bearer token.

The resource paths used: /resources/task for task read and create, /resources/trigger for trigger read and create, the trigger enable operation, agent and cluster operations, task instance operations, and the qualifying-times query.

The browser never calls UAC directly. That is deliberate — it keeps the token server-side and keeps CORS closed.`,
  },
  {
    id: 'integration.teams',
    kind: 'integration',
    title: 'Integration: Microsoft Teams alerts',
    pages: ['monitoring'],
    keywords: ['teams', 'webhook', 'adaptive card', 'notification', 'channel', 'alert'],
    source: 'backend/src/services/monitoringService.ts',
    body: `Monitoring posts Adaptive Cards to a Teams incoming webhook. The URL comes from the monitoring request, or falls back to TEAMS_WEBHOOK_URL. Cards carry the object name, status, environment, time, the operational memo and clickable ServiceNow incident links.

Teams is outbound only today — you receive alerts, you cannot drive the application from Teams. Two-way Teams access is on the Copilot roadmap.`,
  },
  {
    id: 'integration.servicenow',
    kind: 'integration',
    title: 'Integration: ServiceNow incident links',
    pages: ['monitoring'],
    keywords: ['servicenow', 'snow', 'incident', 'ticket', 'inc', 'change'],
    source: 'backend/src/services/monitoringService.ts, backend/src/utils/payloadMapper.ts',
    body: `ServiceNow is referenced two ways.

On alerts: the monitoring service scans a failed instance's operational memo for incident numbers and turns them into deep links against SERVICENOW_PROD_HOST or SERVICENOW_NONPROD_HOST depending on environment.

On job creation: the servicenow_ticket column is written to customField2 on both the task and the trigger, labelled "ServiceNow Ticket", and is used as the title of the notes entry. servicenow_group is recorded inside the job documentation notes. That is what links a created job back to the change record that authorised it.`,
  },
  {
    id: 'integration.power-automate',
    kind: 'integration',
    title: 'Integration: job documentation push to shared Excel',
    pages: ['job-creation'],
    keywords: ['job doc', 'power automate', 'excel', 'sharepoint', 'documentation', 'push'],
    source: 'backend/src/routes/jobDoc.ts',
    body: `POST /api/jobdoc/push forwards the created rows to POWER_AUTOMATE_URL, a Power Automate flow that appends them to the shared job documentation Excel. It is the last optional step of job creation and does not touch UAC.`,
  },

  // ── The Copilot itself ─────────────────────────────────────────────────────
  {
    id: 'feature.copilot',
    kind: 'feature',
    title: 'AI Operations Copilot (Beta) — what it is and what it can see',
    pages: ['home', 'dashboard', 'job-creation', 'upload', 'preview', 'validation', 'execution', 'monitoring', 'recovery', 'job-deletion', 'search', 'adhoc-launch', 'agent-control', 'scheduling', 'configuration', 'logs'],
    keywords: ['copilot', 'assistant', 'ai', 'help', 'beta', 'what can you do', 'who are you'],
    source: 'backend/src/copilot/, frontend/src/components/copilot/',
    body: `The AI Operations Copilot (Beta) is an assistant embedded on every page of this application. It is not a general chatbot: it answers only from this application's own knowledge base and from your current session.

What it knows: every feature, page and workflow; every backend API; every spreadsheet column and payload field; every validation rule the payload builder enforces; every scheduling option the trigger builder supports; and the integrations with UAC, Teams, ServiceNow and Power Automate.

What it can see in your session: the file you uploaded and its parsed rows, the payloads that were generated from them, validation findings, execution results, and everything you have already told it. It does not ask twice for something you have already provided.

What it can do: analyse an upload and report missing fields, invalid values, duplicate names and schedule conflicts; translate plain English like "every weekday at 8 PM" into a valid trigger configuration and explain it back in plain English; explain any generated payload field by field, including why a value was chosen and which API will receive it; explain an error message; run an inline wizard that collects one field at a time to build a job; and suggest best practices for what you are doing right now.

What it will not do: guess at Stonebranch behaviour that is not implemented here, act on your behalf without you clicking, or read anything outside this application. It never sees your UAC token.

Beta scope: a future release adds Microsoft Teams integration so the same contextual assistance is available directly from Teams.`,
  },
  {
    id: 'concept.copilot-roadmap-teams',
    kind: 'concept',
    title: 'Copilot roadmap — Microsoft Teams integration',
    pages: ['home', 'dashboard'],
    keywords: ['roadmap', 'future', 'teams', 'coming soon', 'beta', 'next release'],
    source: 'docs/AI_OPERATIONS_COPILOT.md',
    body: `The Copilot is labelled Beta. Planned next: deeper Microsoft Teams integration, so the assistant can be reached directly from Teams and give the same contextual, session-aware guidance and operational assistance it gives inside the application. Today Teams is outbound only, used by Monitoring to deliver alerts.`,
  },
];
