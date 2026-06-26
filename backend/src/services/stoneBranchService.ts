import axios, { AxiosInstance } from 'axios';
import { parseSchedule, ParsedSchedule } from '../utils/scheduleParser';
import { resolveAgent } from '../utils/agentResolver';
import { derivMaxRunTimeFromLF } from '../utils/payloadMapper';

export interface ResolvedRefJob {
  triggerName:       string;
  schedule:          ParsedSchedule;
  maxRunTime:        number | null;
  maxRunTimeDisplay: string | null;
  rawTrigger:        Record<string, any>;
}

export class StoneBranchService {
  public client: AxiosInstance;

  constructor(
    token: string,
    baseURL: string = process.env.BASE_URL || process.env.SB_API_BASE_URL || ''
  ) {
    if (!baseURL) {
      throw new Error('Stonebranch base URL is required. Connect from the home page first.');
    }
    this.client = axios.create({
      baseURL,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    });
  }

  // ── Tasks ──────────────────────────────────────────────────────────────────
  async getTask(taskname: string): Promise<any> {
    const res = await this.client.get('/resources/task', { params: { taskname } });
    return res.data;
  }

  async createTask(taskData: any): Promise<any> {
    const res = await this.client.post('/resources/task', taskData);
    return res.data;
  }

  async resolveAgentField(agentValue: string, logFn?: (msg: string) => void) {
    return resolveAgent(agentValue, this.client, logFn);
  }

  // ── Agent Control ──────────────────────────────────────────────────────────
  /**
   * Returns ONLY agents (not clusters).
   * Agents have: name, status, suspended, hostName, ipAddress, type, version
   * Clusters are separate — different schema, no status/hostName fields.
   */
  async listAgents(): Promise<any[]> {
    const res = await this.client.get('/resources/agent/list');
    const raw = res.data;
    return Array.isArray(raw) ? raw : (raw?.agent ?? []);
  }

  /**
   * Returns agent clusters separately.
   * Clusters have: name, suspended, type, agents[], distribution, etc.
   * No status/hostName/ipAddress fields.
   */
  async listAgentClusters(): Promise<any[]> {
    const res = await this.client.get('/resources/agentcluster/list');
    const raw = res.data;
    return Array.isArray(raw) ? raw : (raw?.agentCluster ?? []);
  }

  async suspendAgents(agentNames: string[]): Promise<any[]> {
    const results = [];
    for (const agentName of agentNames) {
      try {
        const res = await this.client.post('/resources/agent/ops-suspend-agent', { agentName });
        results.push({ agentName, status: 'success', response: res.data });
      } catch (e: any) {
        results.push({ agentName, status: 'failed', error: e.response?.data ?? e.message });
      }
    }
    return results;
  }

  async resumeAgents(agentNames: string[]): Promise<any[]> {
    const results = [];
    for (const agentName of agentNames) {
      try {
        const res = await this.client.post('/resources/agent/ops-resume-agent', { agentName });
        results.push({ agentName, status: 'success', response: res.data });
      } catch (e: any) {
        results.push({ agentName, status: 'failed', error: e.response?.data ?? e.message });
      }
    }
    return results;
  }

  // ── Agent Cluster suspend / resume ─────────────────────────────────────────
  // UAC: POST /resources/agentcluster/suspend|resume with { agentClusterName }
  async suspendClusters(clusterNames: string[]): Promise<any[]> {
    const results = [];
    for (const name of clusterNames) {
      try {
        const res = await this.client.post('/resources/agentcluster/suspend', { agentClusterName: name });
        results.push({ name, status: 'success', response: res.data });
      } catch (e: any) {
        results.push({ name, status: 'failed', error: e.response?.data ?? e.message });
      }
    }
    return results;
  }

  async resumeClusters(clusterNames: string[]): Promise<any[]> {
    const results = [];
    for (const name of clusterNames) {
      try {
        const res = await this.client.post('/resources/agentcluster/resume', { agentClusterName: name });
        results.push({ name, status: 'success', response: res.data });
      } catch (e: any) {
        results.push({ name, status: 'failed', error: e.response?.data ?? e.message });
      }
    }
    return results;
  }

  // ── Ref Job Resolution ─────────────────────────────────────────────────────
  async resolveRefJob(refJob: string, logFn?: (msg: string) => void): Promise<ResolvedRefJob> {
    const log = logFn ?? (() => {});

    log(`[INFO] POST /resources/trigger/list { tasks: "${refJob}" }`);
    const listRes = await this.client.post('/resources/trigger/list', { tasks: refJob });
    const raw = listRes.data;
    const summaries: any[] = Array.isArray(raw) ? raw
      : Array.isArray(raw?.results) ? raw.results
      : Array.isArray(raw?.trigger) ? raw.trigger
      : [];

    if (!summaries.length) throw new Error(`No triggers found for ref_job: "${refJob}"`);

    const summary = summaries.find(t => t.type === 'Time' || t.type === 'triggerTime') ?? summaries[0];
    if (!summary?.name) throw new Error(`No TIME trigger found for ref_job: "${refJob}"`);

    log(`[INFO] GET /resources/trigger?triggername=${summary.name}`);
    const triggerRes = await this.client.get('/resources/trigger', { params: { triggername: summary.name } });
    const fullTrigger = triggerRes.data;

    log(`[INFO] GET /resources/task?taskname=${refJob} (for lfType/lfDuration)`);
    let maxRunTime: number | null = null;
    let maxRunTimeDisplay: string | null = null;
    try {
      const taskRes = await this.client.get('/resources/task', { params: { taskname: refJob } });
      const task = taskRes.data;
      maxRunTime = derivMaxRunTimeFromLF(task.lfType ?? 'Duration', task.lfDuration ?? '');
      if (maxRunTime !== null) {
        maxRunTimeDisplay = `${maxRunTime} min (from lfDuration "${task.lfDuration}")`;
        log(`[INFO] maxRunTime from lfDuration "${task.lfDuration}": ${maxRunTime} minutes`);
      } else {
        log(`[WARN] lfType="${task.lfType}" or lfDuration missing — maxRunTime not set`);
      }
    } catch {
      log(`[WARN] Could not fetch task for maxRunTime`);
    }

    log(`[INFO] Parsing schedule (dayStyle: "${fullTrigger.dayStyle}")`);
    const schedule = parseSchedule(fullTrigger);
    log(`[SUCCESS] Schedule: ${schedule.human_readable} (${schedule.schedule_type})`);

    return { triggerName: summary.name, schedule, maxRunTime, maxRunTimeDisplay, rawTrigger: fullTrigger };
  }

  // ── Triggers ───────────────────────────────────────────────────────────────
  async createTrigger(triggerData: any): Promise<any> {
    const res = await this.client.post('/resources/trigger', triggerData);
    return res.data;
  }

  async enableTrigger(triggerName: string): Promise<any> {
    const res = await this.client.post('/resources/trigger/enabledisable', [{ name: triggerName, enable: true }]);
    return res.data;
  }

  async validateToken(): Promise<boolean> {
    try {
      await this.client.post('/resources/trigger/list', {});
      return true;
    } catch (e: any) {
      if (e.response?.status === 401 || e.response?.status === 403) return false;
      return true;
    }
  }

  // ── Qualifying Times — fetch next run dates for a trigger ──────────────────
  async getQualifyingTimes(triggerName: string, count = 30): Promise<any[]> {
    const res = await this.client.get('/resources/trigger/qualifyingtimes', {
      params: { triggername: triggerName, count },
    });
    return res.data?.qualifyingTimes ?? [];
  }
}
