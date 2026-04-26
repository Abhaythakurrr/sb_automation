import axios, { AxiosInstance } from 'axios';

const BACKEND = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3001';

export class ApiClient {
  private http: AxiosInstance;
  private token: string;
  private baseUrl: string;

  constructor(token = '', baseUrl = '') {
    this.token   = token;
    this.baseUrl = baseUrl;

    this.http = axios.create({
      baseURL: BACKEND,
      headers: { 'Content-Type': 'application/json' },
    });

    // Attach token + baseUrl to every request
    this.http.interceptors.request.use(cfg => {
      if (this.token)   cfg.headers['Authorization']  = `Bearer ${this.token}`;
      if (this.baseUrl) cfg.headers['X-SB-Base-URL']  = this.baseUrl;
      return cfg;
    });
  }

  setToken(t: string)   { this.token   = t; }
  setBaseUrl(u: string) { this.baseUrl = u; }

  async validateToken(token: string, baseUrl: string): Promise<boolean> {
    try {
      const res = await this.http.get('/api/stonebranch/validate', {
        headers: {
          Authorization:  `Bearer ${token}`,
          'X-SB-Base-URL': baseUrl,
        },
      });
      return res.data?.success === true;
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
}
