import { getClient, withRetry } from '../hive/client.js';
import { getAccounts, getAccountHP } from '../hive/accounts.js';
import { postExists, getActiveVotes } from '../hive/posts.js';
import { getTrustDeclarations } from '../hive/trust.js';
import { fetchAllDeclarers } from '../hive/trustApi.js';
import type { VoterInfo, Config } from '../types.js';

/**
 * Get all voter trust roots — accounts that voted on the Swarm Post
 * within the voter window, along with their HP.
 *
 * During bootstrap (no voting history), falls back to treating all
 * trust-declaring accounts as roots.
 */
export async function getVoterRoots(config: Config, date: string): Promise<VoterInfo[]> {
  const voterAccounts = await collectRecentVoters(config, date);

  if (voterAccounts.size === 0) {
    console.log('No voting history found — entering bootstrap mode');
    return getBootstrapRoots(config);
  }

  return getVoterInfoBatch(Array.from(voterAccounts));
}

/**
 * Collect unique voter accounts from Swarm Post root posts and comments
 * over the voter window (last N days).
 */
async function collectRecentVoters(config: Config, date: string): Promise<Set<string>> {
  const voters = new Set<string>();
  const today = new Date(date + 'T00:00:00Z');

  for (let dayOffset = 0; dayOffset < config.voterWindowDays; dayOffset++) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - dayOffset);
    const dateStr = d.toISOString().slice(0, 10);
    const rootPermlink = `swarm-post-${dateStr}`;

    const exists = await postExists(config.botAccount, rootPermlink);
    if (!exists) continue;

    // Get votes on root post
    const rootVotes = await getActiveVotes(config.botAccount, rootPermlink);
    for (const vote of rootVotes) {
      if (vote.rshares > 0 || vote.percent > 0) {
        voters.add(vote.voter);
      }
    }

    // Get votes on each comment
    for (let round = 1; round <= config.roundsPerDay; round++) {
      const commentPermlink = `swarm-post-${dateStr}-round-${round}`;
      const commentExists = await postExists(config.botAccount, commentPermlink);
      if (!commentExists) continue;

      const commentVotes = await getActiveVotes(config.botAccount, commentPermlink);
      for (const vote of commentVotes) {
        if (vote.rshares > 0 || vote.percent > 0) {
          voters.add(vote.voter);
        }
      }
    }
  }

  return voters;
}

/**
 * Bootstrap mode: use all trust-declaring accounts as roots.
 * Queries the swarm-trust-api backend which indexes all swarm_trust
 * custom_json operations from the blockchain.
 *
 * Falls back to crawling from the bot account's own declarations
 * if the API is unreachable.
 */
export async function getBootstrapRoots(config: Config): Promise<VoterInfo[]> {
  let declarers: string[];

  try {
    declarers = await fetchAllDeclarers(config.trustApiUrl);
    console.log(`Bootstrap mode: ${declarers.length} trust declarers from API`);
  } catch (err) {
    console.log(`Trust API unavailable (${err}), falling back to on-chain crawl`);
    const botTrusted = await getTrustDeclarations(config.botAccount);
    declarers = [config.botAccount, ...botTrusted];
  }

  return getVoterInfoBatch(declarers);
}

/**
 * Get VoterInfo (account + HP) for a batch of accounts.
 */
async function getVoterInfoBatch(accountNames: string[]): Promise<VoterInfo[]> {
  if (accountNames.length === 0) return [];

  const dgp = await withRetry(() => getClient().database.getDynamicGlobalProperties());
  const voters: VoterInfo[] = [];

  // Process in batches of 100 (Hive API limit)
  for (let i = 0; i < accountNames.length; i += 100) {
    const batch = accountNames.slice(i, i + 100);
    const accounts = await getAccounts(batch);

    for (const account of accounts) {
      const hp = await getAccountHP(account, dgp);
      if (hp > 0) {
        voters.push({ account: account.name, hp });
      }
    }
  }

  return voters;
}
