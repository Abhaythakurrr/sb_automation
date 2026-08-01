import axios, { AxiosInstance } from 'axios';

const BACKEND = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3001';

export class ApiClient {
  public http: AxiosInstance;
  private sessionId: string;

  constructor(sessionId = '') {
    this.sessionId = sessionId;

    this.http = axios.create({
      baseURL: BACKEND,
      headers: { 'Content-Type': 'application/json' },
      timeout: 60000, // 60s — deletion inspect can take up to 30s on slow UAC
    });

    // Attach session ID to every request — token never sent from browser
    this.http.interceptors.request.use(cfg => {
      if (this.sessionId) {
        cfg.headers['X-Session-ID'] = this.sessionId;
        // Signal activity so the idle-timeout window slides on real API use.
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('api-activity'));
        }
      }
      return cfg;
    });

    // Handle session expiry globally
    this.http.interceptors.response.use(
      r => r,
      err => {
        if (err.response?.status === 401 && err.response?.data?.code === 'SESSION_EXPIRED') {
          // Clear session — store will handle redirect to reconnect
          this.sessionId = '';
          window.dispatchEvent(new CustomEvent('session-expired'));
        }
        return Promise.reject(err);
      }
    );
  }

  setSessionId(id: string) { this.sessionId = id; }
  clearSession()           { this.sessionId = ''; }
  hasSession()             { return !!this.sessionId; }

  // ── Connect — sends token ONCE, gets session ID back ──────────────────────
  // After this, token is never sent from the browser again
  async connect(token: string, baseUrl: string, username?: string): Promise<{ sessionId: string; username: string }> {
    const res = await axios.post(`${BACKEND}/api/stonebranch/connect`, { token, baseUrl, username });
    const sessionId = res.data?.data?.sessionId;
    const resolvedUsername = res.data?.data?.username || username || 'Operator';
    if (!sessionId) throw new Error('No session ID returned');
    this.sessionId = sessionId;
    return { sessionId, username: resolvedUsername };
  }

  async disconnect(): Promise<void> {
    try {
      await this.http.post('/api/stonebranch/disconnect');
    } catch { /* silent */ }
    this.sessionId = '';
  }

  // ── Legacy validate (used before session system) ───────────────────────────
  async validateToken(token: string, baseUrl: string): Promise<boolean> {
    try {
      // Use the connect endpoint which validates and creates a session
      await this.connect(token, baseUrl);
      return true;
    } catch { return false; }
  }

  async uploadFile(file: File): Promise<any> {
    const fd = new FormData();
    fd.append('file', file);
    return this.http.post('/api/upload', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  }

  /**
   * Creates a task on its own, with no trigger.
   *
   * The batch/stream execution endpoints always build a trigger from the row,
   * so a deliberately unscheduled task has to go through the single-task
   * endpoint instead.
   */
  async createTask(payload: any): Promise<any> {
    return this.http.post('/api/stonebranch/task', payload, { timeout: 90000 });
  }

  async resolveRefJobTrigger(refJob: string): Promise<any> {
    return this.http.get('/api/stonebranch/trigger/resolve', { params: { refJob } });
  }

  async enableTriggers(triggerNames: string[]): Promise<any> {
    return this.http.post('/api/stonebranch/triggers/enable', { triggerNames });
  }

  async executeBatch(rows: any[], resolvedRefs: Record<string, any>): Promise<any> {
    return this.http.post('/api/execution/batch', { rows, resolvedRefs });
  }

  // SSE stream execution — real-time updates for each job
  executeStream(
    rows: any[],
    resolvedRefs: Record<string, any>,
    onEvent: (event: string, data: any) => void,
    onDone: () => void,
    onError: (err: string) => void
  ): () => void {
    const controller = new AbortController();

    fetch(`${BACKEND}/api/execution/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.sessionId ? { 'X-Session-ID': this.sessionId } : {}),
      },
      body: JSON.stringify({ rows, resolvedRefs }),
      signal: controller.signal,
    })
      .then(async response => {
        if (!response.ok) {
          const text = await response.text();
          onError(text || `HTTP ${response.status}`);
          return;
        }
        const reader = response.body?.getReader();
        if (!reader) { onError('No response body'); return; }

        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          let currentEvent = '';
          for (const line of lines) {
            if (line.startsWith('event: ')) {
              currentEvent = line.slice(7);
            } else if (line.startsWith('data: ') && currentEvent) {
              try {
                const data = JSON.parse(line.slice(6));
                onEvent(currentEvent, data);
              } catch { /* skip malformed */ }
              currentEvent = '';
            }
          }
        }
        onDone();
      })
      .catch(err => {
        if (err.name !== 'AbortError') {
          onError(err.message || 'Stream connection failed');
        }
      });

    // Return abort function
    return () => controller.abort();
  }

  // ── Agent Control ──────────────────────────────────────────────────────────
  async listAgents(): Promise<any> {
    return this.http.get('/api/agents/list');
  }

  async suspendAgents(agents: string[]): Promise<any> {
    return this.http.post('/api/agents/suspend', { agents });
  }

  async resumeAgents(agents: string[]): Promise<any> {
    return this.http.post('/api/agents/resume', { agents });
  }

  async suspendClusters(clusters: string[]): Promise<any> {
    return this.http.post('/api/agents/clusters/suspend', { clusters });
  }

  async resumeClusters(clusters: string[]): Promise<any> {
    return this.http.post('/api/agents/clusters/resume', { clusters });
  }

  async scheduleAgentAction(agents: string[], action: 'suspend' | 'resume', scheduledAt: string, target: 'agent' | 'cluster' = 'agent'): Promise<any> {
    return this.http.post('/api/agents/schedule', { agents, action, scheduledAt, target });
  }

  async getScheduledJobs(): Promise<any> {
    return this.http.get('/api/agents/schedule');
  }

  async cancelScheduledJob(jobId: string): Promise<any> {
    return this.http.delete(`/api/agents/schedule/${jobId}`);
  }

  // ── Monitoring ─────────────────────────────────────────────────────────────
  async startMonitoring(config: {
    pollIntervalMinutes: number;
    monitorAgents:       boolean;
    monitorJobs:         boolean;
    environment:         string;
    teamsWebhookUrl?:    string;
  }): Promise<any> {
    return this.http.post('/api/monitoring/start', config);
  }

  async stopMonitoring(): Promise<any> {
    return this.http.post('/api/monitoring/stop');
  }

  async getMonitoringStatus(): Promise<any> {
    return this.http.get('/api/monitoring/status');
  }

  async runMonitoringNow(): Promise<any> {
    return this.http.post('/api/monitoring/run-now');
  }

  async clearMonitoringState(): Promise<any> {
    return this.http.post('/api/monitoring/clear-state');
  }

  async getAlerts(): Promise<any> {
    return this.http.get('/api/monitoring/alerts');
  }

  // ── Job Deletion ───────────────────────────────────────────────────────────
  async inspectJob(taskname: string): Promise<any> {
    return this.http.get('/api/deletion/inspect', { params: { taskname }, timeout: 45000 });
  }

  async deleteJob(taskname: string): Promise<any> {
    return this.http.delete('/api/deletion/job', { data: { taskname }, timeout: 90000 });
  }

  async deleteJobsBulk(tasknames: string[]): Promise<any> {
    return this.http.delete('/api/deletion/jobs', { data: { tasknames }, timeout: 300000 });
  }

  async forceFinishJob(taskname: string): Promise<any> {
    return this.http.post('/api/deletion/force-finish', { taskname });
  }

  async backupJobs(tasknames: string[]): Promise<any> {
    return this.http.post('/api/deletion/backup', { tasknames }, { timeout: 300000 });
  }

  async recoverJob(task: any, triggers: any[]): Promise<any> {
    return this.http.post('/api/deletion/recover', { task, triggers });
  }

  // ── Recovery Center — server-persisted recoverable jobs (per env) ──────────
  async getRecovery(): Promise<any> {
    return this.http.get('/api/deletion/recovery');
  }

  async removeRecovery(taskname: string): Promise<any> {
    return this.http.delete('/api/deletion/recovery', { data: { taskname } });
  }

  async clearRecovery(): Promise<any> {
    return this.http.delete('/api/deletion/recovery', { data: {} });
  }

  // ── Ad-hoc Launch & Live Monitor ───────────────────────────────────────────
  async adhocSearch(q: string): Promise<any> {
    return this.http.get('/api/adhoc/search', { params: { q } });
  }

  async adhocLaunch(kind: string, name: string): Promise<any> {
    return this.http.post('/api/adhoc/launch', { kind, name });
  }

  async adhocStatus(instances: { id: string; name: string }[]): Promise<any> {
    return this.http.post('/api/adhoc/instance/status', { instances });
  }

  async adhocOp(op: string, id: string, name: string): Promise<any> {
    return this.http.post('/api/adhoc/instance/op', { op, id, name });
  }

  // ── Job Doc — push to Power Automate / shared Excel ────────────────────────
  async pushJobDoc(rows: any[]): Promise<any> {
    return this.http.post('/api/jobdoc/push', { rows }, { timeout: 300000 });
  }

  // ── Preview — get the exact payload that will be sent to UAC ───────────────
  async previewPayloads(rows: any[], resolvedRefs: Record<string, any>): Promise<any> {
    return this.http.post('/api/execution/preview', { rows, resolvedRefs });
  }

  // ── Qualifying Times — fetch run cycle from UAC ────────────────────────────
  async getQualifyingTimes(triggerName: string, count = 30): Promise<any> {
    return this.http.get('/api/execution/qualifying-times', { params: { triggername: triggerName, count } });
  }

  // ── Verify — fetch and validate created task + trigger from UAC ────────────
  async verifyJob(taskName: string): Promise<any> {
    return this.http.post('/api/execution/verify', { taskName });
  }

  // ── Search & Edit — quick lookup and update ────────────────────────────────
  async searchTask(name: string): Promise<any> {
    return this.http.get('/api/search/task', { params: { name } });
  }

  async searchTrigger(name: string): Promise<any> {
    return this.http.get('/api/search/trigger', { params: { name } });
  }

  async updateTask(payload: any): Promise<any> {
    return this.http.put('/api/search/task', payload);
  }

  async updateTrigger(payload: any): Promise<any> {
    return this.http.put('/api/search/trigger', payload);
  }

  // ── AI Operations Copilot (Beta) ───────────────────────────────────────────
  // Health is public — the dock needs it before the user has connected.
  async copilotHealth(): Promise<any> {
    return axios.get(`${BACKEND}/api/copilot/health`, { timeout: 8000 });
  }

  /**
   * Shares the current page and session state so the Copilot is context- and
   * upload-aware without being asked. Safe to call on every meaningful change.
   */
  async copilotContext(body: {
    context?: { page: string; step?: string; focus?: string; detail?: Record<string, unknown> };
    upload?: { filename: string; rows: any[] } | null;
    payloads?: { name: string; task: any; trigger: any; summary?: string }[];
    executions?: { name: string; type: 'task' | 'trigger'; status: 'pending' | 'success' | 'failed'; message?: string; at?: string }[];
    reset?: boolean;
  }): Promise<any> {
    return this.http.post('/api/copilot/context', body);
  }

  async copilotAsk(question: string, context?: { page: string; step?: string; focus?: string }): Promise<any> {
    return this.http.post('/api/copilot/ask', { question, context }, { timeout: 60000 });
  }

  async copilotSuggestions(page: string): Promise<any> {
    return this.http.get('/api/copilot/suggestions', { params: { page } });
  }

  async copilotAnalyze(rows?: any[]): Promise<any> {
    return this.http.post('/api/copilot/analyze', rows ? { rows } : {});
  }

  async copilotExplain(body: {
    subject: 'field' | 'payload' | 'error' | 'finding' | 'destination' | 'schedule';
    name?: string;
    scope?: 'input' | 'task' | 'trigger';
    error?: string;
    payload?: { name?: string; task?: any; trigger?: any };
    finding?: any;
    destination?: 'task' | 'trigger' | 'enable';
  }): Promise<any> {
    return this.http.post('/api/copilot/explain', body);
  }

  async copilotSchedule(input: string, timezone?: string): Promise<any> {
    return this.http.post('/api/copilot/schedule', { input, timezone });
  }

  async copilotWizard(action: string, answer?: string): Promise<any> {
    return this.http.post('/api/copilot/wizard', { action, answer });
  }

  async copilotImpact(operation: 'create' | 'delete', opts: { taskName?: string; rows?: any[] } = {}): Promise<any> {
    return this.http.post('/api/copilot/impact', { operation, ...opts });
  }

  async copilotMemory(): Promise<any> {
    return this.http.get('/api/copilot/memory');
  }

  async copilotClearMemory(): Promise<any> {
    return this.http.delete('/api/copilot/memory');
  }

  /**
   * Records a verdict on an answer.
   *
   * A bare thumbs-down is recorded but teaches nothing — it says an answer was
   * wrong without saying what right looks like. `expected` carries a checkable
   * label, and only those reach the model.
   */
  async copilotFeedback(body: {
    verdict: 'up' | 'down';
    text: string;
    mode?: string;
    intent?: string;
    page?: string;
    correction?: string;
    expected?: { kind: 'timeShape' | 'dayShape' | 'intent'; value: string }[];
    predicted?: string;
  }): Promise<any> {
    return this.http.post('/api/copilot/feedback', body);
  }

  /** The Copilot's own scorecard, model state, and what it has learned so far. */
  async copilotScore(): Promise<any> {
    return this.http.get('/api/copilot/score');
  }
}
