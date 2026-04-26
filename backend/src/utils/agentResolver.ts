import { AxiosInstance } from 'axios';

export interface ResolvedAgent {
  field: 'agent' | 'agentCluster';
  value: string;
}

// Cache keyed by base URL — never returns stale empty lists
const agentCacheMap:   Map<string, any[]> = new Map();
const clusterCacheMap: Map<string, any[]> = new Map();

function getCacheKey(client: AxiosInstance): string {
  return client.defaults.baseURL ?? 'default';
}

async function getAllAgents(client: AxiosInstance, logFn: (m: string) => void): Promise<any[]> {
  const key = getCacheKey(client);
  const cached = agentCacheMap.get(key);
  // Only use cache if it has data
  if (cached && cached.length > 0) return cached;

  try {
    logFn('[INFO] Fetching agent list...');
    const res = await client.get('/resources/agent/list');
    const raw = res.data;
    const list: any[] = Array.isArray(raw) ? raw : (raw?.agent ?? []);
    if (list.length > 0) agentCacheMap.set(key, list);
    logFn(`[INFO] Loaded ${list.length} agents`);
    return list;
  } catch (e: any) {
    logFn(`[WARN] Could not fetch agents: ${e.message}`);
    return [];
  }
}

async function getAllClusters(client: AxiosInstance, logFn: (m: string) => void): Promise<any[]> {
  const key = getCacheKey(client);
  const cached = clusterCacheMap.get(key);
  // Only use cache if it has data
  if (cached && cached.length > 0) return cached;

  try {
    logFn('[INFO] Fetching agent cluster list...');
    const res = await client.get('/resources/agentcluster/list');
    const raw = res.data;
    const list: any[] = Array.isArray(raw) ? raw : (raw?.agentCluster ?? []);
    if (list.length > 0) clusterCacheMap.set(key, list);
    logFn(`[INFO] Loaded ${list.length} agent clusters`);
    return list;
  } catch (e: any) {
    logFn(`[WARN] Could not fetch clusters: ${e.message}`);
    return [];
  }
}

/**
 * Resolve agent field from Excel input using smart matching:
 * 1. Exact agent name
 * 2. Exact agentCluster name
 * 3. Prefix match on agentCluster (shortest wins)
 * 4. Contains match on agentCluster (shortest wins)
 * 5. Prefix match on agent
 * 6. Fallback: use as-is as agentCluster
 */
export async function resolveAgent(
  value: string,
  client: AxiosInstance,
  logFn?: (msg: string) => void
): Promise<ResolvedAgent> {
  const log = logFn ?? ((m: string) => console.log(m));
  const v = value?.trim() ?? '';
  if (!v) return { field: 'agentCluster', value: '' };

  const [agents, clusters] = await Promise.all([
    getAllAgents(client, log),
    getAllClusters(client, log),
  ]);

  log(`[INFO] Resolving agent "${v}" — ${agents.length} agents, ${clusters.length} clusters available`);

  // 1. Exact agent
  const exactAgent = agents.find(a => a.name === v);
  if (exactAgent) {
    log(`[INFO] Agent resolved (exact→agent): "${v}"`);
    return { field: 'agent', value: exactAgent.name };
  }

  // 2. Exact cluster
  const exactCluster = clusters.find(c => c.name === v);
  if (exactCluster) {
    log(`[INFO] Agent resolved (exact→cluster): "${v}"`);
    return { field: 'agentCluster', value: exactCluster.name };
  }

  // 3. Prefix match on cluster (input is prefix of cluster name)
  const prefixClusters = clusters
    .filter(c => c.name.startsWith(v))
    .sort((a, b) => a.name.length - b.name.length);
  if (prefixClusters.length > 0) {
    log(`[INFO] Agent resolved (prefix→cluster): "${v}" → "${prefixClusters[0].name}"`);
    return { field: 'agentCluster', value: prefixClusters[0].name };
  }

  // 4. Contains match on cluster
  const containsClusters = clusters
    .filter(c => c.name.includes(v))
    .sort((a, b) => a.name.length - b.name.length);
  if (containsClusters.length > 0) {
    log(`[INFO] Agent resolved (contains→cluster): "${v}" → "${containsClusters[0].name}"`);
    return { field: 'agentCluster', value: containsClusters[0].name };
  }

  // 5. Prefix match on agent
  const prefixAgents = agents
    .filter(a => a.name.startsWith(v))
    .sort((a, b) => a.name.length - b.name.length);
  if (prefixAgents.length > 0) {
    log(`[INFO] Agent resolved (prefix→agent): "${v}" → "${prefixAgents[0].name}"`);
    return { field: 'agent', value: prefixAgents[0].name };
  }

  // 6. Fallback — log clearly so user knows
  log(`[WARN] Agent "${v}" NOT found in ${agents.length} agents / ${clusters.length} clusters — sending as-is`);
  return { field: 'agentCluster', value: v };
}
