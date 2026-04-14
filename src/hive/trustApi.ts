/**
 * Client for the swarm-trust-api backend (hiveinvite.com).
 * Used during bootstrap to discover all trust-declaring accounts
 * without crawling the blockchain from the bot account.
 */

/**
 * Fetch all accounts that have active trust declarations.
 */
export async function fetchAllDeclarers(apiUrl: string): Promise<string[]> {
  const res = await fetch(`${apiUrl}/api/trust/declarers`);
  if (!res.ok) {
    throw new Error(`Trust API error: ${res.status} ${res.statusText}`);
  }
  const data = await res.json() as Record<string, unknown>;
  // Deployed API may serve /:account instead of /declarers (route ordering bug);
  // handle both { declarers: [...] } and { trusts: [...] } shapes
  const declarers = data.declarers ?? data.trusts;
  if (!Array.isArray(declarers)) {
    throw new Error('Unexpected response: missing declarers array (endpoint may not be deployed yet)');
  }
  return declarers as string[];
}

/**
 * Fetch every active trust edge from the API and assemble them into a
 * TrustGraph. The API's indexer keeps this up to date within seconds of
 * chain finality, so this replaces a per-account Hive history crawl.
 */
export async function fetchTrustGraph(apiUrl: string): Promise<{
  graph: Map<string, Set<string>>;
  edgeCount: number;
  lastIndexedBlock: number;
}> {
  const res = await fetch(`${apiUrl}/api/trust/edges`);
  if (!res.ok) {
    throw new Error(`Trust API error: ${res.status} ${res.statusText}`);
  }
  const data = await res.json() as {
    edges: { truster: string; trustee: string }[];
    count: number;
    last_indexed_block: number;
  };

  const graph = new Map<string, Set<string>>();
  for (const { truster, trustee } of data.edges) {
    if (!graph.has(truster)) graph.set(truster, new Set());
    graph.get(truster)!.add(trustee);
  }

  return {
    graph,
    edgeCount: data.count,
    lastIndexedBlock: data.last_indexed_block,
  };
}
