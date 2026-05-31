# Stonebranch Automation Platform
## Technical Presentation

---

## 1. What We Built

A full-stack internal automation platform that sits on top of the **Stonebranch Universal Automation Center (UAC) REST API v7.8**. Instead of manually operating UAC through its UI, the team can now perform bulk operations, schedule actions, and receive real-time alerts — all from a single web interface.

Three live automations are deployed today:

| Automation | Category | What it does |
|---|---|---|
| Job Creation | Scheduling | Bulk create tasks + time triggers from Excel/CSV |
| Agent Control | Operations | Suspend / resume agents immediately or on schedule |
| Monitoring & Alerts | Monitoring | Detect failures, send Teams cards, track ServiceNow incidents |

---

## 2. Architecture Overview

```
Browser (Next.js 14)
        |
        | HTTP (REST)
        v
Express Backend (Node.js / TypeScript)
        |
        | HTTP (Bearer token)
        v
Stonebranch UAC REST API v7.8
        |
        | Internal integration
        v
ServiceNow (incident numbers via operationalMemo field)
        |
        | Outbound webhook
        v
MS Teams (Adaptive Cards)
```

**Key design decision:** The browser never talks to Stonebranch directly. All UAC API calls go through our Express backend. This means:
- The bearer token is never exposed to the browser network tab
- We can add business logic (agent resolution, schedule parsing, deduplication) server-side
- A single connection state is shared across all automations via Zustand

---

## 3. Tech Stack

### Frontend
| Technology | Version | Purpose |
|---|---|---|
| Next.js | 14.0.4 | React framework, App Router, SSR |
| React | 18.2 | UI component model |
| TypeScript | 5.3 | Type safety across the entire codebase |
| Tailwind CSS | 3.3 | Utility-first styling |
| Framer Motion | 12.x | Animations (donut chart, waveforms, transitions) |
| Zustand | 4.4 | Global connection state store |
| Axios | 1.6 | HTTP client |
| SheetJS (xlsx) | 0.18 | Excel/ODS/CSV parsing and generation |

### Backend
| Technology | Version | Purpose |
|---|---|---|
| Node.js + Express | 4.18 | REST API server |
| TypeScript | 5.3 | Type safety |
| tsx | 4.7 | TypeScript execution with hot reload |
| Axios | 1.6 | Stonebranch UAC API calls |
| Multer | 1.4 | File upload handling |
| Zod | 3.22 | Runtime schema validation |
| fs (Node built-in) | — | JSON persistence for scheduled jobs and alert state |

### Shared
- TypeScript monorepo with `@stonebranch/shared` package for common types
- `.env` for base URL and token fallback (UI values take priority)

---

## 4. Automation 1 — Job Creation

### Problem
Creating Stonebranch tasks manually is slow and error-prone. Each job requires filling in 15+ fields across task and trigger forms. For bulk onboarding (10–50 jobs at once), this takes hours.

### Solution
Upload an Excel file → system parses it → resolves agents → builds API-compliant JSON → creates tasks and triggers in one click.

### How it works — step by step

**Step 1: File Upload**
- Accepts `.xlsx`, `.ods`, `.csv`
- Multer handles multipart upload to `backend/uploads/`
- SheetJS parses the file into row objects on the backend
- Each row maps to one task + one time trigger

**Step 2: Agent Resolution (`agentResolver.ts`)**
The Excel `agent` column often contains partial names (e.g. `A0021377P3`). The system:
1. Fetches all agents from `/resources/agent/list`
2. Fetches all clusters from `/resources/agentcluster/list`
3. Tries exact match → prefix match → contains match (shortest result wins)
4. Falls back to sending the value as-is if nothing matches
5. Results are cached per base URL to avoid repeated API calls

**Step 3: Ref Job Resolution**
If a row has a `ref_job` column, the system:
1. Calls `/resources/trigger/list` and filters locally by task name
2. Extracts the full trigger JSON (schedule fields, timezone, interval, etc.)
3. Shows a comparison table: input value vs. reference value vs. final value
4. Inherits schedule fields where the input row left them blank

**Step 4: Schedule Parsing (`scheduleParser.ts`)**
Parses job-doc schedule strings like:
```
AT 0330 TIMEZONE Asia/Kolkata MAXDUR 0100
AT 0100 EVERY 1200 UNTIL 2100 TIMEZONE Asia/Jakarta
FREQ=DAILY;INTERVAL=1
```
Converts to Stonebranch trigger fields: `timeStyle`, `timeInterval`, `timeIntervalUnits`, `enabledStart`, `enabledEnd`, `restrictedTimes`, `timeZone`.

