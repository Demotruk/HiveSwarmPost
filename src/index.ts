import { loadConfig } from './config.js';
import { initClient } from './hive/client.js';
import { buildTrustGraph } from './hive/trust.js';
import { getVoterRoots } from './trust/voters.js';
import { computeTrustScores } from './trust/graph.js';
import { buildEligiblePool } from './newbies/eligibility.js';
import { rankPool } from './newbies/scoring.js';
import { getBtcBlockAtTimestamp } from './lottery/bitcoin.js';
import { computeSeed, selectFromPool } from './lottery/selection.js';
import { buildBeneficiaries } from './lottery/beneficiaries.js';
import { ensureRootPost } from './posting/root.js';
import { postLotteryComment } from './posting/comments.js';
import { getPendingRounds, currentMinuteOfDayUTC, todayUTC, getScheduledTimestamp } from './scheduler.js';
import { postExists } from './hive/posts.js';
import type { Config, EligibleNewbie, LotteryRound, SelectedNewbie } from './types.js';

async function main(): Promise<void> {
  console.log('=== Hive Swarm Post Bot ===');
  console.log(`Time: ${new Date().toISOString()}`);

  // 1. Load config and initialize
  const config = loadConfig();
  initClient(config);
  console.log(`Bot account: @${config.botAccount}`);
  console.log(`Dry run: ${config.dryRun}`);

  const date = todayUTC();
  console.log(`Date: ${date}`);

  // 2. Determine pending rounds
  const minuteOfDay = currentMinuteOfDayUTC();
  const existingRounds = await findExistingRounds(config.botAccount, date, config.roundsPerDay);
  const pendingRounds = getPendingRounds(minuteOfDay, config.roundsPerDay, existingRounds);

  console.log(`Existing rounds: ${existingRounds.size}/${config.roundsPerDay}`);
  console.log(`Pending rounds: ${pendingRounds.length} (${pendingRounds.join(', ') || 'none'})`);

  if (pendingRounds.length === 0 && existingRounds.size > 0) {
    console.log('No pending rounds. Exiting.');
    return;
  }

  // 3. Build trust graph
  console.log('Building trust graph...');
  const voters = await getVoterRoots(config, date);
  console.log(`Trust roots: ${voters.length} voters`);

  if (voters.length === 0) {
    console.log('No trust roots found. Cannot run lottery.');
    // Still create root post with zero stats (no round 1 selection possible)
    await ensureRootPost(config, date, 0, 0, 0, 0, null, null);
    return;
  }

  // Get all accounts in the trust network
  const allTrustAccounts = new Set<string>();
  for (const v of voters) allTrustAccounts.add(v.account);

  // Build trust graph from voter accounts and their declared trustees
  const graph = await buildTrustGraph(Array.from(allTrustAccounts));

  // Expand: also load trust declarations for accounts trusted by voters
  const trustedByVoters = new Set<string>();
  for (const [, trusted] of graph) {
    for (const t of trusted) trustedByVoters.add(t);
  }
  const expandedGraph = await buildTrustGraph(Array.from(trustedByVoters));
  for (const [account, trusted] of expandedGraph) {
    if (!graph.has(account)) graph.set(account, trusted);
  }

  // Compute trust scores
  const trustScores = computeTrustScores(graph, voters, config.trustAttenuation, config.trustDepthCap);
  console.log(`Trust scores computed for ${trustScores.size} onboarders`);

  // All trust participants (for intro post upvote verification)
  const trustParticipants = new Set<string>();
  for (const v of voters) trustParticipants.add(v.account);
  for (const [account] of graph) trustParticipants.add(account);
  for (const [, trusted] of graph) {
    for (const t of trusted) trustParticipants.add(t);
  }

  // 4. Build eligible newbie pool
  console.log('Building eligible newbie pool...');
  const onboarderAccounts = Array.from(trustScores.keys());
  const pool = await buildEligiblePool(
    onboarderAccounts, trustScores, trustParticipants, config, date,
  );
  const rankedPool = rankPool(pool);
  console.log(`Eligible pool: ${rankedPool.length} newbies`);

  // 5. Run round 1 selection and create root post (root post IS round 1)
  const trustDeclarationCount = Array.from(graph.values())
    .reduce((sum, set) => sum + set.size, 0);

  // Track already-selected newbies across rounds in this run
  const selectedThisRun = new Set<string>();
  let round1: LotteryRound | null = null;

  // Run round 1 selection before creating root post so it carries the beneficiaries
  const rootPostExists = existingRounds.has(1);
  if (!rootPostExists && rankedPool.length > 0 && pendingRounds.includes(1)) {
    round1 = await runRoundSelection(config, date, rankedPool, selectedThisRun, 1);
  }

  await ensureRootPost(
    config, date,
    rankedPool.length,
    onboarderAccounts.length,
    voters.length,
    trustDeclarationCount,
    null, // TODO: fetch previous day's results
    round1,
  );

  if (round1) {
    console.log(
      `Round 1: Selected ${round1.selected.map(s => s.newbie.account).join(', ')} (root post)`
    );
  }

  // 6. Run remaining lottery rounds (2+)
  if (rankedPool.length === 0) {
    console.log('No eligible newbies. Skipping lottery rounds.');
    return;
  }

  const commentRounds = pendingRounds.filter(r => r !== 1);

  if (commentRounds.length === 0) {
    console.log('No pending comment rounds to post.');
    return;
  }

  for (const roundNumber of commentRounds) {
    const round = await runRoundSelection(config, date, rankedPool, selectedThisRun, roundNumber);
    if (!round) continue;

    console.log(
      `Round ${roundNumber}: Selected ${round.selected.map(s => s.newbie.account).join(', ')}`
    );

    try {
      await postLotteryComment(config, round);
    } catch (err) {
      console.error(`Failed to post round ${roundNumber}: ${err}`);
      // Continue with other rounds
    }
  }

  console.log('=== Run complete ===');
}

