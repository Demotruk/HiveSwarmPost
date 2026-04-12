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
  const data = await res.json() as { declarers: string[]; count: number };
  if (!Array.isArray(data.declarers)) {
    throw new Error('Unexpected response: missing declarers array (endpoint may not be deployed yet)');
  }
  return data.declarers;
}
