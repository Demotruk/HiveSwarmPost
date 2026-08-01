import { describe, it, expect } from 'vitest';
import { planRcActions, partitionByManagedAmount } from '../src/rc/delegate.js';

describe('planRcActions', () => {
  it('delegates to eligible newbies without an existing delegation', () => {
    const plan = planRcActions({
      eligible: ['alice', 'bob', 'carol'],
      currentDelegatees: ['bob'],
      agedOut: [],
    });
    expect(plan.toDelegate).toEqual(['alice', 'carol']);
    expect(plan.toReclaim).toEqual([]);
  });

  it('reclaims from aged-out delegatees', () => {
    const plan = planRcActions({
      eligible: ['alice'],
      currentDelegatees: ['alice', 'oldbie'],
      agedOut: ['oldbie'],
    });
    expect(plan.toDelegate).toEqual([]);
    expect(plan.toReclaim).toEqual(['oldbie']);
  });

  it('never reclaims an account that is still eligible', () => {
    // An account can be flagged aged-out yet reappear as eligible (e.g. edge
    // of the window) — eligibility must win so we do not yank active RC.
    const plan = planRcActions({
      eligible: ['edge'],
      currentDelegatees: ['edge'],
      agedOut: ['edge'],
    });
    expect(plan.toDelegate).toEqual([]);
    expect(plan.toReclaim).toEqual([]);
  });

  it('handles a mixed cycle: some new, some reclaimed, some unchanged', () => {
    const plan = planRcActions({
      eligible: ['new1', 'keep', 'new2'],
      currentDelegatees: ['keep', 'gone1', 'gone2'],
      agedOut: ['gone1', 'gone2'],
    });
    expect(plan.toDelegate).toEqual(['new1', 'new2']);
    expect(plan.toReclaim).toEqual(['gone1', 'gone2']);
  });

  it('never reclaims from an exempt account', () => {
    // Regression: a manual delegation to @hivepostify looked like a stale bot
    // delegation (not eligible, created long before the window) and was wiped.
    const plan = planRcActions({
      eligible: ['alice'],
      currentDelegatees: ['alice', 'hivepostify'],
      agedOut: ['hivepostify'],
      exempt: ['hivepostify'],
    });
    expect(plan.toReclaim).toEqual([]);
    expect(plan.toDelegate).toEqual([]);
  });

  it('never delegates to an exempt account, so a manual amount is not overwritten', () => {
    const plan = planRcActions({
      eligible: ['alice', 'hivepostify'],
      currentDelegatees: [],
      agedOut: [],
      exempt: ['hivepostify'],
    });
    expect(plan.toDelegate).toEqual(['alice']);
  });

  it('matches exempt accounts case-insensitively and ignores a leading @', () => {
    const plan = planRcActions({
      eligible: [],
      currentDelegatees: ['HivePostify'],
      agedOut: ['HivePostify'],
      exempt: ['@hivepostify'],
    });
    expect(plan.toReclaim).toEqual([]);
  });

  it('still reclaims non-exempt aged-out accounts alongside exempt ones', () => {
    const plan = planRcActions({
      eligible: [],
      currentDelegatees: ['hivepostify', 'oldbie'],
      agedOut: ['hivepostify', 'oldbie'],
      exempt: ['hivepostify'],
    });
    expect(plan.toReclaim).toEqual(['oldbie']);
  });

  it('is a no-op when nothing is eligible and nothing aged out', () => {
    const plan = planRcActions({
      eligible: [],
      currentDelegatees: ['a', 'b'],
      agedOut: [],
    });
    expect(plan.toDelegate).toEqual([]);
    expect(plan.toReclaim).toEqual([]);
  });
});

describe('partitionByManagedAmount', () => {
  const d = (to: string, delegated_rc: number | string) =>
    ({ from: 'delegator', to, delegated_rc } as any);

  it('treats a delegation of the configured amount as ours to reclaim', () => {
    const { managed, foreign } = partitionByManagedAmount(
      [d('alice', 15_000_000_000), d('bob', 15_000_000_000)],
      [15_000_000_000],
    );
    expect(managed).toEqual(['alice', 'bob']);
    expect(foreign).toEqual([]);
  });

  it('protects a manually-sized delegation without needing an exempt entry', () => {
    // The @hivepostify case: a hand-set amount the bot never delegates.
    const { managed, foreign } = partitionByManagedAmount(
      [d('alice', 15_000_000_000), d('hivepostify', 250_000_000_000)],
      [15_000_000_000],
    );
    expect(managed).toEqual(['alice']);
    expect(foreign.map(x => x.to)).toEqual(['hivepostify']);
  });

  it('still reclaims delegations made under a past amount', () => {
    const { managed, foreign } = partitionByManagedAmount(
      [d('old', 10_000_000_000), d('new', 15_000_000_000)],
      [15_000_000_000, 10_000_000_000],
    );
    expect(managed).toEqual(['old', 'new']);
    expect(foreign).toEqual([]);
  });

  it('compares numerically when the node returns int64 as a string', () => {
    const { managed } = partitionByManagedAmount([d('alice', '15000000000')], [15_000_000_000]);
    expect(managed).toEqual(['alice']);
  });

  it('protects everything when no managed amounts are configured', () => {
    const { managed, foreign } = partitionByManagedAmount([d('alice', 15_000_000_000)], []);
    expect(managed).toEqual([]);
    expect(foreign.map(x => x.to)).toEqual(['alice']);
  });
});
