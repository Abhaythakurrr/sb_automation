# Stonebranch Automation

An enterprise automation platform for Stonebranch UAC — built by Abhay Thakur.

Automates task and time trigger creation from Excel, ODS, or CSV files. Supports reference job schedule inheritance, complex schedule parsing, agent auto-resolution, and bulk creation.

---

## Architecture

```
sb_automation/
  backend/          Node.js + Express API server
  frontend/         Next.js 14 + TailwindCSS UI
```

---

## Prerequisites

- Node.js 18+
- npm 9+

---

## Setup

**1. Clone the repository**

```bash
git clone https://github.com/Abhaythakurrr/sb_automation.git
cd sb_automation
```

**2. Install dependencies**

```bash
# Root
npm install

# Backend
cd backend && npm install

# Frontend
cd ../frontend && npm install
```

**3. Configure environment**

Copy the example and fill in your values:

```bash
cp .env.example .env
```

`.env` variables:

```env
BASE_URL=https://your-instance.stonebranch.cloud
AUTH_TOKEN=your_bearer_token_here
BACKEND_PORT=3001
SB_API_BASE_URL=https://your-instance.stonebranch.cloud
MAX_FILE_SIZE=10485760
UPLOAD_DIR=./backend/uploads
```

> The token in `.env` is a fallback only. The UI always takes priority — enter your token and base URL directly in the browser header.

**4. Create uploads directory**

```bash
mkdir -p backend/uploads
```

---

## Running

**Development (two terminals):**

```bash
# Terminal 1 — Backend
cd backend && npm run dev

# Terminal 2 — Frontend
cd frontend && npm run dev
```

- Frontend: http://localhost:3000
- Backend:  http://localhost:3001

---

## Usage

### Landing Page

Open http://localhost:3000 to see all available automations.

### Job Creation Automation

Navigate to http://localhost:3000/job-creation.

**Step 1 — Connect**

Enter your Stonebranch base URL and Bearer token in the header. Click "Connect" to validate.

**Step 2 — Build jobs**

Use the Job Builder Chat at the top of the page:

- Select the task type (Unix, Windows, SQL, Email, etc.)
- Paste the full job documentation text
- Click "Add Job" — repeat for multiple jobs
- Click "Generate & Proceed" to download the Excel and load the pipeline

Or upload an existing Excel/ODS/CSV file directly.

**Step 3 — Review**

The pipeline shows:
- Parsed data table
- Live JSON preview (Task and Trigger)
- Reference job comparison (if `ref_job` is set)
- Final merged payload

**Step 4 — Execute**

Click "Create Tasks" to create all tasks and triggers in Stonebranch.

---

## Excel Schema

The input file must have a sheet named `tasks` with these columns:

| Column | Required | Description |
|--------|----------|-------------|
| `task_name` | Yes | Unique task name |
| `task_type` | Yes | API type: `taskUnix`, `taskWindows`, `taskSql`, etc. |
| `agent` | Yes | Workstation name (partial match supported) |
| `command` | Yes | Script or command to execute |
| `credential` | No | Login account |
| `description` | No | Job description |
| `enabled` | No | `true` or `false` |
| `first_run_date` | No | `YYYY-MM-DD` |
| `start_time` | No | `HH:MM` |
| `timezone` | No | e.g. `Asia/Kolkata`, `Etc/GMT+7` |
| `frequency_type` | No | `DAILY`, `WEEKLY`, `MONTHLY`, `INTERVAL` |
| `frequency_value` | No | Interval count |
| `max_runtime` | No | Minutes (e.g. `60` for 1 hour) |
| `ref_job` | No | Existing job to inherit schedule from |
| `business_services` | No | Comma-separated, e.g. `BJA-QAD, BJA-QAD - AP` |
| `servicenow_ticket` | No | e.g. `SCTASK0862800` |
| `schedule_string` | No | Raw schedule: `AT 0330 TIMEZONE Asia/Kolkata MAXDUR 0100` |

### Schedule String Format

The `schedule_string` column overrides all individual schedule columns when present.

Supported formats:

```
AT 0330 TIMEZONE Asia/Kolkata MAXDUR 0100
AT 0100 TIMEZONE Asia/Jakarta UNTIL 2100 TIMEZONE Asia/Jakarta MAXDUR 0100 EVERY 1200
FREQ=DAILY;INTERVAL=1
```

---

## Reference Job Resolution

When `ref_job` is set and scheduling fields are empty, the system:

1. Calls `POST /resources/trigger/list` with `{ tasks: ref_job }` to find the trigger name
2. Calls `GET /resources/trigger?triggername=<name>` to get the full schedule
3. Calls `GET /resources/task?taskname=<ref_job>` to get `maxRunTime` from Late Finish Duration
4. Merges inherited values — input always takes priority over ref

---

## What Gets Created

For each row in the Excel:

**Task** (`POST /resources/task`):
- All execution fields from input
- `runAsSudo: true`
- `resolveNameImmediately: true`
- Late Finish Duration from `max_runtime`
- `customField1` (Instructions) = resolved agent cluster name
- `customField2` (ServiceNow Ticket) = from `servicenow_ticket` column
- `opswiseGroups` (Business Services) = from `business_services` column
- `notes` with title = ticket number, text = job doc

**Trigger** (`POST /resources/trigger`):
- Name = `task_name_TR001`
- `intervalStartingDate` = `first_run_date`
- Full schedule (Absolute or Interval with UNTIL window)
- `opswiseGroups` = same business services

---

## Adding New Automations

Edit `frontend/src/automations/registry.ts` and add an entry to the `AUTOMATIONS` array. The landing page updates automatically.

```typescript
{
  id:          'my-automation',
  title:       'My Automation',
  description: 'What it does',
  icon:        'job',
  status:      'live',
  category:    'Management',
  features:    ['Feature 1', 'Feature 2'],
  route:       '/my-automation',
}
```

Then create `frontend/src/app/my-automation/page.tsx`.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14, React, TailwindCSS, Framer Motion, Zustand |
| Backend | Node.js, Express, TypeScript, Axios |
| File parsing | xlsx (Excel, ODS, CSV) |
| API | Stonebranch UAC REST API v7.8.3.1 |

---

## Project Structure

```
backend/src/
  index.ts                    Express app entry point
  middleware/
    auth.ts                   Token + base URL extraction
    errorHandler.ts           Global error handler
  routes/
    execution.ts              Batch task + trigger creation
    fileUpload.ts             File upload + parsing
    stoneBranch.ts            Stonebranch API proxy routes
  services/
    fileParserService.ts      Excel/ODS/CSV parser
    stoneBranchService.ts     Stonebranch API client
  utils/
    agentResolver.ts          Agent/cluster name resolution
    payloadMapper.ts          OpenAPI-compliant payload builder
    scheduleParser.ts         Schedule string parser

frontend/src/
  app/
    page.tsx                  Landing page route
    job-creation/page.tsx     Job creation route
    layout.tsx                Root layout
    globals.css               Global styles
  automations/
    registry.ts               Automation registry (add new automations here)
  components/
    LandingPage.tsx           Landing page UI
    PipelinePage.tsx          Job creation pipeline
    PipelineComponents.tsx    Reusable pipeline UI components
    JobBuilderChat.tsx        Job builder chat interface
  services/
    api.ts                    Backend API client
  store/
    useJobStore.ts            Zustand state store
  types/
    index.ts                  TypeScript types
  utils/
    jobDocParser.ts           Job doc text parser
    taskTypeConfig.ts         Task type field definitions
```

---

Built by Abhay Thakur
