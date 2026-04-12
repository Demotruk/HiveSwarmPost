import { hiveCall, withRetry } from './client.js';
import type { TrustGraph } from '../types.js';

const CUSTOM_JSON_ID = 'swarm_trust';
const CUSTOM_JSON_BITMASK = 262144; // filters to custom_json ops only

/**
 * Build the trust graph by reading all swarm_trust custom_json operations
 * from a set of accounts.
 *
 * Returns the trust graph: Map of account -> Set of accounts they trust.
 */
export async function buildTrustGraph(accounts: string[]): Promise<TrustGraph> {
  const graph: TrustGraph = new Map();

  for (const account of accounts) {
    const trusted = await getTrustDeclarations(account);
    if (trusted.size > 0) {
      graph.set(account, trusted);
    }
  }

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

  while (true) {
    let history: any[][];
    try {
      history = await hiveCall<any[][]>('condenser_api', 'get_account_history', [
        username, start, batchSize, CUSTOM_JSON_BITMASK,
      ]);
    } catch {
      // Account may not exist or have no matching history;
      // the bitmask filter causes "Invalid parameters" when no ops match
      break;
    }

    if (!history || history.length === 0) break;

    for (const [, entry] of history) {
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

    if (history.length < batchSize) break;
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
