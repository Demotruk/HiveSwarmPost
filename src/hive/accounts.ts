import { getClient, hiveCall, withRetry } from './client.js';
import type { OnboarderAttribution } from '../types.js';

/**
 * Get account data for one or more accounts.
 */
export async function getAccounts(usernames: string[]): Promise<any[]> {
  return withRetry(() => getClient().database.getAccounts(usernames));
}

/**
 * Get the creation date of an account.
 */
export function getAccountCreatedDate(account: any): Date {
  return new Date(account.created + 'Z');
}

/**
 * Get onboarder attribution for a newbie account.
 *
 * Creator: the account that signed the account_create operation (from account history)
 * Referrer: entry with label "referrer" in json_metadata.beneficiaries (HiveOnBoard standard)
 */
export async function getOnboarderAttribution(username: string): Promise<OnboarderAttribution> {
  // Get creator from account history (account_create operation)
  const creator = await getAccountCreator(username);

  // Get referrer from json_metadata
  const referrer = await getAccountReferrer(username);

  return { creator, referrer };
}

/**
 * Find the account that created this account by scanning account history
 * for account_create or create_claimed_account operations.
 */
async function getAccountCreator(username: string): Promise<string> {
  const history = await withRetry<any[][]>(() =>
    hiveCall<any[][]>('condenser_api', 'get_account_history', [
      username,
      // Operation filter bitmask: account_create = bit 9, create_claimed_account = bit 23
      -1,
      1000,
      // Using low operation filter to capture account creation ops
      ...[]
    ])
  );

  // Look for account_create or create_claimed_account operations
  for (const [, entry] of history) {
    const [opType, opData] = entry.op;
    if (
      (opType === 'account_create' || opType === 'create_claimed_account') &&
      opData.new_account_name === username
    ) {
      return opData.creator;
    }
  }

  // Fallback: check account's recovery_account (often the creator)
  const [account] = await getAccounts([username]);
  return account?.recovery_account || 'unknown';
}

/**
 * Get the referrer from account metadata following the HiveOnBoard standard.
 * Looks for entry with label "referrer" in json_metadata.beneficiaries.
 */
async function getAccountReferrer(username: string): Promise<string | null> {
  const [account] = await getAccounts([username]);
  if (!account) return null;

  try {
    // Try json_metadata first, then posting_json_metadata
    for (const field of ['json_metadata', 'posting_json_metadata']) {
      const raw = account[field];
      if (!raw) continue;
      const meta = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (meta?.beneficiaries && Array.isArray(meta.beneficiaries)) {
        const referrerEntry = meta.beneficiaries.find(
          (b: any) => b.label === 'referrer'
        );
        if (referrerEntry?.name) {
          return referrerEntry.name;
        }
      }
    }
  } catch {
    // Invalid JSON metadata, skip
  }

  return null;
}

/**
 * Get the Hive Power (HP) for an account.
 * Converts vesting shares to HP using dynamic global properties.
 */
export async function getAccountHP(account: any, dgp: any): Promise<number> {
  const totalVestingFund = parseFloat(dgp.total_vesting_fund_hive.split(' ')[0]);
  const totalVestingShares = parseFloat(dgp.total_vesting_shares.split(' ')[0]);
  const vestingShares = parseFloat(account.vesting_shares.split(' ')[0]);
  const receivedVesting = parseFloat(account.received_vesting_shares.split(' ')[0]);
  const delegatedVesting = parseFloat(account.delegated_vesting_shares.split(' ')[0]);

  const effectiveVesting = vestingShares + receivedVesting - delegatedVesting;
  return (effectiveVesting / totalVestingShares) * totalVestingFund;
}

/**
 * Get the post/comment count for a newbie within their eligibility window.
 */
export async function getPostCommentCount(username: string, since: Date): Promise<number> {
  let count = 0;
  let start = -1;
  const batchSize = 1000;

  while (true) {
    // Hive requires start >= limit - 1, so cap the page size on the tail.
    const limit = start === -1 ? batchSize : Math.min(batchSize, start + 1);
    const history = await withRetry<any[][]>(() =>
      hiveCall<any[][]>('condenser_api', 'get_account_history', [
        username, start, limit,
      ])
    );

    if (!history || history.length === 0) break;

    for (const [, entry] of history) {
      const [opType, opData] = entry.op;
      if (opType === 'comment' && opData.author === username && opData.parent_author === '') {
        // Root post
        const timestamp = new Date(entry.timestamp + 'Z');
        if (timestamp >= since) count++;
      } else if (opType === 'comment' && opData.author === username && opData.parent_author !== '') {
        // Comment
        const timestamp = new Date(entry.timestamp + 'Z');
        if (timestamp >= since) count++;
      }
    }

    if (history.length < limit) break;
    start = history[0][0] - 1;
    if (start < 0) break;
  }

  return count;
}
