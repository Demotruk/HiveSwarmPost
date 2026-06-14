import { Client, PrivateKey } from '@hiveio/dhive';

interface NodeState {
  url: string;
  client: Client;
  errors: number;
}

let nodes: NodeState[] = [];
let privateKey: PrivateKey;

export function initClient(config: { hiveNodes: string[]; postingKey?: string }): void {
  nodes = config.hiveNodes.map(url => ({
    url,
    client: new Client([url], { timeout: 30000, failoverThreshold: 1 }),
    errors: 0,
  }));
  if (config.postingKey) {
    privateKey = PrivateKey.fromString(config.postingKey);
  }
}

function getBestNode(): NodeState {
  if (nodes.length === 0) throw new Error('Hive client not initialized. Call initClient first.');
  return nodes.reduce((best, node) => node.errors < best.errors ? node : best);
}

export function getClient(): Client {
  return getBestNode().client;
}

export function getPrivateKey(): PrivateKey {
  if (!privateKey) throw new Error('Private key not initialized. Call initClient first.');
  return privateKey;
}

/**
 * Broadcast operations with an explicit private key (instead of the global one).
 * Used by Feed 3 to reblog with per-subscriber managed account keys.
 */
export async function broadcastWithKey(
  ops: any[],
  key: PrivateKey,
): Promise<void> {
  await getClient().broadcast.sendOperations(ops, key);
}

/**
 * Raw JSON-RPC call to Hive API.
 * Used for APIs that dhive doesn't wrap natively.
 */
export async function hiveCall<T>(api: string, method: string, params: unknown[]): Promise<T> {
  return getClient().call(api, method, params) as Promise<T>;
}

/**
 * Retry a function up to maxRetries times with exponential backoff.
 * On each failure, the current node is penalized so the next attempt
 * uses a different (healthier) node. On success, the node is rewarded.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000,
): Promise<T> {
  let lastError: Error | undefined;
  for (let i = 0; i <= maxRetries; i++) {
    try {
      const result = await fn();
      const best = getBestNode();
      if (best.errors > 0) best.errors--;
      return result;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      const best = getBestNode();
      best.errors++;
      if (i < maxRetries) {
        const nextBest = getBestNode();
        const delay = baseDelay * Math.pow(2, i);
        const rotated = nextBest.url !== best.url ? ` → ${new URL(nextBest.url).hostname}` : '';
        console.log(`Retry ${i + 1}/${maxRetries} after ${delay}ms: ${lastError.message}${rotated}`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError;
}

/** Log a summary of node health (call at end of run). */
export function logNodeHealth(): void {
  if (nodes.length === 0) return;
  const summary = nodes
    .map(n => `${new URL(n.url).hostname}(${n.errors})`)
    .join(', ');
  console.log(`Node health: ${summary}`);
}
