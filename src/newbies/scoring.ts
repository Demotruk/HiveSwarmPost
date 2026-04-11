import type { EligibleNewbie } from '../types.js';

/**
 * Sort the eligible pool by score descending.
 * Newbies with score 0 are filtered out.
 */
export function rankPool(pool: EligibleNewbie[]): EligibleNewbie[] {
  return pool
    .filter(n => n.score > 0)
    .sort((a, b) => b.score - a.score);
}
