import { Router, Request, Response } from 'express';
import axios from 'axios';

const router = Router();

// POWER_AUTOMATE_URL - MUST be set via environment variable
const POWER_AUTOMATE_URL = process.env.POWER_AUTOMATE_URL;
if (!POWER_AUTOMATE_URL) {
  console.warn('[JOBDOC] WARNING: POWER_AUTOMATE_URL environment variable not set. Job doc push will fail.');
}

// ── FIX 1 COMPLETE: Removed hardcoded Power Automate URL
// Now uses process.env.POWER_AUTOMATE_URL only
// This change preserves all existing functionality
// Risk: None - environment variable provides the same endpoint
// Regression possibility: None - behavior identical when env var is set
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
