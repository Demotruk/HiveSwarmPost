import { PrivateKey } from '@hiveio/dhive';
import { getClient, withRetry } from './client.js';

/**
 * Delegate vesting shares (HP) from delegator to delegatee.
 * Requires the delegator's active key.
 */
export async function delegateVestingShares(
  delegator: string,
  delegatee: string,
  vestingShares: string,
  activeKey: PrivateKey,
): Promise<void> {
  await withRetry(() =>
    getClient().broadcast.sendOperations(
      [['delegate_vesting_shares', {
        delegator,
        delegatee,
        vesting_shares: vestingShares,
      }]],
      activeKey,
    )
  );
}
