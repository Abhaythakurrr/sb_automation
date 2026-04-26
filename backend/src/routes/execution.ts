import { Router, Response, NextFunction } from 'express';
import { StoneBranchService } from '../services/stoneBranchService';
import { AuthRequest } from '../middleware/auth';
import { buildTaskPayload, buildTriggerPayload, ExcelRow } from '../utils/payloadMapper';

const router = Router();

router.post('/batch', async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { rows, resolvedRefs } = req.body as {
      rows: ExcelRow[];
      resolvedRefs: Record<string, any>;
    };

    // Both token and baseUrl come from the UI via request headers
    const token   = req.token   || process.env.AUTH_TOKEN || '';
    const baseUrl = req.sbBaseUrl || process.env.BASE_URL   || 'https://adient.stonebranch.cloud';
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
  } catch (e) { next(e); }
});

export { router as executionRouter };
