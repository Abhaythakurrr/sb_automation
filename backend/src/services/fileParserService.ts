import * as XLSX from 'xlsx';

export class FileParserService {
  parseCSV(content: string): Record<string, any>[] {
    const lines = content.trim().split('\n');
    if (lines.length < 2) return [];

    const headers = lines[0].split(',').map(h => h.trim());
    return lines.slice(1).map(line => {
      const values = line.split(',').map(v => v.trim());
      return headers.reduce((obj, header, index) => {
        obj[header] = values[index] || '';
        return obj;
      }, {} as Record<string, any>);
    });
  }

  parseExcel(filePath: string): Record<string, any>[] {
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    return XLSX.utils.sheet_to_json(worksheet);
  }

  parseODS(filePath: string): Record<string, any>[] {
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    return XLSX.utils.sheet_to_json(worksheet);
  }

  async parseFile(filePath: string, mimeType: string): Promise<Record<string, any>[]> {
    const ext = filePath.split('.').pop()?.toLowerCase();

    if (mimeType === 'text/csv' || ext === 'csv') {
      const fs = await import('fs').then(m => m.promises);
      const content = await fs.readFile(filePath, 'utf-8');
      return this.parseCSV(content);
    }

    // xlsx, ods, xls — all handled by XLSX library
    if (['xlsx', 'ods', 'xls'].includes(ext || '') || mimeType.includes('spreadsheet') || mimeType.includes('sheet') || mimeType.includes('excel')) {
      return this.parseExcel(filePath);
    }

    throw new Error(`Unsupported file type: ${mimeType} (${ext})`);
  }
}
