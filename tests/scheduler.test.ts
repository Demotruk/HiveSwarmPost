import { describe, it, expect } from 'vitest';
import { getRoundSchedule, getPendingRounds } from '../src/scheduler.js';

describe('getRoundSchedule', () => {
  it('produces 10 rounds for a 10-round day', () => {
    const schedule = getRoundSchedule(10);
    expect(schedule).toHaveLength(10);
  });

  it('starts at minute 0', () => {
    const schedule = getRoundSchedule(10);
    expect(schedule[0]).toBe(0);
  });

  it('spaces rounds evenly', () => {
    const schedule = getRoundSchedule(10);
    const interval = schedule[1] - schedule[0];
    expect(interval).toBe(144); // 24*60/10 = 144 minutes
  });

  it('last round is before end of day', () => {
    const schedule = getRoundSchedule(10);
    expect(schedule[schedule.length - 1]).toBeLessThan(24 * 60);
  });
});

describe('getPendingRounds', () => {
  it('returns round 1 at the start of the day', () => {
    const pending = getPendingRounds(0, 10, new Set());
    expect(pending).toEqual([1]);
  });

  it('returns multiple rounds as time passes', () => {
    // At minute 300 (5 hours), rounds 1 (0min) and 2 (144min) and 3 (288min) should be due
    const pending = getPendingRounds(300, 10, new Set());
    expect(pending).toEqual([1, 2, 3]);
  });

  it('excludes already-posted rounds', () => {
    const pending = getPendingRounds(300, 10, new Set([1, 2]));
    expect(pending).toEqual([3]);
  });

  it('returns empty when all due rounds are posted', () => {
    const pending = getPendingRounds(300, 10, new Set([1, 2, 3]));
    expect(pending).toEqual([]);
  });

  it('returns all rounds at end of day', () => {
    const pending = getPendingRounds(24 * 60 - 1, 10, new Set());
    expect(pending).toHaveLength(10);
  });
});
