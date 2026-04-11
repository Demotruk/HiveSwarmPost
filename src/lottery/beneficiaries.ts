import type { BeneficiaryEntry, SelectedNewbie } from '../types.js';

/**
 * Build the beneficiary array for a lottery round comment.
 *
 * Per newbie slot (5000 basis points = 50%):
 *   - Newbie: 2500 (25%)
 *   - Creator: 1250 (12.5%)
 *   - Referrer: 1250 (12.5%)
 *
 * If no referrer: creator gets 2500 (25%)
 * If creator == referrer: single entry at 2500 (25%)
 *
 * Entries are sorted alphabetically by account (Hive requirement).
 * Total must equal 10000.
 */
export function buildBeneficiaries(selected: SelectedNewbie[]): BeneficiaryEntry[] {
  const weightMap = new Map<string, number>();

  const slotWeight = Math.floor(10000 / selected.length);

  for (const s of selected) {
    const newbieShare = Math.floor(slotWeight / 2);
    const onboarderShare = slotWeight - newbieShare;

    // Newbie gets their share
    addWeight(weightMap, s.newbie.account, newbieShare);

    if (s.referrer && s.referrer !== s.creator) {
      // Split onboarder share between creator and referrer
      const creatorShare = Math.floor(onboarderShare / 2);
      const referrerShare = onboarderShare - creatorShare;
      addWeight(weightMap, s.creator, creatorShare);
      addWeight(weightMap, s.referrer, referrerShare);
    } else {
      // Creator gets full onboarder share
      addWeight(weightMap, s.creator, onboarderShare);
    }
  }

  // Ensure total is exactly 10000 by adjusting the largest entry
  const entries = Array.from(weightMap.entries()).map(([account, weight]) => ({
    account,
    weight,
  }));

  const currentTotal = entries.reduce((sum, e) => sum + e.weight, 0);
  if (currentTotal !== 10000 && entries.length > 0) {
    const diff = 10000 - currentTotal;
    // Add remainder to the entry with the largest weight
    let maxIdx = 0;
    for (let i = 1; i < entries.length; i++) {
      if (entries[i].weight > entries[maxIdx].weight) {
        maxIdx = i;
      }
    }
    entries[maxIdx].weight += diff;
  }

  // Sort alphabetically by account (Hive requirement)
  entries.sort((a, b) => a.account.localeCompare(b.account));

  return entries;
}

function addWeight(map: Map<string, number>, account: string, weight: number): void {
  map.set(account, (map.get(account) || 0) + weight);
}
