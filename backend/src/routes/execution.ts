import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { StoneBranchService } from '../services/stoneBranchService';
import { AuthRequest } from '../middleware/session';
import { buildTaskPayload, buildTriggerPayload, ExcelRow } from '../utils/payloadMapper';
import { auditLog } from '../middleware/auditLogger';

const router = Router();

// Zod schema for batch execution input
const ExcelRowSchema = z.object({
  task_name: z.string().min(1, 'task_name is required'),
  task_type: z.string().min(1, 'task_type is required'),
}).passthrough(); // allow additional fields

const BatchRequestSchema = z.object({
  rows: z.array(ExcelRowSchema).min(1, 'rows must be a non-empty array'),
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

export { router as executionRouter };
