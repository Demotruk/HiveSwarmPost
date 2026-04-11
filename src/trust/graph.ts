import type { TrustGraph, VoterInfo } from '../types.js';

/**
 * Compute trust scores for all onboarders reachable from voter trust roots.
 *
 * For each voter V with HP, BFS through the trust graph.
 * At each hop, accumulate HP(V) * attenuation^(hops-1) into the target's score.
 *
 * Multiple paths from the same voter to the same onboarder are accumulated (summed)
 * when they arrive at the same depth. Cycles are prevented by not scoring nodes
 * already visited in a prior level.
 *
 * Different voters' contributions to the same onboarder also sum.
 *
 * Returns a Map of account -> trust score.
 */
export function computeTrustScores(
  graph: TrustGraph,
  voters: VoterInfo[],
  attenuation: number,
  depthCap: number,
): Map<string, number> {
  const scores = new Map<string, number>();

  for (const voter of voters) {
    // Tracks nodes finalized in prior levels (won't be scored again)
    const finalized = new Set<string>();
    finalized.add(voter.account);

    let currentLevel = [voter.account];
    let hops = 0;

    while (currentLevel.length > 0 && hops < depthCap) {
      hops++;
      const weight = voter.hp * Math.pow(attenuation, hops - 1);

      // Collect all targets discovered at this level
      const levelTargets = new Map<string, number>(); // account -> count of incoming edges

      for (const current of currentLevel) {
        const trusted = graph.get(current);
        if (!trusted) continue;

        for (const target of trusted) {
          if (finalized.has(target)) continue; // already scored in a prior level
          levelTargets.set(target, (levelTargets.get(target) || 0) + 1);
        }
      }

      // Score each target: weight * number of incoming edges at this level
      for (const [target, edgeCount] of levelTargets) {
        scores.set(target, (scores.get(target) || 0) + weight * edgeCount);
      }

      // Finalize this level's targets and prepare next level
      const nextLevel: string[] = [];
      for (const target of levelTargets.keys()) {
        finalized.add(target);
        nextLevel.push(target);
      }

      currentLevel = nextLevel;
    }
  }

  return scores;
}
