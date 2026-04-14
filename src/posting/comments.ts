import { postExists, broadcastCommentWithBeneficiaries } from '../hive/posts.js';
import { roundCommentBody } from './templates.js';
import { onChainBeneficiaries } from './beneficiariesTestMode.js';
import type { Config, LotteryRound } from '../types.js';

// First tag sets the Hive community/category. hive-107705 is the
// HiveInvite.com community where production Swarm Post entries belong.
const TAGS = ['hive-107705', 'hive-swarm-post', 'swarmpost', 'onboarding', 'newbies'];
const TEST_TAGS = ['test', 'swarmpost-test'];
const APP_METADATA = 'swarmpost/1.0.0';

/**
 * Post a lottery round comment with beneficiaries.
 * Returns true if a new comment was posted.
 */
export async function postLotteryComment(
  config: Config,
  round: LotteryRound,
): Promise<boolean> {
  const prefix = config.testMode ? 'swarm-test' : 'swarm-post';
  const rootPermlink = `${prefix}-${round.date}`;
  const commentPermlink = `${prefix}-${round.date}-round-${round.roundNumber}`;

  const exists = await postExists(config.botAccount, commentPermlink);
  if (exists) {
    console.log(`Round ${round.roundNumber} comment already exists: ${commentPermlink}`);
    return false;
  }

  const body = roundCommentBody(round, config.testMode);

  if (config.dryRun) {
    console.log(`[DRY RUN] Would post round ${round.roundNumber}: ${commentPermlink}`);
    console.log(`[DRY RUN] Beneficiaries: ${JSON.stringify(round.beneficiaries)}`);
    return false;
  }

  const tags = config.testMode ? TEST_TAGS : TAGS;

  const benForChain = onChainBeneficiaries(round.beneficiaries, config.testMode);
  console.log(`Posting round ${round.roundNumber}: ${commentPermlink}`);
  await broadcastCommentWithBeneficiaries(
    config.botAccount,
    config.botAccount,
    rootPermlink,
    commentPermlink,
    body,
    tags,
    APP_METADATA,
    benForChain,
  );
  console.log(`Round ${round.roundNumber} posted with ${round.beneficiaries.length} beneficiaries`);
  return true;
}
