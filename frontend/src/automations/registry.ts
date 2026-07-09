/**
 * Automation Registry
 * Add new automations here — they appear automatically on the landing page.
 */

export interface Automation {
  id:          string;
  title:       string;
  description: string;
  icon:        string;
  status:      'live' | 'beta' | 'coming-soon' | 'maintenance' | 'wip';
  category:    string;
  features:    string[];
  route:       string;
}

export const AUTOMATIONS: Automation[] = [
  {
    id:          'adhoc-launch',
    title:       'Ad-hoc Launch',
    description: 'Global search across tasks, workflows, and triggers. Launch any of them on demand and watch the instance run in real time with cancel, force-finish, halt, rerun, hold and release controls.',
    icon:        'monitor',
    status:      'live',
    category:    'Operations',
    features:    [
      'Global search (task/workflow/trigger)',
      'One-click launch / trigger now',
      'Real-time instance monitoring',
      'Cancel / Force Finish / Halt',
      'Rerun / Hold / Release',
      'Live status until complete',
    ],
    route:       '/adhoc-launch',
  },
  {
    id:          'job-creation',
    title:       'Job Creation',
    description: 'Automate Stonebranch task and time trigger creation from Excel, ODS, or CSV files. Supports ref_job inheritance, complex schedules, and bulk creation.',
    icon:        'job',
    status:      'live',
    category:    'Scheduling',
    features:    [
      'Bulk task + trigger creation',
      'Ref job schedule inheritance',
      'AT/EVERY/UNTIL schedule parsing',
      'Agent auto-resolution',
      'Business Services mapping',
      'Job Builder Chat',
    ],
    route: '/job-creation',
  },
  {
    id:          'agent-control',
    title:       'Agent Control',
    description: 'Suspend and resume Stonebranch agents and agent clusters individually or in bulk. Execute immediately or schedule for a specific date and time.',
    icon:        'agent',
    status:      'live',
    category:    'Operations',
    features:    [
      'Bulk suspend / resume',
      'Agent cluster support',
      'Immediate or scheduled execution',
      'Manual agent name input',
      'Scheduled job management',
      'Real-time execution logs',
    ],
    route: '/agent-control',
  },
  {
    id:          'monitoring',
    title:       'Monitoring & Alerts',
    description: 'Monitor Stonebranch agents and job failures. Send real-time alerts to MS Teams with rich Adaptive Cards.',
    icon:        'monitor',
    status:      'live',
    category:    'Monitoring',
    features:    [
      'Agent offline detection',
      'Job failure alerts',
      'MS Teams Adaptive Cards',
      'Configurable poll interval',
      'Alert deduplication',
      'Operational memo auto-update',
    ],
    route: '/monitoring',
  },
  {
    id:          'job-deletion',
    title:       'Job Deletion',
    description: 'Safely delete Stonebranch tasks, triggers, and workflows following the correct removal sequence with full audit trail.',
    icon:        'delete',
    status:      'live',
    category:    'Management',
    features:    [
      'Trigger → Task safe sequence',
      'Active instance check before delete',
      'Bulk deletion support',
      'Trigger disable before delete',
      'Per-job result reporting',
    ],
    route:       '/job-deletion',
  },
  {
    id:          'bulk-update',
    title:       'Bulk Job Update',
    description: 'Update multiple existing tasks and triggers in one operation — reschedule, migrate agents, rotate credentials.',
    icon:        'update',
    status:      'maintenance',
    category:    'Management',
    features:    [
      'Mass schedule updates',
      'Agent migration',
      'Credential rotation',
      'Business Services update',
    ],
    route:       '#',
  },
  {
    id:          'search-edit',
    title:       'Search & Edit',
    description: 'Look up any task or trigger by name, view all fields, and edit values directly in UAC — with audit trail.',
    icon:        'monitor',
    status:      'live',
    category:    'Operations',
    features:    [
      'Exact name lookup',
      'All fields displayed',
      'Inline field editing',
      'Save directly to UAC',
      'Read-only field protection',
      'Search history',
    ],
    route:       '/search',
  },
];