**Step 5: Payload Mapping (`payloadMapper.ts`)**
Builds the exact JSON the UAC API expects:
- `runAsSudo: true`, `resolveNameImmediately: true`
- `opswiseGroups` from business services (comma-separated → array)
- `customField2` for ServiceNow ticket number
- `lfEnabled`, `lfType: 'Duration'`, `lfDuration` from `max_runtime` (minutes → `DD:HH:MM:SS`)
- `skipCondition: 'None'` (not "Before" — that's invalid)
- `intervalStartingDate` = first run date

**Step 6: Execution**
- POST to `/resources/task` for each task
- POST to `/resources/trigger` for each trigger
- Results shown in execution dashboard with success/failure per item

### Job Builder Chat
An alternative input mode — paste the raw job documentation text (as received from the team), and the system parses it automatically using regex patterns that match the standard job doc format. Supports all 7 task types: Unix, Windows, SQL, Email, Web Service, Timer, Manual.

---

## 5. Automation 2 — Agent Control

### Problem
Suspending/resuming agents for maintenance windows requires navigating to each agent in UAC individually. For bulk operations or scheduled maintenance, this is manual and risky.

### Solution
Select agents from a visual dashboard, choose immediate or scheduled execution, and the system handles it — even if the browser is closed.

### How it works

**Agent Overview — Donut Chart**
- Fetches all agents from `/resources/agent/list`
- Categorizes into Active / Suspended / Offline
- SVG donut chart — click a segment to reveal agent cards for that status
- Each card shows: name, type, host, IP, and a live waveform animation
  - Active → ECG heartbeat (animated polyline)
  - Suspended → breathing sine wave (opacity + scaleY animation)
  - Offline → flat line

**Immediate Execution**
- Suspend: POST to `/resources/agent/ops-suspend-agent` with `{ name: agentName }`
- Resume: POST to `/resources/agent/ops-resume-agent` with `{ name: agentName }`
- Bulk: sequential calls, results shown per agent

**Scheduled Execution**
- User picks date + time + timezone (150+ IANA timezones, grouped by region)
- `buildScheduledISO()` converts local time to UTC correctly using `Intl.DateTimeFormat`
  - Example: 21:00 Asia/Kolkata → 15:30 UTC (correctly subtracts IST offset)
- Job is saved to `scheduled_jobs.json` on disk
- `setTimeout` fires at the correct UTC time
- **On backend restart:** overdue jobs are SKIPPED (not executed) — avoids unintended server impact. Only future jobs are re-scheduled.

**Timezone Conversion Logic**
```typescript
// Get what the target TZ clock shows for a UTC reference date
const tzShows = new Date(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}Z`);
// offset = TZ clock - UTC
const offsetMs = tzShows.getTime() - refDate.getTime();
// UTC = local - offset
const utcTime = new Date(refDate.getTime() - offsetMs);
```

---

## 6. Automation 3 — Monitoring & Alerts

### Problem
When a Stonebranch job fails or an agent goes offline, the team finds out late — either by checking UAC manually or waiting for a user complaint. ServiceNow incidents are created automatically by UAC's internal integration, but there's no proactive notification.

### Solution
A background polling service that detects failures and sends rich MS Teams notifications with direct ServiceNow incident links.

### How it works

**Polling Loop**
- Configurable interval (1, 5, 10, 15 minutes)
- Runs on the backend — survives browser close
- Config persisted to `monitor_config.json` — auto-restores on restart

**Agent Monitoring**
- GET `/resources/agent/list`
- Any agent where `status !== 'Active'` and `suspended === false` is considered offline
- State tracked in `monitor_state.json` — alert fires only once per offline event (deduplication)
- When agent comes back online, state is cleared

**Job Failure Monitoring**
- POST `/resources/taskinstance/listadv` with `{ status, updatedTimeType: 'Last 24 Hours' }`
- Covers three failure types: `Failed`, `Start Failure`, `Aborted`
- Each instance tracked by `sysId` — alert fires only once per failure

**ServiceNow Incident Extraction**
UAC stores the ServiceNow incident number in the `operationalMemo` field:
```
"ServiceNow# INC3699410"
```
The system parses this with regex `/INC\d+/gi` and constructs a direct URL:
```
https://adientprod.service-now.com/nav_to.do?uri=incident_list.do?sysparm_query=number=INC3699410
```
No ServiceNow API access needed — UAC is the source of truth.

**MS Teams Adaptive Cards**
Sent via incoming webhook. Cards include:
- Alert type (Agent Offline / Job Failure)
- Task name, status, agent, start/end time
- Environment label
- Operational memo text
- Action buttons: "Open INC3699410" → direct ServiceNow link

**Alert History**
- All alerts stored in `alert_history.json` (last 200 entries)
- Viewable in the Monitoring page with filters: All / Agents / Jobs
- Shows Teams notification status, incident numbers as clickable badges

---

## 7. Global Connection State

### Problem
Each automation previously had its own connection form. Navigating back to the home page and then to another automation would lose the connection.

### Solution
Zustand store (`useConnectionStore`) with a singleton `ApiClient` instance (`globalApi`).

```typescript
// One instance for the entire app lifetime
export const globalApi = new ApiClient();

