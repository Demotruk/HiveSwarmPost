import { loadReblogFeedConfig } from './config.js';
import { initClient } from './hive/client.js';
import { fetchTrustGraph } from './hive/trustApi.js';
import { getVoterRoots, getBootstrapRoots } from './trust/voters.js';
import { computeTrustScores } from './trust/graph.js';
import { todayUTC } from './scheduler.js';
import { runTrustedFeedCycle } from './reblog/trustedFeed.js';
import { runAllFeedCycle } from './reblog/allFeed.js';
import { runPersonalFeedCycle } from './reblog/personalFeed.js';
import type { Config } from './types.js';

async function main(): Promise<void> {
  console.log('=== Reblog Feed Bots ===');
  console.log(`Time: ${new Date().toISOString()}`);

  const config = loadReblogFeedConfig();
  // Feed 1 uses its own posting key for the trusted feed account
  initClient({ hiveNodes: config.hiveNodes, postingKey: config.trustedFeedPostingKey });
  console.log(`Dry run: ${config.dryRun}`);

  const date = todayUTC();

  // Build trust graph (shared across Feed 1 and Feed 3)
  // Construct a Config-shaped object for getVoterRoots (it reads botAccount, voterWindowDays, roundsPerDay, trustApiUrl)
  const configForVoters: Config = {
    postingKey: '',
    botAccount: config.botAccount,
    hiveNodes: config.hiveNodes,
    eligibilityWindowDays: config.trustedFeedWindowDays,
    activityCap: 10,
    trustAttenuation: config.trustAttenuation,
    trustDepthCap: config.trustDepthCap,
    voterWindowDays: config.voterWindowDays,
    roundsPerDay: config.roundsPerDay,
    newbiesPerRound: 1,
    trustApiUrl: config.trustApiUrl,
    sponsorMinTrust: 1000,
    rejectTopVoters: 10,
    dryRun: config.dryRun,
    syncFollows: false,
    testMode: false,
  };

  console.log('\nFetching trust graph...');
  const voters = await getVoterRoots(configForVoters, date);
  console.log(`Trust roots: ${voters.length} voters`);

  const { graph, edgeCount } = await fetchTrustGraph(config.trustApiUrl);
  console.log(`Trust graph: ${edgeCount} edges from ${graph.size} declarers`);

  let trustScores = computeTrustScores(graph, voters, config.trustAttenuation, config.trustDepthCap);

  if (trustScores.size === 0 && voters.length > 0) {
    console.log('Voter-based BFS produced 0 scores — supplementing with bootstrap roots');
    const bootstrapRoots = await getBootstrapRoots(configForVoters);
    const existingAccounts = new Set(voters.map(v => v.account));
    const combined = [...voters, ...bootstrapRoots.filter(b => !existingAccounts.has(b.account))];
    trustScores = computeTrustScores(graph, combined, config.trustAttenuation, config.trustDepthCap);
  }
  console.log(`Trust scores: ${trustScores.size} onboarders`);

  const trustParticipants = new Set<string>();
  for (const v of voters) trustParticipants.add(v.account);
  for (const [account] of graph) trustParticipants.add(account);
  for (const [, trusted] of graph) {
    for (const t of trusted) trustParticipants.add(t);
  }

  // Feed 1: Trusted Network Newbies
  await runTrustedFeedCycle(config, trustScores, trustParticipants);

  // Feed 2: All New Users (re-init client with Feed 2's posting key)
  initClient({ hiveNodes: config.hiveNodes, postingKey: config.allFeedPostingKey });
  await runAllFeedCycle(config);

  // Feed 3: Personal Trust Network
  await runPersonalFeedCycle(config, graph, trustParticipants);

  console.log('\n=== Reblog feed cycle complete ===');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
