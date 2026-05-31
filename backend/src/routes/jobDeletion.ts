/** Job Deletion Route — dependency check, trigger cleanup, and safe task deletion */
import { Router, Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/session';
import axios from 'axios';
import { auditLog } from '../middleware/auditLogger';

const router = Router();

function sbClient(req: AuthRequest) {
  return axios.create({
    baseURL: req.sbBaseUrl || process.env.BASE_URL || '',
    headers: {
      Authorization:  `Bearer ${req.token || process.env.AUTH_TOKEN || ''}`,
      'Content-Type': 'application/json',
      Accept:         'application/json',
    },
    timeout: 30000, // increased from 15s
  });
}

// ── Helper: find all triggers for a task ──────────────────────────────────
// Strategy: try direct name lookup first (fast), then scan all triggers
async function findTriggersForTask(client: any, taskname: string): Promise<any[]> {
  const found: any[] = [];

  // Strategy 1: try common naming conventions directly (no list call needed)
  const candidates = [
    `${taskname}_TR001`,
    `${taskname}_TR002`,
    `${taskname}_TM_TR001`,
    `${taskname}-TR001`,
  ];
  for (const tname of candidates) {
    try {
      const r = await client.get('/resources/trigger', { params: { triggername: tname } });
      if (r.data?.name) found.push(r.data);
    } catch { /* not found — skip */ }
  }
  if (found.length > 0) return found;

  // Strategy 2: listadv with taskname (may be slow — skip in bulk to avoid timeouts)
  try {
    const r = await client.get('/resources/trigger/listadv', { params: { taskname }, timeout: 5000 });
    const list = Array.isArray(r.data) ? r.data : (r.data?.trigger ?? []);
    if (list.length > 0) return list;
  } catch { /* timeout or error — fall through */ }

  return found;
}

// ── Full inspect ───────────────────────────────────────────────────────────
router.get('/inspect', async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { taskname } = req.query;
    if (!taskname) { res.status(400).json({ error: 'taskname required' }); return; }

    const client = sbClient(req);
    const steps: any[] = [];
    const step = (label: string, status: 'checking' | 'ok' | 'warn' | 'error', detail?: string) =>
      steps.push({ label, status, detail, ts: new Date().toISOString() });

    // 1. Fetch task
    step('Fetching task definition', 'checking');
    let task: any = null;
    try {
      const r = await client.get('/resources/task', { params: { taskname } });
      task = r.data;
      // No sysId in user-facing message
      step(`Task found: ${task.name}`, 'ok', `Type: ${task.type} | Agent: ${task.agentCluster || task.agent || 'N/A'}`);
    } catch {
      step(`Task not found: ${taskname}`, 'error');
      res.json({ success: true, data: { task: null, triggers: [], parents: [], activeInstances: [], steps }, timestamp: new Date().toISOString() });
      return;
    }

    // 2. Check parent workflows
    step('Checking parent workflows', 'checking');
    let parents: any[] = [];
    try {
      const r = await client.get('/resources/task/listadv', { params: { workflowname: taskname as string } });
      parents = Array.isArray(r.data) ? r.data : (r.data?.task ?? []);
      if (parents.length > 0) {
        step(`Found in ${parents.length} workflow(s)`, 'warn', parents.map((p: any) => p.name).join(', '));
      } else {
        step('No parent workflows — standalone task', 'ok');
      }
    } catch {
      step('Parent workflow check skipped', 'ok');
    }

    // 3. Check triggers
    step('Checking associated triggers', 'checking');
    let triggers: any[] = [];
    try {
      triggers = await findTriggersForTask(client, taskname as string);
      if (triggers.length > 0) {
        step(`Found ${triggers.length} trigger(s)`, 'ok',
          triggers.map((t: any) => `${t.name} (${t.enabled ? 'enabled' : 'disabled'})`).join(', '));
      } else {
        step('No triggers associated', 'ok');
      }
    } catch (e: any) {
      step('Could not fetch triggers', 'warn', e.message);
    }

    // 4. Check active instances
    step('Checking active task instances', 'checking');
    let activeInstances: any[] = [];
    try {
      const r = await client.post('/resources/taskinstance/list', {
        name: taskname as string,
        status: 'Running',
      });
      activeInstances = Array.isArray(r.data) ? r.data : (r.data?.taskInstance ?? []);
      if (activeInstances.length > 0) {
        step(`${activeInstances.length} active instance(s) running`, 'warn',
          activeInstances.map((i: any) => `${i.name} — ${i.status}`).join(', '));
      } else {
        step('No active instances', 'ok');
      }
    } catch {
      step('Active instance check skipped', 'ok');
    }

    // 5. Check execution wait instances
    step('Checking execution wait instances', 'checking');
    let waitInstances: any[] = [];
    try {
      const r = await client.post('/resources/taskinstance/list', {
        name: taskname as string,
        status: 'Execution Wait',
      });
      waitInstances = Array.isArray(r.data) ? r.data : (r.data?.taskInstance ?? []);
      if (waitInstances.length > 0) {
        step(`${waitInstances.length} instance(s) in Execution Wait`, 'warn');
      } else {
        step('No execution wait instances', 'ok');
      }
    } catch {
      step('Execution wait check skipped', 'ok');
    }

    const allActive = [...activeInstances, ...waitInstances];

    res.json({
      success: true,
      data: {
        task,
        triggers,
        parents,
        activeInstances: allActive,
        hasActiveInstances: allActive.length > 0,
        steps,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (e) { next(e); }
});

// ── Force finish active instances ──────────────────────────────────────────
router.post('/force-finish', async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { taskname } = req.body;
    if (!taskname) { res.status(400).json({ error: 'taskname required' }); return; }

    const client = sbClient(req);
    const steps: any[] = [];
    const step = (label: string, status: string, detail?: string) =>
      steps.push({ label, status, detail, ts: new Date().toISOString() });

    const statuses = ['Running', 'Execution Wait', 'Queued', 'In Doubt', 'Held'];
    let allInstances: any[] = [];

    for (const status of statuses) {
      try {
        const r = await client.post('/resources/taskinstance/list', { name: taskname, status });
        const list = Array.isArray(r.data) ? r.data : (r.data?.taskInstance ?? []);
        allInstances.push(...list);
      } catch { /* silent */ }
    }

    step(`Found ${allInstances.length} instance(s) to force finish`, 'ok');

    let finished = 0;
    for (const inst of allInstances) {
      try {
        await client.post('/resources/taskinstance/ops-force-finish', {
          taskInstanceName: inst.name,
          taskInstanceId:   inst.sysId,
        });
        step(`Force finished: ${inst.name}`, 'ok');
        finished++;
      } catch (e: any) {
        const msg = typeof e.response?.data === 'string' ? e.response.data : e.message;
        step(`Force finish failed: ${inst.name}`, 'error', msg);
      }
    }

    auditLog({
      timestamp: new Date().toISOString(),
      requestId: (req as any).requestId || '',
      action: 'FORCE_FINISH',
      resource: taskname,
      result: 'success',
      sessionId: req.sessionId,
    });

    res.json({
      success: true,
      data: { finished, total: allInstances.length, steps },
      timestamp: new Date().toISOString(),
    });
  } catch (e) { next(e); }
});

// ── Core deletion logic (shared by single + bulk) ─────────────────────────
async function performDeletion(client: any, taskname: string): Promise<{ success: boolean; steps: any[] }> {
  const steps: any[] = [];
  const step = (label: string, status: string, detail?: string) =>
    steps.push({ label, status, detail, ts: new Date().toISOString() });

  step(`Starting deletion: ${taskname}`, 'ok');

  // Find triggers
  let triggers: any[] = [];
  try {
    triggers = await findTriggersForTask(client, taskname);
    step(`Found ${triggers.length} trigger(s)`, 'ok');
  } catch (e: any) {
    step('Trigger lookup failed — proceeding to task deletion', 'warn', e.message);
  }

  // For each trigger: disable → delete (if sole task) OR remove task from it
  for (const trigger of triggers) {
    const tname = trigger.name;
    const taskList: string[] = trigger.tasks ?? [];

    try {
      // Always disable first — API requires an ARRAY not a single object
      await client.post('/resources/trigger/enabledisable', [{ name: tname, enable: false }]);
      step(`Disabled trigger: ${tname}`, 'ok');

      if (taskList.length <= 1) {
        // Sole task — delete the entire trigger so task can be deleted
        await client.delete('/resources/trigger', { params: { triggername: tname } });
        step(`Deleted trigger: ${tname}`, 'ok');
      } else {
        // Multiple tasks — remove only this task, keep trigger
        const updatedTasks = taskList.filter((t: string) => t.toLowerCase() !== taskname.toLowerCase());
        // Fetch full trigger to avoid missing required fields on PUT
        try {
          const full = await client.get('/resources/trigger', { params: { triggername: tname } });
          const payload = { ...full.data, tasks: updatedTasks, enabled: false };
          // Strip read-only fields
          ['sysId','version','exportReleaseLevel','exportTable','nextScheduledTime',
           'enabledBy','enabledTime','disabledBy','disabledTime'].forEach(f => delete payload[f]);
          await client.put('/resources/trigger', payload);
        } catch {
          // Fallback: minimal update
          await client.put('/resources/trigger', { ...trigger, tasks: updatedTasks, enabled: false });
        }
        step(`Removed ${taskname} from trigger ${tname} (${updatedTasks.length} task(s) remain)`, 'ok');
      }
    } catch (e: any) {
      const msg = typeof e.response?.data === 'string' ? e.response.data : JSON.stringify(e.response?.data ?? e.message);
      step(`Trigger ${tname} error`, 'error', msg);
    }
  }

  // Delete task
  try {
    await client.delete('/resources/task', { params: { taskname } });
    step(`Task deleted successfully`, 'ok');
    return { success: true, steps };
  } catch (e: any) {
    const msg = typeof e.response?.data === 'string' ? e.response.data : JSON.stringify(e.response?.data ?? e.message);
    step(`Task deletion failed`, 'error', msg);
    return { success: false, steps };
  }
}

// ── Delete single job ──────────────────────────────────────────────────────
router.delete('/job', async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { taskname } = req.body;
    if (!taskname) { res.status(400).json({ error: 'taskname required' }); return; }
    const client = sbClient(req);
    const result = await performDeletion(client, taskname);
    auditLog({
      timestamp: new Date().toISOString(),
      requestId: (req as any).requestId || '',
      action: 'JOB_DELETE',
      resource: taskname,
      result: result.success ? 'success' : 'failure',
      sessionId: req.sessionId,
    });
    res.json({ success: result.success, data: { steps: result.steps }, timestamp: new Date().toISOString() });
  } catch (e) { next(e); }
});

// ── Bulk delete ────────────────────────────────────────────────────────────
router.delete('/jobs', async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { tasknames } = req.body;
    if (!Array.isArray(tasknames) || !tasknames.length) {
      res.status(400).json({ error: 'tasknames array required' }); return;
    }
    const client = sbClient(req);
    const results: any[] = [];

    for (const taskname of tasknames) {
      const result = await performDeletion(client, taskname);
      auditLog({
        timestamp: new Date().toISOString(),
        requestId: (req as any).requestId || '',
        action: 'JOB_DELETE',
        resource: taskname,
        result: result.success ? 'success' : 'failure',
        sessionId: req.sessionId,
      });
      results.push({ taskname, success: result.success, steps: result.steps });
    }

    const successCount = results.filter(r => r.success).length;
    res.json({
      success: successCount === tasknames.length,
      data: { results, successCount, total: tasknames.length },
      timestamp: new Date().toISOString(),
    });
  } catch (e) { next(e); }
});

export { router as jobDeletionRouter };
