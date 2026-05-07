import { Client, PrivateKey } from '@hiveio/dhive';

let client: Client;
let privateKey: PrivateKey;

export function initClient(config: { hiveNodes: string[]; postingKey?: string }): void {
  client = new Client(config.hiveNodes, {
    timeout: 30000,
    failoverThreshold: 3,
  });
  if (config.postingKey) {
    privateKey = PrivateKey.fromString(config.postingKey);
  }
}

export function getClient(): Client {
  if (!client) throw new Error('Hive client not initialized. Call initClient first.');
  return client;
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
  const c = getClient();
  return c.call(api, method, params) as Promise<T>;
}

/**
 * Retry a function up to maxRetries times with exponential backoff.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000,
): Promise<T> {
  let lastError: Error | undefined;
  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (i < maxRetries) {
        const delay = baseDelay * Math.pow(2, i);
        console.log(`Retry ${i + 1}/${maxRetries} after ${delay}ms: ${lastError.message}`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError;
}
