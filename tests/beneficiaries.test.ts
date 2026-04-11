import { describe, it, expect } from 'vitest';
import { buildBeneficiaries } from '../src/lottery/beneficiaries.js';
import type { SelectedNewbie, EligibleNewbie } from '../src/types.js';

function makeNewbie(account: string, creator: string, referrer: string | null): SelectedNewbie {
  const newbie: EligibleNewbie = {
    account,
    createdAt: new Date(),
    onboarders: { creator, referrer },
    activityWeight: 0.5,
    onboarderTrust: 100,
    score: 50,
  };
  return { newbie, creator, referrer };
}

describe('buildBeneficiaries', () => {
  it('produces correct structure for 2 newbies with distinct creators and referrers', () => {
    const selected = [
      makeNewbie('alice', 'onboarder1', 'referrer1'),
      makeNewbie('bob', 'onboarder2', 'referrer2'),
    ];
    const bens = buildBeneficiaries(selected);

    const total = bens.reduce((sum, b) => sum + b.weight, 0);
    expect(total).toBe(10000);

    // 6 unique beneficiaries
    expect(bens).toHaveLength(6);

    // Sorted alphabetically
    for (let i = 1; i < bens.length; i++) {
      expect(bens[i].account.localeCompare(bens[i - 1].account)).toBeGreaterThanOrEqual(0);
    }

    // Each newbie gets 2500
    const aliceEntry = bens.find(b => b.account === 'alice');
    const bobEntry = bens.find(b => b.account === 'bob');
    expect(aliceEntry?.weight).toBe(2500);
    expect(bobEntry?.weight).toBe(2500);

    // Each creator/referrer gets 1250
    expect(bens.find(b => b.account === 'onboarder1')?.weight).toBe(1250);
    expect(bens.find(b => b.account === 'referrer1')?.weight).toBe(1250);
    expect(bens.find(b => b.account === 'onboarder2')?.weight).toBe(1250);
    expect(bens.find(b => b.account === 'referrer2')?.weight).toBe(1250);
  });

  it('gives creator full share when no referrer', () => {
    const selected = [
      makeNewbie('alice', 'onboarder1', null),
      makeNewbie('bob', 'onboarder2', null),
    ];
    const bens = buildBeneficiaries(selected);

    const total = bens.reduce((sum, b) => sum + b.weight, 0);
    expect(total).toBe(10000);

    // 4 unique beneficiaries (no referrers)
    expect(bens).toHaveLength(4);

    expect(bens.find(b => b.account === 'alice')?.weight).toBe(2500);
    expect(bens.find(b => b.account === 'onboarder1')?.weight).toBe(2500);
    expect(bens.find(b => b.account === 'bob')?.weight).toBe(2500);
    expect(bens.find(b => b.account === 'onboarder2')?.weight).toBe(2500);
  });

  it('merges creator and referrer when same account', () => {
    const selected = [
      makeNewbie('alice', 'onboarder1', 'onboarder1'),
      makeNewbie('bob', 'onboarder2', 'onboarder2'),
    ];
    const bens = buildBeneficiaries(selected);

    const total = bens.reduce((sum, b) => sum + b.weight, 0);
    expect(total).toBe(10000);

    // 4 unique beneficiaries (creator==referrer merged)
    expect(bens).toHaveLength(4);

    expect(bens.find(b => b.account === 'alice')?.weight).toBe(2500);
    expect(bens.find(b => b.account === 'onboarder1')?.weight).toBe(2500);
  });

  it('handles mixed cases (one with referrer, one without)', () => {
    const selected = [
      makeNewbie('alice', 'onboarder1', 'referrer1'),
      makeNewbie('bob', 'onboarder2', null),
    ];
    const bens = buildBeneficiaries(selected);

    const total = bens.reduce((sum, b) => sum + b.weight, 0);
    expect(total).toBe(10000);

    expect(bens).toHaveLength(5);
  });

  it('handles single newbie', () => {
    const selected = [
      makeNewbie('alice', 'onboarder1', 'referrer1'),
    ];
    const bens = buildBeneficiaries(selected);

    const total = bens.reduce((sum, b) => sum + b.weight, 0);
    expect(total).toBe(10000);

    // Newbie gets 5000, creator 2500, referrer 2500
    expect(bens.find(b => b.account === 'alice')?.weight).toBe(5000);
    expect(bens.find(b => b.account === 'onboarder1')?.weight).toBe(2500);
    expect(bens.find(b => b.account === 'referrer1')?.weight).toBe(2500);
  });

  it('handles overlapping accounts across newbies', () => {
    // Same onboarder for both newbies
    const selected = [
      makeNewbie('alice', 'shared-onboarder', null),
      makeNewbie('bob', 'shared-onboarder', null),
    ];
    const bens = buildBeneficiaries(selected);

    const total = bens.reduce((sum, b) => sum + b.weight, 0);
    expect(total).toBe(10000);

    // 3 unique: alice, bob, shared-onboarder
    expect(bens).toHaveLength(3);

    expect(bens.find(b => b.account === 'shared-onboarder')?.weight).toBe(5000);
  });

  it('never exceeds 8 beneficiaries', () => {
    const selected = [
      makeNewbie('alice', 'c1', 'r1'),
      makeNewbie('bob', 'c2', 'r2'),
    ];
    const bens = buildBeneficiaries(selected);
    expect(bens.length).toBeLessThanOrEqual(8);
  });
});
