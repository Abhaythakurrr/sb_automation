import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { StoneBranchService } from '../services/stoneBranchService';
import { AuthRequest } from '../middleware/session';
import { buildTaskPayload, buildTriggerPayload, ExcelRow } from '../utils/payloadMapper';
import { auditLog } from '../middleware/auditLogger';
import { MAX_JOBS, CALL_DELAY_MS } from '../utils/executionQueue';

const router = Router();

// Zod schema for batch execution input
const ExcelRowSchema = z.object({
  task_name: z.string().min(1, 'task_name is required'),
  task_type: z.string().min(1, 'task_type is required'),
}).passthrough();

const BatchRequestSchema = z.object({
  rows: z.array(ExcelRowSchema).min(1, 'rows must be a non-empty array').max(MAX_JOBS, `Maximum ${MAX_JOBS} jobs per batch`),
  resolvedRefs: z.record(z.any()).optional().default({}),
});

router.post('/batch', async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const parsed = BatchRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: 'Invalid request body',
        details: parsed.error.flatten().fieldErrors,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const { rows, resolvedRefs } = parsed.data as {
      rows: ExcelRow[];
      resolvedRefs: Record<string, any>;
    };

    // Audit: log batch execution start
    auditLog({
      timestamp: new Date().toISOString(),
      requestId: (req as any).requestId || '',
      action: 'BATCH_EXECUTE',
      resource: 'tasks',
      details: `${rows.length} tasks`,
      result: 'pending',
      sessionId: req.sessionId,
    });

    const token   = req.token     || process.env.AUTH_TOKEN || '';
    const baseUrl = req.sbBaseUrl || process.env.BASE_URL   || '';
    if (!baseUrl) {
      res.status(400).json({ success: false, error: 'No Stonebranch base URL configured. Connect from the home page first.' });
      return;
    }
    const service = new StoneBranchService(token, baseUrl);
    const results: any[] = [];
    const id = () => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    for (const row of (rows ?? [])) {
      const refKey     = row.ref_job ? row.ref_job.trim() : '';
      const ref        = refKey ? (resolvedRefs?.[refKey] ?? null) : null;
      const maxRunTime = ref?.maxRunTime ?? null;

      // Resolve agent → agent or agentCluster
      const agentResolved = await service.resolveAgentField(
        row.agent,
        (msg) => console.log(msg)
      );

      // Build strict OpenAPI-compliant payloads
      const taskPayload    = buildTaskPayload(row, maxRunTime, agentResolved);
      const triggerPayload = buildTriggerPayload(row, ref?.rawTrigger);

      console.log(`[EXEC] Creating task: ${taskPayload.name} → ${baseUrl}`);

      // Create Task
      try {
        const result = await service.createTask(taskPayload);
        results.push({
          id: id(), type: 'task', name: taskPayload.name,
          status: 'success', sbId: result.sysId ?? result,
          createdAt: new Date().toISOString(),
        });
        console.log(`[EXEC] Task created: ${taskPayload.name}`);
      } catch (e: any) {
        const msg = e.response?.data ?? e.message;
        results.push({
          id: id(), type: 'task', name: taskPayload.name,
          status: 'failed', message: typeof msg === 'string' ? msg : JSON.stringify(msg),
          createdAt: new Date().toISOString(),
        });
        results.push({
          id: id(), type: 'trigger', name: triggerPayload.name,
          status: 'failed', message: 'Skipped — task creation failed',
          createdAt: new Date().toISOString(),
        });
        continue;
      }

      // Create Trigger
      console.log(`[EXEC] Creating trigger: ${triggerPayload.name}`);
      try {
        const result = await service.createTrigger(triggerPayload);
        results.push({
          id: id(), type: 'trigger', name: triggerPayload.name,
          status: 'success', sbId: result.sysId ?? result,
          createdAt: new Date().toISOString(),
        });
        console.log(`[EXEC] Trigger created: ${triggerPayload.name}`);
      } catch (e: any) {
        const msg = e.response?.data ?? e.message;
        results.push({
          id: id(), type: 'trigger', name: triggerPayload.name,
          status: 'failed', message: typeof msg === 'string' ? msg : JSON.stringify(msg),
          createdAt: new Date().toISOString(),
        });
      }
    }

    res.json({
      success: true,
      data: {
        results,
        summary: {
          total:      results.length,
          successful: results.filter(r => r.status === 'success').length,
          failed:     results.filter(r => r.status === 'failed').length,
        },
      },
      timestamp: new Date().toISOString(),
    });

    // Audit: log batch execution result
    const failedCount = results.filter(r => r.status === 'failed').length;
    auditLog({
      timestamp: new Date().toISOString(),
      requestId: (req as any).requestId || '',
      action: 'BATCH_EXECUTE',
      resource: 'tasks',
      details: `${rows.length} tasks`,
      result: failedCount === results.length ? 'failure' : 'success',
      sessionId: req.sessionId,
    });
  } catch (e) {
    auditLog({
      timestamp: new Date().toISOString(),
      requestId: (req as any).requestId || '',
      action: 'BATCH_EXECUTE',
      resource: 'tasks',
      result: 'failure',
      sessionId: req.sessionId,
    });
    next(e);
  }
});

