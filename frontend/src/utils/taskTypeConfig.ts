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
    icon:        '🐧',
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
    icon:        '🪟',
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

  // ── SQL ───────────────────────────────────────────────────────────────────
  {
    apiType:     'taskSql',
    label:       'SQL',
    icon:        '🗄️',
    description: 'Execute SQL statements against a database connection',
    fields: [
      { key: 'task_name',         label: 'Job Name',           required: true,  placeholder: 'SQL-JOB-001' },
      { key: 'description',       label: 'Job Description',    required: false, placeholder: 'Daily SQL extract' },
      { key: 'connection',        label: 'DB Connection',      required: true,  placeholder: 'PROD_DB_CONNECTION', hint: 'Stonebranch connection name' },
      { key: 'sqlCommand',        label: 'SQL Command',        required: true,  placeholder: 'SELECT * FROM table WHERE date = TODAY' },
      { key: 'credential',        label: 'Credential',         required: false, placeholder: 'db_user' },
      { key: 'first_run_date',    label: 'First Run Date',     required: false, placeholder: '2026-04-27' },
      { key: 'schedule_string',   label: 'Job Starttime',      required: false, placeholder: 'AT 0200 TIMEZONE UTC' },
      { key: 'max_runtime',       label: 'Maximum Runtime',    required: false, placeholder: '30', hint: 'Minutes' },
      { key: 'business_services', label: 'Business Services',  required: false, placeholder: 'BJA-QAD' },
      { key: 'servicenow_ticket', label: 'ServiceNow Ticket',  required: false, placeholder: 'SCTASK...' },
      { key: 'resultProcessing',  label: 'Result Processing',  required: false, placeholder: 'Success Exitcode Range' },
    ],
  },

  // ── Email ─────────────────────────────────────────────────────────────────
  {
    apiType:     'taskEmail',
    label:       'Email',
    icon:        '📧',
    description: 'Send automated email notifications',
    fields: [
      { key: 'task_name',         label: 'Job Name',           required: true,  placeholder: 'EMAIL-NOTIFY-001' },
      { key: 'description',       label: 'Job Description',    required: false, placeholder: 'Daily report email' },
      { key: 'connection',        label: 'Email Connection',   required: true,  placeholder: 'SMTP_CONNECTION' },
      { key: 'toRecipients',      label: 'To',                 required: true,  placeholder: 'user@company.com' },
      { key: 'subject',           label: 'Subject',            required: true,  placeholder: 'Daily Report - ${date}' },
      { key: 'body',              label: 'Body',               required: false, placeholder: 'Please find the daily report attached.' },
      { key: 'first_run_date',    label: 'First Run Date',     required: false, placeholder: '2026-04-27' },
      { key: 'schedule_string',   label: 'Job Starttime',      required: false, placeholder: 'AT 0800 TIMEZONE UTC' },
      { key: 'business_services', label: 'Business Services',  required: false, placeholder: 'BJA-QAD' },
      { key: 'servicenow_ticket', label: 'ServiceNow Ticket',  required: false, placeholder: 'SCTASK...' },
    ],
  },

  // ── Web Service ───────────────────────────────────────────────────────────
  {
    apiType:     'taskWebService',
    label:       'Web Service',
    icon:        '🌐',
    description: 'Call REST or SOAP web service endpoints',
    fields: [
      { key: 'task_name',         label: 'Job Name',           required: true,  placeholder: 'WS-JOB-001' },
      { key: 'description',       label: 'Job Description',    required: false, placeholder: 'API call job' },
      { key: 'url',               label: 'URL',                required: true,  placeholder: 'https://api.example.com/endpoint' },
      { key: 'httpMethod',        label: 'HTTP Method',        required: true,  placeholder: 'POST', hint: 'GET, POST, PUT, DELETE' },
      { key: 'payload',           label: 'Payload / Body',     required: false, placeholder: '{"key": "value"}' },
      { key: 'credential',        label: 'Credential',         required: false, placeholder: 'api_credential' },
      { key: 'first_run_date',    label: 'First Run Date',     required: false, placeholder: '2026-04-27' },
      { key: 'schedule_string',   label: 'Job Starttime',      required: false, placeholder: 'AT 0100 TIMEZONE UTC' },
      { key: 'max_runtime',       label: 'Maximum Runtime',    required: false, placeholder: '10', hint: 'Minutes' },
      { key: 'business_services', label: 'Business Services',  required: false, placeholder: 'BJA-QAD' },
      { key: 'servicenow_ticket', label: 'ServiceNow Ticket',  required: false, placeholder: 'SCTASK...' },
    ],
  },

  // ── Timer / Sleep ─────────────────────────────────────────────────────────
  {
    apiType:     'taskSleep',
    label:       'Timer / Sleep',
    icon:        '⏱️',
    description: 'Pause workflow execution for a specified duration',
    fields: [
      { key: 'task_name',         label: 'Job Name',           required: true,  placeholder: 'SLEEP-JOB-001' },
      { key: 'description',       label: 'Job Description',    required: false, placeholder: 'Wait 5 minutes' },
      { key: 'sleepAmount',       label: 'Sleep Duration',     required: true,  placeholder: '5', hint: 'Amount in sleepType units' },
      { key: 'sleepType',         label: 'Sleep Type',         required: true,  placeholder: 'Minutes', hint: 'Seconds, Minutes, Hours' },
      { key: 'first_run_date',    label: 'First Run Date',     required: false, placeholder: '2026-04-27' },
      { key: 'schedule_string',   label: 'Job Starttime',      required: false, placeholder: 'AT 0100 TIMEZONE UTC' },
      { key: 'business_services', label: 'Business Services',  required: false, placeholder: 'BJA-QAD' },
      { key: 'servicenow_ticket', label: 'ServiceNow Ticket',  required: false, placeholder: 'SCTASK...' },
    ],
  },

  // ── Manual ────────────────────────────────────────────────────────────────
  {
    apiType:     'taskManual',
    label:       'Manual',
    icon:        '👤',
    description: 'Task requiring manual human intervention to complete',
    fields: [
      { key: 'task_name',         label: 'Job Name',           required: true,  placeholder: 'MANUAL-JOB-001' },
      { key: 'description',       label: 'Job Description',    required: false, placeholder: 'Manual approval required' },
      { key: 'first_run_date',    label: 'First Run Date',     required: false, placeholder: '2026-04-27' },
      { key: 'schedule_string',   label: 'Job Starttime',      required: false, placeholder: 'AT 0900 TIMEZONE UTC' },
      { key: 'business_services', label: 'Business Services',  required: false, placeholder: 'BJA-QAD' },
      { key: 'servicenow_ticket', label: 'ServiceNow Ticket',  required: false, placeholder: 'SCTASK...' },
    ],
  },
];

export const TASK_TYPE_MAP = Object.fromEntries(TASK_TYPES.map(t => [t.apiType, t]));
