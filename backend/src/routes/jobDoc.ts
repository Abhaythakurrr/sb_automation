import { Router, Request, Response } from 'express';
import axios from 'axios';

const router = Router();

const POWER_AUTOMATE_URL = 'https://default189de737c93a4f5a8b686f4ca99419.12.environment.api.powerplatform.com:443/powerautomate/automations/direct/workflows/1a20756a632e446199eacd355ccd259b/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=hvAjT9hJtX5O44vQN7BGtrksc7hjuSAzY0zWu7H-Dak';

// POST /api/jobdoc/push — proxy to Power Automate to avoid CORS
router.post('/push', async (req: Request, res: Response): Promise<void> => {
  const { rows } = req.body;

  if (!Array.isArray(rows) || rows.length === 0) {
    res.status(400).json({ success: false, error: 'rows array is required' });
    return;
  }

  const results: { index: number; name: string; status: string; error?: string }[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    try {
      await axios.post(POWER_AUTOMATE_URL, row, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 30000,
      });
      results.push({ index: i, name: row.JOB_NAME || '', status: 'success' });
    } catch (e: any) {
      const msg = e.response?.data || e.message || 'Unknown error';
      results.push({ index: i, name: row.JOB_NAME || '', status: 'failed', error: typeof msg === 'string' ? msg : JSON.stringify(msg) });
    }

    // 300ms delay between rows to avoid throttling
    if (i < rows.length - 1) {
      await new Promise(r => setTimeout(r, 300));
    }
  }

  const success = results.filter(r => r.status === 'success').length;
  const failed = results.filter(r => r.status === 'failed').length;

  res.json({
    success: failed === 0,
    data: { results, summary: { success, failed, total: rows.length } },
  });
});

export { router as jobDocRouter };
