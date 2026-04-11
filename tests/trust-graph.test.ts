import { describe, it, expect } from 'vitest';
import { computeTrustScores } from '../src/trust/graph.js';
import type { TrustGraph, VoterInfo } from '../src/types.js';

describe('computeTrustScores', () => {
  it('scores direct trust at full HP', () => {
    const graph: TrustGraph = new Map([
      ['voter1', new Set(['onboarder1'])],
    ]);
    const voters: VoterInfo[] = [{ account: 'voter1', hp: 1000 }];
    const scores = computeTrustScores(graph, voters, 0.5, 4);

    expect(scores.get('onboarder1')).toBe(1000);
  });

  it('attenuates 2-hop trust by 0.5', () => {
    const graph: TrustGraph = new Map([
      ['voter1', new Set(['intermediary'])],
      ['intermediary', new Set(['onboarder1'])],
    ]);
    const voters: VoterInfo[] = [{ account: 'voter1', hp: 1000 }];
    const scores = computeTrustScores(graph, voters, 0.5, 4);

    // voter1 -> intermediary (1 hop, score=1000), voter1 -> intermediary -> onboarder1 (2 hops, score=500)
    expect(scores.get('onboarder1')).toBe(500);
    expect(scores.get('intermediary')).toBe(1000);
  });

  it('attenuates 3-hop trust by 0.25', () => {
    const graph: TrustGraph = new Map([
      ['voter1', new Set(['a'])],
      ['a', new Set(['b'])],
      ['b', new Set(['onboarder1'])],
    ]);
    const voters: VoterInfo[] = [{ account: 'voter1', hp: 1000 }];
    const scores = computeTrustScores(graph, voters, 0.5, 4);

    expect(scores.get('onboarder1')).toBe(250);
  });

  it('accumulates trust from multiple voters', () => {
    const graph: TrustGraph = new Map([
      ['voter1', new Set(['onboarder1'])],
      ['voter2', new Set(['onboarder1'])],
    ]);
    const voters: VoterInfo[] = [
      { account: 'voter1', hp: 1000 },
      { account: 'voter2', hp: 500 },
    ];
    const scores = computeTrustScores(graph, voters, 0.5, 4);

    expect(scores.get('onboarder1')).toBe(1500);
  });

  it('accumulates multiple paths from same voter', () => {
    // voter -> a -> target AND voter -> b -> target
    const graph: TrustGraph = new Map([
      ['voter1', new Set(['a', 'b'])],
      ['a', new Set(['target'])],
      ['b', new Set(['target'])],
    ]);
    const voters: VoterInfo[] = [{ account: 'voter1', hp: 1000 }];
    const scores = computeTrustScores(graph, voters, 0.5, 4);

    // Two paths at 2 hops each: 500 + 500 = 1000
    // But BFS with visited set means only the first path reaches target
    // Per the spec: "Multiple paths from the same voter to the same onboarder are accumulated (summed)"
    // This needs BFS that allows revisiting via different paths
    // Actually with standard BFS and visited set, only the shortest path counts
    // The spec says they should be summed - we'll verify this in the implementation
    expect(scores.get('target')).toBe(1000);
  });

  it('respects depth cap', () => {
    const graph: TrustGraph = new Map([
      ['voter1', new Set(['a'])],
      ['a', new Set(['b'])],
      ['b', new Set(['c'])],
      ['c', new Set(['d'])],
      ['d', new Set(['too-far'])],
    ]);
    const voters: VoterInfo[] = [{ account: 'voter1', hp: 1000 }];
    const scores = computeTrustScores(graph, voters, 0.5, 4);

    // Depth cap is 4 hops, so 'd' at 4 hops should be included
    expect(scores.get('d')).toBe(1000 * 0.5 ** 3); // 125
    // 'too-far' at 5 hops should NOT be included
    expect(scores.has('too-far')).toBe(false);
  });

  it('handles cycles without infinite loop', () => {
    const graph: TrustGraph = new Map([
      ['voter1', new Set(['a'])],
      ['a', new Set(['b'])],
      ['b', new Set(['a'])], // cycle
    ]);
    const voters: VoterInfo[] = [{ account: 'voter1', hp: 1000 }];
    const scores = computeTrustScores(graph, voters, 0.5, 4);

    expect(scores.get('a')).toBe(1000);
    expect(scores.get('b')).toBe(500);
  });

  it('returns empty map with no voters', () => {
    const graph: TrustGraph = new Map([
      ['someone', new Set(['other'])],
    ]);
    const scores = computeTrustScores(graph, [], 0.5, 4);
    expect(scores.size).toBe(0);
  });

  it('handles voter not in trust graph', () => {
    const graph: TrustGraph = new Map();
    const voters: VoterInfo[] = [{ account: 'voter1', hp: 1000 }];
    const scores = computeTrustScores(graph, voters, 0.5, 4);
    expect(scores.size).toBe(0);
  });
});
