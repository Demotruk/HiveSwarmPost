import { postExists, broadcastPost, broadcastPostWithBeneficiaries } from '../hive/posts.js';
import { rootPostBody } from './templates.js';
import { onChainBeneficiaries } from './beneficiariesTestMode.js';
import type { Config, LotteryRound } from '../types.js';

// First tag sets the Hive community/category. hive-107705 is the
// HiveInvite.com community where production Swarm Post entries belong.
const TAGS = ['hive-107705', 'hive-swarm-post', 'swarmpost', 'onboarding', 'newbies'];
const TEST_TAGS = ['test', 'swarmpost-test'];
const APP_METADATA = 'swarmpost/1.0.0';

/**
 * Ensure today's root post exists. Creates it if missing.
 * The root post acts as round 1, carrying its beneficiaries.
 * Returns true if a new post was created.
 */
export async function ensureRootPost(
  config: Config,
  date: string,
  poolSize: number,
  onboarderCount: number,
  activeVoters: number,
  trustDeclarations: number,
  previousResults: LotteryRound[] | null,
  round1: LotteryRound | null,
): Promise<boolean> {
  const permlink = config.testMode
    ? `swarm-test-${date}`
    : `swarm-post-${date}`;

  const exists = await postExists(config.botAccount, permlink);
  if (exists) {
    console.log(`Root post ${permlink} already exists`);
    return false;
  }

  const title = config.testMode
    ? `⚠️ TEST — DO NOT UPVOTE ⚠️ — ${date}`
    : `Hive Swarm Post — ${date}`;

  const body = rootPostBody(
    date, poolSize, onboarderCount, activeVoters, trustDeclarations,
    previousResults, round1, config.testMode,
  );

  const tags = config.testMode ? TEST_TAGS : TAGS;

  if (config.dryRun) {
    console.log(`[DRY RUN] Would create root post: ${permlink}`);
    console.log(`[DRY RUN] Title: ${title}`);
    if (round1) {
      console.log(`[DRY RUN] Round 1 beneficiaries: ${JSON.stringify(round1.beneficiaries)}`);
    }
    return false;
  }

  console.log(`Creating root post: ${permlink}`);
  if (round1 && round1.beneficiaries.length > 0) {
    const benForChain = onChainBeneficiaries(round1.beneficiaries, config.testMode);
    await broadcastPostWithBeneficiaries(
      config.botAccount, permlink, title, body, tags, APP_METADATA, benForChain,
    );
  } else {
    await broadcastPost(config.botAccount, permlink, title, body, tags, APP_METADATA);
  }
  console.log(`Root post created: ${permlink}`);
  return true;
}
