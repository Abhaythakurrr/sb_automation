# SB Automation — System Documentation

## Job Creation & Job Deletion Features

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Architecture](#architecture)
3. [Authentication & Session Management](#authentication--session-management)
4. [Job Creation Feature](#job-creation-feature)
   - [End-to-End Flow](#job-creation-end-to-end-flow)
   - [Step 1: Input Methods](#step-1-input-methods)
   - [Step 2: File Parsing & Column Normalization](#step-2-file-parsing--column-normalization)
   - [Step 3: Reference Job Resolution](#step-3-reference-job-resolution)
   - [Step 4: Agent Resolution](#step-4-agent-resolution)
   - [Step 5: Payload Construction](#step-5-payload-construction)
   - [Step 6: Execution (SSE Stream)](#step-6-execution-sse-stream)
   - [Step 7: Post-Creation Verification](#step-7-post-creation-verification)
   - [Step 8: Trigger Enablement](#step-8-trigger-enablement)
   - [Step 9: Proof Document & Job Doc Push](#step-9-proof-document--job-doc-push)
5. [Job Deletion Feature](#job-deletion-feature)
   - [End-to-End Flow](#job-deletion-end-to-end-flow)
   - [Step 1: Input & Load](#step-1-input--load)
   - [Step 2: Backup](#step-2-backup)
   - [Step 3: Inspection](#step-3-inspection)
   - [Step 4: Force Finish (if needed)](#step-4-force-finish-if-needed)
   - [Step 5: Deletion](#step-5-deletion)
   - [Step 6: Recovery](#step-6-recovery)
6. [API Reference](#api-reference)
7. [Data Flow Diagrams](#data-flow-diagrams)
8. [File Structure](#file-structure)
9. [Configuration & Environment](#configuration--environment)
10. [Safety Mechanisms](#safety-mechanisms)

---

## System Overview

**SB Automation** is a full-stack web application that automates Stonebranch UAC (Universal Automation Center) job management operations. It provides:

- **Bulk Job Creation** — Parse Excel/CSV files or paste job documentation, build compliant API payloads, and create tasks + triggers in UAC via real-time SSE streaming.
- **Safe Job Deletion** — Inspect dependencies, backup job configurations, disable/remove triggers, force-finish active instances, and delete tasks with full audit trail and recovery capability.

**Tech Stack:**
- **Frontend:** Next.js (App Router), React, TypeScript, Zustand, Framer Motion, Tailwind CSS
- **Backend:** Express.js, TypeScript, Axios, Multer, XLSX
- **Integration:** Stonebranch UAC REST API, Microsoft Power Automate

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                          FRONTEND (Next.js)                          │
│                                                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────────────┐ │
│  │ PipelinePage │  │ JobDeletion  │  │ useConnectionStore        │ │
│  │ (Job Create) │  │    Page      │  │ (Global Session + API)    │ │
│  └──────┬───────┘  └──────┬───────┘  └─────────────┬─────────────┘ │
│         │                  │                        │               │
│         └──────────┬───────┘                        │               │
│                    ▼                                ▼               │
│            ┌──────────────┐              ┌─────────────────┐       │
│            │  ApiClient   │──────────────│  X-Session-ID   │       │
│            │ (services/)  │              │  (HTTP Header)  │       │
│            └──────┬───────┘              └─────────────────┘       │
└───────────────────┼─────────────────────────────────────────────────┘
                    │  HTTP / SSE
                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         BACKEND (Express)                            │
│                                                                     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌───────────┐ │
│  │ stoneBranch  │  │  execution  │  │ jobDeletion │  │ fileUpload│ │
│  │   Router    │  │   Router    │  │   Router    │  │   Router  │ │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └─────┬─────┘ │
│         │                │                 │               │       │
│         ▼                ▼                 ▼               ▼       │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    SERVICES / UTILS                          │   │
│  │  • StoneBranchService (UAC API client)                      │   │
│  │  • FileParserService (Excel/CSV parser)                     │   │
│  │  • payloadMapper (task + trigger builder)                   │   │
│  │  • scheduleParser (schedule string → UAC fields)            │   │
│  │  • triggerSchedule (frequency → UAC trigger fields)         │   │
│  │  • agentResolver (smart agent/cluster matching)             │   │
│  │  • executionQueue (concurrency + rate limiting)             │   │
│  └──────────────────────────┬──────────────────────────────────┘   │
└─────────────────────────────┼───────────────────────────────────────┘
                              │  HTTPS (Bearer Token)
                              ▼
              ┌──────────────────────────────┐
              │   Stonebranch UAC REST API   │
              │   /resources/task            │
              │   /resources/trigger         │
              │   /resources/agent           │
              │   /resources/taskinstance    │
              └──────────────────────────────┘
```

---

## Authentication & Session Management

### How It Works

1. **User connects** from the frontend landing page by entering:
   - UAC Bearer Token
   - UAC Base URL (e.g., `https://uac-prod.company.com/uc`)
   - Username (optional, display only)

2. **Backend validates** the token by calling `POST /resources/trigger/list` on UAC.

3. **Backend creates a session** — returns a `sessionId` to the frontend. The token is stored server-side ONLY and never sent back.

4. **All subsequent requests** use the `X-Session-ID` header. The backend resolves token + baseUrl from the session map.

5. **Sessions expire** after 8 hours. Frontend polls every 60 seconds and auto-disconnects on expiry.

### Key Files
| File | Role |
|------|------|
| `backend/src/middleware/session.ts` | Session creation, lookup, expiry |
| `backend/src/routes/stoneBranch.ts` | `/connect` and `/disconnect` endpoints |
| `frontend/src/store/useConnectionStore.ts` | Zustand store, global API singleton |
| `frontend/src/services/api.ts` | `ApiClient` class with interceptors |

---

## Job Creation Feature

### Job Creation End-to-End Flow

```
┌─────────────┐    ┌──────────────┐    ┌───────────────┐    ┌──────────────┐
│  User Input │───▶│  File Parse  │───▶│  Ref Job      │───▶│  Agent       │
│  (Excel or  │    │  & Column    │    │  Resolution   │    │  Resolution  │
│  Job Doc)   │    │  Normalization│    │  (optional)   │    │  (at exec)   │
└─────────────┘    └──────────────┘    └───────────────┘    └──────┬───────┘
                                                                    │
       ┌────────────────────────────────────────────────────────────┘
       ▼
┌──────────────┐    ┌──────────────┐    ┌───────────────┐    ┌──────────────┐
│  Payload     │───▶│  SSE Stream  │───▶│  Verification │───▶│  Enable      │
│  Build       │    │  Execution   │    │  (from UAC)   │    │  Triggers    │
│  (task+trig) │    │  (live UI)   │    │               │    │              │
└──────────────┘    └──────────────┘    └───────────────┘    └──────┬───────┘
                                                                    │
                                                                    ▼
                                                          ┌──────────────────┐
                                                          │  Proof Doc +     │
                                                          │  Job Doc Push    │
                                                          └──────────────────┘
```

---

### Step 1: Input Methods

There are **two ways** to provide job data:

#### A) Excel/CSV File Upload
- User uploads `.xlsx`, `.csv`, or `.ods` file via the drop zone on `PipelinePage`.
- File is sent to `POST /api/upload` → `fileUploadRouter`.
- Backend saves temporarily, parses with `FileParserService`, then immediately deletes the file.

#### B) Job Builder Chat (Paste Job Doc)
- User pastes structured job documentation text (key=value format) into the `JobBuilderChat` component.
- The frontend `parseJobDoc()` utility extracts fields from text.
- User selects the task type (Unix, Windows, SQL, etc.) from UI buttons.
- Multiple jobs can be queued before proceeding.
- On "Generate & Proceed" — downloads an Excel and loads rows into the pipeline.

**Supported Job Doc Format:**
```
Job Name = PMFG-BU-AS1-MFG-377-MYJOB
Job Description = APAC - My production job
Job Workstation = A0021377P3_DD_94
Job Script = /usr/bin/bash -c 'unset TERM && sh /path/script.sh'
Job Login Account = mfgeb
Firstrun Date = 2026-04-27
Job Starttime = AT 0330 TIMEZONE Asia/Kolkata MAXDUR 0100
Maximum Runtime = 0060
ServiceNow Ticket = SCTASK0862800
Business Services = BJA-QAD, BJA-QAD - AP
ServiceNow Group = L2-MFG-SUPPORT
Job Recovery1 = Rerun Job Manually
Job Recovery2 = Escalate to L3
```

---

### Step 2: File Parsing & Column Normalization

**Backend File:** `backend/src/services/fileParserService.ts`

The parser accepts user-friendly column names (as seen in the Stonebranch UI) and normalizes them to internal field names.

| User-Friendly Column | Internal Field |
|---------------------|---------------|
| Job Name / Task Name | `task_name` |
| Job Type / Task Type | `task_type` |
| Job Workstation / Agent / Agent Cluster | `agent` |
| Job Script / Command / Script | `command` |
| Job Login Account / Credential | `credential` |
| Job Description | `description` |
| Active / Enabled | `enabled` |
| Firstrun Date / First Run Date | `first_run_date` |
| Job Starttime / Schedule String | `schedule_string` |
| Start Time | `start_time` |
| Timezone / Time Zone | `timezone` |
| Scheduled Frequency | `frequency_type` |
| Maximum Runtime / Max Runtime | `max_runtime` |
| Reference Job / Ref Job | `ref_job` |
| Member of Business Services | `business_services` |
| ServiceNow Ticket | `servicenow_ticket` |
| ServiceNow Group / Queues | `servicenow_group` |
| Job Recovery1 | `recovery1` |
| Job Recovery2 | `recovery2` |
| Job End Time | `end_time` |
| Elevate User / Run As Administrator | `elevateUser` |

**Both formats work simultaneously** — users can use either UI labels or API field names.

---

### Step 3: Reference Job Resolution

**When:** A row has a `ref_job` field (e.g., `ref_job = EXISTING-PROD-JOB`)

**Purpose:** Inherit the schedule configuration from an existing job's trigger in UAC, so the new job runs on the same schedule.

**Backend Endpoint:** `GET /api/stonebranch/trigger/resolve?refJob=TASKNAME`

**What happens:**
1. `POST /resources/trigger/list { tasks: "TASKNAME" }` — find all triggers for the ref job
2. Filter for `type = "Time"` trigger (time-based trigger)
3. `GET /resources/trigger?triggername=FOUND_TRIGGER` — fetch full trigger details
4. `GET /resources/task?taskname=TASKNAME` — fetch task for `lfDuration` → derive `maxRunTime`
5. Parse the trigger's schedule fields into a normalized `ParsedSchedule`
6. Return: `{ triggerName, schedule, maxRunTime, maxRunTimeDisplay, rawTrigger }`

**Frontend then:**
- Shows a "Merge Comparison" table — input values vs. inherited values
- Any field empty in the input but present in the ref trigger is inherited
- Schedule fields from the raw trigger are copied verbatim to the new trigger payload

---

### Step 4: Agent Resolution

**Backend File:** `backend/src/utils/agentResolver.ts`

**When:** At execution time, for each row's `agent` field.

**Matching Strategy (priority order):**
1. **Exact agent name** → use as `agent` field
2. **Exact cluster name** → use as `agentCluster` field
3. **Prefix match on cluster** (shortest match wins) → `agentCluster`
4. **Contains match on cluster** (shortest match wins) → `agentCluster`
5. **Prefix match on agent** → `agent`
6. **Fallback** → send as-is as `agentCluster` (log warning)

**Caching:** Agent and cluster lists are cached per UAC base URL to avoid repeated API calls within a batch.

---

### Step 5: Payload Construction

**Backend File:** `backend/src/utils/payloadMapper.ts`

#### Task Payload (`buildTaskPayload`)

Builds a UAC-compliant task object:

```typescript
{
  type: "taskUnix",              // from task_type column
  name: "PMFG-BU-AS1-MFG-377",  // from task_name
  agentCluster: "RESOLVED_CLUSTER", // from agent resolution
  command: "/usr/bin/bash ...",   // from command column
  credentials: "mfgeb",         // from credential column
  summary: "Job description",   // from description column
  resolveNameImmediately: true,
  startHeld: false,
  runAsSudo: true,               // for taskUnix
  commandOrScript: "Command",    // for script-type tasks
  exitCodes: "0",
  exitCodeProcessing: "Success Exitcode Range",
  maxRunTime: 60,                // from max_runtime or ref_job
  lfEnabled: true,               // Late Finish enabled
  lfType: "Duration",
  lfDuration: "00:01:00:00",     // derived from maxRunTime
  opswiseGroups: ["BJA-QAD"],    // business services
  customField1: { label: "Agent Cluster Name", value: "..." },
  customField2: { label: "ServiceNow Ticket", value: "SCTASK..." },
  notes: [{ title: "SCTASK...", text: "Full job doc text..." }],
}
```

#### Trigger Payload (`buildTriggerPayload`)

Builds a UAC time trigger:

```typescript
{
  type: "triggerTime",
  name: "PMFG-BU-AS1-MFG-377-TR001",  // taskName + "-TR001"
  tasks: ["PMFG-BU-AS1-MFG-377"],
  enabled: false,                       // ALWAYS created disabled
  dayStyle: "Simple",
  simpleDateType: "Daily",
  timeStyle: "Absolute",
  time: "03:30",
  timeZone: "Asia/Kolkata",
  calendar: "System Default",
  situation: "Holiday",
  action: "Do Not Trigger",
  skipCondition: "Active By Trigger",
  intervalStartingDate: "2026-04-27",   // first_run_date
  skipRestriction: "Before",
  skipBeforeDate: "2026-04-27",
  retentionDuration: 1,
  retentionDurationUnit: "Days",
  notes: [{ title: "...", text: "..." }],
}
```

#### Schedule Parsing (`triggerSchedule.ts`)

Converts various input formats into UAC trigger fields:

| Input Format | Result |
|-------------|--------|
| `AT 0330 TIMEZONE Asia/Kolkata` | `timeStyle: "Absolute", time: "03:30", timeZone: "Asia/Kolkata"` |
| `AT 0100 EVERY 0030 UNTIL 2200` | `timeStyle: "Interval", timeInterval: 30, timeIntervalUnits: "Minutes", enabledStart: "01:00", enabledEnd: "22:00"` |
| `FREQ=MONTHLY;INTERVAL=1;byday=24th` | `dayStyle: "Complex", dateNouns: [{value: "Month Day 24"}]` |
| `Weekdays` or `Mon-Fri` | `dayStyle: "Simple", mon-fri: true` |
| `Every 15 minutes` | `timeStyle: "Interval", timeInterval: 15, timeIntervalUnits: "Minutes"` |
| `Monthly 2nd Sunday` | `dayStyle: "Complex", dateAdjective: "2nd", dateNouns: [{value: "Sunday"}]` |

#### Field Filtering

Before sending to UAC, payloads are filtered against whitelists (`ALLOWED_TASK_FIELDS`, `ALLOWED_TRIGGER_FIELDS`) and read-only fields are stripped. Unknown fields are logged as warnings.

---

### Step 6: Execution (SSE Stream)

**Backend Endpoint:** `POST /api/execution/stream`

**Protocol:** Server-Sent Events (SSE) — the frontend opens a streaming fetch connection.

**For each job in the batch:**
1. **`event: job_start`** — signals processing has begun
2. **`event: step` (Resolving agent)** — calls `resolveAgentField()`
3. **`event: step` (Creating task)** — `POST /resources/task` to UAC
4. **`event: step` (Creating trigger)** — `POST /resources/trigger` to UAC
5. **`event: job_done`** — signals job complete

**After all jobs:**
- **`event: complete`** — `{ total, successful, failed }`

**Rate Limiting:**
- `CALL_DELAY_MS = 300ms` between API calls
- `MAX_JOBS = 100` per batch
- Sequential processing (one job at a time to avoid UAC overload)

**Error Handling:**
- If task creation fails → trigger is skipped (logged as failed)
- If trigger creation fails → task still exists (partial success)
- Frontend can abort at any time (AbortController)

---

### Step 7: Post-Creation Verification

**Backend Endpoint:** `POST /api/execution/verify`

**Triggered automatically** after each trigger is successfully created.

**What it does:**
1. `GET /resources/task?taskname=X` — verify task exists in UAC
2. `GET /resources/trigger?triggername=X-TR001` — verify trigger exists
3. Checks: task name, command, agent/cluster, max runtime, time style, time, timezone, day style, enabled status
4. If trigger is enabled, fetches qualifying times (next 10 run dates)

**Frontend displays:** A verification panel with pass/warn/fail indicators for each check.

---

### Step 8: Trigger Enablement

**Backend Endpoint:** `POST /api/stonebranch/triggers/enable`

Triggers are ALWAYS created disabled. After verification:
1. User clicks "Enable All Triggers"
2. Backend calls `POST /resources/trigger/enabledisable` for each trigger with `{ name, enable: true }`
3. Results are displayed (enabled count vs. failed count)

**Why disabled by default:** Prevents jobs from firing before the operator verifies the configuration in UAC.

---

### Step 9: Proof Document & Job Doc Push

#### Proof Document Download
After execution + verification, user downloads an Excel containing:
- **Summary sheet:** Job name, trigger name, command, checks passed, status
- **Checks sheet:** Per-job field verification details
- **Qualifying Times sheet:** Next 10 scheduled run dates per trigger

#### Job Doc Push (Power Automate)
- Backend endpoint: `POST /api/jobdoc/push`
- Sends structured rows to a Power Automate flow URL
- Power Automate inserts them into a shared Excel/SharePoint sheet
- Format: `ID, JOB_ID, INSTRUCTION, TICKET, SCRIPT, JOB_WORKSTATION, JOB_NAME, STREAMLOGON, DESCRIPTION, TASKTYPE, QUEUE`
- 300ms delay between rows to avoid throttling

---

## Job Deletion Feature

### Job Deletion End-to-End Flow

```
┌─────────────┐    ┌──────────────┐    ┌───────────────┐    ┌──────────────┐
│  Input Task │───▶│   Backup     │───▶│   Inspect     │───▶│  Force       │
│  Names      │    │   (optional) │    │   Dependencies│    │  Finish?     │
└─────────────┘    └──────────────┘    └───────────────┘    └──────┬───────┘
                                                                    │
                                                                    ▼
                                              ┌──────────────────────────────┐
                                              │         DELETION             │
                                              │  1. Check parent workflows   │
                                              │  2. Find all triggers        │
                                              │  3. Disable enabled triggers │
                                              │  4. Delete/update triggers   │
                                              │  5. Delete task              │
                                              └──────────────┬───────────────┘
                                                             │
                                                             ▼
                                              ┌──────────────────────────────┐
                                              │    Recovery Center            │
                                              │  (restore from backup)       │
                                              └──────────────────────────────┘
```

---

### Step 1: Input & Load

**Frontend:** `JobDeletionPage.tsx`

- User enters task names (one per line or comma-separated)
- Clicks "Load Jobs" → creates job cards in `idle` phase
- Each job tracks its phase: `idle → inspecting → inspected → prompt_force_finish → force_finishing → ready_to_delete → deleting → done`

---

### Step 2: Backup

**Backend Endpoint:** `POST /api/deletion/backup`

**When:** Before deletion begins (if "Backup Before Delete" toggle is enabled — on by default).

**What it does for each task:**
1. `GET /resources/task?taskname=X` — fetches full task definition
2. `POST /resources/trigger/list { tasks: X }` — finds all triggers
3. For each trigger: `GET /resources/trigger?triggername=Y` — fetches full trigger definition
4. Converts task+trigger data into a **Job Creation Template format** (same Excel format used for uploading)
5. Extracts recovery1/recovery2/ServiceNow Group from task notes

**Output:** Auto-downloads an Excel with two sheets:
- **Job_Creation_Template** — can be directly re-uploaded to recreate jobs
- **Backup_Summary** — raw reference data (name, type, agent, command, triggers, status)

---

### Step 3: Inspection

**Backend Endpoint:** `GET /api/deletion/inspect?taskname=X`

**Checks performed (sequential with live UI updates):**

| Step | What | API Call |
|------|------|----------|
| 1 | Fetch task definition | `GET /resources/task?taskname=X` |
| 2 | Check parent workflows | `GET /resources/task/listadv?workflowname=X` |
| 3 | Find associated triggers | Strategy: direct name lookup → listadv scan |
| 4 | Check active instances | `POST /resources/taskinstance/list { name, status: "Running" }` |
| 5 | Check execution wait instances | `POST /resources/taskinstance/list { name, status: "Execution Wait" }` |

**Trigger Discovery Strategy:**
1. Try common naming conventions directly: `TASKNAME_TR001`, `TASKNAME_TR002`, `TASKNAME_TM_TR001`, `TASKNAME-TR001`
2. If none found: `GET /resources/trigger/listadv?taskname=X` (slower, 5s timeout)

**Results returned:**
```typescript
{
  task: { ... },           // full task data
  triggers: [...],         // all found triggers
  parents: [...],          // parent workflows
  activeInstances: [...],  // running + execution wait instances
  hasActiveInstances: bool,
  steps: [...]             // live step-by-step status for UI
}
```

---

### Step 4: Force Finish (if needed)

**Backend Endpoint:** `POST /api/deletion/force-finish`

**When:** Inspection reveals active instances (Running, Execution Wait, Queued, In Doubt, Held).

**Frontend behavior:**
- Shows orange warning card: "N active instance(s) — force finish before deleting?"
- User chooses "Force Finish" or "Skip"
- If skipped → job marked as failed/skipped

**What it does:**
1. Fetches instances in all blockable states: Running, Execution Wait, Queued, In Doubt, Held
2. For each: `POST /resources/taskinstance/ops-force-finish { taskInstanceName, taskInstanceId }`
3. Reports success/failure per instance

---

### Step 5: Deletion

**Backend Function:** `performDeletion(client, taskname)`

**Deletion sequence (order matters):**

1. **Check parent workflows** — if task is in workflows, logs a warning (doesn't block deletion)
2. **Find all triggers** — same strategy as inspection
3. **For each trigger:**
   - If enabled → `POST /resources/trigger/enabledisable [{ name, enable: false }]` (disable first)
   - If trigger has only this task → `DELETE /resources/trigger?triggername=X` (delete entire trigger)
   - If trigger has multiple tasks → `PUT /resources/trigger` with this task removed from the tasks array
4. **Delete the task** → `DELETE /resources/task?taskname=X`

**Audit logging:** Every deletion (success or failure) is logged via `auditLog()`.

**Endpoints:**
- `DELETE /api/deletion/job` — single task deletion
- `DELETE /api/deletion/jobs` — bulk deletion (processes sequentially)

---

### Step 6: Recovery

**Backend Endpoint:** `POST /api/deletion/recover`

**When:** User wants to restore a previously deleted job from backup.

**What it does:**
1. Strips read-only fields from the backed-up task/trigger objects (`sysId`, `version`, etc.)
2. `POST /resources/task` — recreates the task with its original configuration
3. For each trigger: `POST /resources/trigger` — recreates triggers

**Frontend provides two recovery paths:**
- **Individual "Recover" button** per backed-up job in the Recovery Center
- **Upload to Restore** — upload the backup Excel file, match rows to backup data, and recover each

---

## API Reference

### Connection
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/stonebranch/connect` | Validate token, create session |
| POST | `/api/stonebranch/disconnect` | Destroy session |

### File Upload
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/upload` | Upload Excel/CSV, parse and return rows |

### Job Creation / Execution
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/execution/batch` | Execute batch (non-streaming) |
| POST | `/api/execution/stream` | Execute via SSE stream (real-time) |
| POST | `/api/execution/preview` | Preview exact UAC payloads |
| POST | `/api/execution/verify` | Verify created task+trigger in UAC |
| GET | `/api/execution/qualifying-times` | Fetch next run dates for a trigger |

### Stonebranch Proxy
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/stonebranch/task` | Fetch task by name |
| POST | `/api/stonebranch/task` | Create task |
| GET | `/api/stonebranch/trigger/resolve` | Resolve ref_job trigger schedule |
| POST | `/api/stonebranch/trigger` | Create trigger |
| POST | `/api/stonebranch/triggers/enable` | Bulk enable triggers |

### Job Deletion
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/deletion/inspect` | Inspect task dependencies |
| POST | `/api/deletion/force-finish` | Force finish active instances |
| DELETE | `/api/deletion/job` | Delete single job (trigger cleanup + task) |
| DELETE | `/api/deletion/jobs` | Bulk delete jobs |
| POST | `/api/deletion/backup` | Backup job configs before deletion |
| POST | `/api/deletion/recover` | Recreate job from backup |

### Job Documentation
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/jobdoc/push` | Push rows to Power Automate shared Excel |

---

## Data Flow Diagrams

### Job Creation — Detailed Data Transform

```
Excel Row (user input):
┌──────────────────────────────────────────────────────────────────┐
│ Job Name: PMFG-BU-AS1-MFG-377                                   │
│ Job Workstation: A0021377P3_DD                                   │
│ Job Script: /usr/bin/bash -c 'sh /opt/script.sh'                 │
│ Schedule: AT 0330 TIMEZONE Asia/Kolkata                          │
│ Ref Job: EXISTING-PROD-JOB                                      │
└──────────────────────────────────────────────────────────────────┘
           │
           ▼  FileParserService.parseFile() → normaliseRow()
┌──────────────────────────────────────────────────────────────────┐
│ { task_name: "PMFG-BU-AS1-MFG-377",                             │
│   agent: "A0021377P3_DD",                                        │
│   command: "/usr/bin/bash -c 'sh /opt/script.sh'",               │
│   schedule_string: "AT 0330 TIMEZONE Asia/Kolkata",              │
│   ref_job: "EXISTING-PROD-JOB" }                                 │
└──────────────────────────────────────────────────────────────────┘
           │
           ▼  resolveRefJob() → inherits schedule from ref trigger
┌──────────────────────────────────────────────────────────────────┐
│ resolvedRefs["EXISTING-PROD-JOB"] = {                            │
│   maxRunTime: 60,                                                │
│   rawTrigger: { dayStyle: "Complex", dateNouns: [...], ... }     │
│ }                                                                │
└──────────────────────────────────────────────────────────────────┘
           │
           ▼  resolveAgent() → smart matching
┌──────────────────────────────────────────────────────────────────┐
│ agentResolved = { field: "agentCluster",                         │
│                   value: "A0021377P3_DD_CLUSTER" }               │
└──────────────────────────────────────────────────────────────────┘
           │
           ▼  buildTaskPayload() + buildTriggerPayload()
┌──────────────────────────────────────────────────────────────────┐
│ TASK:    { type, name, agentCluster, command, credentials,       │
│            maxRunTime, lfEnabled, notes, opswiseGroups, ... }    │
│ TRIGGER: { type, name, tasks, enabled:false, dayStyle, time,    │
│            timeZone, dateNouns, skipBeforeDate, notes, ... }     │
└──────────────────────────────────────────────────────────────────┘
           │
           ▼  POST /resources/task → POST /resources/trigger (UAC)
           ✓ Created
```

### Job Deletion — Decision Tree

```
                    ┌─────────────────────┐
                    │   Load Task Names   │
                    └─────────┬───────────┘
                              │
                    ┌─────────▼───────────┐
                    │  Backup (optional)   │
                    │  Downloads Excel     │
                    └─────────┬───────────┘
                              │
                    ┌─────────▼───────────┐
                    │    INSPECT TASK      │
                    └─────────┬───────────┘
                              │
                ┌─────────────┼─────────────┐
                ▼             ▼             ▼
         ┌───────────┐ ┌──────────┐ ┌───────────────┐
         │Task Not   │ │ Active   │ │ No Active     │
         │Found      │ │Instances │ │ Instances     │
         └─────┬─────┘ └────┬─────┘ └───────┬───────┘
               │             │               │
               ▼             ▼               │
          ┌────────┐   ┌──────────┐          │
          │ FAILED │   │ PROMPT:  │          │
          └────────┘   │Force     │          │
                       │Finish?   │          │
                       └────┬─────┘          │
                      ┌─────┼─────┐          │
                      ▼           ▼          │
                ┌──────────┐ ┌────────┐      │
                │  Force   │ │  Skip  │      │
                │  Finish  │ │→FAILED │      │
                └────┬─────┘ └────────┘      │
                     │                       │
                     └───────────┬───────────┘
                                 ▼
                    ┌─────────────────────────┐
                    │      DELETION           │
                    │  1. Disable triggers    │
                    │  2. Delete/update trigs │
                    │  3. Delete task         │
                    └─────────────┬───────────┘
                                  │
                          ┌───────┼───────┐
                          ▼               ▼
                    ┌──────────┐    ┌──────────┐
                    │ SUCCESS  │    │  FAILED  │
                    └──────────┘    └──────────┘
```

---

## File Structure

```
sb_automation/
├── backend/
│   ├── src/
│   │   ├── index.ts                    # Express app setup, route mounting
│   │   ├── routes/
│   │   │   ├── stoneBranch.ts          # Session mgmt, UAC API proxy
│   │   │   ├── execution.ts           # Batch, Stream, Preview, Verify, Qualifying Times
│   │   │   ├── fileUpload.ts          # Multer file upload + parse
│   │   │   ├── jobDeletion.ts         # Inspect, Force Finish, Delete, Backup, Recover
│   │   │   └── jobDoc.ts             # Power Automate push
│   │   ├── services/
│   │   │   ├── stoneBranchService.ts   # UAC REST API client (Axios)
│   │   │   ├── fileParserService.ts    # Excel/CSV/ODS parser + column normalization
│   │   │   └── monitoringService.ts    # Agent/job monitoring (separate feature)
│   │   ├── middleware/
│   │   │   ├── session.ts             # Session store, creation, lookup, expiry
│   │   │   ├── auditLogger.ts        # Audit trail for all operations
│   │   │   ├── errorHandler.ts       # Global error handling
│   │   │   └── requestLogger.ts      # HTTP request logging
│   │   └── utils/
│   │       ├── payloadMapper.ts       # Task + Trigger payload builders
│   │       ├── scheduleParser.ts      # Schedule string → ParsedSchedule
│   │       ├── triggerSchedule.ts     # Frequency/starttime → UAC trigger fields
│   │       ├── agentResolver.ts       # Smart agent/cluster matching
│   │       ├── executionQueue.ts      # Concurrency control + rate limiting
│   │       └── jobPersistence.ts      # Encrypted scheduled job storage
│   ├── package.json
│   └── tsconfig.json
│
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── job-creation/page.tsx   # Route → opens "Job Creation" tab
│   │   │   ├── job-deletion/page.tsx   # Route → opens "Job Deletion" tab
│   │   │   ├── layout.tsx            # Root layout
│   │   │   └── page.tsx              # Landing page
│   │   ├── components/
│   │   │   ├── PipelinePage.tsx       # Main job creation orchestrator
│   │   │   ├── JobBuilderChat.tsx     # Paste job doc → parsed rows
│   │   │   ├── JobDeletionPage.tsx    # Full deletion workflow UI
│   │   │   ├── ExecutionDashboard.tsx # Stream display + verification
│   │   │   ├── PipelineComponents.tsx # DropZone, ParsedTable, JsonPanel, MergeTable
│   │   │   ├── GlobalHeader.tsx       # Connection status bar
│   │   │   └── WorkspaceLayout.tsx    # Tab-based workspace container
│   │   ├── services/
│   │   │   └── api.ts                # ApiClient (HTTP + SSE)
│   │   ├── store/
│   │   │   ├── useConnectionStore.ts  # Global session state (Zustand)
│   │   │   └── useWorkspaceStore.ts   # Tab/workspace state
│   │   └── utils/
│   │       ├── jobDocParser.ts        # Parse pasted job doc text
│   │       └── taskTypeConfig.ts      # Task type definitions (Unix, Windows, SQL, etc.)
│   ├── package.json
│   └── next.config.js
│
├── ansible/                           # Deployment automation
├── deploy.sh                          # Deploy script
└── ecosystem.config.js                # PM2 process config
```

---

## Configuration & Environment

### Backend Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Backend server port | `3001` |
| `BASE_URL` | UAC base URL (fallback) | — |
| `AUTH_TOKEN` | UAC auth token (fallback) | — |
| `UPLOAD_DIR` | Temporary file upload directory | `./uploads` |
| `MAX_FILE_SIZE` | Max upload size in bytes | `10485760` (10MB) |
| `ENCRYPTION_KEY` | AES-256 key for token-at-rest encryption | `sb-automation-default-key-32chr!` |

### Frontend Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NEXT_PUBLIC_API_BASE_URL` | Backend URL | `http://localhost:3001` |

### Execution Constraints

| Constant | Value | Purpose |
|----------|-------|---------|
| `MAX_JOBS` | 100 | Maximum jobs per batch |
| `MAX_CONCURRENT` | 2 | Max parallel UAC API calls |
| `CALL_DELAY_MS` | 300 | Milliseconds between API calls |

---

## Safety Mechanisms

### Job Creation Safety

1. **Triggers always created DISABLED** — prevents accidental early execution
2. **Payload whitelist filtering** — only UAC-approved fields pass through
3. **Read-only field stripping** — prevents API errors from immutable fields
4. **Zod input validation** — rejects malformed requests at the gate
5. **Rate limiting** — 300ms delay between UAC calls protects the server
6. **Agent resolution logging** — warns clearly if agent isn't found
7. **Session-based auth** — token never stored in browser, never sent over the wire after connect
8. **Post-creation verification** — reads back from UAC to confirm creation
9. **Qualifying times check** — validates the schedule will fire correctly

### Job Deletion Safety

1. **Backup before delete** — downloads full job config as re-importable Excel (default ON)
2. **Dependency inspection** — checks workflows, triggers, active instances BEFORE any destructive action
3. **Force finish prompt** — never deletes a task with running instances without user confirmation
4. **Trigger cleanup** — disables triggers before deletion, removes task from multi-task triggers gracefully
5. **Recovery center** — immediate one-click restore from in-memory backup
6. **Upload to restore** — backup Excel can be uploaded to recreate deleted jobs
7. **Sequential processing** — bulk deletes happen one at a time to avoid race conditions
8. **Audit logging** — every deletion is logged with timestamp, session, and result
9. **Step-by-step UI** — user sees exactly what's happening at each moment

---

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| Triggers named `TASKNAME-TR001` | Matches UAC convention, enables reliable discovery |
| Session-based auth (no token in browser) | Security — token only exists server-side |
| SSE streaming (not WebSocket) | Simpler, works through proxies, unidirectional is sufficient |
| Disabled trigger creation | Prevents jobs from firing before operator verification |
| Column name normalization | Users can use UI labels OR API names — no documentation required |
| Backup in job-creation-template format | Deleted jobs can be restored by simply re-uploading the backup |
| Agent resolution with caching | Avoids N+1 API calls while handling fuzzy/partial agent names |
| Sequential deletion (not parallel) | UAC can have race conditions with concurrent trigger updates |

---

*Documentation generated from source code analysis. Last updated: June 2026.*
*Designed and engineered by Abhay Thakur.*
