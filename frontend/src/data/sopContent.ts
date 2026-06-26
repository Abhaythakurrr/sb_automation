/**
 * SOP content — single source of truth.
 * Both the on-screen SOP pages and the DOCX export read from these structures
 * so the document and the web page always stay in sync ("same visuals").
 */

export type CalloutKind = 'info' | 'warning' | 'success' | 'danger';

export interface SopStep {
  title: string;
  detail: string;
  substeps?: string[];
}

export interface SopSection {
  heading: string;
  intro?: string;
  steps?: SopStep[];
  bullets?: string[];
  table?: { columns: string[]; rows: string[][] };
  callout?: { kind: CalloutKind; title: string; body: string };
  mockups?: string[];   // names of dummy UI mockups to render (see SopMockups.tsx)
}

export interface Sop {
  id: string;
  title: string;
  subtitle: string;
  accent: string;        // hex accent color for the theme
  docCode: string;       // document reference code
  version: string;
  owner: string;
  audience: string;
  purpose: string;
  prerequisites: string[];
  sections: SopSection[];
}

// ══════════════════════════════════════════════════════════════════════════════
// JOB CREATION SOP
// ══════════════════════════════════════════════════════════════════════════════
export const JOB_CREATION_SOP: Sop = {
  id: 'job-creation',
  title: 'Job Creation — Standard Operating Procedure',
  subtitle: 'Creating Stonebranch tasks and time triggers',
  accent: '#06b6d4',
  docCode: 'SOP-SB-CREATE-001',
  version: '1.0',
  owner: 'Abhay Thakur',
  audience: 'Schedulers, Operations Engineers, and Job Requesters',
  purpose:
    'This procedure describes how to create one or many Stonebranch (UAC) tasks together with their time triggers using the Job Creation automation — either by uploading a spreadsheet or by pasting a job document into Job Builder Chat. Following it ensures every job is created with a consistent, validated, audit-ready configuration.',
  prerequisites: [
    'You have an active connection to the target UAC environment (connect from the Home page with a valid token and Base URL).',
    'You know the target environment (Production / Test) and have authority to create jobs there.',
    'You have the job details: name, type, agent/workstation, script/command, login account, schedule, and timezone.',
    'For schedule inheritance, you know the Reference Job (ref_job) name if applicable.',
  ],
  sections: [
    {
      heading: '1. Overview of the Creation Flow',
      intro:
        'The automation turns each job row into two UAC objects: a Task (the work) and a Time Trigger (the schedule). Triggers are always created DISABLED so nothing fires until you verify and enable it.',
      bullets: [
        'Connect to UAC → provide token + Base URL once; only a session ID is used afterwards.',
        'Provide jobs → upload Excel/ODS/CSV, or paste a job document into Job Builder Chat.',
        'Review parsed rows → confirm name, type, agent, command, and schedule.',
        'Preview payloads → see the exact Task and Trigger JSON before anything is sent.',
        'Execute → tasks and triggers are created in UAC with a live progress log.',
        'Verify & enable → confirm fields in UAC, then enable the trigger to go live.',
      ],
      mockups: ['connect'],
    },
    {
      heading: '2. Prepare the Input',
      intro: 'Choose one of the two supported input methods.',
      steps: [
        {
          title: 'Option A — Spreadsheet upload',
          detail:
            'Fill the template using the same column labels you see in the UAC UI. Each row is one job. Save as .xlsx, .ods, or .csv (max 10 MB).',
          substeps: [
            'Job Name → task name (must be unique in UAC).',
            'Job Type → Unix / Windows / SQL etc. ("Production" is an environment label, not a task type — leave the UI type selector set correctly).',
            'Job Workstation → agent or agent cluster (auto-resolved).',
            'Job Script → the command or script to run.',
            'Job Login Account → the credential.',
            'Job Starttime + Scheduled Frequency + Job Timezone → the schedule (see section 4).',
          ],
        },
        {
          title: 'Option B — Job Builder Chat',
          detail:
            'Paste the full job request document into Job Builder Chat. The parser extracts every field automatically and shows a structured row you can edit before continuing.',
          substeps: [
            'Select the correct Task Type in the UI before parsing.',
            'Paste the job document text and click Parse.',
            'Fix any validation warnings (name, agent, and command are required).',
          ],
        },
      ],
      mockups: ['creation-input'],
    },
    {
      heading: '3. Field Reference',
      intro: 'The most common job-document fields and where they map in UAC.',
      table: {
        columns: ['Job Document Field', 'Maps To', 'Notes'],
        rows: [
          ['Job Name', 'Task name', 'Unique identifier in UAC'],
          ['Job Type', 'Task type', 'Unix/Windows/SQL… ("Production" = environment, ignored as type)'],
          ['Job Workstation', 'Agent / Agent Cluster', 'Auto-resolved to agent or cluster'],
          ['Job Script', 'Command', 'The script/command body'],
          ['Job Login Account', 'Credentials', 'UAC credential name'],
          ['Maximum Runtime', 'maxRunTime + Late Finish', '"0100" = 60 min; sets lfDuration'],
          ['Member of Business Services', 'opswiseGroups', 'Comma-separated list'],
          ['ServiceNow Ticket', 'customField2', 'RITM/INC auto-detected from text'],
          ['Job Recovery1/2', 'Notes', 'Recovery instructions stored in notes'],
        ],
      },
    },
    {
      heading: '4. Schedule Formats',
      intro:
        'The schedule comes from Job Starttime + Scheduled Frequency. The parser understands canonical formats AND natural language.',
      steps: [
        {
          title: 'Fixed daily time',
          detail: 'Use a single time. Example: Job Starttime = "AT 1800 TIMEZONE Asia/Kolkata", Scheduled Frequency = "Daily". Produces an Absolute trigger at 18:00.',
        },
        {
          title: 'Interval within a window',
          detail:
            'For "every N hours/minutes from X to Y" use either of the equivalent forms below — both produce an Interval trigger with a start/end window.',
          substeps: [
            'Canonical: Job Starttime = "AT 0730 EVERY 0200 UNTIL 1930 TIMEZONE Asia/Kolkata".',
            'Natural language: Scheduled Frequency = "every 2 hours from 07:30 to 19:30" (AM/PM and dot-times like 07.30 are accepted).',
          ],
        },
        {
          title: 'Specific days',
          detail: 'Scheduled Frequency = "Weekdays", "Mon,Wed,Fri", or "Monthly Day 24" for day-of-month patterns.',
        },
      ],
      callout: {
        kind: 'info',
        title: 'Timezone always wins',
        body: 'Always include the timezone (e.g., Asia/Kolkata). If omitted, the schedule may default incorrectly. IANA names are preferred.',
      },
    },
    {
      heading: '5. Review, Preview, and Execute',
      steps: [
        { title: 'Review parsed rows', detail: 'Confirm each row’s name, type, agent, command, and schedule in the table.' },
        { title: 'Preview payloads', detail: 'Open Preview to inspect the exact Task and Trigger JSON that will be sent to UAC. Nothing is created at this stage.' },
        { title: 'Execute', detail: 'Run the batch. Each job shows live steps: agent resolved → task created → trigger created. Triggers are created DISABLED.' },
        { title: 'Verify', detail: 'Use Verify to fetch the created task + trigger back from UAC and check the fields and qualifying run times.' },
        { title: 'Enable', detail: 'Once verified, enable the trigger(s) so the schedule goes live.' },
      ],
      callout: {
        kind: 'warning',
        title: 'Triggers start disabled by design',
        body: 'A created job will NOT run until you enable its trigger. This is intentional — verify first, then enable.',
      },
      mockups: ['creation-execute'],
    },
    {
      heading: '6. Post-Creation Checklist',
      bullets: [
        'Task exists in UAC with correct agent, command, and credentials.',
        'Trigger exists with the expected timeStyle, time/interval, and timezone.',
        'Qualifying times show the expected run cycle.',
        'Trigger enabled only after verification.',
        'ServiceNow ticket reference recorded where applicable.',
      ],
    },
    {
      heading: '7. Troubleshooting',
      table: {
        columns: ['Symptom', 'Likely Cause', 'Action'],
        rows: [
          ['Schedule created as plain Daily', 'AM/PM or interval phrasing not recognized in old input', 'Use "AT … EVERY … UNTIL …" or "every N hours from X to Y"'],
          ['Task creation failed', 'Invalid task type or missing agent/command', 'Check required fields; ensure agent resolves in UAC'],
          ['Trigger failed after task', 'Schedule fields invalid for timeStyle', 'Review preview JSON; confirm time vs interval fields'],
          ['Upload rejected', 'File content does not match a real spreadsheet/CSV', 'Re-export as genuine .xlsx/.ods/.csv'],
        ],
      },
    },
  ],
};

