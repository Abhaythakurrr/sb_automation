/**
 * Stonebranch Monitoring Service.
 * Polls agents and task instances on a configurable interval, builds MS Teams
 * Adaptive Card alerts on state changes, and parses ServiceNow incident numbers
 * from the UAC `operationalMemo` field to include clickable deep-links in alerts.
 */

import axios from 'axios';
import fs    from 'fs';
import path  from 'path';
import { createModuleLogger } from '../config/logger';

const log = createModuleLogger('monitoringService');

// ServiceNow instances differ between production and non-production UAC
// environments. Both are configurable; the defaults preserve existing behaviour.
const SERVICENOW_NONPROD_HOST = process.env.SERVICENOW_NONPROD_HOST || 'adientdev.service-now.com';
const SERVICENOW_PROD_HOST = process.env.SERVICENOW_PROD_HOST || 'adientprod.service-now.com';

export interface MonitorConfig {
  sessionId:      string;
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

// Config, state and alert history are all scoped per session for multi-user isolation.
const CONFIG_DIR     = path.join(process.cwd(), 'monitor_configs');
const STATE_DIR      = path.join(process.cwd(), 'monitor_states');
const HISTORY_DIR    = path.join(process.cwd(), 'monitor_history');

// Ensure directories exist
[CONFIG_DIR, STATE_DIR, HISTORY_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// Global Teams-alert deduplication. When several users run monitoring at once
// they may observe the same offline agent or failed job; a single shared store
// of already-sent alert IDs guarantees each alert reaches Teams only once, while
// per-session state/history are kept separately for each user's UI.
const SENT_ALERTS_FILE = path.join(process.cwd(), 'monitor_sent_alerts.json');

interface SentAlertRecord {
  alertId:    string;
  sentAt:     string;
  teamsWebhook: string;
}

function loadSentAlerts(): Record<string, SentAlertRecord> {
  try {
    if (fs.existsSync(SENT_ALERTS_FILE)) {
      return JSON.parse(fs.readFileSync(SENT_ALERTS_FILE, 'utf-8'));
    }
  } catch { /* ignore */ }
  return {};
}

function saveSentAlerts(sent: Record<string, SentAlertRecord>): void {
  fs.writeFileSync(SENT_ALERTS_FILE, JSON.stringify(sent, null, 2));
}

function markAlertSent(alertId: string, webhook: string): void {
  const sent = loadSentAlerts();
  sent[alertId] = {
    alertId,
    sentAt: new Date().toISOString(),
    teamsWebhook: webhook,
  };
  saveSentAlerts(sent);
  log.debug('Alert marked as sent to Teams', { alertId });
}

function isAlertSent(alertId: string): boolean {
  const sent = loadSentAlerts();
  return !!sent[alertId];
}

function getConfigFile(sessionId: string): string {
  return path.join(CONFIG_DIR, `monitor_config_${sessionId}.json`);
}

function getStateFile(sessionId: string): string {
  return path.join(STATE_DIR, `monitor_state_${sessionId}.json`);
}

function getHistoryFile(sessionId: string): string {
  return path.join(HISTORY_DIR, `alert_history_${sessionId}.json`);
}

// Resolve the effective Teams webhook: an explicit per-request value wins,
// otherwise fall back to the environment. There is deliberately no hardcoded
// default so alerts can never be sent to an unintended channel.
export function resolveWebhook(configured?: string): string {
  const webhook = (configured && configured.trim()) || process.env.TEAMS_WEBHOOK_URL;
  if (!webhook) {
    log.warn('No Teams webhook configured — alerts will not be sent');
  }
  return webhook || '';
}

interface AlertState {
  offlineAgents: Record<string, string>;
  failedJobs:    Record<string, string>;
}

function loadState(sessionId: string): AlertState {
  try {
    const stateFile = getStateFile(sessionId);
    if (fs.existsSync(stateFile)) return JSON.parse(fs.readFileSync(stateFile, 'utf-8'));
  } catch { /* ignore */ }
  return { offlineAgents: {}, failedJobs: {} };
}

function saveState(sessionId: string, state: AlertState): void {
  const stateFile = getStateFile(sessionId);
  fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
}

export function loadAlertHistory(sessionId: string): AlertRecord[] {
  try {
    const historyFile = getHistoryFile(sessionId);
    if (fs.existsSync(historyFile)) return JSON.parse(fs.readFileSync(historyFile, 'utf-8'));
  } catch { /* ignore */ }
  return [];
}

function appendAlert(sessionId: string, alert: AlertRecord): void {
  const history = loadAlertHistory(sessionId);
  history.push(alert);
  // Keep last 200
  const trimmed = history.slice(-200);
  const historyFile = getHistoryFile(sessionId);
  fs.writeFileSync(historyFile, JSON.stringify(trimmed, null, 2));
}

function parseIncidentNumbers(memo: string): string[] {
  if (!memo) return [];
  const matches = memo.match(/INC\d+/gi) || [];
  return [...new Set(matches.map((m: string) => m.toUpperCase()))];
}

// Choose the ServiceNow instance based on the connected UAC environment.
function serviceNowHost(baseUrl?: string): string {
  const url = (baseUrl || '').toLowerCase();
  const isNonProd = /\b(tst|test|dev|qa|uat|stg|stage|staging|nonprod|non-prod|sandbox)\b/.test(url)
    || /adienttst|adientdev|adientqa|adientuat/.test(url);
  return isNonProd ? SERVICENOW_NONPROD_HOST : SERVICENOW_PROD_HOST;
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
  const state  = loadState(config.sessionId);
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
            const alertId = `agent-${agent.name}-${Date.now()}`;
            const alert: AlertRecord = {
              id:              alertId,
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
            
            // Check if this alert has already been sent to Teams (global dedup)
            if (!isAlertSent(alertId)) {
              try {
                await sendTeamsCard(webhook, buildAgentOfflineCard(agent, config.environment));
                alert.teamsSent = true;
                markAlertSent(alertId, webhook); // Mark as sent globally
                agentAlerts++;
                log.info('Agent offline alert sent', { agent: agent.name, environment: config.environment });
              } catch (e: any) {
                errors.push(`Teams send failed for agent ${agent.name}: ${e.message}`);
              }
            } else {
              log.debug('Agent offline alert suppressed (already sent)', { agent: agent.name });
            }
            appendAlert(config.sessionId, alert);
          }
        }
      }