/**
 * Run lottery selection for a single round. Returns the round data, or null
 * if the pool is exhausted.
 */
async function runRoundSelection(
  config: Config,
  date: string,
  rankedPool: EligibleNewbie[],
  selectedThisRun: Set<string>,
  roundNumber: number,
): Promise<LotteryRound | null> {
  const scheduledTs = getScheduledTimestamp(date, roundNumber, config.roundsPerDay);
  console.log(
    `Round ${roundNumber}: scheduled ${new Date(scheduledTs * 1000).toISOString()}, fetching BTC block...`
  );
  const btcBlock = await getBtcBlockAtTimestamp(scheduledTs);
  console.log(
    `Round ${roundNumber}: BTC block height=${btcBlock.height}, hash=${btcBlock.hash.slice(0, 16)}...`
  );

  const seed = computeSeed(btcBlock.hash, date, roundNumber);

  const availablePool = rankedPool.filter(n => !selectedThisRun.has(n.account));
  if (availablePool.length === 0) {
    console.log(`Round ${roundNumber}: Pool exhausted, skipping`);
    return null;
  }

  const weights = availablePool.map(n => n.score);
  const count = Math.min(config.newbiesPerRound, availablePool.length);
  const selectedIndices = selectFromPool(weights, seed, count);

  const selected: SelectedNewbie[] = selectedIndices.map(idx => {
    const newbie = availablePool[idx];
    selectedThisRun.add(newbie.account);
    return {
      newbie,
      creator: newbie.onboarders.creator,
      referrer: newbie.onboarders.referrer,
    };
  });

  const beneficiaries = buildBeneficiaries(selected);

  return {
    roundNumber,
    date,
    scheduledTimestamp: scheduledTs,
    btcBlockHash: btcBlock.hash,
    btcBlockHeight: btcBlock.height,
    seed,
    selected,
    beneficiaries,
  };
}

/**
 * Find which lottery rounds already exist for today.
 * Round 1 is the root post itself; rounds 2+ are comments.
 */
async function findExistingRounds(
  botAccount: string,
  date: string,
  roundsPerDay: number,
): Promise<Set<number>> {
  const existing = new Set<number>();

  for (let round = 1; round <= roundsPerDay; round++) {
    // Round 1 lives on the root post; other rounds are comments
    const permlink = round === 1
      ? `swarm-post-${date}`
      : `swarm-post-${date}-round-${round}`;
    const exists = await postExists(botAccount, permlink);
    if (exists) existing.add(round);
  }

  return existing;
}

// Run
main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
