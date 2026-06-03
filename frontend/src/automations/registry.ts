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
    description: 'Suspend and resume Stonebranch agents individually or in bulk. Execute immediately or schedule for a specific date and time.',
    icon:        'agent',
    status:      'maintenance',
    category:    'Operations',
    features:    [
      'Bulk suspend / resume',
      'Immediate or scheduled execution',
      'Agent and cluster support',
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
    status:      'maintenance',
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
];