      // Clear agents that came back online.
      for (const name of Object.keys(state.offlineAgents)) {
        if (!currentOffline.has(name)) {
          delete state.offlineAgents[name];
          log.info('Agent back online', { agent: name });
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
          log.warn('taskinstance/list query failed', { error: msg });
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

          const alertId = `job-${id}-${Date.now()}`;
          const alert: AlertRecord = {
            id:              alertId,
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

          // Check if this alert has already been sent to Teams (global dedup)
          if (!isAlertSent(alertId)) {
            try {
              await sendTeamsCard(
                webhook,
                buildJobFailureCard(instance, config.environment, incidentNumbers, serviceNowLinks)
              );
              alert.teamsSent = true;
              markAlertSent(alertId, webhook); // Mark as sent globally
              jobAlerts++;
              log.info('Job failure alert sent', { job: alert.name, incidents: incidentNumbers, environment: config.environment });
            } catch (e: any) {
              errors.push(`Teams send failed for job ${alert.name}: ${e.message}`);
            }
          } else {
            log.debug('Job failure alert suppressed (already sent)', { job: alert.name });
          }

          appendAlert(config.sessionId, alert);

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

  saveState(config.sessionId, state);
  return { agentAlerts, jobAlerts, agentsTotal, agentsOffline, jobsFailed, errors };
}
