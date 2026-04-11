import { describe, it, expect } from 'vitest';
import { activityWeight } from '../src/newbies/activity.js';

describe('activityWeight', () => {
  const cap = 10;

  it('returns 0 for 0 posts', () => {
    expect(activityWeight(0, cap)).toBe(0);
  });

  it('returns ~0.29 for 1 post', () => {
    const w = activityWeight(1, cap);
    expect(w).toBeCloseTo(0.29, 1);
  });

  it('returns ~0.46 for 2 posts', () => {
    const w = activityWeight(2, cap);
    expect(w).toBeCloseTo(0.46, 1);
  });

  it('returns ~0.58 for 3 posts', () => {
    const w = activityWeight(3, cap);
    expect(w).toBeCloseTo(0.58, 1);
  });

  it('returns ~0.74 for 5 posts', () => {
    const w = activityWeight(5, cap);
    expect(w).toBeCloseTo(0.74, 1);
  });

  it('returns 1.0 for cap posts', () => {
    const w = activityWeight(10, cap);
    expect(w).toBeCloseTo(1.0, 5);
  });

  it('clamps at cap (no benefit beyond cap)', () => {
    const atCap = activityWeight(10, cap);
    const beyond = activityWeight(100, cap);
    expect(beyond).toBeCloseTo(atCap, 10);
  });

  it('is monotonically increasing', () => {
    let prev = 0;
    for (let i = 1; i <= cap; i++) {
      const w = activityWeight(i, cap);
      expect(w).toBeGreaterThan(prev);
      prev = w;
    }
  });
});
