/**
 * Stonebranch Monitoring Service
 * Polls agents and task instances, sends Teams alerts on changes.
 * Parses ServiceNow incident numbers from operationalMemo field.
 */

import axios from 'axios';
import fs    from 'fs';
import path  from 'path';

export interface MonitorConfig {
  sbBaseUrl:      string;
  sbToken:        string;
  teamsWebhookUrl:string;
  pollIntervalMs: number;
  monitorAgents:  boolean;
  monitorJobs:    boolean;
  environment:    string;
}

export interface AlertRecord {
  id:              string;
  type:            'agent_offline' | 'job_failure';
  name:            string;
  status?:         string;
  agent?:          string;
  time:            string;
  environment:     string;
  baseUrl?:        string;   // UAC environment (base URL) this alert came from
  operationalMemo: string;
  incidentNumbers: string[];
  serviceNowLinks: string[];
  teamsSent:       boolean;
}

const STATE_FILE   = path.join(process.cwd(), 'monitor_state.json');
const HISTORY_FILE = path.join(process.cwd(), 'alert_history.json');

// Hardcoded default MS Teams webhook (Power Automate channel). Used whenever no
// webhook is explicitly configured via env or the monitoring config.
export const DEFAULT_TEAMS_WEBHOOK =
  'https://default189de737c93a4f5a8b686f4ca99419.12.environment.api.powerplatform.com:443/powerautomate/automations/direct/workflows/4f2dfb629f224989ac59d51c0c92f1ea/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=h5M4DuQzQG1hAcd30k_FIwzD2pUMctRLclxjoV7BTKo';

// Resolve the effective webhook: explicit config → env override → hardcoded default.
export function resolveWebhook(configured?: string): string {
  return (configured && configured.trim()) || process.env.TEAMS_WEBHOOK_URL || DEFAULT_TEAMS_WEBHOOK;
}

interface AlertState {
  offlineAgents: Record<string, string>;
  failedJobs:    Record<string, string>;
}

function loadState(): AlertState {
  try {
    if (fs.existsSync(STATE_FILE)) return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
  } catch { /* ignore */ }
  return { offlineAgents: {}, failedJobs: {} };
}

function saveState(state: AlertState): void {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

export function loadAlertHistory(): AlertRecord[] {
  try {
    if (fs.existsSync(HISTORY_FILE)) return JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf-8'));
  } catch { /* ignore */ }
  return [];
}

function appendAlert(alert: AlertRecord): void {
  const history = loadAlertHistory();
  history.push(alert);
  // Keep last 200
  const trimmed = history.slice(-200);
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(trimmed, null, 2));
}

function parseIncidentNumbers(memo: string): string[] {
  if (!memo) return [];
  const matches = memo.match(/INC\d+/gi) || [];
  return [...new Set(matches.map((m: string) => m.toUpperCase()))];
}

// Choose the ServiceNow instance based on the connected UAC environment.
// Prod UAC (e.g. adient.stonebranch.cloud)      → adientprod.service-now.com
// Non-prod UAC (e.g. adienttst.stonebranch.cloud) → adientdev.service-now.com
function serviceNowHost(baseUrl?: string): string {
  const url = (baseUrl || '').toLowerCase();
  const isNonProd = /\b(tst|test|dev|qa|uat|stg|stage|staging|nonprod|non-prod|sandbox)\b/.test(url)
    || /adienttst|adientdev|adientqa|adientuat/.test(url);
  return isNonProd ? 'adientdev.service-now.com' : 'adientprod.service-now.com';
}

function buildServiceNowLinks(incidentNumbers: string[], baseUrl?: string): string[] {
  const host = serviceNowHost(baseUrl);
  return incidentNumbers.map(inc =>
    `https://${host}/nav_to.do?uri=incident_list.do?sysparm_query=number=${inc}`
  );
}

async function sendTeamsCard(webhookUrl: string, card: object): Promise<void> {
  if (!webhookUrl) return; // No webhook configured — skip silently
  await axios.post(webhookUrl, card, {
    headers: { 'Content-Type': 'application/json' },
    timeout: 10000,
  });
}

function buildAgentOfflineCard(agent: any, env: string): object {
  return {
    type: 'message',
    attachments: [{
      contentType: 'application/vnd.microsoft.card.adaptive',
      content: {
        type: 'AdaptiveCard',
        version: '1.4',
        body: [
          {
            type: 'Container',
            style: 'attention',
            items: [{ type: 'TextBlock', text: 'AGENT OFFLINE', weight: 'Bolder', size: 'Large', color: 'Attention' }],
          },
          {
            type: 'FactSet',
            facts: [
              { title: 'Agent',       value: agent.name },
              { title: 'Host',        value: agent.hostName  || 'N/A' },
              { title: 'IP',          value: agent.ipAddress || 'N/A' },
              { title: 'Type',        value: agent.type      || 'N/A' },
              { title: 'Environment', value: env },
              { title: 'Detected',    value: new Date().toUTCString() },
            ],
          },
          { type: 'TextBlock', text: 'Please investigate and bring the agent back online when ready.', wrap: true, color: 'Warning', size: 'Small' },
        ],
      },
    }],
  };
}

