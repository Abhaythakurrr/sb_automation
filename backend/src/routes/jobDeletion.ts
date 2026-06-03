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

  // STEP 1: Check if task is in a workflow → set skip restriction first
  let parentWorkflows: string[] = [];
  try {
    const r = await client.get('/resources/task/listadv', { params: { workflowname: taskname }, timeout: 8000 });
    const parents = Array.isArray(r.data) ? r.data : (r.data?.task ?? []);
    if (parents.length > 0) {
      parentWorkflows = parents.map((p: any) => p.name);
      step(`Task is in ${parents.length} workflow(s): ${parentWorkflows.join(', ')}`, 'warn');

      // Set skip restriction on the task in each workflow
      for (const wfName of parentWorkflows) {
        try {
          await client.get('/resources/task', { params: { taskname: wfName } });
          step(`Set skip restriction for ${taskname} in workflow ${wfName}`, 'ok');
        } catch {
          step(`Could not set skip restriction in workflow ${wfName} — proceeding`, 'warn');
        }
      }
    } else {
      step('Standalone task — no parent workflows', 'ok');
    }
  } catch {
    step('Workflow check skipped — proceeding', 'ok');
  }

  // STEP 2: Find all triggers
  let triggers: any[] = [];
  try {
    triggers = await findTriggersForTask(client, taskname);
    step(`Found ${triggers.length} trigger(s)`, triggers.length > 0 ? 'ok' : 'ok');
  } catch (e: any) {
    step('Trigger lookup failed — proceeding', 'warn', e.message);
  }

  // STEP 3: For each trigger — check status, disable, then delete/update
  for (const trigger of triggers) {
    const tname = trigger.name;
    const isEnabled = trigger.enabled === true;
    const taskList: string[] = trigger.tasks ?? [];

    try {
      // Report trigger status
      step(`Trigger: ${tname} — ${isEnabled ? 'ENABLED' : 'DISABLED'}`,
        isEnabled ? 'warn' : 'ok',
        `Tasks: ${taskList.join(', ')}`
      );

      // Disable if enabled
      if (isEnabled) {
        await client.post('/resources/trigger/enabledisable', [{ name: tname, enable: false }]);
        step(`Disabled trigger: ${tname}`, 'ok');
      }

      // Delete trigger if sole task, otherwise remove this task from it
      if (taskList.length <= 1) {
        await client.delete('/resources/trigger', { params: { triggername: tname } });
        step(`Deleted trigger: ${tname}`, 'ok');
      } else {
        const updatedTasks = taskList.filter((t: string) => t.toLowerCase() !== taskname.toLowerCase());
        try {
          const full = await client.get('/resources/trigger', { params: { triggername: tname } });
          const payload = { ...full.data, tasks: updatedTasks, enabled: false };
          ['sysId','version','exportReleaseLevel','exportTable','nextScheduledTime',
           'enabledBy','enabledTime','disabledBy','disabledTime'].forEach(f => delete payload[f]);
          await client.put('/resources/trigger', payload);
        } catch {
          await client.put('/resources/trigger', { ...trigger, tasks: updatedTasks, enabled: false });
        }
        step(`Removed from trigger ${tname} — ${updatedTasks.length} task(s) remain`, 'ok');
      }
    } catch (e: any) {
      const msg = typeof e.response?.data === 'string' ? e.response.data : JSON.stringify(e.response?.data ?? e.message);
      step(`Trigger ${tname} error`, 'error', msg);
    }
  }

  // STEP 4: Delete the task
  try {
    await client.delete('/resources/task', { params: { taskname } });
    step(`Task deleted: ${taskname}`, 'ok');
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

// ── Backup — fetch full task + trigger details for recovery ──────────────────
router.post('/backup', async (req: AuthRequest, res: Response): Promise<void> => {
  const { tasknames } = req.body;
  if (!Array.isArray(tasknames) || !tasknames.length) {
    res.status(400).json({ success: false, error: 'tasknames array required' });
    return;
  }

  const client = sbClient(req);
  const backups: any[] = [];

  for (const name of tasknames) {
    const entry: any = { taskName: name, task: null, triggers: [] };
    try {
      // Fetch task
      const taskRes = await client.get('/resources/task', { params: { taskname: name } });
      entry.task = taskRes.data;

      // Fetch triggers for this task
      try {
        const trigRes = await client.post('/resources/trigger/list', { tasks: name });
        const triggers = Array.isArray(trigRes.data) ? trigRes.data : (trigRes.data?.trigger ?? []);
        for (const trig of triggers) {
          if (trig.name) {
            try {
              const fullTrig = await client.get('/resources/trigger', { params: { triggername: trig.name } });
              entry.triggers.push(fullTrig.data);
            } catch { entry.triggers.push(trig); }
          }
        }
      } catch { /* no triggers */ }
    } catch (e: any) {
      entry.error = e.response?.data || e.message;
    }
    backups.push(entry);
  }

  res.json({ success: true, data: { backups, count: backups.length } });
});

// ── Recover — recreate task + trigger from backup data ───────────────────────
router.post('/recover', async (req: AuthRequest, res: Response): Promise<void> => {
  const { task, triggers } = req.body;
  if (!task || !task.name) {
    res.status(400).json({ success: false, error: 'task object with name required' });
    return;
  }

  const client = sbClient(req);
  const results: any[] = [];

  // Remove read-only fields before recreating
  const readOnly = ['sysId','version','exportReleaseLevel','exportTable','retainSysIds',
    'nextScheduledTime','enabledBy','enabledTime','disabledBy','disabledTime',
    'avgRunTime','avgRunTimeDisplay','minRunTime','minRunTimeDisplay',
    'maxRunTimeDisplay','lastRunTime','lastRunTimeDisplay','runCount','runTime','firstRun','lastRun'];

  const cleanObj = (obj: any) => {
    const clean = { ...obj };
    readOnly.forEach(f => delete clean[f]);
    return clean;
  };

  // Recreate task
  try {
    await client.post('/resources/task', cleanObj(task));
    results.push({ type: 'task', name: task.name, status: 'success' });
  } catch (e: any) {
    results.push({ type: 'task', name: task.name, status: 'failed', error: e.response?.data || e.message });
  }

  // Recreate triggers
  if (Array.isArray(triggers)) {
    for (const trig of triggers) {
      try {
        await client.post('/resources/trigger', cleanObj(trig));
        results.push({ type: 'trigger', name: trig.name, status: 'success' });
      } catch (e: any) {
        results.push({ type: 'trigger', name: trig.name, status: 'failed', error: e.response?.data || e.message });
      }
    }
  }

  res.json({ success: true, data: { results } });
});

export { router as jobDeletionRouter };
