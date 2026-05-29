import axios, { AxiosInstance } from 'axios';

const BACKEND = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3001';

export class ApiClient {
  private http: AxiosInstance;
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
  async connect(token: string, baseUrl: string): Promise<{ sessionId: string }> {
    const res = await axios.post(`${BACKEND}/api/stonebranch/connect`, { token, baseUrl });
    const sessionId = res.data?.data?.sessionId;
    if (!sessionId) throw new Error('No session ID returned');
    this.sessionId = sessionId;
    return { sessionId };
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

  async resolveRefJobTrigger(refJob: string): Promise<any> {
    return this.http.get('/api/stonebranch/trigger/resolve', { params: { refJob } });
  }

  async executeBatch(rows: any[], resolvedRefs: Record<string, any>): Promise<any> {
    return this.http.post('/api/execution/batch', { rows, resolvedRefs });
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

  async scheduleAgentAction(agents: string[], action: 'suspend' | 'resume', scheduledAt: string): Promise<any> {
    return this.http.post('/api/agents/schedule', { agents, action, scheduledAt });
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
    return this.http.get('/api/deletion/inspect', { params: { taskname } });
  }

  async deleteJob(taskname: string): Promise<any> {
    return this.http.delete('/api/deletion/job', { data: { taskname } });
  }

  async deleteJobsBulk(tasknames: string[]): Promise<any> {
    return this.http.delete('/api/deletion/jobs', { data: { tasknames } });
  }

  async forceFinishJob(taskname: string): Promise<any> {
    return this.http.post('/api/deletion/force-finish', { taskname });
  }
}
