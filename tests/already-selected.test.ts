import { describe, it, expect, vi, beforeEach } from 'vitest';

// Keep the real withRetry / initClient / getClient (no network is hit because
// hiveCall is the only thing that would make a request, and we mock it).
vi.mock('../src/hive/client.js', async (importActual) => {
  const actual = await importActual<typeof import('../src/hive/client.js')>();
  return { ...actual, hiveCall: vi.fn() };
});

import { hiveCall, initClient } from '../src/hive/client.js';
import { getAlreadySelectedNewbies } from '../src/newbies/eligibility.js';
import type { Config } from '../src/types.js';

const mockHiveCall = vi.mocked(hiveCall);

const config = {
  botAccount: 'swarmpost',
  eligibilityWindowDays: 2,
  roundsPerDay: 10,
} as unknown as Config;

const emptyPost = { author: '' };
const postWith = (accounts: string[]) => ({
  author: 'swarmpost',
  beneficiaries: accounts.map(account => ({ account, weight: 5000 })),
});

beforeEach(() => {
  initClient({ hiveNodes: ['https://a.test', 'https://b.test'] });
  mockHiveCall.mockReset();
});

describe('getAlreadySelectedNewbies', () => {
  it('collects beneficiaries from past posts within the window', async () => {
    mockHiveCall.mockImplementation(async (_api, _method, params) => {
      const permlink = (params as unknown[])[1];
      if (permlink === 'swarm-post-2026-06-13') {
        return postWith(['blessskateshop', 'hallszn']);
      }
      return emptyPost;
    });

    const selected = await getAlreadySelectedNewbies(config, '2026-06-14');

    expect(selected.has('hallszn')).toBe(true);
    expect(selected.has('blessskateshop')).toBe(true);
  });

  it('retries a transient read failure instead of silently dropping the day', async () => {
    // This is the @hallszn double-award regression: the day's root read used
    // to be gated behind an un-retried postExists, so one flaky node made the
    // whole day's beneficiaries invisible and the newbie was selected again.
    let rootReads = 0;
    mockHiveCall.mockImplementation(async (_api, _method, params) => {
      const permlink = (params as unknown[])[1];
      if (permlink === 'swarm-post-2026-06-13') {
        rootReads++;
        if (rootReads === 1) throw new Error('node timeout');
        return postWith(['hallszn']);
      }
      return emptyPost;
    });

    const selected = await getAlreadySelectedNewbies(config, '2026-06-14');

    expect(rootReads).toBeGreaterThanOrEqual(2); // retried, not skipped
    expect(selected.has('hallszn')).toBe(true);
  });

  it('returns an empty set when no posts exist in the window', async () => {
    mockHiveCall.mockResolvedValue(emptyPost);

    const selected = await getAlreadySelectedNewbies(config, '2026-06-14');

    expect(selected.size).toBe(0);
  });
});
