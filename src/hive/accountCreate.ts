import { PrivateKey, Authority } from '@hiveio/dhive';
import { getClient, withRetry } from './client.js';

/**
 * Create a new Hive account using a pre-claimed account creation token.
 * Requires the creator's active key.
 */
export async function createClaimedAccount(
  creator: string,
  newAccountName: string,
  activeKey: PrivateKey,
  keys: { owner: string; active: string; posting: string; memo: string },
): Promise<void> {
  const ownerAuth: Authority = { weight_threshold: 1, account_auths: [], key_auths: [[keys.owner, 1]] };
  const activeAuth: Authority = { weight_threshold: 1, account_auths: [], key_auths: [[keys.active, 1]] };
  const postingAuth: Authority = { weight_threshold: 1, account_auths: [], key_auths: [[keys.posting, 1]] };

  await withRetry(() =>
    getClient().broadcast.sendOperations(
      [['create_claimed_account', {
        creator,
        new_account_name: newAccountName,
        owner: ownerAuth,
        active: activeAuth,
        posting: postingAuth,
        memo_key: keys.memo,
        json_metadata: '{}',
        extensions: [],
      }]],
      activeKey,
    )
  );
}

/**
 * Check if a Hive account name is available.
 */
export async function isAccountAvailable(username: string): Promise<boolean> {
  const accounts = await withRetry(() =>
    getClient().database.getAccounts([username])
  );
  return accounts.length === 0;
}
