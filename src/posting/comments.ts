import { postExists, broadcastCommentWithBeneficiaries } from '../hive/posts.js';
import { roundCommentBody } from './templates.js';
import type { Config, LotteryRound } from '../types.js';

const TAGS = ['hive-swarm-post', 'swarmpost', 'onboarding', 'newbies'];
const APP_METADATA = 'swarmpost/1.0.0';

/**
 * Post a lottery round comment with beneficiaries.
 * Returns true if a new comment was posted.
 */
export async function postLotteryComment(
  config: Config,
  round: LotteryRound,
): Promise<boolean> {
  const rootPermlink = `swarm-post-${round.date}`;
  const commentPermlink = `swarm-post-${round.date}-round-${round.roundNumber}`;

  const exists = await postExists(config.botAccount, commentPermlink);
  if (exists) {
    console.log(`Round ${round.roundNumber} comment already exists: ${commentPermlink}`);
    return false;
  }

  const body = roundCommentBody(round);

  if (config.dryRun) {
    console.log(`[DRY RUN] Would post round ${round.roundNumber}: ${commentPermlink}`);
    console.log(`[DRY RUN] Beneficiaries: ${JSON.stringify(round.beneficiaries)}`);
    return false;
  }

  console.log(`Posting round ${round.roundNumber}: ${commentPermlink}`);
  await broadcastCommentWithBeneficiaries(
    config.botAccount,
    config.botAccount,
    rootPermlink,
    commentPermlink,
    body,
    TAGS,
    APP_METADATA,
    round.beneficiaries,
  );
  console.log(`Round ${round.roundNumber} posted with ${round.beneficiaries.length} beneficiaries`);
  return true;
}
