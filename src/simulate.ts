/**
 * Simulation mode: runs the full pipeline with fixture data.
 * No Hive API calls, no posting key, no network required.
 *
 * Usage: npm run simulate
 */

import { computeTrustScores } from './trust/graph.js';
import { activityWeight } from './newbies/activity.js';
import { rankPool } from './newbies/scoring.js';
import { computeSeed, selectFromPool } from './lottery/selection.js';
import { buildBeneficiaries } from './lottery/beneficiaries.js';
import { getPendingRounds, getScheduledTimestamp } from './scheduler.js';
import { rootPostBody, roundCommentBody } from './posting/templates.js';
import type { TrustGraph, VoterInfo, EligibleNewbie, SelectedNewbie, LotteryRound } from './types.js';

const ACTIVITY_CAP = 10;
const ROUNDS_PER_DAY = 10;
const NEWBIES_PER_ROUND = 2;
const DATE = new Date().toISOString().slice(0, 10);
const FAKE_BTC_HASH = '0000000000000000000232a3fe8b6c8d4f0e7c5a9b1d3e5f7a9b1c3d5e7f9a1b';
const FAKE_BTC_HEIGHT = 840000;

// --- Fixture data ---

const voters: VoterInfo[] = [
  { account: 'whale1', hp: 50000 },
  { account: 'whale2', hp: 30000 },
  { account: 'dolphin1', hp: 5000 },
  { account: 'dolphin2', hp: 3000 },
  { account: 'minnow1', hp: 500 },
];

const trustGraph: TrustGraph = new Map([
  // whale1 directly trusts onboarder-a and onboarder-b
  ['whale1', new Set(['onboarder-a', 'onboarder-b'])],
  // whale2 directly trusts onboarder-a and onboarder-c
  ['whale2', new Set(['onboarder-a', 'onboarder-c'])],
  // dolphin1 trusts onboarder-b (2nd path to onboarder-b)
  ['dolphin1', new Set(['onboarder-b'])],
  // dolphin2 trusts intermediary who trusts onboarder-d (2-hop)
  ['dolphin2', new Set(['intermediary1'])],
  ['intermediary1', new Set(['onboarder-d'])],
  // minnow1 trusts onboarder-a (3rd trust path to onboarder-a)
  ['minnow1', new Set(['onboarder-a'])],
  // onboarder-c also trusts onboarder-e (3-hop from whale2)
  ['onboarder-c', new Set(['onboarder-e'])],
]);

// 8 newbies with different onboarders and activity levels
const newbieFixtures: Array<{
  account: string;
  creator: string;
  referrer: string | null;
  postCount: number;
  daysAgo: number;
}> = [
  { account: 'newbie-alice', creator: 'onboarder-a', referrer: 'onboarder-b', postCount: 8, daysAgo: 5 },
  { account: 'newbie-bob', creator: 'onboarder-a', referrer: null, postCount: 3, daysAgo: 10 },
  { account: 'newbie-carol', creator: 'onboarder-b', referrer: 'onboarder-a', postCount: 12, daysAgo: 2 },
  { account: 'newbie-dave', creator: 'onboarder-c', referrer: null, postCount: 1, daysAgo: 20 },
  { account: 'newbie-eve', creator: 'onboarder-d', referrer: 'onboarder-a', postCount: 5, daysAgo: 7 },
  { account: 'newbie-frank', creator: 'onboarder-a', referrer: 'onboarder-c', postCount: 2, daysAgo: 15 },
  { account: 'newbie-grace', creator: 'onboarder-e', referrer: null, postCount: 4, daysAgo: 3 },
  { account: 'newbie-heidi', creator: 'onboarder-b', referrer: 'onboarder-b', postCount: 6, daysAgo: 8 },
];

// --- Run simulation ---

function simulate(): void {
  console.log('=== SIMULATION MODE ===');
  console.log(`Date: ${DATE}\n`);

  // 1. Trust scores
  console.log('--- Trust Scores ---');
  const trustScores = computeTrustScores(trustGraph, voters, 0.5, 4);
  const sortedScores = Array.from(trustScores.entries()).sort((a, b) => b[1] - a[1]);
  for (const [account, score] of sortedScores) {
    console.log(`  ${account}: ${score.toFixed(2)}`);
  }
  console.log();

  // 2. Build eligible pool
  console.log('--- Eligible Pool ---');
  const now = new Date(DATE + 'T00:00:00Z');
  const pool: EligibleNewbie[] = newbieFixtures.map(n => {
    const createdAt = new Date(now);
    createdAt.setUTCDate(createdAt.getUTCDate() - n.daysAgo);

    const creatorTrust = trustScores.get(n.creator) || 0;
    const referrerTrust = n.referrer ? (trustScores.get(n.referrer) || 0) : 0;
    const onboarderTrust = creatorTrust + referrerTrust;
    const weight = activityWeight(n.postCount, ACTIVITY_CAP);
    const score = onboarderTrust * weight;

    return {
      account: n.account,
      createdAt,
      onboarders: { creator: n.creator, referrer: n.referrer },
      activityWeight: weight,
      onboarderTrust,
      score,
    };
  });

  const ranked = rankPool(pool);
  for (const n of ranked) {
    console.log(
      `  ${n.account.padEnd(16)} score=${n.score.toFixed(2).padStart(10)}  ` +
      `trust=${n.onboarderTrust.toFixed(0).padStart(7)}  ` +
      `activity=${n.activityWeight.toFixed(4)}  ` +
      `creator=${n.onboarders.creator}  referrer=${n.onboarders.referrer || '(none)'}`
    );
  }
  console.log();

  // 3. Root post
  console.log('--- Root Post ---');
  const onboarderCount = new Set(newbieFixtures.map(n => n.creator)).size;
  const rootBody = rootPostBody(DATE, ranked.length, onboarderCount, voters.length, sortedScores.length, null);
  console.log(rootBody);

  // 4. Lottery rounds
  // Simulate all 10 rounds (as if end of day)
  const pendingRounds = getPendingRounds(24 * 60 - 1, ROUNDS_PER_DAY, new Set());
  const selectedThisRun = new Set<string>();
  const allRounds: LotteryRound[] = [];

  for (const roundNumber of pendingRounds) {
    const btcBlockHash = FAKE_BTC_HASH;
    const seed = computeSeed(btcBlockHash, DATE, roundNumber);

    const availablePool = ranked.filter(n => !selectedThisRun.has(n.account));
    if (availablePool.length === 0) {
      console.log(`Round ${roundNumber}: Pool exhausted, skipping\n`);
      continue;
    }

    const weights = availablePool.map(n => n.score);
    const count = Math.min(NEWBIES_PER_ROUND, availablePool.length);
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

    const scheduledTs = getScheduledTimestamp(DATE, roundNumber, ROUNDS_PER_DAY);

    const round: LotteryRound = {
      roundNumber,
      date: DATE,
      scheduledTimestamp: scheduledTs,
      btcBlockHash,
      btcBlockHeight: FAKE_BTC_HEIGHT + roundNumber,
      seed,
      selected,
      beneficiaries,
    };
    allRounds.push(round);

    console.log(`--- Round ${roundNumber} Comment ---`);
    console.log(roundCommentBody(round));
  }

  // Summary
  console.log('--- Summary ---');
  console.log(`Total rounds: ${allRounds.length}`);
  console.log(`Total newbies selected: ${selectedThisRun.size}`);
  console.log(`Newbies: ${Array.from(selectedThisRun).join(', ')}`);
  console.log(`Pool remaining: ${ranked.length - selectedThisRun.size}`);
}

simulate();
