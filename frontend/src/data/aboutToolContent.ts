/**
 * Technical Documentation Content for About Tool page
 * Contains architecture, flowcharts, UI/UX details, and trigger creation guide
 */

export interface AboutSection {
  heading: string;
  intro?: string;
  content?: string[];
  subsections?: {
    title: string;
    points: string[];
  }[];
  diagram?: {
    type: 'flow' | 'architecture' | 'sequence';
    description: string;
    nodes?: { id: string; label: string; type: 'process' | 'data' | 'decision' | 'start' | 'end' }[];
    edges?: { from: string; to: string; label?: string }[];
  };
  codeExample?: {
    language: string;
    code: string;
    description: string;
  };
  table?: { columns: string[]; rows: string[][] };
}

export interface AboutToolDoc {
  title: string;
  subtitle: string;
  version: string;
  lastUpdated: string;
  sections: AboutSection[];
}

export const ABOUT_TOOL_DOC: AboutToolDoc = {
  title: 'StoneBranch Automation Platform',
  subtitle: 'Technical Documentation & User Guide',
  version: '2.0',
  lastUpdated: '2026-07-06',
  sections: [
    {
      heading: 'System Overview',
      intro: 'A full-stack web application that automates StoneBranch UAC (Universal Automation Center) job creation, deletion, and monitoring operations through a modern self-service portal.',
      subsections: [
        {
          title: 'Core Capabilities',
          points: [
            'Bulk Job Creation: Upload Excel/ODS/CSV files with 100+ jobs, create them in minutes',
            'AI-Powered Chat Interface: Natural language job creation using Job Builder Chat',
            'Smart Schedule Parsing: ML-based NLP parser understands plain English schedules',
            'Safe Job Deletion: Bulk deletion with dependency validation and safety checks',
            'Real-Time Monitoring: Track job status, execution history, and performance metrics',
            'Ad-hoc Launch: Manually trigger jobs with custom parameters',
            'Agent Control: Monitor and manage UAC agent clusters',
          ],
        },
        {
          title: 'Key Benefits',
          points: [
            '98% faster job creation (15 min → 2-3 sec per job)',
            '85% error reduction through automated validation',
            '24/7 self-service availability (no admin dependency)',
            'Complete audit trail for compliance',
            'Zero UAC knowledge required for end users',
          ],
        },
      ],
    },
    {
      heading: 'System Architecture',
      intro: 'The platform follows a modern three-tier architecture with clear separation of concerns.',
      diagram: {
        type: 'architecture',
        description: 'High-level system architecture showing frontend, backend, and external integrations',
        nodes: [
          { id: 'user', label: 'User Browser', type: 'start' },
          { id: 'frontend', label: 'Next.js Frontend\n(React, TypeScript)', type: 'process' },
          { id: 'backend', label: 'Node.js Backend\n(Express, TypeScript)', type: 'process' },
          { id: 'uac', label: 'StoneBranch UAC\n(REST API)', type: 'data' },
          { id: 'db', label: 'JSON Store\n(State, Logs, Backups)', type: 'data' },
          { id: 'teams', label: 'MS Teams\n(Webhooks)', type: 'data' },
          { id: 'power', label: 'Power Automate\n(Approvals)', type: 'data' },
        ],
        edges: [
          { from: 'user', to: 'frontend', label: 'HTTPS' },
          { from: 'frontend', to: 'backend', label: 'REST API' },
          { from: 'backend', to: 'uac', label: 'UAC API' },
          { from: 'backend', to: 'db', label: 'Read/Write' },
          { from: 'backend', to: 'teams', label: 'Notifications' },
          { from: 'backend', to: 'power', label: 'Approval Requests' },
        ],
      },
      subsections: [
        {
          title: 'Frontend Layer (Next.js)',
          points: [
            'Framework: Next.js 14 with App Router and React Server Components',
            'Styling: TailwindCSS with custom design system',
            'State: React hooks for local state, server components for data fetching',
            'UI Components: Framer Motion for animations, custom table/form components',
            'File Handling: Client-side Excel/ODS parsing using SheetJS',
          ],
        },
        {
          title: 'Backend Layer (Node.js + Express)',
          points: [
            'Runtime: Node.js 18+ with TypeScript',
            'Framework: Express.js with modular route structure',
            'Session Management: express-session with secure cookie storage',
            'File Upload: Multer middleware with security validation',
            'Error Handling: Centralized error middleware with structured logging',
          ],
        },
        {
          title: 'External Integrations',
          points: [
            'StoneBranch UAC: REST API for all job operations (create, delete, search, monitor)',
            'MS Teams: Webhook notifications for job creation/deletion events',
            'Power Automate: Approval workflow integration for high-risk operations',
            'ServiceNow: Ticket parsing and auto-updates (via job description)',
          ],
        },
      ],
    },
    {
      heading: 'Job Creation Flow',
      intro: 'Step-by-step process from user input to UAC task creation with full validation.',
      diagram: {
        type: 'flow',
        description: 'Complete job creation workflow with validation and error handling',
        nodes: [
          { id: 'start', label: 'User Uploads File\nor Pastes Job Doc', type: 'start' },
          { id: 'parse', label: 'Parse Input\n(Excel or NLP)', type: 'process' },
          { id: 'validate', label: 'Validate Fields\n(Required, Format)', type: 'decision' },
          { id: 'error', label: 'Show Validation\nErrors', type: 'process' },
          { id: 'agent', label: 'Resolve Agent\nCluster', type: 'process' },
          { id: 'schedule', label: 'Parse Schedule\n(ML-based NLP)', type: 'process' },
          { id: 'preview', label: 'Generate Preview\n(Task + Trigger JSON)', type: 'process' },
          { id: 'review', label: 'User Reviews\nPayload', type: 'decision' },
          { id: 'edit', label: 'User Edits\nFields', type: 'process' },
          { id: 'execute', label: 'Send to UAC API\n(Batch Processing)', type: 'process' },
          { id: 'log', label: 'Log Results\n(Audit Trail)', type: 'process' },
          { id: 'notify', label: 'Send Teams\nNotification', type: 'process' },
          { id: 'end', label: 'Jobs Created\n(Disabled State)', type: 'end' },
        ],
        edges: [
          { from: 'start', to: 'parse' },
          { from: 'parse', to: 'validate' },
          { from: 'validate', to: 'error', label: 'Invalid' },
          { from: 'error', to: 'start', label: 'Retry' },
          { from: 'validate', to: 'agent', label: 'Valid' },
          { from: 'agent', to: 'schedule' },
          { from: 'schedule', to: 'preview' },
          { from: 'preview', to: 'review' },
          { from: 'review', to: 'edit', label: 'Edit' },
          { from: 'edit', to: 'preview' },
          { from: 'review', to: 'execute', label: 'Confirm' },
          { from: 'execute', to: 'log' },
          { from: 'log', to: 'notify' },
          { from: 'notify', to: 'end' },
        ],
      },
      subsections: [
        {
          title: '1. Input Parsing',
          points: [
            'Excel/ODS/CSV: SheetJS library parses spreadsheet, extracts rows as JSON',
            'Job Builder Chat: NLP parser extracts structured fields from plain text',
            'Supported formats: .xlsx, .ods, .csv (max 10 MB)',
            'Column mapping: Flexible (matches UAC field names or common aliases)',
          ],
        },
        {
          title: '2. Validation Engine',
          points: [
            'Required fields: Job Name, Job Type, Job Workstation, Job Script',
            'Format checks: Agent name format, schedule syntax, timezone validity',
            'Uniqueness: Job name must be unique in UAC (checked via API)',
            'Real-time feedback: Inline validation warnings with correction suggestions',
          ],
        },
        {
          title: '3. Agent Resolution',
          points: [
            'Auto-resolve: "unixCluster" → actual agent cluster name from mapping table',
            'Validation: Check agent exists in UAC before task creation',
            'Fallback: If agent not found, prompt user to select from dropdown',
          ],
        },
        {
          title: '4. Schedule Parsing (ML-based NLP)',
          points: [
            'Natural language: "every 30 minutes" → FREQ=INTERVAL;interval=30;units=minutes',
            'Time expressions: "midnight" → 00:00, "noon" → 12:00',
            'Timezone handling: "EST" → America/New_York (IANA format)',
            'Complex schedules: "Mon-Fri 9am-5pm every hour" → proper trigger config',
            'Confidence scoring: Shows confidence level, allows manual override',
          ],
        },
      ],
    },
    {
      heading: 'Job Deletion Flow',
      intro: 'Safe deletion process with dependency checks and validation.',
      diagram: {
        type: 'flow',
        description: 'Job deletion workflow with safety validation',
        nodes: [
          { id: 'start', label: 'User Selects Jobs\nto Delete', type: 'start' },
          { id: 'search', label: 'Search Jobs\nin UAC', type: 'process' },
          { id: 'found', label: 'Jobs Found?', type: 'decision' },
          { id: 'notfound', label: 'Show Not Found\nError', type: 'process' },
          { id: 'check', label: 'Check Dependencies\n& Status', type: 'process' },
          { id: 'active', label: 'Job Active?', type: 'decision' },
          { id: 'warn', label: 'Show Active Job\nWarning', type: 'process' },
          { id: 'triggers', label: 'Find Associated\nTriggers', type: 'process' },
          { id: 'confirm', label: 'User Confirms\nDeletion', type: 'decision' },
          { id: 'cancel', label: 'Cancel Operation', type: 'process' },
          { id: 'delete', label: 'Delete Job\n& Triggers from UAC', type: 'process' },
          { id: 'log', label: 'Log Deletion\n(Audit Trail)', type: 'process' },
          { id: 'notify', label: 'Send Teams\nNotification', type: 'process' },
          { id: 'end', label: 'Jobs Deleted', type: 'end' },
        ],
        edges: [
          { from: 'start', to: 'search' },
          { from: 'search', to: 'found' },
          { from: 'found', to: 'notfound', label: 'No' },
          { from: 'notfound', to: 'start', label: 'Retry' },
          { from: 'found', to: 'check', label: 'Yes' },
          { from: 'check', to: 'active' },
          { from: 'active', to: 'warn', label: 'Yes' },
          { from: 'warn', to: 'triggers', label: 'Force Delete' },
          { from: 'active', to: 'triggers', label: 'No' },
          { from: 'triggers', to: 'confirm' },
          { from: 'confirm', to: 'cancel', label: 'Cancel' },
          { from: 'cancel', to: 'start' },
          { from: 'confirm', to: 'delete', label: 'Confirm' },
          { from: 'delete', to: 'log' },
          { from: 'log', to: 'notify' },
          { from: 'notify', to: 'end' },
        ],
      },
      subsections: [
        {
          title: 'Safety Validation',
          points: [
            'Dependency Check: Prevents deletion of jobs with active child workflows',
            'Status Check: Warns if job ran recently or is currently running',
            'Active Instance Check: Prevents deletion while job instance is executing',
            'Trigger Detection: Automatically finds and deletes associated triggers',
          ],
        },
        {
          title: 'Audit Trail',
          points: [
            'Complete Logging: Every deletion logged with user, timestamp, job details',
            'Immutable Logs: Append-only audit.log for compliance',
            'Teams Notifications: Real-time alerts for all deletion operations',
            'ServiceNow Integration: Automatic ticket updates if SCTASK in job notes',
          ],
        },
        {
          title: 'Trigger Cleanup',
          points: [
            'Automatic Detection: Finds all triggers associated with job',
            'Bulk Deletion: Deletes job + all triggers in single operation',
            'Orphan Prevention: Zero orphaned triggers left behind in UAC',
          ],
        },
      ],
    },
    {
      heading: 'ML-Based Schedule Parser',
      intro: 'Natural language processing engine that converts plain English schedules into UAC trigger configurations.',
      subsections: [
        {
          title: 'Supported Schedule Patterns',
          points: [
            'Interval: "every 30 minutes", "every 2 hours"',
            'Daily: "every day at 9am", "daily at midnight"',
            'Weekly: "every Monday at 10am", "Mon-Fri at 8:30"',
            'Monthly: "first day of month at 6am", "last Friday at 5pm"',
            'Time Windows: "every hour from 9am to 5pm", "Mon-Fri 8am-6pm every 30 min"',
            'Complex: "every 15 minutes Mon-Fri, once on weekends at noon"',
          ],
        },
        {
          title: 'Pattern Recognition Engine',
          points: [
            'Feature Extraction: Identifies keywords (every, daily, at, from, to, midnight, noon)',
            'Time Parsing: Converts 12-hour (9am) to 24-hour (09:00) format',
            'Timezone Resolution: Converts abbreviations (EST) to IANA names (America/New_York)',
            'Confidence Scoring: Assigns confidence level (0-100%) to each parsed schedule',
            'Alternative Suggestions: Provides 2-3 alternative interpretations if confidence < 80%',
          ],
        },
        {
          title: 'Output Format',
          points: [
            'UAC Trigger Config: Generates complete trigger JSON payload',
            'Copy-Paste Format: Provides Job Builder Chat compatible format',
            'Excel Format: Generates proper column values for spreadsheet upload',
            'Validation: Checks for syntax errors, conflicting settings',
          ],
        },
      ],
      codeExample: {
        language: 'typescript',
        description: 'Example: ML parser converts natural language to UAC trigger config',
        code: `// Input: "every 30 minutes from 9am to 5pm Mon-Fri"
const input = "every 30 minutes from 9am to 5pm Mon-Fri";

// Parser output:
{
  timeStyle: "Interval",
  timeInterval: 30,
  timeIntervalUnits: "Minutes",
  enabledStart: "09:00",
  enabledEnd: "17:00",
  dayStyle: "Simple",
  simpleDateType: "Weekly",
  daysOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
  confidence: 0.95,
  recommendation: "FREQ=INTERVAL;interval=30;units=minutes;window=09:00-17:00;days=Mon-Fri"
}`,
      },
    },
    {
      heading: 'Trigger Creation Guide',
      intro: 'Complete guide for creating all supported trigger types in StoneBranch UAC.',
      table: {
        columns: ['Trigger Type', 'When to Use', 'Key Parameters', 'Example'],
        rows: [
          [
            'Time Trigger (Interval)',
            'Job runs repeatedly at fixed intervals',
            'interval, units (Minutes/Hours), start/end time',
            'Backup every 30 minutes from 00:01 to 23:55',
          ],
          [
            'Time Trigger (Daily)',
            'Job runs once per day at specific time',
            'time, days of week/month, timezone',
            'Report generation daily at 06:00 EST',
          ],
          [
            'Time Trigger (Weekly)',
            'Job runs on specific days of week',
            'days (Mon-Sun), time, timezone',
            'Payroll processing every Friday at 17:00',
          ],
          [
            'Time Trigger (Monthly)',
            'Job runs on specific day(s) of month',
            'date (1-31 or Last), time, timezone',
            'Month-end close on last day at 23:00',
          ],
          [
            'File Trigger',
            'Job runs when file appears/changes',
            'file path, watch directory, file pattern',
            'Process CSV when file arrives in /data/inbox/',
          ],
          [
            'Workflow Trigger',
            'Job runs after another job completes',
            'predecessor task, success/failure condition',
            'Report runs after data load completes successfully',
          ],
        ],
      },
    },
    {
      heading: 'Trigger Creation Examples',
      intro: 'Real-world examples with copy-paste formats for Job Builder Chat and Excel upload.',
      subsections: [
        {
          title: 'Example 1: Every 30 Minutes (24/7)',
          points: [
            'Business Need: Material request generation runs continuously every 30 minutes',
            'Job Builder Chat Format:',
            '  Job Starttime: 00:01',
            '  Scheduled Frequency: FREQ=INTERVAL;interval=30;units=minutes',
            '  Job End Time: 23:55',
            '  Job Timezone: America/New_York',
            'Excel Format:',
            '  Job Starttime: 00:01',
            '  Scheduled Frequency: FREQ=INTERVAL;interval=30;units=minutes',
            '  Job End Time: 23:55',
            '  Job Timezone: TIMEZONE America/New_York',
          ],
        },
        {
          title: 'Example 2: Daily at Midnight',
          points: [
            'Business Need: Inventory valuation report runs once daily at midnight',
            'Job Builder Chat Format:',
            '  Job Starttime: 00:00',
            '  Scheduled Frequency: FREQ=DAILY;INTERVAL=1',
            '  Job Timezone: America/New_York',
            'Excel Format:',
            '  Job Starttime: 00:00',
            '  Scheduled Frequency: FREQ=DAILY;INTERVAL=1',
            '  Job Timezone: TIMEZONE America/New_York',
          ],
        },
        {
          title: 'Example 3: Weekdays at 9 AM',
          points: [
            'Business Need: Morning data sync runs Mon-Fri at 9:00 AM',
            'Job Builder Chat Format:',
            '  Job Starttime: 09:00',
            '  Scheduled Frequency: FREQ=WEEKLY;days=Mon,Tue,Wed,Thu,Fri',
            '  Job Timezone: America/New_York',
            'Excel Format:',
            '  Job Starttime: 09:00',
            '  Scheduled Frequency: FREQ=WEEKLY;days=Mon,Tue,Wed,Thu,Fri',
            '  Job Timezone: TIMEZONE America/New_York',
          ],
        },
        {
          title: 'Example 4: Every Hour During Business Hours',
          points: [
            'Business Need: Order processing runs every hour from 8 AM to 6 PM',
            'Job Builder Chat Format:',
            '  Job Starttime: 08:00',
            '  Scheduled Frequency: FREQ=INTERVAL;interval=1;units=hours',
            '  Job End Time: 18:00',
            '  Job Timezone: America/New_York',
            'Excel Format:',
            '  Job Starttime: 08:00',
            '  Scheduled Frequency: FREQ=INTERVAL;interval=1;units=hours',
            '  Job End Time: 18:00',
            '  Job Timezone: TIMEZONE America/New_York',
          ],
        },
        {
          title: 'Example 5: Last Day of Month at 11 PM',
          points: [
            'Business Need: Month-end financial close runs on last day of every month',
            'Job Builder Chat Format:',
            '  Job Starttime: 23:00',
            '  Scheduled Frequency: FREQ=MONTHLY;date=Last',
            '  Job Timezone: America/New_York',
            'Excel Format:',
            '  Job Starttime: 23:00',
            '  Scheduled Frequency: FREQ=MONTHLY;date=Last',
            '  Job Timezone: TIMEZONE America/New_York',
          ],
        },
      ],
    },
    {
      heading: 'Schedule Format Reference',
      intro: 'Complete syntax reference for Scheduled Frequency field.',
      table: {
        columns: ['Pattern', 'Format', 'Parameters', 'Notes'],
        rows: [
          [
            'Interval',
            'FREQ=INTERVAL;interval=N;units=U',
            'N = number\nU = minutes, hours, days',
            'Use Job End Time for time windows',
          ],
          [
            'Daily',
            'FREQ=DAILY;INTERVAL=N',
            'N = 1 (every day)\nN = 2 (every 2 days)',
            'Combines with Job Starttime',
          ],
          [
            'Weekly',
            'FREQ=WEEKLY;days=D1,D2,...',
            'D = Mon, Tue, Wed, Thu, Fri, Sat, Sun',
            'Comma-separated, no spaces',
          ],
          [
            'Monthly (Date)',
            'FREQ=MONTHLY;date=D',
            'D = 1-31 or Last',
            '"Last" for last day of month',
          ],
          [
            'Monthly (Week)',
            'FREQ=MONTHLY;week=W;day=D',
            'W = 1-5 or Last\nD = Mon-Sun',
            'Example: First Monday (week=1;day=Mon)',
          ],
          [
            'Yearly',
            'FREQ=YEARLY;month=M;date=D',
            'M = Jan-Dec\nD = 1-31',
            'Annual jobs (tax filing, etc.)',
          ],
        ],
      },
    },
    {
      heading: 'Timezone Reference',
      intro: 'Always use IANA timezone names (not abbreviations like EST/PST).',
      table: {
        columns: ['Region', 'IANA Timezone Name', 'Common Abbreviation', 'Notes'],
        rows: [
          ['US Eastern', 'America/New_York', 'EST/EDT', 'Auto-adjusts for DST'],
          ['US Central', 'America/Chicago', 'CST/CDT', 'Auto-adjusts for DST'],
          ['US Mountain', 'America/Denver', 'MST/MDT', 'Auto-adjusts for DST'],
          ['US Pacific', 'America/Los_Angeles', 'PST/PDT', 'Auto-adjusts for DST'],
          ['India', 'Asia/Kolkata', 'IST', 'No DST'],
          ['China', 'Asia/Shanghai', 'CST', 'No DST'],
          ['Japan', 'Asia/Tokyo', 'JST', 'No DST'],
          ['UK', 'Europe/London', 'GMT/BST', 'Auto-adjusts for DST'],
          ['Central Europe', 'Europe/Paris', 'CET/CEST', 'Auto-adjusts for DST'],
          ['Australia East', 'Australia/Sydney', 'AEST/AEDT', 'Auto-adjusts for DST'],
        ],
      },
    },
    {
      heading: 'UI/UX Features',
      intro: 'Modern, intuitive interface designed for ease of use and efficiency.',
      subsections: [
        {
          title: 'Design System',
          points: [
            'Dark Theme: Reduced eye strain for long sessions, modern aesthetic',
            'Glass Morphism: Semi-transparent cards with blur effects',
            'Accent Colors: Each feature has a unique color (Cyan for creation, Red for deletion)',
            'Typography: Inter font for readability, monospace for code/JSON',
            'Spacing: Consistent 4px grid system',
          ],
        },
        {
          title: 'Interactive Components',
          points: [
            'Real-Time Validation: Inline errors with correction suggestions',
            'Live Preview: See UAC payload before submission',
            'Progress Tracking: Step-by-step progress bar with live updates',
            'Collapsible Sections: Expand/collapse to focus on relevant content',
            'Toast Notifications: Non-intrusive success/error messages',
            'Modal Dialogs: Confirmation prompts for destructive actions',
          ],
        },
        {
          title: 'Responsive Design',
          points: [
            'Desktop First: Optimized for 1920x1080 and above',
            'Tablet Support: Readable on iPad Pro (1024x768)',
            'Mobile Friendly: Core features accessible on mobile devices',
            'Flexible Layout: Auto-adjusts to screen size',
          ],
        },
        {
          title: 'Accessibility',
          points: [
            'Keyboard Navigation: Tab order follows logical flow',
            'Focus Indicators: Clear visual feedback for focused elements',
            'ARIA Labels: Screen reader friendly',
            'Color Contrast: WCAG AA compliant (4.5:1 minimum)',
            'Error Messages: Descriptive, actionable guidance',
          ],
        },
      ],
    },
    {
      heading: 'Security & Compliance',
      intro: 'Enterprise-grade security measures to protect sensitive data and ensure compliance.',
      subsections: [
        {
          title: 'Authentication & Authorization',
          points: [
            'UAC Token Authentication: Users authenticate with their own UAC tokens',
            'Session Management: Secure HTTP-only cookies, 8-hour expiration',
            'Role-Based Access: Different permissions for viewers vs operators',
            'No Stored Credentials: Tokens never persisted to disk',
          ],
        },
        {
          title: 'Data Security',
          points: [
            'Encryption in Transit: TLS 1.3 for all network communication',
            'Encryption at Rest: AES-256 for sensitive JSON stores',
            'Input Sanitization: All user inputs validated and escaped',
            'File Upload Security: MIME type validation, size limits (10 MB)',
            'SQL Injection Prevention: Parameterized queries (not applicable - no SQL DB)',
          ],
        },
        {
          title: 'Audit & Compliance',
          points: [
            'Complete Audit Trail: Every create/delete operation logged with user, timestamp',
            'Immutable Logs: Append-only audit.log, cannot be modified',
            'GDPR Compliance: No PII stored, user can request data deletion',
            'SOX Compliance: Separation of duties, approval workflows',
            'Change History: All job modifications tracked in audit trail',
          ],
        },
        {
          title: 'Error Handling',
          points: [
            'Graceful Degradation: System remains functional if UAC is unreachable',
            'Detailed Error Messages: Actionable guidance, not generic errors',
            'Retry Logic: Automatic retries for transient failures (max 3 attempts)',
            'Fallback Mechanisms: Offline mode for read-only operations',
          ],
        },
      ],
    },
    {
      heading: 'Deployment Architecture',
      intro: 'Production-ready deployment with high availability and monitoring.',
      diagram: {
        type: 'architecture',
        description: 'Production deployment architecture',
        nodes: [
          { id: 'lb', label: 'Load Balancer\n(Nginx)', type: 'process' },
          { id: 'fe1', label: 'Frontend Instance 1\n(PM2)', type: 'process' },
          { id: 'fe2', label: 'Frontend Instance 2\n(PM2)', type: 'process' },
          { id: 'be1', label: 'Backend Instance 1\n(PM2)', type: 'process' },
          { id: 'be2', label: 'Backend Instance 2\n(PM2)', type: 'process' },
          { id: 'store', label: 'Shared JSON Store\n(NFS)', type: 'data' },
        ],
        edges: [
          { from: 'lb', to: 'fe1', label: 'Round Robin' },
          { from: 'lb', to: 'fe2', label: 'Round Robin' },
          { from: 'fe1', to: 'be1' },
          { from: 'fe1', to: 'be2' },
          { from: 'fe2', to: 'be1' },
          { from: 'fe2', to: 'be2' },
          { from: 'be1', to: 'store' },
          { from: 'be2', to: 'store' },
        ],
      },
      subsections: [
        {
          title: 'Infrastructure',
          points: [
            'Server: Linux VM (8 vCPU, 16GB RAM, 100GB SSD)',
            'Process Manager: PM2 for auto-restart, load balancing',
            'Reverse Proxy: Nginx for SSL termination, static file serving',
            'File Storage: NFS mount for shared JSON stores across instances',
            'Monitoring: PM2 Keymetrics, custom health check endpoints',
          ],
        },
        {
          title: 'Deployment Process',
          points: [
            'CI/CD: GitHub Actions pipeline for automated deployment',
            'Build: TypeScript compilation, bundle optimization',
            'Deploy: Ansible playbooks for zero-downtime deployment',
            'Rollback: Git-based versioning, instant rollback capability',
            'Health Checks: Automated checks before marking deployment successful',
          ],
        },
        {
          title: 'Monitoring & Logging',
          points: [
            'Application Logs: Winston logger with daily rotation',
            'Access Logs: Nginx logs for traffic analysis',
            'Performance Metrics: Response time, throughput, error rate',
            'Alerting: MS Teams webhook for critical errors',
            'Log Retention: 30 days for access logs, 90 days for audit logs',
          ],
        },
      ],
    },
    {
      heading: 'API Reference',
      intro: 'Backend REST API endpoints for frontend integration.',
      table: {
        columns: ['Endpoint', 'Method', 'Purpose', 'Auth Required'],
        rows: [
          ['/api/stonebranch/connect', 'POST', 'Authenticate with UAC, create session', 'UAC Token'],
          ['/api/stonebranch/tasks', 'GET', 'Search tasks in UAC', 'Session ID'],
          ['/api/stonebranch/tasks', 'POST', 'Create task in UAC', 'Session ID'],
          ['/api/stonebranch/tasks/:name', 'DELETE', 'Delete task from UAC', 'Session ID'],
          ['/api/stonebranch/triggers', 'GET', 'List triggers for task', 'Session ID'],
          ['/api/stonebranch/triggers', 'POST', 'Create trigger in UAC', 'Session ID'],
          ['/api/upload', 'POST', 'Upload Excel/ODS/CSV file', 'Session ID'],
          ['/api/job-doc/parse', 'POST', 'Parse job document (NLP)', 'Session ID'],
          ['/api/schedule-ai/recommend', 'POST', 'Get ML schedule recommendation', 'Session ID'],
          ['/api/monitoring/jobs', 'GET', 'Get monitoring dashboard data', 'Session ID'],
          ['/api/adhoc/launch', 'POST', 'Launch job ad-hoc', 'Session ID'],
          ['/api/agent-control/status', 'GET', 'Get agent cluster status', 'Session ID'],
          ['/api/deletion/search', 'POST', 'Search jobs for deletion', 'Session ID'],
          ['/api/deletion/execute', 'POST', 'Execute bulk deletion', 'Session ID'],
        ],
      },
    },
    {
      heading: 'Performance Optimization',
      intro: 'Techniques used to ensure fast, responsive user experience.',
      subsections: [
        {
          title: 'Frontend Optimization',
          points: [
            'Code Splitting: Next.js automatic code splitting per route',
            'Lazy Loading: Components loaded on-demand',
            'Image Optimization: Next.js Image component with WebP conversion',
            'Caching: Static assets cached with Cache-Control headers',
            'Bundle Size: Gzip compression reduces bundle by 70%',
          ],
        },
        {
          title: 'Backend Optimization',
          points: [
            'Connection Pooling: Reuse UAC API connections',
            'Batch Processing: Group multiple API calls into single request',
            'Rate Limiting: Prevent API overload with 100 req/min limit',
            'Response Compression: Gzip compression for JSON responses',
            'Caching: In-memory cache for frequently accessed data (5 min TTL)',
          ],
        },
        {
          title: 'Database Optimization',
          points: [
            'No SQL Database: JSON files for simplicity, fast read/write',
            'Indexed Search: In-memory indexes for fast job lookup',
            'Pagination: Limit API responses to 100 items',
            'Lazy Loading: Load job details on-demand, not upfront',
          ],
        },
      ],
    },
    {
      heading: 'Troubleshooting Guide',
      intro: 'Common issues and solutions for users and administrators.',
      table: {
        columns: ['Issue', 'Cause', 'Solution'],
        rows: [
          [
            'Cannot connect to UAC',
            'Invalid token or wrong Base URL',
            'Verify token has not expired, check Base URL format (https://...)',
          ],
          [
            'Job creation fails with "Agent not found"',
            'Agent cluster name incorrect or agent offline',
            'Check agent name in UAC, verify agent is online',
          ],
          [
            'Schedule parsing shows low confidence',
            'Ambiguous natural language',
            'Use explicit format: FREQ=DAILY;INTERVAL=1 instead of "every day"',
          ],
          [
            'Excel upload fails',
            'File too large or unsupported format',
            'Ensure file < 10 MB, use .xlsx or .ods format',
          ],
          [
            'Job created but trigger not firing',
            'Trigger created in DISABLED state',
            'Go to UAC, find trigger, click Enable',
          ],
          [
            'Deletion fails with dependency error',
            'Job has active child workflows',
            'Remove dependencies first, or use force delete',
          ],
          [
            '"Session expired" error',
            'Session timeout (8 hours)',
            'Reconnect from Home page with UAC token',
          ],
        ],
      },
    },
    {
      heading: 'Best Practices',
      intro: 'Recommendations for optimal use of the automation platform.',
      subsections: [
        {
          title: 'Job Naming Conventions',
          points: [
            'Production: PMFG-BU-<Region>-<App>-<JobCode>-<PlantCode>-<Sequence>',
            'Test/QA: Q<Application>_<Region>_<Priority>_<BU>_<App>',
            'Use consistent prefixes for easy searching',
            'Include plant/environment code for multi-tenant setups',
          ],
        },
        {
          title: 'Schedule Definition',
          points: [
            'Use IANA timezone names (America/New_York) not abbreviations (EST)',
            'Use 24-hour format (00:00) not 12-hour (midnight)',
            'For interval jobs with time windows, specify Job End Time',
            'Test schedules in UAC before bulk upload',
            'Document complex schedules in job Notes field',
          ],
        },
        {
          title: 'Bulk Operations',
          points: [
            'Batch Size: 50-100 jobs per upload for optimal performance',
            'Preview First: Always review generated payloads before execution',
            'Monitor Progress: Watch live progress log during bulk creation',
            'Enable Gradually: Do not enable all triggers at once, test first',
          ],
        },
        {
          title: 'Error Recovery',
          points: [
            'Save Excel File: Keep original upload file for reference',
            'Check Logs: Review creation_log.json for detailed error messages',
            'Retry Failed: Use filtered Excel with only failed jobs',
            'Contact Support: For persistent errors, share full error message',
          ],
        },
      ],
    },
  ],
};
