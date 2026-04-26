import axios, { AxiosInstance } from 'axios';
import { parseSchedule, ParsedSchedule } from '../utils/scheduleParser';
import { resolveAgent } from '../utils/agentResolver';
import { derivMaxRunTimeFromLF } from '../utils/payloadMapper';

export interface ResolvedRefJob {
  triggerName:       string;
  schedule:          ParsedSchedule;
  maxRunTime:        number | null;   // minutes, from lfDuration only
  maxRunTimeDisplay: string | null;
  rawTrigger:        Record<string, any>;
}

export class StoneBranchService {
  private client: AxiosInstance;

  constructor(
    token: string,
    baseURL: string = process.env.BASE_URL || process.env.SB_API_BASE_URL || 'https://adient.stonebranch.cloud'
  ) {    this.client = axios.create({
      baseURL,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    });
  }

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

  /**
   * Full ref_job resolution:
   * 1. POST /resources/trigger/list { tasks: refJob } → trigger name
   * 2. GET  /resources/trigger?triggername=<name>     → full trigger JSON
   * 3. GET  /resources/task?taskname=<refJob>         → lfType + lfDuration → maxRunTime
   * 4. Parse schedule
   */
  async resolveRefJob(refJob: string, logFn?: (msg: string) => void): Promise<ResolvedRefJob> {
    const log = logFn ?? (() => {});

    // Step 1 — find trigger name
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

    // Step 2 — full trigger
    log(`[INFO] GET /resources/trigger?triggername=${summary.name}`);
    const triggerRes = await this.client.get('/resources/trigger', { params: { triggername: summary.name } });
    const fullTrigger = triggerRes.data;

    // Step 3 — maxRunTime from lfDuration (FIX #1)
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

    // Step 4 — parse schedule
    log(`[INFO] Parsing schedule (dayStyle: "${fullTrigger.dayStyle}")`);
    const schedule = parseSchedule(fullTrigger);
    log(`[SUCCESS] Schedule: ${schedule.human_readable} (${schedule.schedule_type})`);

    return { triggerName: summary.name, schedule, maxRunTime, maxRunTimeDisplay, rawTrigger: fullTrigger };
  }

  async createTrigger(triggerData: any): Promise<any> {
    const res = await this.client.post('/resources/trigger', triggerData);
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
}
