/**
 * Task Type Configuration
 * Defines fields, labels, and prompts for each Stonebranch task type.
 * Add new task types here — the Job Builder Chat adapts automatically.
 */

export interface FieldDef {
  key:         string;       // maps to ExcelRow field or pass-through API field
  label:       string;       // display label
  required:    boolean;
  placeholder: string;
  hint?:       string;
}

export interface TaskTypeConfig {
  apiType:     string;       // exact API type value
  label:       string;       // display name
  icon:        string;
  description: string;
  fields:      FieldDef[];
}

export const TASK_TYPES: TaskTypeConfig[] = [
  // ── Unix / Linux ──────────────────────────────────────────────────────────
  {
    apiType:     'taskUnix',
    label:       'Unix / Linux',
    icon:        'LNX',
    description: 'Execute shell scripts or commands on a Linux/Unix agent',
    fields: [
      { key: 'task_name',         label: 'Job Name',           required: true,  placeholder: 'PMFG-BU-AS1-MFG-377-MYJOB' },
      { key: 'description',       label: 'Job Description',    required: false, placeholder: 'APAC - My Job Description' },
      { key: 'agent',             label: 'Job Workstation',    required: true,  placeholder: 'A0021377P3_DD_94' },
      { key: 'command',           label: 'Job Script',         required: true,  placeholder: "/usr/bin/bash -c 'unset TERM && sh /path/to/script.sh'" },
      { key: 'credential',        label: 'Job Login Account',  required: false, placeholder: 'mfgeb' },
      { key: 'first_run_date',    label: 'First Run Date',     required: false, placeholder: '2026-04-27', hint: 'YYYY-MM-DD' },
      { key: 'schedule_string',   label: 'Job Starttime',      required: false, placeholder: 'AT 0330 TIMEZONE Asia/Kolkata MAXDUR 0100', hint: 'AT HHMM TIMEZONE tz [UNTIL HHMM] [EVERY HHMM]' },
      { key: 'max_runtime',       label: 'Maximum Runtime',    required: false, placeholder: '60', hint: 'Minutes (e.g. 0100 = 60 min)' },
      { key: 'business_services', label: 'Business Services',  required: false, placeholder: 'BJA-QAD, BJA-QAD - AP', hint: 'Comma-separated' },
      { key: 'servicenow_ticket', label: 'ServiceNow Ticket',  required: false, placeholder: 'SCTASK0862800' },
    ],
  },

  // ── Windows ───────────────────────────────────────────────────────────────
  {
    apiType:     'taskWindows',
    label:       'Windows',
    icon:        'WIN',
    description: 'Execute scripts or commands on a Windows agent',
    fields: [
      { key: 'task_name',         label: 'Job Name',           required: true,  placeholder: 'WIN-JOB-001' },
      { key: 'description',       label: 'Job Description',    required: false, placeholder: 'Windows batch job' },
      { key: 'agent',             label: 'Job Workstation',    required: true,  placeholder: 'WIN-AGENT-01' },
      { key: 'command',           label: 'Job Script',         required: true,  placeholder: 'C:\\scripts\\myjob.bat' },
      { key: 'credential',        label: 'Job Login Account',  required: false, placeholder: 'svc_account' },
      { key: 'first_run_date',    label: 'First Run Date',     required: false, placeholder: '2026-04-27' },
      { key: 'schedule_string',   label: 'Job Starttime',      required: false, placeholder: 'AT 0800 TIMEZONE America/New_York' },
      { key: 'max_runtime',       label: 'Maximum Runtime',    required: false, placeholder: '60', hint: 'Minutes' },
      { key: 'business_services', label: 'Business Services',  required: false, placeholder: 'BJA-QAD' },
      { key: 'servicenow_ticket', label: 'ServiceNow Ticket',  required: false, placeholder: 'SCTASK...' },
      { key: 'elevateUser',       label: 'Elevate User (UAC)', required: false, placeholder: 'true', hint: 'true/false' },
    ],
  },
];

export const TASK_TYPE_MAP = Object.fromEntries(TASK_TYPES.map(t => [t.apiType, t]));