function buildJobFailureCard(instance: any, env: string, incidentNumbers: string[], serviceNowLinks: string[]): object {
  const facts: any[] = [
    { title: 'Task',        value: instance.name || instance.taskName || 'N/A' },
    { title: 'Status',      value: instance.status || 'Failed' },
    { title: 'Agent',       value: instance.agent || instance.agentName || 'N/A' },
    { title: 'Started',     value: instance.startTime  || 'N/A' },
    { title: 'Ended',       value: instance.endTime    || 'N/A' },
    { title: 'Environment', value: env },
  ];

  if (instance.operationalMemo) {
    facts.push({ title: 'Operational Memo', value: instance.operationalMemo });
  }

  if (incidentNumbers.length > 0) {
    facts.push({ title: 'ServiceNow Incident', value: incidentNumbers.join(', ') });
  }

  const body: any[] = [
    {
      type: 'Container',
      style: 'attention',
      items: [{ type: 'TextBlock', text: 'JOB FAILURE ALERT', weight: 'Bolder', size: 'Large', color: 'Attention' }],
    },
    { type: 'FactSet', facts },
    { type: 'TextBlock', text: 'Check the Stonebranch console for details.', wrap: true, color: 'Warning', size: 'Small' },
  ];

  // Add ServiceNow links as action buttons
  const actions: any[] = serviceNowLinks.map((link, i) => ({
    type: 'Action.OpenUrl',
    title: `Open ${incidentNumbers[i] || 'Incident'}`,
    url: link,
  }));

  return {
    type: 'message',
    attachments: [{
      contentType: 'application/vnd.microsoft.card.adaptive',
      content: {
        type: 'AdaptiveCard',
        version: '1.4',
        body,
        ...(actions.length > 0 ? { actions } : {}),
      },
    }],
  };
}

