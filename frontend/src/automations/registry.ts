/**
 * Automation Registry
 * Add new automations here — they appear automatically on the landing page.
 */

export interface Automation {
  id:          string;
  title:       string;
  description: string;
  icon:        string;        // SVG path or emoji
  status:      'live' | 'beta' | 'coming-soon';
  category:    string;
  features:    string[];
  route:       string;        // internal route or '#' for modal
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
  // ── Add future automations below ──────────────────────────────────────────
  // {
  //   id:          'job-monitoring',
  //   title:       'Job Monitoring',
  //   description: 'Real-time monitoring dashboard for Stonebranch task instances.',
  //   icon:        'monitor',
  //   status:      'coming-soon',
  //   category:    'Monitoring',
  //   features:    ['Live status feed', 'Alert configuration', 'SLA tracking'],
  //   route:       '/monitoring',
  // },
  // {
  //   id:          'bulk-update',
  //   title:       'Bulk Job Update',
  //   description: 'Update multiple existing tasks and triggers in one operation.',
  //   icon:        'update',
  //   status:      'coming-soon',
  //   category:    'Management',
  //   features:    ['Mass schedule updates', 'Agent migration', 'Credential rotation'],
  //   route:       '/bulk-update',
  // },
];
