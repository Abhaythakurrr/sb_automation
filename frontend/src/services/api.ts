import axios, { AxiosInstance } from 'axios';

// Backend URL — must be set via NEXT_PUBLIC_API_BASE_URL in production
// In dev: http://localhost:3001
// In prod: https://sb-automation.adient.internal (or whatever the internal domain is)
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
}
