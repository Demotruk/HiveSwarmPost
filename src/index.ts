import { loadConfig } from './config.js';
import { initClient } from './hive/client.js';
import { fetchTrustGraph } from './hive/trustApi.js';
import { getVoterRoots, getBootstrapRoots, getAuthorizedRejectors } from './trust/voters.js';
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
import { getFollowing, syncFollows } from './hive/follows.js';
import type { Config, EligibleNewbie, LotteryRound, SelectedNewbie } from './types.js';

async function main(): Promise<void> {
  console.log('=== Hive Swarm Post Bot ===');
  console.log(`Time: ${new Date().toISOString()}`);

  // 1. Load config and initialize
  const config = loadConfig();
  initClient(config);
  console.log(`Bot account: @${config.botAccount}`);
  console.log(`Dry run: ${config.dryRun}`);
  if (config.testMode) console.log(`⚠️  TEST MODE — posts will be marked as test`);

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
  console.log('Fetching voter roots...');
  const votersStart = Date.now();
  const voters = await getVoterRoots(config, date);
  console.log(`Trust roots: ${voters.length} voters (${((Date.now() - votersStart) / 1000).toFixed(1)}s)`);

  if (voters.length === 0) {
    console.log('No trust roots found. Cannot run lottery.');
    if (existingRounds.has(1)) {
      console.log('Root post already exists; nothing to do.');
    } else {
      console.log('Skipping root post creation — no point posting with zero data.');
    }
    return;
  }

  // Fetch the full trust graph from swarm-trust-api. The API indexer keeps
  // this up to date within seconds of chain finality, so we don't need to
  // crawl account history from the bot.
  const graphStart = Date.now();
  const { graph, edgeCount, lastIndexedBlock } = await fetchTrustGraph(config.trustApiUrl);
  console.log(
    `Trust graph: ${edgeCount} edges from ${graph.size} declarers ` +
    `(last indexed block ${lastIndexedBlock}, ${((Date.now() - graphStart) / 1000).toFixed(1)}s)`
  );

  // Compute trust scores
  let trustScores = computeTrustScores(graph, voters, config.trustAttenuation, config.trustDepthCap);

  // If voter-based BFS produced 0 scores (voters exist but aren't in the
  // trust graph), fall back to bootstrap roots so the system keeps working
  // during the transition period.
  if (trustScores.size === 0 && voters.length > 0) {
    console.log('Voter-based BFS produced 0 scores — supplementing with bootstrap roots');
    const bootstrapRoots = await getBootstrapRoots(config);
    // Merge: keep original voters + add bootstrap roots not already present
    const existingAccounts = new Set(voters.map(v => v.account));
    const combined = [...voters, ...bootstrapRoots.filter(b => !existingAccounts.has(b.account))];
    trustScores = computeTrustScores(graph, combined, config.trustAttenuation, config.trustDepthCap);
    console.log(`Trust scores (with bootstrap fallback): ${trustScores.size} onboarders`);
  } else {
    console.log(`Trust scores computed for ${trustScores.size} onboarders`);
  }

  // All trust participants (for intro post upvote verification)
  const trustParticipants = new Set<string>();
  for (const v of voters) trustParticipants.add(v.account);
  for (const [account] of graph) trustParticipants.add(account);
  for (const [, trusted] of graph) {
    for (const t of trusted) trustParticipants.add(t);
  }

  // 4. Get authorized rejectors and build eligible newbie pool
  const authorizedRejectors = await getAuthorizedRejectors(config, date, config.rejectTopVoters);

  console.log('Building eligible newbie pool...');
  const onboarderAccounts = Array.from(trustScores.keys());
  const { eligible, followable } = await buildEligiblePool(
    onboarderAccounts, trustScores, trustParticipants, config, date, authorizedRejectors,
  );
  const rankedPool = rankPool(eligible);
  console.log(`Ranked pool: ${rankedPool.length} newbies`);

  // 5. Sync follow list with the followable pool.
  // Follow criteria are deliberately more liberal than lottery criteria —
  // we want to follow brand-new accounts before they've made an intro post,
  // so the bot sees their activity early.
  if (config.syncFollows) {
    console.log('Syncing follow list...');
    const currentFollows = await getFollowing(config.botAccount);
    console.log(`Current follows: ${currentFollows.length}, desired: ${followable.length}`);
    const result = await syncFollows(followable, currentFollows, config.botAccount, config.dryRun);
    console.log(`Follow sync complete: +${result.followed.length} -${result.unfollowed.length}`);
  }

  // 6. Run round 1 selection and create root post (root post IS round 1)
  const trustDeclarationCount = Array.from(graph.values())
    .reduce((sum, set) => sum + set.size, 0);

  // Track already-selected newbies across rounds in this run

  const selectedThisRun = new Set<string>();
  let round1: LotteryRound | null = null;

  // Run round 1 selection before creating root post so it carries the beneficiaries
  const rootPostExists = existingRounds.has(1);

  // Don't create an empty root post when there are no eligible newbies. If the
  // pool is empty and we haven't posted yet, skip entirely — we'd rather have
  // no post than a content-free one that earns rewards with no beneficiaries.
  // If the root already exists (created earlier in the day when the pool was
  // non-empty), we still proceed to run any pending comment rounds.
  if (!rootPostExists && rankedPool.length === 0) {
    console.log('No eligible newbies and no root post yet today. Skipping post creation.');
    return;
  }

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

  // 7. Run remaining lottery rounds (2+)
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
    const sponsored = !!newbie.onboarders.sponsor;
    return {
      newbie,
      creator: sponsored
        ? newbie.onboarders.sponsor!
        : (newbie.onboarders.vouchedCreator || newbie.onboarders.creator),
      referrer: sponsored ? null : newbie.onboarders.referrer,
      voucher: newbie.onboarders.voucher,
      sponsor: newbie.onboarders.sponsor,
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
