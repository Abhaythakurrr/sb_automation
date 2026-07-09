/**
 * Technical Documentation — StoneBranch Automation Platform
 * Audited against actual source code. No placeholder or fictional content.
 */

export interface AboutSection {
  heading: string;
  intro?: string;
  content?: string[];
  subsections?: { title: string; points: string[] }[];
  diagram?: {
    type: 'flow' | 'architecture' | 'sequence';
    description: string;
    nodes?: { id: string; label: string; type: 'process' | 'data' | 'decision' | 'start' | 'end' }[];
    edges?: { from: string; to: string; label?: string }[];
  };
  codeExample?: { language: string; code: string; description: string };
  table?: { columns: string[]; rows: string[][] };
}

export interface AboutToolDoc {
  title: string;
  subtitle: string;
  sections: AboutSection[];
}

export const ABOUT_TOOL_DOC: AboutToolDoc = {
  title: 'StoneBranch Automation Platform',
  subtitle: 'Technical Documentation & User Guide',
  sections: [
    // ── 1. System Overview ───────────────────────────────────────────────────
    {
      heading: 'System Overview',
      intro: 'A full-stack web application that automates StoneBranch UAC (Universal Automation Center) job creation, deletion, recovery, monitoring, and ad-hoc operations through a modern self-service portal. Users authenticate with their own UAC bearer token — no credentials are stored server-side.',
      subsections: [
        {
          title: 'Automation Modules (Live)',
          points: [
            'Job Creation — bulk task + time trigger creation from Excel / ODS / CSV, with schedule parsing and ref-job inheritance',
            'Job Deletion — safe multi-step deletion: inspect → disable triggers → delete triggers → delete task; handles workflows and active instances',
            'Job Recovery — restore deleted jobs from server-side backups or uploaded Excel files with real-time per-job status',
            'Ad-hoc Launch — global search across tasks, workflows, and triggers; one-click launch with real-time instance monitoring and Cancel / Force-Finish / Halt / Rerun / Hold / Release controls',
            'Agent Control — bulk suspend / resume of agents and agent clusters; immediate or scheduled (persisted to disk, survives restarts)',
            'Monitoring & Alerts — polls UAC for agent-offline and job-failure events; pushes Adaptive Card alerts to MS Teams',
            'Search & Edit — exact-name lookup of any task or trigger; inline field editing saved directly to UAC',
          ],
        },
        {
          title: 'Key Metrics',
          points: [
            'Job creation speed: 2–3 seconds per job (task + trigger) via UAC REST API',
            'Bulk limit: up to 500 jobs per upload file',
            'Server-side backup retention: 7 days per UAC environment (auto-expires)',
            'Session lifetime: 8 hours (HTTP-only cookie, token never stored to disk)',
            'Audit log retention: rolling file, kept until manually rotated',
          ],
        },
        {
          title: 'Technology Stack',
          points: [
            'Frontend: Next.js 14 (App Router), React 18, TypeScript, TailwindCSS, Framer Motion, Zustand, SheetJS (xlsx)',
            'Backend: Node.js 18+, Express.js, TypeScript, Multer (file upload), express-session, Winston (logging), Zod (validation)',
            'Process management: PM2 (auto-restart, log rotation)',
            'Reverse proxy: Nginx (SSL termination, static serving)',
            'Storage: flat JSON files (no database) — recovery_store.json, creation_log.json, audit.log, monitor_state.json',
          ],
        },
      ],
    },

    // ── 2. System Architecture ───────────────────────────────────────────────
    {
      heading: 'System Architecture',
      intro: 'Three-tier architecture: Next.js frontend → Express backend → StoneBranch UAC REST API. The backend holds the bearer token in a server-side session so it is never exposed to the browser after the initial connect call.',
      diagram: {
        type: 'architecture',
        description: 'Data flow: user browser → Next.js (port 3000) → Express backend (port 3001) → UAC REST API. Side channels: backend → MS Teams webhooks, backend → flat JSON stores.',
        nodes: [
          { id: 'browser', label: 'User Browser\n(Next.js SPA)', type: 'start' },
          { id: 'backend', label: 'Express Backend\n(Node.js :3001)', type: 'process' },
          { id: 'uac',     label: 'StoneBranch UAC\nREST API',        type: 'data' },
          { id: 'json',    label: 'JSON File Store\n(recovery, logs)', type: 'data' },
          { id: 'teams',   label: 'MS Teams\nWebhook',                type: 'data' },
        ],
        edges: [
          { from: 'browser', to: 'backend', label: 'REST + SSE (HTTPS)' },
          { from: 'backend', to: 'uac',     label: 'Bearer token' },
          { from: 'backend', to: 'json',    label: 'Read / Write' },
          { from: 'backend', to: 'teams',   label: 'Adaptive Cards' },
        ],
      },
      subsections: [
        {
          title: 'Frontend (Next.js)',
          points: [
            'Single-page workspace: all automation tabs mounted and hidden (not unmounted) so state is preserved across tab switches',
            'State: Zustand stores for connection (session ID, token hint, username) and workspace (open tabs, active tab)',
            'Real-time job creation: SSE stream from POST /api/execution/stream — each task/trigger step sent as a server-sent event',
            'File parsing: SheetJS runs client-side to parse .xlsx / .ods / .csv before uploading rows as JSON',
            'Sound effects: optional audio feedback on connect, create, delete, error',
          ],
        },
        {
          title: 'Backend (Express)',
          points: [
            'Route modules: stoneBranch (connect/auth), execution (batch + SSE stream + preview + verify), fileUpload, jobDeletion, adhoc, agentControl, monitoring, search, scheduleAI',
            'Session middleware: req.token and req.sbBaseUrl injected from encrypted server-side session — never sent back to client',
            'Audit logger: every mutating action written to audit.log (timestamp, action, resource, sessionId, result)',
            'Request logger: all HTTP requests logged with method, path, status, duration',
            'Error handler: centralized middleware returns structured JSON errors, never stack traces to client',
          ],
        },
        {
          title: 'File Storage (no database)',
          points: [
            'recovery_store.json — per-environment server-side job backups (taskName, task, triggers, savedAt); 7-day TTL, pruned daily',
            'creation_log.json — rolling log of created task names with timestamp; capped at 2000 entries',
            'audit.log — append-only structured audit trail',
            'monitor_state.json — monitoring service state (last seen agents/jobs, dedup cache)',
            'monitor_config.json — monitoring service config (poll interval, webhook URL, environment)',
            'schedule_state.json — persisted scheduled agent-control jobs (survives backend restarts)',
          ],
        },
      ],
    },

    // ── 3. Job Creation Flow ─────────────────────────────────────────────────
    {
      heading: 'Job Creation Flow',
      intro: 'Jobs are created by uploading an Excel/ODS/CSV file or by using the Job Builder Chat. Each row produces one UAC task and one time trigger. Creation runs sequentially via a real-time SSE stream so the user sees per-step live feedback.',
      diagram: {
        type: 'flow',
        description: 'End-to-end job creation: file upload → parse → validate → preview → SSE stream → UAC',
        nodes: [
          { id: 'input',    label: 'Upload File\nor Job Builder Chat', type: 'start' },
          { id: 'parse',    label: 'Parse Rows\n(SheetJS / NLP)',      type: 'process' },
          { id: 'validate', label: 'Validate Fields',                   type: 'decision' },
          { id: 'errors',   label: 'Show Validation\nErrors',           type: 'process' },
          { id: 'ref',      label: 'Resolve ref_job\n(schedule inherit)', type: 'process' },
          { id: 'preview',  label: 'Generate Preview\n(task + trigger JSON)', type: 'process' },
          { id: 'confirm',  label: 'User Reviews\n& Confirms',          type: 'decision' },
          { id: 'stream',   label: 'SSE Stream\nPOST /api/execution/stream', type: 'process' },
          { id: 'agent',    label: 'Resolve Agent\nCluster',            type: 'process' },
          { id: 'task',     label: 'POST task\nto UAC',                 type: 'process' },
          { id: 'trigger',  label: 'POST trigger\nto UAC',              type: 'process' },
          { id: 'log',      label: 'Write creation_log\n+ audit.log',   type: 'process' },
          { id: 'done',     label: 'Jobs Created\n(triggers disabled)', type: 'end' },
        ],
        edges: [
          { from: 'input',    to: 'parse' },
          { from: 'parse',    to: 'validate' },
          { from: 'validate', to: 'errors',   label: 'Invalid' },
          { from: 'errors',   to: 'input',    label: 'Fix & retry' },
          { from: 'validate', to: 'ref',      label: 'Valid' },
          { from: 'ref',      to: 'preview' },
          { from: 'preview',  to: 'confirm' },
          { from: 'confirm',  to: 'stream',   label: 'Execute' },
          { from: 'stream',   to: 'agent' },
          { from: 'agent',    to: 'task' },
          { from: 'task',     to: 'trigger' },
          { from: 'trigger',  to: 'log' },
          { from: 'log',      to: 'done' },
        ],
      },
      subsections: [
        {
          title: 'Input Methods',
          points: [
            'Excel / ODS / CSV upload: SheetJS parses the file client-side; rows are sent as JSON to POST /api/upload',
            'Job Builder Chat: natural-language description parsed by the NLP engine into structured row fields',
            'Supported file types: .xlsx, .ods, .csv; max 10 MB',
            'Required columns: Job Name, Job Type, Job Workstation, Job Script',
            'Optional columns: Job Login Account, Job Description, ServiceNow Group, Job Starttime, Job Timezone, Scheduled Frequency, Job End Time, Maximum Runtime, Reference Job, Member of Business Services, ServiceNow Ticket, Job Recovery1, Job Recovery2',
          ],
        },
        {
          title: 'ref_job Inheritance',
          points: [
            'If a row has a "Reference Job" value, the backend fetches that job from UAC before creation',
            'Inherited fields: maxRunTime, raw trigger config (time, timeStyle, timeInterval, timeZone, dayStyle, etc.)',
            'Row-level values always override inherited values — ref_job only fills gaps',
            'Resolved refs are sent to the stream endpoint alongside rows in the resolvedRefs map',
          ],
        },
        {
          title: 'SSE Stream Execution',
          points: [
            'Frontend opens fetch() to POST /api/execution/stream with rows + resolvedRefs',
            'Server sends events: start → job_start → step (resolving agent) → step (creating task) → step (creating trigger) → job_done → complete',
            'Each step has status: processing | success | error',
            'Jobs run sequentially; configurable delay between task and trigger creation (CALL_DELAY_MS)',
            'On success: task name + timestamp written to creation_log.json (capped at 2000 entries)',
          ],
        },
        {
          title: 'Schedule Parsing (NLP)',
          points: [
            'Input from "Job Starttime" column: AT 0600 TIMEZONE America/New_York, AT 0001 every 30 minutes UNTIL 2200, everyday Time: midnight EST, etc.',
            'Input from "Scheduled Frequency" column: FREQ=DAILY, FREQ=MONTHLY;byday=24, Monday,Wednesday,Friday, Weekdays, from 1st till 10th each month',
            'Output: UAC trigger fields — timeStyle, time, timeInterval, timeIntervalUnits, enabledStart, enabledEnd, restrictedTimes, dayStyle, simpleDateType, day flags (mon–sun), dateAdjective, dateNouns, dateQualifiers, timeZone',
            'Special words handled: midnight → 00:00, noon / midday → 12:00; timezone abbreviations mapped to IANA names',
            'FREQ= format is the most reliable; use it for complex schedules',
          ],
        },
      ],
    },

    // ── 4. Job Deletion Flow ─────────────────────────────────────────────────
    {
      heading: 'Job Deletion Flow',
      intro: 'Deletion is a multi-step process. Each job is inspected first, then triggers are disabled and deleted, workflow membership is cleaned up, and finally the task is deleted. An optional Excel backup is exported before deletion begins.',
      diagram: {
        type: 'flow',
        description: 'Safe deletion: inspect → optional backup → disable/delete triggers → remove from workflows → delete task',
        nodes: [
          { id: 'input',    label: 'Enter Job Names\n(text or paste)', type: 'start' },
          { id: 'inspect',  label: 'GET /api/deletion/inspect\n(task, triggers, parents, active instances)', type: 'process' },
          { id: 'active',   label: 'Active Instances?', type: 'decision' },
          { id: 'force',    label: 'Force Finish\nActive Instances',   type: 'process' },
          { id: 'backup',   label: 'POST /api/deletion/backup\n(optional — exports Excel + saves to server)', type: 'process' },
          { id: 'confirm',  label: 'Type DELETE\nto confirm',          type: 'decision' },
          { id: 'workflow', label: 'Handle Parent\nWorkflows',         type: 'process' },
          { id: 'triggers', label: 'Disable → Delete\nTriggers',       type: 'process' },
          { id: 'task',     label: 'DELETE task\nfrom UAC',            type: 'process' },
          { id: 'log',      label: 'Write audit.log\n+ recovery_store.json', type: 'process' },
          { id: 'done',     label: 'Deletion Complete', type: 'end' },
        ],
        edges: [
          { from: 'input',    to: 'inspect' },
          { from: 'inspect',  to: 'active' },
          { from: 'active',   to: 'force',    label: 'Yes' },
          { from: 'active',   to: 'backup',   label: 'No' },
          { from: 'force',    to: 'backup' },
          { from: 'backup',   to: 'confirm' },
          { from: 'confirm',  to: 'workflow',  label: 'Confirmed' },
          { from: 'workflow', to: 'triggers' },
          { from: 'triggers', to: 'task' },
          { from: 'task',     to: 'log' },
          { from: 'log',      to: 'done' },
        ],
      },
      subsections: [
        {
          title: 'Inspection (GET /api/deletion/inspect)',
          points: [
            'Fetches full task definition from UAC',
            'Checks parent workflows via GET /resources/task/parent/list',
            'Finds all associated triggers using POST /resources/trigger/list (falls back to name-convention candidates, then listadv)',
            'Checks for running instances via POST /resources/taskinstance/list with status=Running and status=Execution Wait',
            'All findings returned as a step-by-step log shown live in the UI',
          ],
        },
        {
          title: 'Backup (POST /api/deletion/backup)',
          points: [
            'Fetches full task + trigger payloads from UAC for each job',
            'Generates two Excel sheets: "Job_Creation_Template" (ready to re-upload) and "Backup_Summary" (raw reference)',
            'Excel auto-downloads to the user\'s machine',
            'Simultaneously persists backups server-side to recovery_store.json, keyed by UAC base URL',
            'Server-side backups auto-expire after 7 days; accessible from the Job Recovery module at any time',
          ],
        },
        {
          title: 'Workflow Cleanup',
          points: [
            'If all tasks in a workflow are being deleted: disables and deletes all workflow triggers, then deletes the workflow itself',
            'If other tasks remain: removes only the target task vertex from the workflow (DELETE /resources/workflow/vertices)',
            'If the workflow trigger references the target task: task is removed from the trigger\'s task list; trigger deleted if no tasks remain',
          ],
        },
        {
          title: 'Trigger Cleanup',
          points: [
            'If trigger has only one task: disable (POST /resources/trigger/enabledisable) then delete',
            'If trigger has multiple tasks: remove only the target task from the task list, update trigger via PUT, leave it disabled',
            'Zero orphaned triggers are left behind',
          ],
        },
      ],
    },

    // ── 5. Job Recovery Flow ─────────────────────────────────────────────────
    {
      heading: 'Job Recovery Flow',
      intro: 'Deleted jobs can be restored from server-side backups (auto-saved during deletion) or by uploading the Excel backup file that was downloaded at deletion time. Recovery is a standalone automation module — no deletion needed first.',
      diagram: {
        type: 'flow',
        description: 'Recovery: load server backups or upload Excel → queue jobs → run restore with per-row live status',
        nodes: [
          { id: 'source',   label: 'Source:\nServer Backup List\nor Upload Excel', type: 'start' },
          { id: 'load',     label: 'GET /api/deletion/recovery\n(server backups)',  type: 'process' },
          { id: 'upload',   label: 'POST /api/upload\n(parse Excel rows)',          type: 'process' },
          { id: 'match',    label: 'Match row names\nto server backups',            type: 'process' },
          { id: 'queue',    label: 'Queue Jobs\n(pending)',                         type: 'process' },
          { id: 'restore',  label: 'POST /api/deletion/recover\n(task + triggers)', type: 'process' },
          { id: 'status',   label: 'Per-row live status\n(restoring → done/failed)', type: 'process' },
          { id: 'cleanup',  label: 'DELETE /api/deletion/recovery\n(remove from server store)', type: 'process' },
          { id: 'done',     label: 'Jobs Restored\n(triggers in disabled state)',   type: 'end' },
        ],
        edges: [
          { from: 'source',  to: 'load',    label: 'Server list' },
          { from: 'source',  to: 'upload',  label: 'Excel file' },
          { from: 'upload',  to: 'match' },
          { from: 'match',   to: 'queue' },
          { from: 'load',    to: 'queue' },
          { from: 'queue',   to: 'restore' },
          { from: 'restore', to: 'status' },
          { from: 'status',  to: 'cleanup', label: 'On success' },
          { from: 'cleanup', to: 'done' },
        ],
      },
      subsections: [
        {
          title: 'Server Backup List',
          points: [
            'Loaded automatically on connect via GET /api/deletion/recovery',
            'Scoped per UAC environment (base URL) — Test and Production backups never mix',
            'Shows: job name, task type, trigger count, date saved',
            'Queue individual jobs with "+ Queue" or all at once with "Queue All"',
            'Backups auto-expire after 7 days; can be manually cleared with "Clear All"',
          ],
        },
        {
          title: 'Upload Excel Backup',
          points: [
            'Upload the .xlsx file that was downloaded automatically during the deletion backup step',
            'The file is parsed server-side via POST /api/upload',
            'Each row\'s Job Name is matched against the server backup list',
            'Matched jobs are queued; unmatched names are reported (count shown)',
            'Upload supports drag & drop or click-to-select',
          ],
        },
        {
          title: 'Restore Execution (POST /api/deletion/recover)',
          points: [
            'Sends the full task payload and triggers array back to UAC via POST /resources/task and POST /resources/trigger',
            'Read-only fields (sysId, version, nextScheduledTime, avgRunTime, etc.) are stripped before POST to avoid UAC rejection',
            'Jobs run sequentially with a 600 ms gap between each to avoid hammering UAC',
            'On success: entry is automatically removed from recovery_store.json',
            'Restored triggers are created in DISABLED state — enable manually in UAC after verifying',
          ],
        },
        {
          title: 'Live Visual Feedback (per row)',
          points: [
            'Pending — grey dot, job is queued',
            'Restoring — purple spinning ring + purple scanning-line animation across the card',
            'Restored — spring-animated green checkmark, card turns dark green; shows "Task + N trigger(s) recreated"',
            'Failed — spring-animated red X, card turns dark red; shows exact UAC error message inline (no alert() popups)',
            'Overall progress bar fills in real time; summary cards (Restored / Failed / Total) appear after completion',
          ],
        },
      ],
    },

    // ── 6. Ad-hoc Launch ────────────────────────────────────────────────────
    {
      heading: 'Ad-hoc Launch',
      intro: 'Search for any task, workflow, or trigger by name (wildcard supported), then launch it on demand and monitor the resulting instance in real time.',
      subsections: [
        {
          title: 'Search',
          points: [
            'GET /api/adhoc/search?q=<query> — sends wildcard (*query*) to POST /resources/task/list and POST /resources/trigger/list in parallel',
            'Results show kind (task / workflow / trigger), type, and agent/cluster',
            'Exact-name matches sort to the top; results capped at 50',
          ],
        },
        {
          title: 'Launch',
          points: [
            'Tasks and workflows: POST /resources/task/launch',
            'Triggers: POST /resources/trigger/triggernow (with includeTaskInstanceIds=true)',
            'If UAC does not return instance IDs, the backend falls back to fetching the newest instance by task name',
          ],
        },
        {
          title: 'Instance Monitoring',
          points: [
            'Status polled via POST /resources/taskinstance/list or GET /resources/taskinstance?taskinstanceid=<id>',
            'Terminal statuses: Success, Failed, Finished, Cancelled, Skipped, Start Failure, Rejected — polling stops on terminal',
            'Available operations: Cancel, Force Finish, Halt + Force Finish, Rerun, Hold, Release, Skip, Unskip',
            'All operations call POST /resources/taskinstance/<op> and are audit-logged',
          ],
        },
      ],
    },

    // ── 7. Agent Control ────────────────────────────────────────────────────
    {
      heading: 'Agent Control',
      intro: 'Bulk suspend or resume UAC agents and agent clusters, either immediately or at a scheduled future time. Scheduled jobs are persisted to disk and survive backend restarts.',
      subsections: [
        {
          title: 'Immediate Operations',
          points: [
            'Suspend agents: POST /api/agents/suspend — calls UAC agent suspend endpoint for each agent',
            'Resume agents: POST /api/agents/resume',
            'Suspend clusters: POST /api/agents/clusters/suspend',
            'Resume clusters: POST /api/agents/clusters/resume',
            'All operations are bulk — pass an array of agent/cluster names',
          ],
        },
        {
          title: 'Scheduled Operations',
          points: [
            'POST /api/agents/schedule — accepts agents[], action (suspend|resume), scheduledAt (ISO datetime), target (agent|cluster)',
            'Job persisted to schedule_state.json immediately so it survives backend restarts',
            'On startup, overdue jobs are NOT auto-executed (admin may have handled them manually) — they are removed with a warning log',
            'Cancel: DELETE /api/agents/schedule/:jobId — clears in-memory timer and removes from disk',
            'List: GET /api/agents/schedule — shows all pending jobs with inMemory flag',
          ],
        },
      ],
    },

    // ── 8. Schedule Format Reference ────────────────────────────────────────
    {
      heading: 'Schedule Format Reference',
      intro: 'The "Job Starttime" and "Scheduled Frequency" columns together define the trigger. FREQ= format is the most reliable. All times must be 24-hour (HH:MM or HHMM). Timezones must be IANA names.',
      table: {
        columns: ['Pattern', 'Job Starttime', 'Scheduled Frequency', 'Notes'],
        rows: [
          [
            'Daily at fixed time',
            'AT 0600 TIMEZONE America/New_York',
            'Daily',
            'Runs every day at 06:00 Eastern',
          ],
          [
            'Weekdays only',
            'AT 0800 TIMEZONE UTC',
            'Weekdays',
            'Mon–Fri; also accepts "Business Days"',
          ],
          [
            'Specific days',
            'AT 1200 TIMEZONE Asia/Kolkata',
            'Monday,Wednesday,Friday',
            'Comma-separated day names; no spaces',
          ],
          [
            'Monthly on day N',
            'AT 0300 TIMEZONE UTC',
            'FREQ=MONTHLY;INTERVAL=1;byday=15',
            'Runs on the 15th of each month',
          ],
          [
            'Interval all day',
            'AT 0001 every 30 minutes',
            'Daily',
            'Every 30 min starting 00:01; also: "AT 0001 EVERY 0030"',
          ],
          [
            'Interval with window',
            'AT 0600 EVERY 0030 UNTIL 2200 TIMEZONE UTC',
            'Daily',
            'Every 30 min between 06:00 and 22:00',
          ],
          [
            'Interval weekdays only',
            'AT 0700 every 15 minutes UNTIL 1900',
            'Weekdays',
            'Every 15 min from 07:00–19:00 Mon–Fri',
          ],
          [
            'Monthly with interval',
            'AT 0001 every 15 minutes',
            'FREQ=MONTHLY;byday=24',
            'Every 15 min on the 24th of each month',
          ],
          [
            'Monthly day range',
            'AT 0600 TIMEZONE UTC',
            'from 1st till 10th each month',
            'Runs daily during days 1–10 of each month',
          ],
          [
            'FREQ=INTERVAL explicit',
            'AT 0800',
            'FREQ=INTERVAL;interval=30;units=minutes;starttime=08:00;endtime=18:00;byday=Mon,Tue,Wed,Thu,Fri',
            'Most explicit form; byday controls day pattern',
          ],
        ],
      },
    },

    // ── 9. Timezone Reference ────────────────────────────────────────────────
    {
      heading: 'Timezone Reference',
      intro: 'Always use full IANA timezone names in the Job Timezone column. Abbreviations (EST, PST) are parsed by the NLP engine but IANA names are preferred — they handle DST automatically.',
      table: {
        columns: ['Region', 'IANA Name', 'Abbreviation', 'DST'],
        rows: [
          ['US Eastern',      'America/New_York',    'EST / EDT',  'Yes'],
          ['US Central',      'America/Chicago',     'CST / CDT',  'Yes'],
          ['US Mountain',     'America/Denver',      'MST / MDT',  'Yes'],
          ['US Pacific',      'America/Los_Angeles', 'PST / PDT',  'Yes'],
          ['UTC',             'UTC',                 'UTC',        'No'],
          ['India',           'Asia/Kolkata',        'IST',        'No'],
          ['China',           'Asia/Shanghai',       'CST',        'No'],
          ['Japan',           'Asia/Tokyo',          'JST',        'No'],
          ['UK',              'Europe/London',       'GMT / BST',  'Yes'],
          ['Central Europe',  'Europe/Paris',        'CET / CEST', 'Yes'],
          ['Australia East',  'Australia/Sydney',    'AEST / AEDT','Yes'],
        ],
      },
    },

    // ── 10. API Reference ────────────────────────────────────────────────────
    {
      heading: 'API Reference',
      intro: 'All endpoints require an active session (established via POST /api/stonebranch/connect). The session cookie carries the encrypted UAC token and base URL — never re-sent from the client.',
      table: {
        columns: ['Method', 'Endpoint', 'Purpose'],
        rows: [
          ['POST',   '/api/stonebranch/connect',         'Authenticate with UAC; create encrypted server-side session'],
          ['GET',    '/api/stonebranch/tasks',            'Fetch a single task by name from UAC'],
          ['POST',   '/api/stonebranch/tasks',            'Create a task in UAC'],
          ['GET',    '/api/stonebranch/triggers',         'Fetch a single trigger by name from UAC'],
          ['POST',   '/api/stonebranch/triggers',         'Create a trigger in UAC'],
          ['POST',   '/api/upload',                       'Upload .xlsx / .ods / .csv; returns parsed rows as JSON'],
          ['POST',   '/api/execution/stream',             'SSE stream: create tasks + triggers for all rows with live step events'],
          ['POST',   '/api/execution/batch',              'Non-streaming batch create (same logic, single JSON response)'],
          ['POST',   '/api/execution/preview',            'Return task + trigger JSON payloads without sending to UAC'],
          ['GET',    '/api/execution/qualifying-times',   'Fetch next N run times for a trigger from UAC'],
          ['POST',   '/api/execution/verify',             'Fetch created task + trigger from UAC and validate fields'],
          ['GET',    '/api/deletion/inspect',             'Inspect a task: fetch task, triggers, parent workflows, active instances'],
          ['DELETE', '/api/deletion/job',                 'Delete a single task + its triggers (safe sequence)'],
          ['DELETE', '/api/deletion/jobs',                'Bulk delete tasks + triggers'],
          ['POST',   '/api/deletion/force-finish',        'Force finish all active instances of a task'],
          ['POST',   '/api/deletion/backup',              'Fetch full task + trigger payloads; export Excel; persist to server'],
          ['GET',    '/api/deletion/recovery',            'List server-persisted backup entries for current environment'],
          ['DELETE', '/api/deletion/recovery',            'Remove one (taskname in body) or all backup entries for environment'],
          ['POST',   '/api/deletion/recover',             'Recreate task + triggers in UAC from backup payload'],
          ['GET',    '/api/adhoc/search',                 'Wildcard search across tasks, workflows, and triggers'],
          ['POST',   '/api/adhoc/launch',                 'Launch a task, workflow, or trigger ad-hoc'],
          ['POST',   '/api/adhoc/instance/status',        'Poll status of one or more task instances'],
          ['POST',   '/api/adhoc/instance/op',            'Execute instance operation: cancel, forcefinish, halt, rerun, hold, release, skip, unskip'],
          ['GET',    '/api/agents/list',                  'List all agents and agent clusters'],
          ['POST',   '/api/agents/suspend',               'Bulk suspend agents (immediate)'],
          ['POST',   '/api/agents/resume',                'Bulk resume agents (immediate)'],
          ['POST',   '/api/agents/clusters/suspend',      'Bulk suspend agent clusters'],
          ['POST',   '/api/agents/clusters/resume',       'Bulk resume agent clusters'],
          ['POST',   '/api/agents/schedule',              'Schedule a suspend/resume for a future time (persisted)'],
          ['GET',    '/api/agents/schedule',              'List all pending scheduled jobs'],
          ['DELETE', '/api/agents/schedule/:jobId',       'Cancel and remove a scheduled job'],
          ['POST',   '/api/monitoring/start',             'Start the monitoring service with config'],
          ['POST',   '/api/monitoring/stop',              'Stop the monitoring service'],
          ['GET',    '/api/monitoring/status',            'Get current monitoring service status and config'],
          ['POST',   '/api/monitoring/run-now',           'Trigger an immediate monitoring poll'],
          ['POST',   '/api/monitoring/clear-state',       'Clear the deduplication state (forces re-alert on next poll)'],
          ['GET',    '/api/monitoring/alerts',            'Get recent alert history'],
          ['GET',    '/api/search/task',                  'Fetch a task by exact name (for Search & Edit)'],
          ['GET',    '/api/search/trigger',               'Fetch a trigger by exact name'],
          ['PUT',    '/api/search/task',                  'Update task fields in UAC (strips read-only fields automatically)'],
          ['PUT',    '/api/search/trigger',               'Update trigger fields in UAC'],
          ['POST',   '/api/schedule-ai/recommend',        'Get ML-based schedule recommendation from plain text'],
          ['POST',   '/api/schedule-ai/analyze',          'Analyze a schedule string and return parsed UAC fields'],
          ['POST',   '/api/schedule-ai/recommend-batch',  'Batch schedule recommendations for multiple inputs'],
        ],
      },
    },

    // ── 11. Security & Audit ─────────────────────────────────────────────────
    {
      heading: 'Security & Audit',
      intro: 'Authentication uses the user\'s own UAC bearer token. The token is stored only in the server-side encrypted session and never written to disk or sent back to the browser.',
      subsections: [
        {
          title: 'Authentication Flow',
          points: [
            'User pastes UAC bearer token and base URL on the Home page',
            'POST /api/stonebranch/connect sends a test request to UAC to validate the token',
            'On success, token + base URL are stored in express-session (server-side); a session cookie (HTTP-only, Secure) is issued to the browser',
            'All subsequent requests use req.token and req.sbBaseUrl from the session — never re-sent by the client',
            'Session expires after 8 hours; user must reconnect',
          ],
        },
        {
          title: 'File Upload Security',
          points: [
            'MIME type check: only spreadsheet and CSV types accepted',
            'File size limit: 10 MB',
            'Upload path: files written to /backend/uploads/ with a randomised filename',
            'File security utility strips path traversal attempts',
          ],
        },
        {
          title: 'Audit Trail',
          points: [
            'Every mutating action (create, delete, force-finish, launch, suspend, resume, update) is written to audit.log',
            'Each entry: timestamp, requestId, action, resource, details, result (success/failure/pending), sessionId',
            'Audit log is append-only — no modification or deletion via the API',
            'All HTTP requests logged to a separate request log with method, path, status, duration',
          ],
        },
        {
          title: 'Input Handling',
          points: [
            'All request bodies validated with Zod schemas before processing',
            'Task and trigger names passed directly to UAC API as query params — no SQL injection surface',
            'Inline error responses never include stack traces',
            'Read-only UAC fields (sysId, version, avgRunTime, etc.) stripped before any PUT/POST to prevent UAC rejections',
          ],
        },
      ],
    },

    // ── 12. Troubleshooting ──────────────────────────────────────────────────
    {
      heading: 'Troubleshooting',
      intro: 'Common issues and exact resolution steps.',
      table: {
        columns: ['Symptom', 'Likely Cause', 'Fix'],
        rows: [
          [
            'Cannot connect — "Connection failed"',
            'Token expired, wrong base URL, or UAC unreachable',
            'Verify token is valid in UAC; check base URL format: https://host/uc (no trailing slash)',
          ],
          [
            'Job creation fails — "Agent not found"',
            'Agent cluster name in the Excel file does not match UAC exactly',
            'Search for the agent in UAC, copy exact name, update the Job Workstation column',
          ],
          [
            'Trigger created but never fires',
            'All triggers are created in DISABLED state',
            'Go to UAC → Triggers → find the trigger → Enable it manually after testing',
          ],
          [
            'Excel upload returns "No rows found"',
            'Wrong sheet name, header row missing, or wrong column names',
            'Ensure the first sheet has a header row with column names matching the template',
          ],
          [
            'Deletion fails — "Task not found"',
            'Job name has leading/trailing spaces or wrong case',
            'Copy the exact name from UAC; names are case-sensitive',
          ],
          [
            'Deletion fails — "Active instances running"',
            'Job is currently executing',
            'Use "Force Finish" prompt in the deletion UI, or wait for the instance to complete',
          ],
          [
            'Recovery shows "0 jobs" in server backup list',
            'Backup was not enabled during deletion, or backups expired (7 days)',
            'Use the Excel backup file downloaded at deletion time — upload it in the Job Recovery module',
          ],
          [
            'Recovered job appears in UAC but trigger is missing',
            'Trigger POST failed during recover (UAC rejected duplicate name or invalid fields)',
            'Check the inline error on the recovery card; recreate the trigger manually in UAC or re-upload after editing the backup Excel',
          ],
          [
            '"Session expired" error',
            'Session cookie has expired (8-hour lifetime)',
            'Return to Home page and reconnect with a fresh UAC token',
          ],
          [
            'Monitoring does not send Teams alerts',
            'Teams webhook URL not configured, or monitoring not started',
            'Go to Monitoring module → enter webhook URL → click Start Monitoring',
          ],
          [
            'Scheduled agent action did not run',
            'Backend restarted after the job was scheduled — overdue jobs are skipped on restart',
            'Re-schedule the action; overdue jobs are intentionally not auto-executed to prevent unintended server impacts',
          ],
        ],
      },
    },

    // ── 13. Best Practices ───────────────────────────────────────────────────
    {
      heading: 'Best Practices',
      subsections: [
        {
          title: 'Job Naming',
          points: [
            'Use a consistent prefix scheme so jobs are easy to search (e.g. PMFG-BU-<Region>-<App>-<Code>)',
            'Avoid spaces — use hyphens or underscores',
            'Include the environment identifier (DEV / QA / PROD) in test job names',
          ],
        },
        {
          title: 'Schedules',
          points: [
            'Use IANA timezone names (America/New_York), not abbreviations (EST)',
            'Use 24-hour time format throughout — 00:00, 06:30, 23:45',
            'For interval jobs with a time window, always fill in the Job End Time column',
            'FREQ= format is the most explicit and least likely to be mis-parsed',
            'Test complex schedules with Preview → qualifying-times before bulk upload',
          ],
        },
        {
          title: 'Bulk Operations',
          points: [
            'Use Preview before Execute — review the generated task + trigger JSON for every row',
            'Start with a small batch (5–10 jobs) on a new template before uploading 100+',
            'Monitor the SSE progress stream; do not close the tab during execution',
            'Enable "Backup Before Delete" whenever deleting — it costs nothing and saves server-side',
          ],
        },
        {
          title: 'Backup & Recovery',
          points: [
            'Save the Excel backup file in a team SharePoint or shared drive (not just Downloads)',
            'Server-side backups expire after 7 days — download the Excel file as a long-term record',
            'Test recovery in a non-production environment before restoring to Production',
            'Restored triggers are DISABLED — verify schedule and agent before enabling',
          ],
        },
      ],
    },
  ],
};
