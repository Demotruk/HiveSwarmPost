import { hiveCall, withRetry } from './client.js';
import type { TrustGraph } from '../types.js';

const CUSTOM_JSON_ID = 'swarm_trust';
const CUSTOM_JSON_BITMASK = 262144; // filters to custom_json ops only

/**
 * Earliest possible timestamp for a swarm_trust custom_json op.
 * Used to bound backward pagination through account history — no need to
 * scan ops older than this, since swarm_trust didn't exist yet.
 */
const SWARM_TRUST_EPOCH = new Date('2026-04-10T00:00:00Z');

/**
 * Build the trust graph by reading all swarm_trust custom_json operations
 * from a set of accounts.
 *
 * Returns the trust graph: Map of account -> Set of accounts they trust.
 */
export async function buildTrustGraph(accounts: string[]): Promise<TrustGraph> {
  const graph: TrustGraph = new Map();
  const t0 = Date.now();

  console.log(`Building trust graph for ${accounts.length} accounts...`);
  for (let i = 0; i < accounts.length; i++) {
    const account = accounts[i];
    const accountStart = Date.now();
    const trusted = await getTrustDeclarations(account);
    const elapsed = ((Date.now() - accountStart) / 1000).toFixed(1);
    console.log(`  [${i + 1}/${accounts.length}] @${account}: ${trusted.size} trustees (${elapsed}s)`);
    if (trusted.size > 0) {
      graph.set(account, trusted);
    }
  }

  const totalElapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`Trust graph built in ${totalElapsed}s`);
  return graph;
}

/**
 * Get the current set of trusted accounts for a user by replaying their
 * swarm_trust custom_json history (applying trusts and revocations in order).
 *
 * Mirrors the pattern from the trust UI at hiveinvite.com/trust.
 */
export async function getTrustDeclarations(username: string): Promise<Set<string>> {
  const trusted = new Set<string>();
  let start = -1;
  const batchSize = 1000;
  let batchCount = 0;

  while (true) {
    // Hive requires start >= limit - 1, so cap the page size on the tail.
    const limit = start === -1 ? batchSize : Math.min(batchSize, start + 1);
    let history: any[][];
    try {
      history = await hiveCall<any[][]>('condenser_api', 'get_account_history', [
        username, start, limit, CUSTOM_JSON_BITMASK,
      ]);
    } catch {
      // Account may not exist or have no matching history;
      // the bitmask filter causes "Invalid parameters" when no ops match
      break;
    }
    batchCount++;
    if (batchCount % 5 === 0) {
      console.log(`    @${username}: ${batchCount} batches scanned, still paginating...`);
    }

    if (!history || history.length === 0) break;

    let oldestInBatch: Date | null = null;
    for (const [, entry] of history) {
      const timestamp = new Date(entry.timestamp + 'Z');
      if (!oldestInBatch || timestamp < oldestInBatch) oldestInBatch = timestamp;

      const [opType, opData] = entry.op;
      if (opType !== 'custom_json' || opData.id !== CUSTOM_JSON_ID) continue;

      try {
        const json = JSON.parse(opData.json);
        if (json.trust) {
          trusted.add(json.trust);
        } else if (json.revoke) {
          trusted.delete(json.revoke);
        }
      } catch {
        // Invalid JSON, skip
      }
    }

    // Stop paginating once we've scanned past the swarm_trust epoch —
    // no swarm_trust ops can exist before it.
    if (oldestInBatch && oldestInBatch < SWARM_TRUST_EPOCH) break;

    if (history.length < limit) break;
    start = history[0][0] - 1;
    if (start < 0) break;
  }

  return trusted;
}

/**
 * Get all accounts that have ever broadcast a swarm_trust custom_json.
 * Used during bootstrap when no voting history exists yet.
 *
 * This is expensive — scans recent blocks. In practice, during bootstrap
 * the set of trust declarers is small and can be seeded from known accounts.
 */
export async function getAllTrustDeclarers(): Promise<string[]> {
  // During bootstrap, we rely on the trust graph accounts already known
  // from the trust declarations of the bot account's followers/known onboarders.
  // This function will be called with a seed list from the config or
  // discovered through other means.
  // For now, return empty — the bootstrap logic in voters.ts handles this.
  return [];
}
