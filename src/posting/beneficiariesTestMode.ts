import type { BeneficiaryEntry } from '../types.js';

/**
 * The Hive burn account. Used as the sole on-chain beneficiary in test mode
 * so that real users aren't notified via beneficiary-assignment events.
 */
const NULL_ACCOUNT = 'null';

/**
 * Rewrite the beneficiary array that actually goes on-chain.
 *
 * In production, returns the real per-recipient split unchanged.
 *
 * In test mode, collapses every entry into a single `@null` beneficiary
 * carrying the full summed weight. The rendered body of the post still
 * shows the would-be split (for test inspection), but the `comment_options`
 * op broadcast to Hive names only `@null`, so no real user is notified or
 * receives any share of any (unintended) author reward.
 */
export function onChainBeneficiaries(
  beneficiaries: BeneficiaryEntry[],
  testMode: boolean,
): BeneficiaryEntry[] {
  if (!testMode) return beneficiaries;
  const totalWeight = beneficiaries.reduce((sum, b) => sum + b.weight, 0);
  if (totalWeight === 0) return [];
  return [{ account: NULL_ACCOUNT, weight: totalWeight }];
}