export async function runMonitoringCycle(config: MonitorConfig): Promise<{
  agentAlerts:   number;
  jobAlerts:     number;
  agentsTotal:   number;
  agentsOffline: number;
  jobsFailed:    number;
  errors:        string[];
}> {
  const state  = loadState();
  const webhook = resolveWebhook(config.teamsWebhookUrl);
  const client = axios.create({
    baseURL: config.sbBaseUrl,
    headers: {
      Authorization: `Bearer ${config.sbToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    timeout: 15000,
  });

  let agentAlerts   = 0;
  let jobAlerts     = 0;
  let agentsTotal   = 0;
  let agentsOffline = 0;
  let jobsFailed    = 0;
  const errors: string[] = [];

  // ── Monitor agents ──────────────────────────────────────────────────────────
  // Monitoring operates at the AGENT level (offline detection). Cluster
  // suspend/resume is a separate concern handled by Agent Control (management).
  if (config.monitorAgents) {
    try {
      const res    = await client.get('/resources/agent/list');
      const agents = Array.isArray(res.data) ? res.data : (res.data?.agent ?? []);
      const currentOffline = new Set<string>();
      agentsTotal = agents.length;

      for (const agent of agents) {
        if (!agent?.name) continue;
        // An agent is "offline" when it is not Active and not intentionally suspended.
        const isOffline = agent.status !== 'Active' && agent.suspended !== true;
        if (isOffline) {
          currentOffline.add(agent.name);
          if (!state.offlineAgents[agent.name]) {
            state.offlineAgents[agent.name] = new Date().toISOString();
            const alert: AlertRecord = {
              id:              `agent-${agent.name}-${Date.now()}`,
              type:            'agent_offline',
              name:            agent.name,
              status:          agent.status,
              agent:           agent.name,
              time:            new Date().toISOString(),
              environment:     config.environment,
              baseUrl:         config.sbBaseUrl,
              operationalMemo: '',
              incidentNumbers: [],
              serviceNowLinks: [],
              teamsSent:       false,
            };
            try {
              await sendTeamsCard(webhook, buildAgentOfflineCard(agent, config.environment));
              alert.teamsSent = true;
              agentAlerts++;
              console.log(`[MONITOR] Agent offline alert sent: ${agent.name}`);
            } catch (e: any) {
              errors.push(`Teams send failed for agent ${agent.name}: ${e.message}`);
            }
            appendAlert(alert);
          }
        }
      }

      // Clear agents that came back online.
      for (const name of Object.keys(state.offlineAgents)) {
        if (!currentOffline.has(name)) {
          delete state.offlineAgents[name];
          console.log(`[MONITOR] Agent back online: ${name}`);
        }
      }
      agentsOffline = currentOffline.size;
    } catch (e: any) {
      const status = e.response?.status;
      const hint = status === 401
        ? ' (401 Unauthorized — the monitoring token is missing/expired; reconnect and reopen the Monitoring page)'
        : '';
      errors.push(`Agent monitoring error: ${e.message}${hint}`);
    }
  }

  // ── Monitor job failures ────────────────────────────────────────────────────
  if (config.monitorJobs) {
    try {
      // UAC: POST /resources/taskinstance/list (it is a POST, not GET — GET returns 405).
      // `name` is required but accepts wildcards, so "*" matches all task instances.
      // status codes: Failed = 140, Start Failure = 120. updatedTimeType "Today"
      // scopes to today's instances (updatedTime is ignored when type is Today).
      const allInstances: any[] = [];
      try {
        const res = await client.post('/resources/taskinstance/list', {
          name: '*',
          status: '140,120',          // Failed, Start Failure
          updatedTimeType: 'Today',
        }, { timeout: 20000 });
        const list = Array.isArray(res.data) ? res.data : (res.data?.taskInstance ?? []);
        allInstances.push(...list);
      } catch (e: any) {
        // Fallback: query each status by name and a 1-day offset window.
        try {
          for (const code of ['140', '120']) {
            const res = await client.post('/resources/taskinstance/list', {
              name: '*',
              status: code,
              updatedTimeType: 'Offset',
              updatedTime: '-1d',
            }, { timeout: 20000 });
            const list = Array.isArray(res.data) ? res.data : (res.data?.taskInstance ?? []);
            allInstances.push(...list);
          }
        } catch (e2: any) {
          const msg = typeof e2.response?.data === 'string' ? e2.response.data : e2.message;
          console.warn('[MONITOR] taskinstance/list error:', msg);
          errors.push(`Job monitoring query failed: ${msg}`);
        }
      }

      jobsFailed = allInstances.length;

      for (const instance of allInstances) {
        const id = instance.sysId || instance.id || `${instance.name}-${instance.startTime}`;
        if (!id) continue;
        if (!state.failedJobs[id]) {
          state.failedJobs[id] = new Date().toISOString();

          // Parse ServiceNow incident from operationalMemo
          const memo           = instance.operationalMemo || '';
          const incidentNumbers = parseIncidentNumbers(memo);
          const serviceNowLinks = buildServiceNowLinks(incidentNumbers, config.sbBaseUrl);

          const alert: AlertRecord = {
            id:              `job-${id}-${Date.now()}`,
            type:            'job_failure',
            name:            instance.name || instance.taskName || id,
            status:          instance.status,
            agent:           instance.agent || instance.agentName || '',
            time:            instance.endTime || instance.startTime || new Date().toISOString(),
            environment:     config.environment,
            baseUrl:         config.sbBaseUrl,
            operationalMemo: memo,
            incidentNumbers,
            serviceNowLinks,
            teamsSent:       false,
          };

          try {
            await sendTeamsCard(
              webhook,
              buildJobFailureCard(instance, config.environment, incidentNumbers, serviceNowLinks)
            );
            alert.teamsSent = true;
            jobAlerts++;
            console.log(`[MONITOR] Job failure alert sent: ${alert.name}${incidentNumbers.length ? ` [${incidentNumbers.join(', ')}]` : ''}`);
          } catch (e: any) {
            errors.push(`Teams send failed for job ${alert.name}: ${e.message}`);
          }

          appendAlert(alert);

          // Update operational memo with alert timestamp
          if (instance.sysId) {
            try {
              const memoUpdate = memo
                ? `${memo} | Teams alert: ${new Date().toUTCString()}`
                : `Teams alert sent: ${new Date().toUTCString()}`;
              await client.put('/resources/taskinstance/updatememo', null, {
                params: { taskinstanceid: instance.sysId, memo: memoUpdate.slice(0, 255) },
              });
            } catch { /* best-effort */ }
          }
        }
      }

      // Prune old job failures
      const keys = Object.keys(state.failedJobs);
      if (keys.length > 500) {
        const sorted = keys.sort((a, b) =>
          new Date(state.failedJobs[a]).getTime() - new Date(state.failedJobs[b]).getTime()
        );
        sorted.slice(0, keys.length - 500).forEach(k => delete state.failedJobs[k]);
      }
    } catch (e: any) {
      errors.push(`Job monitoring error: ${e.message}`);
    }
  }

  saveState(state);
  return { agentAlerts, jobAlerts, agentsTotal, agentsOffline, jobsFailed, errors };
}
