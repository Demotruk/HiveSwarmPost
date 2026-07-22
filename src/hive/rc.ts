import { PrivateKey } from '@hiveio/dhive';
import { getClient, withRetry, broadcastWithKey } from './client.js';

export interface RcDelegation {
  from: string;
  to: string;
  delegated_rc: number;
}

/**
 * Broadcast an RC delegation from `delegator` to one or more `delegatees`,
 * each receiving `maxRc` resource credits. This is the `delegate_rc`
 * custom_json op (id "rc"), which requires only the delegator's *posting*
 * authority — it grants resource credits only, not HP or voting power.
 *
 * Pass maxRc = 0 to reclaim (undelegate) from the listed delegatees.
 */
export async function delegateRc(
  delegator: string,
  delegatees: string[],
  maxRc: number,
  key: PrivateKey,
): Promise<void> {
  if (delegatees.length === 0) return;

  const op = ['custom_json', {
    required_auths: [],
    required_posting_auths: [delegator],
    id: 'rc',
    json: JSON.stringify([
      'delegate_rc',
      { from: delegator, delegatees, max_rc: maxRc },
    ]),
  }] as const;

  await withRetry(() => broadcastWithKey([op] as any, key));
}

/**
 * List every RC delegation currently outgoing from `delegator`, via
 * rc_api.list_rc_direct_delegations (ordered by (from, to)). Paginates until
 * the `from` field no longer matches, so we see the delegator's complete set.
 * Note: the API requires `start[0]` to be an existing account — our delegator
 * always is.
 */
export async function getRcDelegationsFrom(delegator: string): Promise<RcDelegation[]> {
  const out: RcDelegation[] = [];
  const seen = new Set<string>();
  const limit = 1000;
  let start: [string, string] = [delegator, ''];

  while (true) {
    const res = await withRetry<{ rc_direct_delegations?: RcDelegation[] }>(() =>
      getClient().call('rc_api', 'list_rc_direct_delegations', { start, limit }),
    );
    const page = res?.rc_direct_delegations ?? [];
    if (page.length === 0) break;

    let advanced = false;
    for (const d of page) {
      if (d.from !== delegator) return out; // passed our delegator in global order
      if (seen.has(d.to)) continue; // start is inclusive → skip the repeated boundary row
      seen.add(d.to);
      out.push(d);
      advanced = true;
    }

    if (page.length < limit) break;
    const last = page[page.length - 1];
    start = [last.from, last.to];
    if (!advanced) break; // safety: no progress, avoid an infinite loop
  }

  return out;
}
