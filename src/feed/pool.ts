import { getAccounts, getAccountCreatedDate, getOnboarderAttribution, getPostCommentCount } from '../hive/accounts.js';
import { discoverVouches } from '../hive/vouches.js';
import { findNewbiesCreatedBy, findIntroPostWithStatus } from '../newbies/eligibility.js';
import { activityWeight } from '../newbies/activity.js';
import type { Config, FeedNewbie } from '../types.js';

/**
 * Build the feed of newbie introduction posts with eligibility status.
 *
 * Unlike buildEligiblePool, this includes newbies whose intro posts
 * have NOT yet received a trusted upvote. Those posts are returned
 * with hasTrustedVote: false so the UI can show them greyed out.
 */
export async function buildFeedPool(
  onboarderAccounts: string[],
  trustScores: Map<string, number>,
  trustParticipants: Set<string>,
  config: Config,
  date: string,
): Promise<FeedNewbie[]> {
  const feedNewbies: FeedNewbie[] = [];
  const now = new Date(date + 'T00:00:00Z');
  const windowStart = new Date(now);
  windowStart.setUTCDate(windowStart.getUTCDate() - config.eligibilityWindowDays);

  for (const onboarder of onboarderAccounts) {
    const creatorScore = trustScores.get(onboarder) || 0;
    if (creatorScore === 0) continue;

    console.log(`  Scanning @${onboarder} for created accounts...`);
    const newbies = await findNewbiesCreatedBy(onboarder, windowStart, now);
    console.log(`  @${onboarder}: ${newbies.length} newbies found`);

    for (const newbieAccount of newbies) {
      try {
        const result = await evaluateForFeed(
          newbieAccount, trustScores, trustParticipants, config, windowStart,
        );
        if (result) {
          feedNewbies.push(result);
        }
      } catch (err) {
        console.log(`Error evaluating newbie for feed ${newbieAccount}: ${err}`);
      }
    }
  }

  // Vouch discovery: find newbies attested via !vouch on intro posts
  const seen = new Set(feedNewbies.map(n => n.account));
  const vouches = await discoverVouches(trustParticipants, windowStart);

  for (const vouch of vouches) {
    if (seen.has(vouch.newbie)) continue;
    const creatorTrust = trustScores.get(vouch.attestedCreator) || 0;
    if (creatorTrust === 0) continue;

    try {
      const result = await evaluateForFeed(
        vouch.newbie, trustScores, trustParticipants, config, windowStart,
        { vouchedCreator: vouch.attestedCreator, voucher: vouch.voucher },
      );
      if (result) {
        seen.add(vouch.newbie);
        feedNewbies.push(result);
      }
    } catch (err) {
      console.log(`Error evaluating vouched newbie for feed ${vouch.newbie}: ${err}`);
    }
  }

  // Sort: fully eligible first by score desc, then ineligible by creation date desc
  const isEligible = (n: FeedNewbie) => n.introPost.hasTrustedVote && n.introPost.isOldEnough;
  feedNewbies.sort((a, b) => {
    const aElig = isEligible(a);
    const bElig = isEligible(b);
    if (aElig !== bElig) return aElig ? -1 : 1;
    if (aElig) return b.score - a.score;
    return new Date(b.introPost.created).getTime() - new Date(a.introPost.created).getTime();
  });

  return feedNewbies;
}

/**
 * Evaluate a newbie for the feed. Returns the newbie with intro post status,
 * or null if they don't have an intro post with image + tag at all.
 */
async function evaluateForFeed(
  username: string,
  trustScores: Map<string, number>,
  trustParticipants: Set<string>,
  config: Config,
  windowStart: Date,
  vouchOverride?: { vouchedCreator: string; voucher: string },
): Promise<FeedNewbie | null> {
  const [account] = await getAccounts([username]);
  if (!account) return null;

  const createdAt = getAccountCreatedDate(account);
  if (createdAt < windowStart) return null;

  // Find intro post with detailed status (does NOT require trusted vote)
  const introPost = await findIntroPostWithStatus(username, trustParticipants);
  if (!introPost) return null;

  const onboarders = await getOnboarderAttribution(username);
  if (vouchOverride) {
    onboarders.vouchedCreator = vouchOverride.vouchedCreator;
    onboarders.voucher = vouchOverride.voucher;
  }

  const creator = onboarders.vouchedCreator || onboarders.creator;
  const creatorTrust = trustScores.get(creator) || 0;
  const referrerTrust = onboarders.referrer ? (trustScores.get(onboarders.referrer) || 0) : 0;
  const onboarderTrust = creatorTrust + referrerTrust;

  if (onboarderTrust === 0) return null;

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
    introPost,
  };
}
