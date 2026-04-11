import { createHash } from 'node:crypto';

/**
 * Compute the lottery seed for a given round.
 *
 * seed = SHA256(btcBlockHash + "hive-swarm-post" + date + roundNumber)
 */
export function computeSeed(
  btcBlockHash: string,
  date: string,
  roundNumber: number,
): string {
  const input = btcBlockHash + 'hive-swarm-post' + date + roundNumber.toString();
  return createHash('sha256').update(input).digest('hex');
}

/**
 * Deterministic weighted random selection.
 *
 * Given a seed and selection index, produces a random value in [0, 1)
 * by hashing seed + index, taking the first 8 bytes as a uint64,
 * and dividing by 2^64.
 */
export function weightedRandom(
  weights: number[],
  seed: string,
  selectionIndex: number,
): number {
  if (weights.length === 0) {
    throw new Error('Cannot select from empty pool');
  }

  const hashInput = seed + selectionIndex.toString();
  const hash = createHash('sha256').update(hashInput).digest();

  // First 8 bytes as BigInt (big-endian)
  const value = hash.readBigUInt64BE(0);
  const maxUint64 = 2n ** 64n;
  const randomValue = Number(value) / Number(maxUint64);

  const totalWeight = weights.reduce((a, b) => a + b, 0);
  const threshold = randomValue * totalWeight;

  let cumulative = 0;
  for (let i = 0; i < weights.length; i++) {
    cumulative += weights[i];
    if (cumulative > threshold) {
      return i;
    }
  }

  // Fallback for floating point edge case
  return weights.length - 1;
}

/**
 * Select multiple items from a weighted pool without replacement.
 *
 * Returns the indices of the selected items in the original pool.
 */
export function selectFromPool(
  weights: number[],
  seed: string,
  count: number,
): number[] {
  if (count > weights.length) {
    count = weights.length;
  }

  const selected: number[] = [];
  const remainingIndices = weights.map((_, i) => i);
  const remainingWeights = [...weights];

  for (let i = 0; i < count; i++) {
    const localIndex = weightedRandom(remainingWeights, seed, i);
    const originalIndex = remainingIndices[localIndex];
    selected.push(originalIndex);

    remainingIndices.splice(localIndex, 1);
    remainingWeights.splice(localIndex, 1);
  }

  return selected;
}
