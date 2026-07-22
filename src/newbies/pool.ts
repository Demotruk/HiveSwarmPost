import { fetchTrustGraph } from '../hive/trustApi.js';
import { getVoterRoots, getBootstrapRoots, getAuthorizedRejectors } from '../trust/voters.js';
import { computeTrustScores } from '../trust/graph.js';
import { buildEligiblePool } from './eligibility.js';
import type { Config, EligibleNewbie } from '../types.js';

export interface EligibleContext {
  eligible: EligibleNewbie[];
  followable: string[];
  trustScores: Map<string, number>;
  trustParticipants: Set<string>;
}

/**
 * Build the eligible newbie pool from scratch: fetch voter roots, load the
 * trust graph, compute trust scores (with bootstrap fallback), and evaluate
 * newbies for eligibility.
 *
 * This is the same sequence the lottery runs in index.ts (steps 3–4), factored
 * out so the RC-delegation service targets an identical "trustworthy newbie
 * with a qualifying intro" pool. Returns null when there are no trust roots.
 */
export async function buildEligibleContext(
  config: Config,
  date: string,
): Promise<EligibleContext | null> {
  const voters = await getVoterRoots(config, date);
  console.log(`Trust roots: ${voters.length} voters`);
  if (voters.length === 0) {
    console.log('No trust roots found — cannot build eligible pool.');
    return null;
  }

  const { graph, edgeCount } = await fetchTrustGraph(config.trustApiUrl);
  console.log(`Trust graph: ${edgeCount} edges from ${graph.size} declarers`);

  let trustScores = computeTrustScores(
    graph, voters, config.trustAttenuation, config.trustDepthCap,
  );
  if (trustScores.size === 0 && voters.length > 0) {
    console.log('Voter-based BFS produced 0 scores — supplementing with bootstrap roots');
    const bootstrapRoots = await getBootstrapRoots(config);
    const existingAccounts = new Set(voters.map(v => v.account));
    const combined = [...voters, ...bootstrapRoots.filter(b => !existingAccounts.has(b.account))];
    trustScores = computeTrustScores(
      graph, combined, config.trustAttenuation, config.trustDepthCap,
    );
  }
  console.log(`Trust scores computed for ${trustScores.size} onboarders`);

  const trustParticipants = new Set<string>();
  for (const v of voters) trustParticipants.add(v.account);
  for (const [account, trusted] of graph) {
    trustParticipants.add(account);
    for (const t of trusted) trustParticipants.add(t);
  }

  const authorizedRejectors = await getAuthorizedRejectors(config, date, config.rejectTopVoters);

  const onboarderAccounts = Array.from(trustScores.keys());
  const { eligible, followable } = await buildEligiblePool(
    onboarderAccounts, trustScores, trustParticipants, config, date, authorizedRejectors,
  );

  return { eligible, followable, trustScores, trustParticipants };
}
