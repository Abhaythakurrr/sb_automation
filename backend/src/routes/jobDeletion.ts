/** Job Deletion Route — dependency check, trigger cleanup, and safe task deletion */
import { Router, Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/session';
import axios from 'axios';
import { auditLog } from '../middleware/auditLogger';
import * as recovery from '../utils/recoveryStore';

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

  // Strategy 0: Use POST /resources/trigger/list with tasks filter (most reliable)
  try {
    const r = await client.post('/resources/trigger/list', { tasks: taskname }, { timeout: 8000 });
    const list = Array.isArray(r.data) ? r.data : (r.data?.trigger ?? []);
    if (list.length > 0) {
      // Fetch full details for each trigger
      for (const trig of list) {
        if (trig.name) {
          try {
            const full = await client.get('/resources/trigger', { params: { triggername: trig.name } });
            if (full.data?.name) found.push(full.data);
          } catch {
            found.push(trig);
          }
        }
      }
      if (found.length > 0) return found;
    }
  } catch { /* fall through to other strategies */ }

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
      // Use the correct UAC endpoint: "List All Workflows That a Task Belongs To"
      const r = await client.get('/resources/task/parent/list', { params: { taskname: taskname as string } });
      parents = Array.isArray(r.data) ? r.data : (r.data?.task ?? r.data?.workflow ?? []);
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
// tasknamesBeingDeleted: all task names in the current bulk operation (for workflow cleanup logic)
async function performDeletion(client: any, taskname: string, tasknamesBeingDeleted: string[] = []): Promise<{ success: boolean; steps: any[] }> {
  const steps: any[] = [];
  const step = (label: string, status: string, detail?: string) =>
    steps.push({ label, status, detail, ts: new Date().toISOString() });

  step(`Starting deletion: ${taskname}`, 'ok');

  // Normalize the full list of tasks being deleted for comparison
  const deletionSet = new Set(
    (tasknamesBeingDeleted.length > 0 ? tasknamesBeingDeleted : [taskname])
      .map(n => n.toLowerCase())
  );

  // STEP 1: Check if task is in a workflow → handle workflow cleanup
  let parentWorkflows: { name: string; sysId?: string; vertexId?: string }[] = [];
  try {
    // Use the correct UAC endpoint: "List All Workflows That a Task Belongs To"
    const r = await client.get('/resources/task/parent/list', { params: { taskname }, timeout: 8000 });
    const parents = Array.isArray(r.data) ? r.data : (r.data?.task ?? r.data?.workflow ?? []);
    if (parents.length > 0) {
      parentWorkflows = parents.map((p: any) => ({ name: p.name, sysId: p.sysId, vertexId: p.vertexId }));
      step(`Task is in ${parents.length} workflow(s): ${parentWorkflows.map(p => p.name).join(', ')}`, 'warn');

      // For each parent workflow: handle triggers, set skip restriction, then remove task
      for (const wf of parentWorkflows) {
        try {
          // 1a. Get the vertexId for this task in the workflow (from parent/list response)
          const vertexId = wf.vertexId;

          // 1b. ALWAYS find and handle workflow-level triggers first
          // This is essential — workflow cannot be deleted/modified while triggers exist
          let wfTriggers: any[] = [];
          try {
            wfTriggers = await findTriggersForTask(client, wf.name);
            if (wfTriggers.length > 0) {
              step(`Workflow ${wf.name} has ${wfTriggers.length} trigger(s)`, 'ok');
            }
          } catch { /* no triggers */ }

          // 1c. Set "Skip" execution restriction on the task vertex within the workflow
          // PUT /resources/workflow/vertices?workflowname=WF_NAME
          try {
            const modifyPayload: any = { task: taskname };
            if (vertexId) modifyPayload.vertexId = vertexId;
            await client.put('/resources/workflow/vertices', modifyPayload, {
              params: { workflowname: wf.name },
            });
            step(`Set skip restriction for ${taskname} in workflow ${wf.name}`, 'ok');
          } catch {
            step(`Could not set skip restriction in ${wf.name} — proceeding`, 'warn');
          }

          // 1d. Get the list of all tasks/vertices in this workflow
          // GET /resources/workflow/vertices?workflowname=WF_NAME
          let workflowTaskNames: string[] = [];
          try {
            const verticesRes = await client.get('/resources/workflow/vertices', {
              params: { workflowname: wf.name },
              timeout: 8000,
            });
            const vertices = Array.isArray(verticesRes.data)
              ? verticesRes.data
              : (verticesRes.data?.workflowVertex ?? verticesRes.data?.vertices ?? []);
            workflowTaskNames = vertices
              .map((v: any) => {
                // v.task can be a string OR an object like { value: "name" } or { name: "name" }
                const t = v.task;
                if (typeof t === 'string') return t;
                if (t && typeof t === 'object') return t.value || t.name || '';
                return v.taskName || v.name || '';
              })
              .filter((n: string) => n);
          } catch {
            step(`Could not list tasks in workflow ${wf.name}`, 'warn');
          }

          // 1e. Determine if ALL tasks in this workflow are being deleted
          const allTasksBeingDeleted = workflowTaskNames.length > 0 &&
            workflowTaskNames.every((wfTask: string) => deletionSet.has(wfTask.toLowerCase()));

          if (allTasksBeingDeleted) {
            // All tasks in the workflow are scheduled for deletion → delete the entire workflow
            step(`All ${workflowTaskNames.length} task(s) in workflow ${wf.name} are being deleted — removing workflow`, 'ok');

            // Disable and delete all workflow triggers
            for (const wfTrig of wfTriggers) {
              try {
                if (wfTrig.enabled) {
                  await client.post('/resources/trigger/enabledisable', [{ name: wfTrig.name, enable: false }]);
                  step(`Disabled workflow trigger: ${wfTrig.name}`, 'ok');
                }
                await client.delete('/resources/trigger', { params: { triggername: wfTrig.name } });
                step(`Deleted workflow trigger: ${wfTrig.name}`, 'ok');
              } catch (trigErr: any) {
                const msg = typeof trigErr.response?.data === 'string' ? trigErr.response.data : JSON.stringify(trigErr.response?.data ?? trigErr.message);
                step(`Could not delete workflow trigger ${wfTrig.name}`, 'warn', msg);
              }
            }

            // Delete the workflow itself
            try {
              await client.delete('/resources/task', { params: { taskname: wf.name } });
              step(`Workflow ${wf.name} deleted`, 'ok');
            } catch (delErr: any) {
              const msg = typeof delErr.response?.data === 'string' ? delErr.response.data : JSON.stringify(delErr.response?.data ?? delErr.message);
              step(`Could not delete workflow ${wf.name}`, 'warn', msg);
            }
          } else {
            // Other tasks remain in the workflow → remove only this task from it
            const remaining = workflowTaskNames.filter((n: string) => !deletionSet.has(n.toLowerCase()));
            step(`Workflow ${wf.name} has other tasks — removing ${taskname} from it`, 'ok',
              `Remaining: ${remaining.join(', ')}`);

            // If workflow trigger references this specific task, update it
            for (const wfTrig of wfTriggers) {
              const trigTasks: string[] = wfTrig.tasks ?? [];
              if (trigTasks.some((t: string) => t.toLowerCase() === taskname.toLowerCase())) {
                try {
                  const updatedTasks = trigTasks.filter((t: string) => t.toLowerCase() !== taskname.toLowerCase());
                  if (updatedTasks.length === 0) {
                    // No tasks left in this trigger — delete it
                    if (wfTrig.enabled) {
                      await client.post('/resources/trigger/enabledisable', [{ name: wfTrig.name, enable: false }]);
                    }
                    await client.delete('/resources/trigger', { params: { triggername: wfTrig.name } });
                    step(`Deleted workflow trigger ${wfTrig.name} (no tasks remain)`, 'ok');
                  } else {
                    // Update trigger to remove this task
                    const full = await client.get('/resources/trigger', { params: { triggername: wfTrig.name } });
                    const payload = { ...full.data, tasks: updatedTasks };
                    ['sysId','version','exportReleaseLevel','exportTable','nextScheduledTime',
                     'enabledBy','enabledTime','disabledBy','disabledTime'].forEach(f => delete payload[f]);
                    await client.put('/resources/trigger', payload);
                    step(`Removed ${taskname} from workflow trigger ${wfTrig.name}`, 'ok');
                  }
                } catch { /* best effort */ }
              }
            }

            // Remove the task vertex from the workflow
            // DELETE /resources/workflow/vertices?workflowname=WF_NAME&taskname=TASK_NAME
            try {
              const deleteParams: any = { workflowname: wf.name };
              if (vertexId) {
                deleteParams.vertexid = vertexId;
              } else {
                deleteParams.taskname = taskname;
              }
              await client.delete('/resources/workflow/vertices', { params: deleteParams });
              step(`Removed ${taskname} from workflow ${wf.name}`, 'ok');
            } catch (removeErr: any) {
              const msg = typeof removeErr.response?.data === 'string' ? removeErr.response.data : JSON.stringify(removeErr.response?.data ?? removeErr.message);
              step(`Could not remove ${taskname} from workflow ${wf.name}`, 'warn', msg);
            }
          }
        } catch (wfErr: any) {
          const msg = typeof wfErr.response?.data === 'string' ? wfErr.response.data : JSON.stringify(wfErr.response?.data ?? wfErr.message);
          step(`Workflow ${wf.name} handling error — proceeding`, 'warn', msg);
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
    const result = await performDeletion(client, taskname, [taskname]);
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
      // Pass ALL tasknames so workflow cleanup logic knows if all tasks in a workflow are being removed
      const result = await performDeletion(client, taskname, tasknames);
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

// ── Backup — fetch full task + trigger details, return in job creation template format ──
router.post('/backup', async (req: AuthRequest, res: Response): Promise<void> => {
  const { tasknames } = req.body;
  if (!Array.isArray(tasknames) || !tasknames.length) {
    res.status(400).json({ success: false, error: 'tasknames array required' });
    return;
  }

  const client = sbClient(req);
  const backups: any[] = [];        // raw UAC data for in-memory recovery
  const templateRows: any[] = [];   // job creation template format for Excel download

  for (const name of tasknames) {
    const entry: any = { taskName: name, task: null, triggers: [] };
    try {
      const taskRes = await client.get('/resources/task', { params: { taskname: name } });
      entry.task = taskRes.data;
      const task = taskRes.data;

      // Fetch triggers
      try {
        const trigRes = await client.post('/resources/trigger/list', { tasks: name });
        const triggers = Array.isArray(trigRes.data) ? trigRes.data : (trigRes.data?.trigger ?? []);
        for (const trig of triggers) {
          if (trig.name) {
            try {
              const full = await client.get('/resources/trigger', { params: { triggername: trig.name } });
              entry.triggers.push(full.data);
            } catch { entry.triggers.push(trig); }
          }
        }
      } catch { /* no triggers */ }

      // Convert to job creation template format
      const trig = entry.triggers[0];
      const schedString = trig
        ? trig.timeStyle === 'Interval'
          ? `Every ${trig.timeInterval} ${trig.timeIntervalUnits}${trig.enabledStart ? ` from ${trig.enabledStart}` : ''}${trig.enabledEnd ? ` to ${trig.enabledEnd}` : ''}${trig.timeZone ? ` ${trig.timeZone}` : ''}`
          : `AT ${(trig.time || '00:00').replace(':','')} TIMEZONE ${trig.timeZone || 'UTC'}`
        : '';

      // Parse recovery from notes
      const notesText = task.notes?.[0]?.text || '';
      const rec1Match = notesText.match(/Job Recovery1\s*=\s*(.+?)(?:\n|$)/i);
      const rec2Match = notesText.match(/Job Recovery2\s*=\s*(.+?)(?:\n|$)/i);
      const snGroupMatch = notesText.match(/ServiceNow Group\s*=\s*(.+?)(?:\n|$)/i);

      templateRows.push({
        'Job Name':                    task.name,
        'Job Type':                    task.type || 'taskUnix',
        'Job Workstation':             task.agentCluster || task.agent || '',
        'Job Script':                  task.command || '',
        'Job Login Account':           task.credentials || '',
        'Job Description':             task.summary || '',
        'ServiceNow Group':            snGroupMatch?.[1]?.trim() || task.customField1?.value || '',
        'Firstrun Date':               trig?.intervalStartingDate || '',
        'Job Starttime':               schedString,
        'Job Timezone':                trig?.timeZone || '',
        'Scheduled Frequency':         '',
        'Maximum Runtime':             task.maxRunTime ? String(task.maxRunTime) : '',
        'Reference Job':               '',
        'Member of Business Services': (task.opswiseGroups || []).join(', '),
        'ServiceNow Ticket':           task.customField2?.value || '',
        'Job Recovery1':               rec1Match?.[1]?.trim() || '',
        'Job Recovery2':               rec2Match?.[1]?.trim() || '',
      });
    } catch (e: any) {
      entry.error = e.response?.data || e.message;
      templateRows.push({ 'Job Name': name, 'Error': entry.error });
    }
    backups.push(entry);
  }

  // Persist successful backups server-side so the Recovery Center survives
  // session refresh/timeout/restart (per environment; auto-expires after 7 days).
  try {
    const persistable = backups
      .filter(b => b.task)
      .map(b => ({ taskName: b.taskName, task: b.task, triggers: b.triggers || [], savedAt: new Date().toISOString(), savedBy: (req as any).username }));
    if (persistable.length) recovery.addEntries(req.sbBaseUrl || '', persistable);
  } catch { /* non-critical */ }

  res.json({
    success: true,
    data: { backups, templateRows, count: backups.length },
  });
});

// ── List recoverable jobs (server-persisted) for the connected environment ──
router.get('/recovery', (req: AuthRequest, res: Response): void => {
  const entries = recovery.listEntries(req.sbBaseUrl || '');
  res.json({
    success: true,
    data: {
      backups: entries.map(e => ({ taskName: e.taskName, task: e.task, triggers: e.triggers, savedAt: e.savedAt })),
      count: entries.length,
      environment: req.sbBaseUrl || '',
    },
    timestamp: new Date().toISOString(),
  });
});

// ── Remove from recovery — one job, or all (manual cleanup) ──────────────────
router.delete('/recovery', (req: AuthRequest, res: Response): void => {
  const taskname = (req.body?.taskname || req.query?.taskname) as string | undefined;
  if (taskname) recovery.removeEntry(req.sbBaseUrl || '', taskname);
  else recovery.clearEnv(req.sbBaseUrl || '');
  res.json({ success: true, timestamp: new Date().toISOString() });
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

  // If the task was recreated successfully, drop it from the recovery store.
  const taskOk = results.some(r => r.type === 'task' && r.status === 'success');
  if (taskOk) { try { recovery.removeEntry(req.sbBaseUrl || '', task.name); } catch { /* ignore */ } }

  res.json({ success: true, data: { results } });
});

export { router as jobDeletionRouter };