// ══════════════════════════════════════════════════════════════════════════════
// JOB DELETION SOP
// ══════════════════════════════════════════════════════════════════════════════
export const JOB_DELETION_SOP: Sop = {
  id: 'job-deletion',
  title: 'Job Deletion — Standard Operating Procedure',
  subtitle: 'Safely removing Stonebranch tasks, triggers, and workflows',
  accent: '#ef4444',
  docCode: 'SOP-SB-DELETE-001',
  version: '1.0',
  owner: 'Abhay Thakur',
  audience: 'Operations Engineers and Schedulers authorized to remove jobs',
  purpose:
    'This procedure describes how to safely delete one or many Stonebranch (UAC) jobs using the Job Deletion automation. It enforces the correct removal sequence — disable triggers, detach from workflows, force-finish active instances, then delete the task — so that no orphaned triggers, broken workflows, or running instances are left behind.',
  prerequisites: [
    'You have an active connection to the target UAC environment.',
    'You have confirmed the exact task name(s) to delete.',
    'You understand the deletion is irreversible without a backup (use the built-in Backup option).',
    'You have authority to delete jobs in the target environment.',
  ],
  sections: [
    {
      heading: '1. Why a Procedure Is Needed',
      intro:
        'A task may be referenced by triggers and by one or more workflows, and it may have running instances. Deleting it directly causes errors ("task is referenced by workflow"). The automation handles dependencies in the correct order.',
      bullets: [
        'Triggers must be disabled and removed/updated before the task can be deleted.',
        'A task inside a workflow must be detached (or the workflow removed) first.',
        'Active/Execution-Wait instances must be force-finished before deletion.',
        'Every action is recorded in the audit log.',
      ],
    },
    {
      heading: '2. The Safe Deletion Sequence',
      intro: 'The automation performs these steps for each job, in order.',
      steps: [
        { title: 'Inspect', detail: 'Fetch the task and discover its triggers, parent workflows, and any active instances.' },
        { title: 'Handle workflows', detail: 'If the task belongs to a workflow, set its execution restriction to Skip, then detach it. If every task in the workflow is being deleted, the workflow (and its trigger) is removed too; otherwise only this task is removed and the rest stay intact.' },
        { title: 'Disable & remove triggers', detail: 'Each associated trigger is disabled, then deleted if this is its only task, or updated to drop this task if others remain.' },
        { title: 'Force-finish instances', detail: 'If active or Execution-Wait instances exist, you are prompted to force-finish them before deletion.' },
        { title: 'Delete the task', detail: 'With all dependencies cleared, the task is deleted from UAC.' },
      ],
      callout: {
        kind: 'danger',
        title: 'Deletion is irreversible',
        body: 'Always keep "Backup Before Delete" enabled. It downloads a recovery file (job-creation template) so the job can be recreated if needed.',
      },
      mockups: ['deletion-cards'],
    },
    {
      heading: '3. Step-by-Step Usage',
      steps: [
        {
          title: 'Open Job Deletion and enter job names',
          detail: 'Paste one task name per line (or comma-separated). Click Load Jobs to queue them.',
        },
        {
          title: 'Keep Backup enabled',
          detail: 'Leave "Backup Before Delete" on. When you run, a backup spreadsheet is downloaded automatically before any deletion.',
        },
        {
          title: 'Confirm the deletion',
          detail: 'Click Delete, review the confirmation modal listing the jobs, and confirm. This guards against accidental bulk deletes.',
        },
        {
          title: 'Respond to active-instance prompts',
          detail: 'If a job has running instances, choose Force Finish & Delete to stop them and continue, or Skip to leave that job untouched.',
        },
        {
          title: 'Read the per-job result',
          detail: 'Each card shows live steps with WF (workflow) and TR (trigger) badges, and a final DELETED or FAILED status with ok/warn/error counts.',
        },
      ],
      mockups: ['deletion-input', 'deletion-confirm'],
    },
    {
      heading: '4. Workflow Scenarios',
      intro: 'How the automation decides what to do with a parent workflow.',
      table: {
        columns: ['Scenario', 'Behaviour'],
        rows: [
          ['Standalone task (no workflow)', 'Triggers removed, then task deleted.'],
          ['Task is the only one in a workflow', 'Workflow trigger removed, task detached, workflow deleted, task deleted.'],
          ['Task shares a workflow with others (not being deleted)', 'Only this task is detached from the workflow; the workflow and remaining tasks are preserved.'],
          ['All tasks of a workflow are in the same delete batch', 'The whole workflow (and its trigger) is removed once all its tasks are detached.'],
        ],
      },
    },
    {
      heading: '5. Recovery',
      intro: 'If a deletion must be undone.',
      steps: [
        { title: 'Use the Recovery Center', detail: 'After a backup, the Recovery Center lists recoverable jobs. Click Recover on a job to recreate its task and triggers in UAC.' },
        { title: 'Or re-upload the backup file', detail: 'Use "Upload to Restore" with the downloaded backup spreadsheet to recreate jobs in bulk.' },
      ],
      callout: {
        kind: 'success',
        title: 'Recovery recreates objects disabled',
        body: 'Recovered triggers should be verified and enabled again, exactly like a new creation.',
      },
      mockups: ['deletion-recovery'],
    },
    {
      heading: '6. Post-Deletion Checklist',
      bullets: [
        'Task no longer found in UAC.',
        'No orphaned triggers remain for the task.',
        'Parent workflows are either intact (if shared) or removed (if fully emptied).',
        'No active instances left running.',
        'Backup file stored safely for the retention period.',
      ],
    },
    {
      heading: '7. Troubleshooting',
      table: {
        columns: ['Symptom', 'Likely Cause', 'Action'],
        rows: [
          ['"Task is referenced by workflow"', 'Workflow not detected/detached', 'Re-run; ensure the parent workflow lookup succeeds (task/parent/list)'],
          ['Workflow handling error', 'Unexpected vertex/trigger shape', 'Check the step detail; verify workflow has a trigger that must be removed'],
          ['Deletion blocked by instances', 'Running or Execution-Wait instances', 'Use Force Finish & Delete'],
          ['Trigger not found', 'Non-standard trigger naming', 'Confirm trigger name; automation scans common patterns + list API'],
        ],
      },
    },
  ],
};
