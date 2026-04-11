import { getAccounts, getAccountCreatedDate, getOnboarderAttribution, getPostCommentCount } from '../hive/accounts.js';
import { hiveCall, withRetry } from '../hive/client.js';
import { postExists, getActiveVotes } from '../hive/posts.js';
import { activityWeight } from './activity.js';
import type { Config, EligibleNewbie, TrustGraph } from '../types.js';

/**
 * Build the pool of eligible newbies for the lottery.
 *
 * A newbie is eligible when:
 * 1. Account created within the eligibility window
 * 2. Has a qualifying introduction post (image, introduceyourself tag, trusted upvote)
 * 3. Not already selected as a beneficiary in current eligibility window
 */
export async function buildEligiblePool(
  onboarderAccounts: string[],
  trustScores: Map<string, number>,
  trustParticipants: Set<string>,
  config: Config,
  date: string,
): Promise<EligibleNewbie[]> {
  const eligibleNewbies: EligibleNewbie[] = [];
  const now = new Date(date + 'T00:00:00Z');
  const windowStart = new Date(now);
  windowStart.setUTCDate(windowStart.getUTCDate() - config.eligibilityWindowDays);

  // Get already-selected newbies (beneficiaries of past Swarm Post comments)
  const alreadySelected = await getAlreadySelectedNewbies(config, date);

  // For each onboarder with a trust score, find their created accounts
  for (const onboarder of onboarderAccounts) {
    const creatorScore = trustScores.get(onboarder) || 0;
    if (creatorScore === 0) continue;

    const newbies = await findNewbiesCreatedBy(onboarder, windowStart, now);

    for (const newbieAccount of newbies) {
      if (alreadySelected.has(newbieAccount)) continue;

      try {
        const newbie = await evaluateNewbie(
          newbieAccount, trustScores, trustParticipants, config, windowStart,
        );
        if (newbie) {
          eligibleNewbies.push(newbie);
        }
      } catch (err) {
        console.log(`Error evaluating newbie ${newbieAccount}: ${err}`);
      }
    }
  }

  return eligibleNewbies;
}

/**
 * Evaluate a single newbie for eligibility.
 * Returns null if the newbie is not eligible.
 */
async function evaluateNewbie(
  username: string,
  trustScores: Map<string, number>,
  trustParticipants: Set<string>,
  config: Config,
  windowStart: Date,
): Promise<EligibleNewbie | null> {
  const [account] = await getAccounts([username]);
  if (!account) return null;

  const createdAt = getAccountCreatedDate(account);
  if (createdAt < windowStart) return null;

  // Check for qualifying introduction post
  const hasIntro = await hasQualifyingIntroPost(username, trustParticipants);
  if (!hasIntro) return null;

  // Get onboarder attribution
  const onboarders = await getOnboarderAttribution(username);

  // Compute onboarder trust
  const creatorTrust = trustScores.get(onboarders.creator) || 0;
  const referrerTrust = onboarders.referrer ? (trustScores.get(onboarders.referrer) || 0) : 0;
  const onboarderTrust = creatorTrust + referrerTrust;

  if (onboarderTrust === 0) return null;

  // Compute activity weight
  const postCount = await getPostCommentCount(username, createdAt);
  const weight = activityWeight(postCount, config.activityCap);

  const score = onboarderTrust * weight;

  return {
    account: username,
    createdAt,
    onboarders,
    activityWeight: weight,
    onboarderTrust,
    score,
  };
}

/**
 * Check if a newbie has a qualifying introduction post:
 * - Tagged with "introduceyourself"
 * - Contains at least one image in json_metadata.image
 * - Has at least one upvote with positive weight from a trust participant
 */
async function hasQualifyingIntroPost(
  username: string,
  trustParticipants: Set<string>,
): Promise<boolean> {
  // Get the user's posts tagged with introduceyourself
  const posts = await withRetry<any[]>(() =>
    hiveCall<any[]>('condenser_api', 'get_discussions_by_blog', [{
      tag: username,
      limit: 50,
    }])
  );

  if (!posts || posts.length === 0) return false;

  for (const post of posts) {
    // Must be a root post by this author
    if (post.author !== username || post.parent_author !== '') continue;

    // Check tags
    let tags: string[] = [];
    try {
      const meta = JSON.parse(post.json_metadata);
      tags = meta.tags || [];

      // Check for image
      const images = meta.image || meta.images || [];
      if (!Array.isArray(images) || images.length === 0) continue;
    } catch {
      continue;
    }

    if (!tags.includes('introduceyourself')) continue;

    // Check for trusted upvote
    const votes = await getActiveVotes(post.author, post.permlink);
    const hasTrustedVote = votes.some(
      (v: any) => trustParticipants.has(v.voter) && (v.rshares > 0 || v.percent > 0)
    );

    if (hasTrustedVote) return true;
  }

  return false;
}

/**
 * Find accounts created by a specific onboarder within the eligibility window.
 */
async function findNewbiesCreatedBy(
  creator: string,
  windowStart: Date,
  windowEnd: Date,
): Promise<string[]> {
  const newbies: string[] = [];
  let start = -1;
  const batchSize = 1000;

  while (true) {
    const history = await withRetry<any[][]>(() =>
      hiveCall<any[][]>('condenser_api', 'get_account_history', [
        creator, start, batchSize,
      ])
    );

    if (!history || history.length === 0) break;

    for (const [, entry] of history) {
      const [opType, opData] = entry.op;
      if (
        (opType === 'account_create' || opType === 'create_claimed_account') &&
        opData.creator === creator
      ) {
        const timestamp = new Date(entry.timestamp + 'Z');
        if (timestamp >= windowStart && timestamp <= windowEnd) {
          newbies.push(opData.new_account_name);
        }
      }
    }

    if (history.length < batchSize) break;
    start = history[0][0] - 1;
    if (start < 0) break;
  }

  return newbies;
}

/**
 * Get the set of newbie accounts that have already been selected as
 * beneficiaries in Swarm Post comments during the eligibility window.
 */
async function getAlreadySelectedNewbies(
  config: Config,
  date: string,
): Promise<Set<string>> {
  const selected = new Set<string>();
  const now = new Date(date + 'T00:00:00Z');

  for (let dayOffset = 0; dayOffset < config.eligibilityWindowDays; dayOffset++) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - dayOffset);
    const dateStr = d.toISOString().slice(0, 10);
    const rootPermlink = `swarm-post-${dateStr}`;

    const exists = await postExists(config.botAccount, rootPermlink);
    if (!exists) continue;

    for (let round = 1; round <= config.roundsPerDay; round++) {
      const commentPermlink = `swarm-post-${dateStr}-round-${round}`;
      const commentExists = await postExists(config.botAccount, commentPermlink);
      if (!commentExists) continue;

      // Parse the comment body to extract selected newbie accounts
      // The comment body contains the beneficiary info in a structured format
      const comment = await withRetry(() =>
        hiveCall<any>('condenser_api', 'get_content', [config.botAccount, commentPermlink])
      );

      if (comment?.beneficiaries) {
        for (const ben of comment.beneficiaries) {
          selected.add(ben.account);
        }
      }
    }
  }

  return selected;
}
