import { describe, it, expect } from 'vitest';
import { computeSeed, weightedRandom, selectFromPool } from '../src/lottery/selection.js';

describe('computeSeed', () => {
  it('produces a 64-char hex string', () => {
    const seed = computeSeed('00000000000000000002abc', '2026-04-11', 1);
    expect(seed).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic', () => {
    const a = computeSeed('blockhash', '2026-04-11', 1);
    const b = computeSeed('blockhash', '2026-04-11', 1);
    expect(a).toBe(b);
  });

  it('differs with different round numbers', () => {
    const a = computeSeed('blockhash', '2026-04-11', 1);
    const b = computeSeed('blockhash', '2026-04-11', 2);
    expect(a).not.toBe(b);
  });

  it('differs with different dates', () => {
    const a = computeSeed('blockhash', '2026-04-11', 1);
    const b = computeSeed('blockhash', '2026-04-12', 1);
    expect(a).not.toBe(b);
  });

  it('differs with different block hashes', () => {
    const a = computeSeed('hash1', '2026-04-11', 1);
    const b = computeSeed('hash2', '2026-04-11', 1);
    expect(a).not.toBe(b);
  });
});

describe('weightedRandom', () => {
  it('selects the only item in a pool of 1', () => {
    const idx = weightedRandom([1.0], 'seed', 0);
    expect(idx).toBe(0);
  });

  it('returns a valid index', () => {
    const weights = [1, 2, 3, 4, 5];
    const idx = weightedRandom(weights, 'testseed', 0);
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(idx).toBeLessThan(weights.length);
  });

  it('is deterministic', () => {
    const weights = [1, 2, 3, 4, 5];
    const a = weightedRandom(weights, 'seed123', 0);
    const b = weightedRandom(weights, 'seed123', 0);
    expect(a).toBe(b);
  });

  it('throws on empty pool', () => {
    expect(() => weightedRandom([], 'seed', 0)).toThrow('Cannot select from empty pool');
  });

  it('distributes roughly proportional to weights over many selections', () => {
    const weights = [1, 9]; // 10% vs 90%
    const counts = [0, 0];
    for (let i = 0; i < 1000; i++) {
      const idx = weightedRandom(weights, `seed-${i}`, 0);
      counts[idx]++;
    }
    // With 1000 samples, item 1 should be picked ~900 times
    expect(counts[1]).toBeGreaterThan(800);
    expect(counts[0]).toBeLessThan(200);
  });
});

describe('selectFromPool', () => {
  it('selects the requested number of items', () => {
    const weights = [1, 2, 3, 4, 5];
    const selected = selectFromPool(weights, 'seed', 2);
    expect(selected).toHaveLength(2);
  });

  it('selects without replacement', () => {
    const weights = [1, 2, 3, 4, 5];
    const selected = selectFromPool(weights, 'seed', 3);
    const unique = new Set(selected);
    expect(unique.size).toBe(3);
  });

  it('handles request for more than pool size', () => {
    const weights = [1, 2];
    const selected = selectFromPool(weights, 'seed', 5);
    expect(selected).toHaveLength(2);
  });

  it('returns valid indices', () => {
    const weights = [1, 2, 3];
    const selected = selectFromPool(weights, 'seed', 2);
    for (const idx of selected) {
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(weights.length);
    }
  });

  it('is deterministic', () => {
    const weights = [1, 2, 3, 4, 5];
    const a = selectFromPool(weights, 'same-seed', 2);
    const b = selectFromPool(weights, 'same-seed', 2);
    expect(a).toEqual(b);
  });
});
