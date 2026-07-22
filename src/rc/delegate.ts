import { PrivateKey } from '@hiveio/dhive';
import { getAccounts, getAccountCreatedDate } from '../hive/accounts.js';
import { delegateRc, getRcDelegationsFrom } from '../hive/rc.js';
import type { Config, RcDelegationConfig, EligibleNewbie } from '../types.js';

export interface RcPlan {
  /** Eligible newbies not yet delegated to → delegate the configured amount. */
  toDelegate: string[];
  /** Current delegatees that have aged out of the window → reclaim (max_rc 0). */
  toReclaim: string[];
}

/**
 * Decide RC actions purely from set membership.
 *
 * - Delegate to every eligible newbie we don't already delegate to.
 * - Reclaim from aged-out delegatees (created before the window) unless they
 *   are somehow still eligible — the eligible set always wins over reclaim.
 */
export function planRcActions(params: {
  eligible: string[];
  currentDelegatees: string[];
  agedOut: string[];
}): RcPlan {
  const current = new Set(params.currentDelegatees);
  const eligibleSet = new Set(params.eligible);

  const toDelegate = params.eligible.filter(a => !current.has(a));
  const toReclaim = params.agedOut.filter(a => !eligibleSet.has(a));

  return { toDelegate, toReclaim };
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Run one RC-delegation cycle: delegate to newly eligible newbies and reclaim
 * from delegatees that have aged out of the eligibility window.
 *
 * `eligible` is the same pool the lottery uses (trustworthy newbie, created in
 * window, with a qualifying introduceyourself post). Note it already excludes
 * accounts that have won a lottery round in the window — those received reward
 * HP (and therefore RC) already, so RC delegation focuses on the rest.
 */
export async function runRcDelegationCycle(
  rcConfig: RcDelegationConfig,
  config: Config,
  eligible: EligibleNewbie[],
  date: string,
): Promise<void> {
  console.log('\n--- RC Delegation ---');
  if (!rcConfig.enabled) {
    console.log('RC delegation disabled (RC_DELEGATION_ENABLED=false). Skipping.');
    return;
  }
  if (!rcConfig.delegatorAccount) {
    console.log('RC_DELEGATOR_ACCOUNT not set. Skipping.');
    return;
  }

  const delegator = rcConfig.delegatorAccount;
  const eligibleAccounts = eligible.map(n => n.account);

  // Current on-chain delegations from our delegator are the source of truth
  // for "who already has a delegation" — robust to lost local state.
  const existing = await getRcDelegationsFrom(delegator);
  const currentDelegatees = existing.map(d => d.to);
  console.log(`@${delegator} currently delegates RC to ${currentDelegatees.length} account(s)`);

  // Determine which current delegatees have aged out of the window.
  const windowStart = new Date(date + 'T00:00:00Z');
  windowStart.setUTCDate(windowStart.getUTCDate() - config.eligibilityWindowDays);

  const agedOut: string[] = [];
  for (const batch of chunk(currentDelegatees, 100)) {
    const accounts = await getAccounts(batch);
    const found = new Map<string, any>(accounts.map(a => [a.name, a]));
    for (const name of batch) {
      const acct = found.get(name);
      // Account gone or created before the window → reclaim.
      if (!acct || getAccountCreatedDate(acct) < windowStart) agedOut.push(name);
    }
  }

  const { toDelegate, toReclaim } = planRcActions({
    eligible: eligibleAccounts,
    currentDelegatees,
    agedOut,
  });

  console.log(`Plan: delegate to ${toDelegate.length}, reclaim from ${toReclaim.length}`);
  if (toDelegate.length > 0) console.log(`  Delegate: ${toDelegate.join(', ')}`);
  if (toReclaim.length > 0) console.log(`  Reclaim:  ${toReclaim.join(', ')}`);

  if (rcConfig.dryRun) {
    console.log('[DRY RUN] No RC ops broadcast.');
    return;
  }

  const key = PrivateKey.fromString(rcConfig.postingKey);

  for (const batch of chunk(toDelegate, rcConfig.batchSize)) {
    try {
      await delegateRc(delegator, batch, rcConfig.amount, key);
      console.log(`  Delegated ${rcConfig.amount} RC to ${batch.length} account(s)`);
    } catch (err) {
      console.error(`  Failed to delegate to [${batch.join(', ')}]: ${err}`);
    }
  }

  for (const batch of chunk(toReclaim, rcConfig.batchSize)) {
    try {
      await delegateRc(delegator, batch, 0, key);
      console.log(`  Reclaimed RC from ${batch.length} account(s)`);
    } catch (err) {
      console.error(`  Failed to reclaim from [${batch.join(', ')}]: ${err}`);
    }
  }

  console.log('RC delegation cycle complete.');
}
