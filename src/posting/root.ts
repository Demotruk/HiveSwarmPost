import { postExists, broadcastPost, broadcastPostWithBeneficiaries } from '../hive/posts.js';
import { rootPostBody } from './templates.js';
import type { Config, LotteryRound } from '../types.js';

const TAGS = ['hive-swarm-post', 'swarmpost', 'onboarding', 'newbies'];
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
  const permlink = `swarm-post-${date}`;

  const exists = await postExists(config.botAccount, permlink);
  if (exists) {
    console.log(`Root post ${permlink} already exists`);
    return false;
  }

  const title = `Hive Swarm Post — ${date}`;
  const body = rootPostBody(
    date, poolSize, onboarderCount, activeVoters, trustDeclarations, previousResults, round1,
  );

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
    await broadcastPostWithBeneficiaries(
      config.botAccount, permlink, title, body, TAGS, APP_METADATA, round1.beneficiaries,
    );
  } else {
    await broadcastPost(config.botAccount, permlink, title, body, TAGS, APP_METADATA);
  }
  console.log(`Root post created: ${permlink}`);
  return true;
}
