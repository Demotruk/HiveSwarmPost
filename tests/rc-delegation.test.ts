import { describe, it, expect } from 'vitest';
import { planRcActions } from '../src/rc/delegate.js';

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