// Zustand store — persists across page navigation
export const useConnectionStore = create<ConnectionState>((set) => ({
  baseUrl: '', token: '', connected: false, environment: 'Production',
  // ...
}));
```

- Connect once on the **Landing Page**
- All three automations read from the same store
- `globalApi` carries the token and base URL for every request
- Disconnect button available in every page header

---

## 8. Security Design

- Bearer token entered in UI, never hardcoded
- Token stored only in memory (Zustand store) — not in localStorage or cookies
- Backend proxies all UAC calls — token never visible in browser network tab
- `.env` file excluded from git (`.gitignore`)
- Scheduled jobs file (`scheduled_jobs.json`) excluded from git — contains tokens
- Alert state files excluded from git

---

## 9. Data Flow — Job Creation (End to End)

```
User uploads Excel
        |
        v
Multer saves file → SheetJS parses rows
        |
        v
For each row with ref_job:
  GET /resources/trigger/list → filter by taskName → extract schedule
        |
        v
For each row:
  resolveAgent() → GET /resources/agent/list + /agentcluster/list
  parseScheduleString() → convert AT/EVERY/UNTIL to trigger fields
  buildTaskPayload() → construct task JSON
  buildTriggerPayload() → construct trigger JSON
        |
        v
POST /resources/task → create task
POST /resources/trigger → create trigger
        |
        v
Return results array → display in execution dashboard
```

---

## 10. Data Flow — Monitoring (End to End)

```
User clicks "Start" on Monitoring page
        |
        v
POST /api/monitoring/start → startMonitor(config)
        |
        v
setInterval every N minutes:
  GET /resources/agent/list
    → compare with monitor_state.json
    → new offline agents → POST Teams webhook
        |
  POST /resources/taskinstance/listadv (x3 statuses)
    → compare with monitor_state.json
    → new failures → parse operationalMemo for INC numbers
    → POST Teams webhook with ServiceNow action buttons
        |
  saveState() → monitor_state.json
  appendAlert() → alert_history.json
        |
        v
GET /api/monitoring/alerts → return alert_history.json
  → displayed in Monitoring page
```

---

## 11. Key Technical Decisions

| Decision | Reason |
|---|---|
| Backend proxy for all UAC calls | Token security, business logic, CORS |
| `listadv` with time window for task instances | `/list` without date range returns HTTP 400 |
| Overdue scheduled jobs are SKIPPED on restart | Executing stale suspensions could affect server uptime |
| Agent and cluster lists kept separate | They are different API resources with different fields |
| `skipCondition: 'None'` not `'Before'` | `'Before'` is not a valid UAC API value |
| `lfDuration` for Late Finish, not `maxRunTime` | `maxRunTime` is a read-only stat field |
| `opswiseGroups` for business services | Correct UAC API field name |
| Intl.DateTimeFormat for timezone conversion | Handles DST correctly for all IANA timezones |
| Alert deduplication via sysId in state file | Prevents repeated Teams notifications for same event |

---

## 12. Repository Structure

```
stonebranch-automation/
├── frontend/               Next.js 14 app
│   └── src/
│       ├── app/            Pages (/, /job-creation, /agent-control, /monitoring)
│       ├── components/     Page components + shared UI
│       ├── services/       ApiClient (axios wrapper)
│       ├── store/          Zustand global connection store
│       ├── utils/          Schedule parser, job doc parser, task type config
│       └── types/          Shared TypeScript types
├── backend/                Express API server
│   └── src/
│       ├── routes/         fileUpload, stoneBranch, execution, agentControl, monitoring
│       ├── services/       monitoringService (polling loop)
│       ├── middleware/      auth (token extraction), errorHandler
│       └── utils/          payloadMapper, scheduleParser, agentResolver, jobPersistence
├── shared/                 Common types (monorepo)
├── openapi.json            Stonebranch UAC API spec v7.8.3.1
└── .env                    BASE_URL, AUTH_TOKEN (gitignored)
```

---

## 13. What This Replaces

| Before | After |
|---|---|
| Manually create each task in UAC UI (15+ fields) | Upload Excel → one click |
| Navigate to each agent to suspend/resume | Select from dashboard → bulk execute |
| Check UAC manually for failures | Automatic Teams notification within minutes |
| No visibility into ServiceNow incidents from UAC | Direct incident links in Teams cards |
| Connection lost when switching between tools | Single connection, persists across all automations |

---

## 14. Live Demo Flow

1. Open `http://localhost:3000`
2. Enter base URL + bearer token → Connect
3. **Job Creation** — upload sample Excel → watch agent resolution + ref job inheritance → review JSON → create
4. **Agent Control** — click donut segment → select agents → suspend immediately or schedule
5. **Monitoring** — start monitoring → run manual check → view alert history

---

*Built by Abhay Thakur — Stonebranch Automation Platform v1.0*
