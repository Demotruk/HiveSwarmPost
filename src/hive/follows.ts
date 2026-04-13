import { getClient, getPrivateKey, hiveCall, withRetry } from './client.js';

const FOLLOW_DELAY_MS = 3500; // Hive rate limit: ~1 custom_json per 3s

/**
 * Get the full list of accounts that `account` follows (blog follows only).
 */
export async function getFollowing(account: string): Promise<string[]> {
  const following: string[] = [];
  let start = '';
  const limit = 1000;

  while (true) {
    const batch = await withRetry(() =>
      hiveCall<Array<{ following: string }>>('condenser_api', 'get_following', [
        account, start, 'blog', limit,
      ])
    );

    if (!batch || batch.length === 0) break;

    for (const entry of batch) {
      if (entry.following !== start) {
        following.push(entry.following);
      }
    }

    if (batch.length < limit) break;
    start = batch[batch.length - 1].following;
  }

  return following;
}

/**
 * Follow an account on the Hive blockchain.
 */
export async function follow(follower: string, following: string): Promise<void> {
  const json = JSON.stringify(['follow', { follower, following, what: ['blog'] }]);

  await withRetry(() =>
    getClient().broadcast.sendOperations(
      [['custom_json', {
        required_auths: [],
        required_posting_auths: [follower],
        id: 'follow',
        json,
      }]],
      getPrivateKey(),
    )
  );
}

/**
 * Unfollow an account on the Hive blockchain.
 */
export async function unfollow(follower: string, following: string): Promise<void> {
  const json = JSON.stringify(['follow', { follower, following, what: [] }]);

  await withRetry(() =>
    getClient().broadcast.sendOperations(
      [['custom_json', {
        required_auths: [],
        required_posting_auths: [follower],
        id: 'follow',
        json,
      }]],
      getPrivateKey(),
    )
  );
}

/**
 * Sync the follow list to match the desired set.
 * Returns the accounts that were followed/unfollowed.
 */
export async function syncFollows(
  desired: string[],
  current: string[],
  follower: string,
  dryRun: boolean,
): Promise<{ followed: string[]; unfollowed: string[] }> {
  const desiredSet = new Set(desired);
  const currentSet = new Set(current);

  const toFollow = desired.filter(a => !currentSet.has(a));
  const toUnfollow = current.filter(a => !desiredSet.has(a));

  if (toFollow.length === 0 && toUnfollow.length === 0) {
    console.log('Follow list already in sync.');
    return { followed: [], unfollowed: [] };
  }

  console.log(`Follow sync: +${toFollow.length} follows, -${toUnfollow.length} unfollows`);

  if (dryRun) {
    if (toFollow.length > 0) {
      console.log(`[DRY RUN] Would follow: ${toFollow.join(', ')}`);
    }
    if (toUnfollow.length > 0) {
      console.log(`[DRY RUN] Would unfollow: ${toUnfollow.join(', ')}`);
    }
    return { followed: toFollow, unfollowed: toUnfollow };
  }

  const followed: string[] = [];
  const unfollowed: string[] = [];

  for (const account of toFollow) {
    try {
      await follow(follower, account);
      followed.push(account);
      console.log(`Followed @${account}`);
      if (toFollow.indexOf(account) < toFollow.length - 1) {
        await delay(FOLLOW_DELAY_MS);
      }
    } catch (err) {
      console.error(`Failed to follow @${account}: ${err}`);
    }
  }

  for (const account of toUnfollow) {
    try {
      await unfollow(follower, account);
      unfollowed.push(account);
      console.log(`Unfollowed @${account}`);
      if (toUnfollow.indexOf(account) < toUnfollow.length - 1) {
        await delay(FOLLOW_DELAY_MS);
      }
    } catch (err) {
      console.error(`Failed to unfollow @${account}: ${err}`);
    }
  }

  return { followed, unfollowed };
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
