import { PrivateKey } from '@hiveio/dhive';
import { getClient, getPrivateKey, withRetry, broadcastWithKey } from './client.js';

const REBLOG_DELAY_MS = 3500;

export async function reblog(
  account: string,
  author: string,
  permlink: string,
  key?: PrivateKey,
): Promise<void> {
  const json = JSON.stringify(['reblog', { account, author, permlink }]);
  const op = ['custom_json', {
    required_auths: [],
    required_posting_auths: [account],
    id: 'follow',
    json,
  }] as const;

  if (key) {
    await withRetry(() => broadcastWithKey([op], key));
  } else {
    await withRetry(() =>
      getClient().broadcast.sendOperations([op] as any, getPrivateKey())
    );
  }
}

export { REBLOG_DELAY_MS };
