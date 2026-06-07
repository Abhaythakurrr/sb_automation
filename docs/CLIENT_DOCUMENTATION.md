# Stonebranch Automation Platform

## Client Documentation

**Version:** 3.0.0
**Classification:** Internal — Operations Technology
**Prepared by:** Abhay Thakur
**Last Updated:** July 2025

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Business Value & ROI](#business-value--roi)
3. [Platform Overview](#platform-overview)
4. [Module Breakdown](#module-breakdown)
   - [Job Creation](#module-1-job-creation)
   - [Job Deletion](#module-2-job-deletion)
   - [Agent Control](#module-3-agent-control)
   - [Monitoring & Alerts](#module-4-monitoring--alerts)
   - [Analytics & Insights](#module-5-analytics--insights)
5. [Operational Workflows](#operational-workflows)
6. [Security Architecture](#security-architecture)
7. [Data Handling & Governance](#data-handling--governance)
8. [Rate Limiting & Performance](#rate-limiting--performance)
9. [Audit Trail & Compliance](#audit-trail--compliance)
10. [Deployment Architecture](#deployment-architecture)
11. [Support & Maintenance](#support--maintenance)
12. [Appendix](#appendix)

---

## Executive Summary

The **Stonebranch Automation Platform** is an enterprise-grade web application that automates Stonebranch UAC (Universal Automation Center) operations — specifically **job creation**, **job deletion**, **agent lifecycle management**, **real-time monitoring**, and **operations analytics**.

Built to eliminate manual, repetitive, and error-prone UAC console interactions, the platform enables operations teams to execute bulk workload changes in seconds instead of hours — with full audit trails, safety checks, and governance controls.

### Key Outcomes

| Metric | Before (Manual) | After (Automated) | Improvement |
|--------|-----------------|-------------------|-------------|
| Time per job creation | ~15 minutes | ~30 seconds | **90% reduction** |
| Time per job deletion | ~12 minutes | ~20 seconds | **90% reduction** |
| Batch of 50 jobs | ~12.5 hours | ~25 minutes | **97% reduction** |
| Human errors | Frequent | Near-zero | **Eliminated** |
| Audit coverage | Inconsistent | 100% automatic | **Full compliance** |

---

## Business Value & ROI

### Time Savings Breakdown

**Job Creation (per job):**

| Step | Manual (UAC Console) | Automated (Platform) |
|------|---------------------|---------------------|
| Navigate to task creation form | 30 seconds | — |
| Fill task fields (name, agent, command, credentials) | 3 minutes | — |
| Configure schedule trigger | 4 minutes | — |
| Set business services, custom fields | 2 minutes | — |
| Configure late finish, recovery | 2 minutes | — |
| Verify configuration | 2 minutes | — |
| Save and validate | 1 minute | — |
| **Subtotal (manual)** | **~15 minutes** | — |
| Provide input (paste job doc or upload Excel) | — | 29 seconds |
| Automated creation (task + trigger via API) | — | 1 second |
| **Subtotal (automated)** | — | **~30 seconds** |

**Productivity Multiplier:** An operator who previously created 4 jobs per hour can now create **120 jobs per hour** — a **30x throughput increase**.

### Annual Impact (Example: 200 jobs/month)

| Scenario | Manual Hours/Month | Automated Hours/Month | Hours Saved/Month |
|----------|--------------------|-----------------------|-------------------|
| Job Creation (200 jobs) | 50 hours | 1.7 hours | **48.3 hours** |
| Job Deletion (50 jobs) | 10 hours | 0.3 hours | **9.7 hours** |
| Monitoring Setup | 5 hours | 0.5 hours | **4.5 hours** |
| **Monthly Total** | **65 hours** | **2.5 hours** | **62.5 hours** |
| **Annual Total** | **780 hours** | **30 hours** | **750 hours** |

At an average operator cost of $75/hour, this represents **$56,250 annual savings** per team.

### Qualitative Benefits

- **Consistency**: Every job follows the same configuration standards — no human variation
- **Speed**: Emergency changes that took days can be executed in minutes
- **Traceability**: Every action is logged with timestamp, operator, and result
- **Risk Reduction**: Built-in safety checks prevent accidental deletions and misconfigurations
- **Knowledge Retention**: Job documentation is automatically preserved and retrievable

---

## Platform Overview

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     OPERATOR BROWSER                             │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │            Web Application (Next.js)                       │  │
│  │   • Job Creation Pipeline    • Agent Control               │  │
│  │   • Job Deletion Flow        • Monitoring Dashboard        │  │
│  │   • Analytics & Insights     • Real-time SSE Streaming     │  │
│  └───────────────────────────────┬───────────────────────────┘  │
└──────────────────────────────────┼──────────────────────────────┘
                                   │ HTTPS (Session ID only)
                                   │ Token NEVER sent after login
                                   ▼
┌─────────────────────────────────────────────────────────────────┐
│                   BACKEND APPLICATION SERVER                      │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │  Express.js API Server                                       │ │
│  │                                                              │ │
│  │  • Session Management (encrypted token store)                │ │
│  │  • Request Validation (Zod schemas)                          │ │
│  │  • Rate Limiting (300ms between UAC calls)                   │ │
│  │  • Audit Logging (all operations)                            │ │
│  │  • File Parsing (Excel/CSV/ODS)                              │ │
│  │  • Payload Construction & Validation                         │ │
│  │  • Agent Resolution (smart matching)                         │ │
│  │  • Schedule Parsing (complex frequency support)              │ │
│  └──────────────────────────────────┬──────────────────────────┘ │
└─────────────────────────────────────┼────────────────────────────┘
                                      │ HTTPS (Bearer Token)
                                      │ Rate-limited & validated
                                      ▼
                    ┌──────────────────────────────┐
                    │   Stonebranch UAC REST API   │
                    │                              │
                    │   • /resources/task           │
                    │   • /resources/trigger        │
                    │   • /resources/agent          │
                    │   • /resources/taskinstance   │
                    └──────────────────────────────┘
```

### Technology Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Frontend | Next.js 14, React 18, TypeScript | User interface |
| State Management | Zustand | Global state (zero boilerplate) |
| Animations | Framer Motion | Professional micro-interactions |
| Styling | Tailwind CSS | Consistent design system |
| Backend | Express.js, TypeScript | API server, business logic |
| File Parsing | XLSX library | Excel/CSV/ODS processing |
| Streaming | Server-Sent Events (SSE) | Real-time execution feedback |
| Integration | Axios | UAC API communication |
| Process Manager | PM2 | Production deployment |
| Deployment | Ansible | Automated server provisioning |

---

## Module Breakdown

### Module 1: Job Creation

**Purpose:** Automate the creation of Stonebranch tasks and time triggers in bulk from structured input (Excel files or pasted job documentation).

#### How It Works

```
INPUT                    PROCESSING                    OUTPUT
─────                    ──────────                    ──────

Excel/CSV/ODS     ──┐                           ┌──  Task created in UAC
                    ├──▶  Parse & Validate  ──▶  │
Pasted Job Doc   ──┘     Resolve Agents         ├──  Trigger created in UAC
                         Build Payloads         │
                         Execute via API        ├──  Verification report
                         Verify in UAC          │
                                                └──  Proof document (Excel)
```

#### Step-by-Step Process

| Step | What Happens | Duration |
|------|-------------|----------|
| 1. Input | Operator uploads Excel or pastes job documentation | 10-25 seconds |
| 2. Parsing | System normalizes column names, validates required fields | Instant |
| 3. Reference Job | If specified, inherits schedule from existing UAC trigger | 1-2 seconds |
| 4. Agent Resolution | Smart matching: exact name → cluster prefix → fuzzy match | <1 second |
| 5. Payload Build | Constructs UAC-compliant JSON for task + trigger | Instant |
| 6. Execution | Creates task → creates trigger via UAC API (per job) | ~1 second/job |
| 7. Verification | Reads back from UAC to confirm configuration | 1-2 seconds/job |
| 8. Trigger Enable | Operator explicitly enables triggers after verification | Instant |
| 9. Proof Document | Downloads Excel with verification results + qualifying times | Instant |

#### Supported Input Formats

**Excel columns** (any of these names work):

| Column | Aliases | Required |
|--------|---------|----------|
| Job Name | Task Name, Name | Yes |
| Job Workstation | Agent, Agent Cluster | Yes |
| Job Script | Command, Script | Yes |
| Job Type | Task Type | No (default: Unix) |
| Job Login Account | Credential | No |
| Job Description | Description | No |
| Firstrun Date | First Run Date | No |
| Job Starttime | Schedule String | No |
| Job Timezone | Timezone | No |
| Scheduled Frequency | Frequency | No |
| Maximum Runtime | Max Runtime | No |
| Reference Job | Ref Job | No |
| Business Services | Member of Business Services | No |
| ServiceNow Ticket | Ticket | No |
| ServiceNow Group | Queues | No |
| Job Recovery1 | Recovery1 | No |
| Job Recovery2 | Recovery2 | No |

**Supported schedule formats:**

| Format | Example | Result |
|--------|---------|--------|
| Single daily run | `AT 0330 TIMEZONE Asia/Kolkata` | 03:30 daily |
| Recurring interval | `AT 0600 EVERY 0030 UNTIL 2200` | Every 30min, 06:00-22:00 |
| FREQ notation | `FREQ=INTERVAL;interval=5;units=minutes;byday=Daily` | Every 5min daily |
| Weekly | `FREQ=WEEKLY;byday=Mon,Wed,Fri` | Mon/Wed/Fri only |
| Monthly | `FREQ=MONTHLY;byday=24` | 24th of each month |
| Natural language | `Every 15 minutes from 06:00 to 22:00` | Interval with window |

#### Safety Mechanisms

1. **Triggers always created disabled** — prevents jobs from firing before operator verification
2. **Payload whitelist filtering** — only UAC-approved fields pass through
3. **Post-creation verification** — reads back from UAC to confirm correctness
4. **Qualifying times check** — validates the schedule will fire on expected dates
5. **Rate limiting** — 300ms between API calls to protect UAC server

---

### Module 2: Job Deletion

**Purpose:** Safely remove Stonebranch tasks and their associated triggers following the correct deletion sequence, with full backup and recovery capability.

#### How It Works

```
INPUT              SAFETY CHECKS              DELETION              RECOVERY
─────              ─────────────              ────────              ────────

Task names  ──▶  Backup configs    ──▶   Disable triggers  ──▶   One-click
(text or         Inspect deps            Delete triggers         restore from
 Excel)          Check instances         Delete task             backup Excel
                 Force finish?           Audit log
```

#### Safety-First Deletion Sequence

| Step | Action | Why |
|------|--------|-----|
| 1 | **Backup** | Downloads full job config as re-importable Excel (default ON) |
| 2 | **Inspect** | Checks: parent workflows, triggers, active instances |
| 3 | **Force Finish** | If running instances exist, prompts operator to force-finish |
| 4 | **Disable Triggers** | Prevents new executions during deletion |
| 5 | **Delete/Update Triggers** | Removes trigger (or removes task from multi-task trigger) |
| 6 | **Delete Task** | Final step — task removed from UAC |
| 7 | **Audit Log** | Records: who, when, what, success/failure |

#### Visual Confirmation Flow

The deletion process includes a **type-to-confirm safety modal**:
- Displays list of jobs to be deleted
- Shows backup status (enabled/disabled)
- Requires typing "DELETE" to proceed
- Animated warning indicators for visual attention

#### Recovery Capability

If a job is accidentally deleted:
1. **Immediate restore** from in-memory backup (one click)
2. **Upload backup Excel** — the backup file is in the exact format used for job creation, so it can be directly re-uploaded to recreate the jobs
3. **API recovery endpoint** — programmatic restore from stored configuration

---

### Module 3: Agent Control

**Purpose:** Suspend and resume Stonebranch agents individually or in bulk, with immediate or scheduled execution.

#### Capabilities

- View all agents with real-time status (Active, Suspended, Offline)
- Visual donut chart for quick status overview
- Select agents individually or by status group
- Execute suspend/resume immediately or schedule for a future date/time
- Full timezone support for scheduled actions
- Terminal-style execution logs

---

### Module 4: Monitoring & Alerts

**Purpose:** Continuously monitor Stonebranch agents and job failures, sending real-time alerts to Microsoft Teams with rich Adaptive Cards.

#### Features

| Feature | Description |
|---------|-------------|
| Agent Offline Detection | Alerts when an agent goes offline |
| Job Failure Detection | Detects Failed and Start Failure statuses |
| MS Teams Integration | Rich Adaptive Cards with incident details |
| ServiceNow Integration | Auto-parses INC numbers from operational memos |
| Alert Deduplication | Same issue only alerts once until resolved |
| Configurable Polling | 1, 5, 10, or 15 minute intervals |
| Operational Memo Update | Timestamps alerts back into UAC |

---

### Module 5: Analytics & Insights

**Purpose:** Comprehensive operations intelligence dashboard with real-time data visualization from UAC.

#### Three Views

**1. Failed Jobs Analysis**
- Total failures, average per day, peak day, unique failing jobs
- Daily failures bar chart (full month)
- Hour-by-day heatmap (identifies failure patterns)
- Top 10 failing jobs ranking
- Detailed failure table with agent, exit code, timestamp

**2. Created Items Tracking**
- Tasks and triggers created in the period
- Daily creation activity chart
- Combined UAC data + locally logged creations
- Creation attribution (who created what)

**3. Operations Overview**
- Total agents, active instances, monthly failures, monthly creations
- Combined activity chart (failures + creations)
- Job type breakdown (donut chart)
- Failure distribution heatmap

#### Data Sources

| Source | What It Provides |
|--------|-----------------|
| UAC API (live) | Failed task instances, created tasks/triggers, agent count |
| Local Creation Log | Jobs created through this platform (name, type, time, operator) |
| Combined View | Merged and deduplicated — UAC data takes priority |

#### Refresh Schedule

- **Auto-refresh:** Every 1 hour
- **Manual refresh:** Click "Refresh" button anytime
- **Month selector:** Switch between current month and last month

---

## Operational Workflows

### Workflow 1: Standard Job Creation

```
Operator receives job request (ServiceNow ticket)
         │
         ▼
Fills Excel template OR pastes job documentation
         │
         ▼
Uploads to platform → system parses and validates
         │
         ▼
Reviews parsed data + JSON preview
         │
         ▼
Clicks "Create Tasks" → watches real-time stream
         │
         ▼
System creates task → creates trigger (disabled) → verifies
         │
         ▼
Operator reviews verification results
         │
         ▼
Clicks "Enable All Triggers" → jobs go live
         │
         ▼
Downloads proof document → attaches to ticket
         │
         ▼
Pushes job documentation to shared Excel (Power Automate)
```

### Workflow 2: Emergency Job Deletion

```
Operator identifies jobs to remove
         │
         ▼
Enters task names into deletion panel
         │
         ▼
System backs up all job configurations (auto-download)
         │
         ▼
System inspects each job (workflows, triggers, instances)
         │
         ▼
If active instances → prompts to force-finish
         │
         ▼
Operator types "DELETE" to confirm
         │
         ▼
System: disable triggers → delete triggers → delete tasks
         │
         ▼
Results displayed per job (success/failure + steps)
         │
         ▼
Recovery center available if needed
```

---

## Security Architecture

### Authentication Model

```
┌─────────────────────────────────────────────────────────────────┐
│  BROWSER                                                        │
│                                                                 │
│  1. User enters UAC token + base URL                            │
│  2. Token sent ONCE to backend via HTTPS                        │
│  3. Backend validates token against UAC                         │
│  4. Backend returns session ID (UUID)                           │
│  5. Token DELETED from browser memory                           │
│  6. All subsequent requests use session ID only                 │
│                                                                 │
│  ✓ Token never stored in browser                                │
│  ✓ Token never sent over the wire after initial connect         │
│  ✓ Session ID is non-reversible (cannot derive token from it)   │
└─────────────────────────────────────────────────────────────────┘
```

### Security Controls

| Control | Implementation | Purpose |
|---------|---------------|---------|
| Token-at-rest encryption | AES-256-GCM | Protects stored sessions |
| Session expiry | 8 hours maximum | Limits exposure window |
| Session validation | Every request | Prevents stale access |
| HTTPS only | TLS 1.3 enforced | Encrypts all traffic |
| No token in browser | Session ID pattern | Eliminates XSS token theft |
| CSP headers | Strict policy | Prevents script injection |
| X-Frame-Options | DENY | Prevents clickjacking |
| Rate limiting | 300ms per UAC call | Prevents API abuse |
| Input validation | Zod schemas | Prevents injection attacks |
| Field whitelisting | Allowed fields only | Blocks unknown payloads |
| Read-only field stripping | Automatic | Prevents API errors |

### Data Flow Security

```
Browser ──[HTTPS]──▶ Backend ──[HTTPS]──▶ UAC API
  │                    │                     │
  │ Session ID only    │ Bearer Token        │ Authenticated
  │ No sensitive data  │ AES-256 at rest     │ TLS encrypted
  │ CSP protected      │ Audit logged        │ Rate limited
```

### What Is Never Stored in the Browser

- UAC authentication token
- API credentials
- Job execution results (streamed, not cached)
- Session encryption keys

---

## Data Handling & Governance

### Data Classification

| Data Type | Classification | Storage | Retention |
|-----------|---------------|---------|-----------|
| UAC Token | Confidential | Backend memory only (encrypted) | Session duration (max 8hr) |
| Job configurations | Internal | Not stored (pass-through) | Not retained |
| Uploaded Excel files | Internal | Temporary (deleted after parse) | Seconds |
| Audit logs | Internal | Server filesystem | 90 days |
| Alert history | Internal | Server filesystem | Last 200 records |
| Creation log | Internal | Server filesystem | Last 500 records |
| Backup exports | Internal | Operator's browser download | Operator-managed |

### Data Minimization Principles

1. **No persistent storage of job data** — the platform acts as a pass-through between operator input and UAC API
2. **Files deleted immediately** — uploaded Excel/CSV files are parsed and deleted within the same request
3. **Token never persisted** — held in encrypted memory only for the session duration
4. **Logs contain metadata only** — action type, timestamp, resource name, success/failure (no sensitive payload content)

### Data Residency

- All processing occurs on the internal application server
- No data is sent to external services (except Teams webhooks for alerts, if configured)
- UAC API calls go directly to the configured Stonebranch instance
- No cloud services, no third-party analytics, no external telemetry

---

## Rate Limiting & Performance

### UAC API Protection

The platform implements multiple layers of rate control to protect the Stonebranch UAC server:

| Control | Value | Purpose |
|---------|-------|---------|
| Inter-call delay | 300ms | Prevents overwhelming UAC with rapid requests |
| Max batch size | 100 jobs | Caps single execution to prevent runaway operations |
| Request timeout | 30 seconds | Prevents hanging connections |
| Sequential processing | 1 job at a time | Avoids race conditions in UAC |
| Connection timeout | 60 seconds | Handles slow UAC responses gracefully |

### Performance Characteristics

| Operation | Duration | Notes |
|-----------|----------|-------|
| File upload + parse | <1 second | 100 rows, 10MB file |
| Agent resolution | <1 second | Cached per session |
| Single job creation (task + trigger) | ~1 second | Two API calls + validation |
| Batch of 50 jobs | ~50 seconds | Sequential with 300ms delay |
| Job inspection (deletion) | 2-5 seconds | 5 parallel checks |
| Trigger enable (bulk) | ~2 seconds | Single API call |
| Analytics refresh | 3-10 seconds | Depends on UAC response time |

### Concurrency Model

```
Operator 1  ──▶  Session 1  ──▶  UAC API (sequential calls)
Operator 2  ──▶  Session 2  ──▶  UAC API (sequential calls)
Operator 3  ──▶  Session 3  ──▶  UAC API (sequential calls)
```

Each operator session operates independently. Within a session, UAC calls are serialized to prevent conflicts. Multiple operators can use the platform simultaneously without interference.

---

## Audit Trail & Compliance

### What Is Logged

Every operation that modifies UAC state generates an audit record:

```json
{
  "timestamp": "2025-07-15T10:23:45.123Z",
  "requestId": "req-abc-123",
  "sessionId": "sess-xyz-789",
  "action": "JOB_CREATE",
  "resource": "PMFG-BU-AS1-MFG-377-MYJOB",
  "result": "success",
  "details": {
    "taskCreated": true,
    "triggerCreated": true,
    "triggerEnabled": false
  }
}
```

### Audited Actions

| Action | What Is Recorded |
|--------|-----------------|
| `CONNECT` | Session creation, UAC endpoint, operator name |
| `DISCONNECT` | Session termination |
| `JOB_CREATE` | Task name, trigger name, success/failure |
| `JOB_DELETE` | Task name, trigger cleanup steps, result |
| `TRIGGER_ENABLE` | Trigger names, enable count |
| `FORCE_FINISH` | Instance names, finish result |
| `AGENT_SUSPEND` | Agent names, action type, timing |
| `AGENT_RESUME` | Agent names, result |
| `MONITORING_START` | Configuration, poll interval |
| `MONITORING_ALERT` | Alert type, target name, Teams delivery status |

### Compliance Benefits

- **Change Management**: Every job creation/deletion is traceable to an operator and timestamp
- **Separation of Duties**: Trigger enable is a separate, explicit action from job creation
- **Proof of Work**: Downloadable verification documents for each batch
- **Incident Response**: Full history of monitoring alerts with ServiceNow incident correlation
- **Access Control**: Session-based authentication with automatic expiry

---

## Deployment Architecture

### Production Setup

```
┌──────────────────────────────────────────────────────────┐
│  APPLICATION SERVER (Internal Network)                    │
│                                                          │
│  ┌──────────────────┐  ┌──────────────────────────────┐ │
│  │  PM2 Process     │  │  PM2 Process                 │ │
│  │  ─────────────   │  │  ──────────────────────────  │ │
│  │  Next.js Frontend│  │  Express.js Backend          │ │
│  │  Port: 3000      │  │  Port: 3001                  │ │
│  │  Static + SSR    │  │  API + SSE + File Processing │ │
│  └──────────────────┘  └──────────────────────────────┘ │
│                                                          │
│  Managed by PM2 (auto-restart, log rotation, clustering) │
└──────────────────────────────────────────────────────────┘
         │
         │  Internal network only
         ▼
┌──────────────────────────────────────────────────────────┐
│  STONEBRANCH UAC INSTANCE                                │
│  (e.g., uac-prod.company.com)                            │
└──────────────────────────────────────────────────────────┘
```

### Deployment Process

Automated via Ansible playbook:
1. Pull latest code from repository
2. Install dependencies (npm)
3. Build frontend (Next.js production build)
4. Build backend (TypeScript compilation)
5. Restart PM2 processes (zero-downtime reload)
6. Health check verification

---

## Support & Maintenance

### Health Indicators

| Indicator | Normal | Warning | Critical |
|-----------|--------|---------|----------|
| Backend response time | <500ms | 500ms-2s | >2s |
| UAC API connectivity | Connected | Intermittent | Disconnected |
| Session count | <50 active | 50-100 | >100 |
| Memory usage | <512MB | 512MB-1GB | >1GB |
| Disk (logs) | <1GB | 1-5GB | >5GB |

### Troubleshooting

| Issue | Likely Cause | Resolution |
|-------|-------------|------------|
| "Session expired" | 8-hour timeout reached | Reconnect with token |
| "Connection failed" | UAC unreachable or token invalid | Verify UAC URL and token |
| Jobs not creating | Invalid payload fields | Check logs for UAC error message |
| Triggers not enabling | Trigger naming mismatch | Verify trigger exists in UAC |
| Analytics empty | UAC listadv query params | Check date range and UAC version |

### Log Locations

| Log | Path | Content |
|-----|------|---------|
| Backend application | `~/.pm2/logs/sb-backend-*.log` | API requests, UAC calls, errors |
| Frontend application | `~/.pm2/logs/sb-frontend-*.log` | SSR rendering, build errors |
| Audit trail | `./audit_log.json` | All state-changing operations |
| Alert history | `./alert_history.json` | Monitoring alerts sent |
| Creation log | `./creation_log.json` | Jobs created via platform |

---

## Appendix

### A. Supported Task Types

| Type | API Value | Description |
|------|-----------|-------------|
| Unix/Linux | `taskUnix` | Shell scripts on Linux/Unix agents |
| Windows | `taskWindows` | Batch/PowerShell on Windows agents |
| SQL | `taskSql` | Database queries |
| Email | `taskEmail` | Automated email sending |
| FTP | `taskFtp` | File transfer operations |
| Web Service | `taskWebService` | HTTP/REST API calls |
| SAP | `taskSap` | SAP system integration |

### B. UAC API Endpoints Used

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/resources/task` | GET/POST/DELETE | Task CRUD |
| `/resources/trigger` | GET/POST/PUT/DELETE | Trigger CRUD |
| `/resources/trigger/enabledisable` | POST | Enable/disable triggers |
| `/resources/trigger/list` | POST | Find triggers by task |
| `/resources/trigger/listadv` | GET | Advanced trigger queries |
| `/resources/taskinstance/listadv` | GET | Query task instances by status |
| `/resources/taskinstance/ops-force-finish` | POST | Force finish running instances |
| `/resources/agent/list` | GET | List all agents |
| `/resources/agent/suspend` | POST | Suspend agents |
| `/resources/agent/resume` | POST | Resume agents |

### C. Schedule Notation Reference

| Notation | Meaning |
|----------|---------|
| `AT HHMM` | Run at specific time (24hr) |
| `TIMEZONE tz` | IANA timezone identifier |
| `EVERY HHMM` | Repeat at interval (HH:MM) |
| `UNTIL HHMM` | Stop repeating at this time |
| `FREQ=INTERVAL;interval=N;units=minutes` | Every N minutes |
| `FREQ=WEEKLY;byday=Mon,Wed,Fri` | Specific weekdays |
| `FREQ=MONTHLY;byday=24` | Monthly on day 24 |
| `byday=Daily` | Every day |
| `byday=Weekdays` | Monday through Friday |

### D. Error Codes

| Code | Meaning | Action |
|------|---------|--------|
| `SESSION_EXPIRED` | Session older than 8 hours | Reconnect |
| `TOKEN_INVALID` | UAC rejected the bearer token | Get new token from UAC admin |
| `TASK_EXISTS` | Task name already in UAC | Use different name or delete first |
| `TRIGGER_EXISTS` | Trigger already exists | Delete existing trigger first |
| `AGENT_NOT_FOUND` | No matching agent/cluster | Verify agent name spelling |
| `RATE_LIMIT` | Too many requests to UAC | Wait and retry (auto-handled) |

---

*This document is maintained alongside the platform source code and updated with each release.*

**Designed and Engineered by Abhay Thakur**
