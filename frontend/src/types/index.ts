export interface JobRow {
  task_name:          string;
  task_type:          string;
  agent:              string;
  command:            string;
  credential:         string;
  description:        string;
  enabled:            string;
  first_run_date:     string;
  start_time:         string;
  timezone:           string;
  frequency_type:     string;
  frequency_value:    string;
  max_runtime:        string;
  ref_job:            string;
  business_services?: string;
  servicenow_ticket?: string;
  schedule_string?:   string;
  [key: string]: any;
}

export interface ParsedFileData {
  filename: string;
  rows: JobRow[];
  totalRows: number;
}

export interface ExecutionStatus {
  id: string;
  type: 'task' | 'trigger';
  name: string;
  status: 'pending' | 'success' | 'failed';
  message?: string;
  sbId?: string;
  createdAt: string;
  completedAt?: string;
}

export interface ComparisonField {
  field: string;
  inputValue: string;
  referenceValue: string;
  finalValue: string;
  isOverridden: boolean;
  isInherited: boolean;
}