// ── SSE Stream endpoint — real-time execution with live updates ──────────────
// Frontend opens this as an EventSource. Each job step is streamed back live.
router.post('/stream', async (req: AuthRequest, res: Response): Promise<void> => {
  const parsed = BatchRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: 'Invalid request', details: parsed.error.flatten().fieldErrors });
    return;
  }

  const { rows, resolvedRefs } = parsed.data as { rows: ExcelRow[]; resolvedRefs: Record<string, any> };
  const token   = req.token     || '';
  const baseUrl = req.sbBaseUrl || '';
  if (!baseUrl) { res.status(400).json({ success: false, error: 'No base URL configured' }); return; }

  // Set up SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // disable nginx buffering
  res.flushHeaders();

  const send = (event: string, data: any) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  const service = new StoneBranchService(token, baseUrl);
  let successCount = 0;
  let failCount    = 0;

  send('start', { total: rows.length, timestamp: new Date().toISOString() });

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const refKey     = row.ref_job ? row.ref_job.trim() : '';
    const ref        = refKey ? (resolvedRefs?.[refKey] ?? null) : null;
    const maxRunTime = ref?.maxRunTime ?? null;

    send('job_start', { index: i, name: row.task_name, total: rows.length });

    // Resolve agent
    send('step', { index: i, name: row.task_name, step: 'Resolving agent...', status: 'processing' });
    const agentResolved = await service.resolveAgentField(row.agent, () => {});

    // Build payloads
    const taskPayload    = buildTaskPayload(row, maxRunTime, agentResolved);
    const triggerPayload = buildTriggerPayload(row, ref?.rawTrigger);

    // Create task
    send('step', { index: i, name: row.task_name, step: 'Creating task...', status: 'processing' });
    try {
      const result = await service.createTask(taskPayload);
      send('step', { index: i, name: row.task_name, step: 'Task created', status: 'success', id: result?.sysId ?? result });
    } catch (e: any) {
      const msg = typeof e.response?.data === 'string' ? e.response.data : JSON.stringify(e.response?.data ?? e.message);
      send('step', { index: i, name: row.task_name, step: 'Task failed', status: 'error', message: msg });
      send('step', { index: i, name: row.task_name, step: 'Trigger skipped', status: 'error', message: 'Task creation failed' });
      failCount += 2;
      send('job_done', { index: i, name: row.task_name, success: false });
      // Delay before next job
      await new Promise(r => setTimeout(r, CALL_DELAY_MS));
      continue;
    }

    // Delay between task and trigger
    await new Promise(r => setTimeout(r, CALL_DELAY_MS));

    // Create trigger
    send('step', { index: i, name: row.task_name, step: 'Creating trigger...', status: 'processing' });
    try {
      const result = await service.createTrigger(triggerPayload);
      send('step', { index: i, name: row.task_name, step: 'Trigger created', status: 'success', id: result?.sysId ?? result });
      successCount += 2;
    } catch (e: any) {
      const msg = typeof e.response?.data === 'string' ? e.response.data : JSON.stringify(e.response?.data ?? e.message);
      send('step', { index: i, name: row.task_name, step: 'Trigger failed', status: 'error', message: msg });
      successCount += 1;
      failCount += 1;
    }

    send('job_done', { index: i, name: row.task_name, success: true });

    // Delay before next job
    if (i < rows.length - 1) {
      await new Promise(r => setTimeout(r, CALL_DELAY_MS));
    }
  }

  // Final summary
  send('complete', {
    total: rows.length * 2,
    successful: successCount,
    failed: failCount,
    timestamp: new Date().toISOString(),
  });

  auditLog({
    timestamp: new Date().toISOString(),
    requestId: (req as any).requestId || '',
    action: 'BATCH_EXECUTE_STREAM',
    resource: 'tasks',
    details: `${rows.length} jobs, ${successCount} success, ${failCount} failed`,
    result: failCount === 0 ? 'success' : 'failure',
    sessionId: req.sessionId,
  });

  res.end();
});

export { router as executionRouter };
