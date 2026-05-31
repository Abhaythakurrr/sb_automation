import * as XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';

/**
 * Maps user-friendly UAC UI column names → internal field names.
 * Users fill the Excel using the same labels they see in the Stonebranch UI.
 * Both the friendly name and the internal name are accepted — so existing
 * files with API-style columns continue to work.
 */
const COLUMN_MAP: Record<string, string> = {
  // UI label                    → internal field
  'job name':                     'task_name',
  'task name':                    'task_name',
  'job type':                     'task_type',
  'task type':                    'task_type',
  'job workstation':              'agent',
  'workstation':                  'agent',
  'agent':                        'agent',
  'agent cluster':                'agent',
  'job script':                   'command',
  'command':                      'command',
  'script':                       'command',
  'job login account':            'credential',
  'login account':                'credential',
  'credential':                   'credential',
  'credentials':                  'credential',
  'job description':              'description',
  'description':                  'description',
  'active':                       'enabled',
  'enabled':                      'enabled',
  'firstrun date':                'first_run_date',
  'first run date':               'first_run_date',
  'first_run_date':               'first_run_date',
  'job starttime':                'schedule_string',
  'start time':                   'start_time',
  'starttime':                    'schedule_string',
  'schedule':                     'schedule_string',
  'schedule string':              'schedule_string',
  'schedule_string':              'schedule_string',
  'timezone':                     'timezone',
  'time zone':                    'timezone',
  'job timezone':                 'timezone',
  'maximum runtime':              'max_runtime',
  'max runtime':                  'max_runtime',
  'max_runtime':                  'max_runtime',
  'scheduled frequency':          'frequency_type',
  'frequency':                    'frequency_type',
  'schedule frequency':           'frequency_type',
  'frequency_type':               'frequency_type',
  'reference job':                'ref_job',
  'ref job':                      'ref_job',
  'ref_job':                      'ref_job',
  'member of business services':  'business_services',
  'business services':            'business_services',
  'business_services':            'business_services',
  'servicenow ticket':            'servicenow_ticket',
  'servicenow_ticket':            'servicenow_ticket',
  'snow ticket':                  'servicenow_ticket',
  'ticket':                       'servicenow_ticket',
  'job documentation':            'job_doc',
  'job doc':                      'job_doc',
  'job_doc':                      'job_doc',
  'notes':                        'job_doc',
  // Recovery fields
  'job recovery1':                'recovery1',
  'recovery1':                    'recovery1',
  'job recovery 1':               'recovery1',
  'job recovery2':                'recovery2',
  'recovery2':                    'recovery2',
  'job recovery 2':               'recovery2',
  // Windows-specific
  'elevate user':                 'elevateUser',
  'run as administrator':         'elevateUser',
  'desktop interact':             'desktopInteract',
  'create console':               'createConsole',
};

function normaliseRow(row: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [key, value] of Object.entries(row)) {
    const normalised = COLUMN_MAP[key.toLowerCase().trim()] ?? key;
    out[normalised] = value;
  }
  return out;
}

function normaliseRows(rows: Record<string, any>[]): Record<string, any>[] {
  return rows.map(normaliseRow);
}

export class FileParserService {

  private parseCSV(content: string): Record<string, any>[] {
    const lines = content.trim().split('\n');
    if (lines.length < 2) return [];
    const headers = lines[0].split(',').map(h => h.trim());
    return lines.slice(1).map(line => {
      const values = line.split(',').map(v => v.trim());
      return headers.reduce((obj, header, index) => {
        obj[header] = values[index] ?? '';
        return obj;
      }, {} as Record<string, any>);
    });
  }

  private parseSpreadsheet(filePath: string): Record<string, any>[] {
    const workbook = XLSX.readFile(filePath, { type: 'file' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    return XLSX.utils.sheet_to_json(worksheet, { defval: '' });
  }

  async parseFile(filePath: string, mimeType: string): Promise<Record<string, any>[]> {
    const ext = path.extname(filePath).toLowerCase().replace('.', '');
    let rows: Record<string, any>[];

    if (mimeType === 'text/csv' || ext === 'csv') {
      const content = await fs.promises.readFile(filePath, 'utf-8');
      rows = this.parseCSV(content);
    } else if (['xlsx', 'ods', 'xls'].includes(ext) || mimeType.includes('spreadsheet') || mimeType.includes('sheet') || mimeType.includes('excel')) {
      rows = this.parseSpreadsheet(filePath);
    } else {
      throw new Error(`Unsupported file type: ${mimeType} (${ext})`);
    }

    // Normalise column names — UI-friendly labels → internal field names
    return normaliseRows(rows);
  }
}
