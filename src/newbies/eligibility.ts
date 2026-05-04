import { getAccounts, getAccountCreatedDate, getOnboarderAttribution, getPostCommentCount } from '../hive/accounts.js';
import { hiveCall, withRetry } from '../hive/client.js';
import { postExists, getActiveVotes } from '../hive/posts.js';
import { discoverVouchesAndSponsorships } from '../hive/vouches.js';
import { activityWeight } from './activity.js';
import type { Config, EligibleNewbie, IntroPostStatus, TrustGraph } from '../types.js';

// Server-side operation filter for get_account_history: only return
// account_create (op 9) and create_claimed_account (op 23) ops.
// Without this filter, the API returns every op type (votes, comments,
// transfers, etc.) and we discard 99%+ client-side.
const ACCOUNT_CREATE_BITMASK = (1 << 9) | (1 << 23);

/**
 * Build the pool of eligible newbies for the lottery.
 *
 * Returns two pools:
 * - `followable`: any account created by a trusted onboarder within the
 *   eligibility window. Used for follow sync — deliberately liberal so the
 *   bot follows brand-new accounts before they've made an intro post.
 * - `eligible`: subset of followable that also passes the lottery criteria
 *   (has a qualifying intro post: image, `introduceyourself` tag, net
 *   positive trust-participant votes, >= 24h old) and hasn't already been
 *   selected as a beneficiary in the current window.
 */
export async function buildEligiblePool(
  onboarderAccounts: string[],
  trustScores: Map<string, number>,
  trustParticipants: Set<string>,
  config: Config,
  date: string,
): Promise<{ eligible: EligibleNewbie[]; followable: string[] }> {
  const eligibleNewbies: EligibleNewbie[] = [];
  const followable = new Set<string>();
  const now = new Date(date + 'T00:00:00Z');
  const windowStart = new Date(now);
  windowStart.setUTCDate(windowStart.getUTCDate() - config.eligibilityWindowDays);
  const t0 = Date.now();

  // Get already-selected newbies (beneficiaries of past Swarm Post comments)
  const alreadySelected = await getAlreadySelectedNewbies(config, date);
  console.log(`Already-selected newbies (past ${config.eligibilityWindowDays}d): ${alreadySelected.size}`);

  const scoredOnboarders = onboarderAccounts.filter(o => (trustScores.get(o) || 0) > 0);
  console.log(`Scanning ${scoredOnboarders.length} onboarders for newbies...`);

  // For each onboarder with a trust score, find their created accounts
  let onboarderIdx = 0;
  for (const onboarder of scoredOnboarders) {
    onboarderIdx++;
    const newbies = await findNewbiesCreatedBy(onboarder, windowStart, now);
    if (newbies.length > 0) {
      console.log(`  [${onboarderIdx}/${scoredOnboarders.length}] @${onboarder}: ${newbies.length} newbies to evaluate`);
    }

    for (const newbieAccount of newbies) {
      // Every trusted-onboarder-created account in window is followable,
      // regardless of lottery eligibility.
      followable.add(newbieAccount);

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

  // Second pass: discover newbies via !vouch and !sponsor on intro posts.
  const { vouches, sponsorships } = await discoverVouchesAndSponsorships(
    trustParticipants, windowStart,
  );

  for (const vouch of vouches) {
    if (followable.has(vouch.newbie)) continue;
    if (alreadySelected.has(vouch.newbie)) continue;

    const creatorTrust = trustScores.get(vouch.attestedCreator) || 0;
    if (creatorTrust === 0) continue;

    followable.add(vouch.newbie);

    try {
      const newbie = await evaluateVouchedNewbie(
        vouch, trustScores, trustParticipants, config, windowStart,
      );
      if (newbie) {
        eligibleNewbies.push(newbie);
      }
    } catch (err) {
      console.log(`Error evaluating vouched newbie ${vouch.newbie}: ${err}`);
    }
  }

  for (const sponsorship of sponsorships) {
    if (followable.has(sponsorship.newbie)) continue;
    if (alreadySelected.has(sponsorship.newbie)) continue;

    const sponsorTrust = trustScores.get(sponsorship.sponsor) || 0;
    if (sponsorTrust < config.sponsorMinTrust) continue;

    followable.add(sponsorship.newbie);

    try {
      const newbie = await evaluateSponsoredNewbie(
        sponsorship, trustScores, trustParticipants, config, windowStart,
      );
      if (newbie) {
        eligibleNewbies.push(newbie);
      }
    } catch (err) {
      console.log(`Error evaluating sponsored newbie ${sponsorship.newbie}: ${err}`);
    }
  }

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(
    `Pool built in ${elapsed}s: ${eligibleNewbies.length} eligible, ${followable.size} followable`
  );
  return { eligible: eligibleNewbies, followable: [...followable] };
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
 * Evaluate a vouched newbie — one discovered via a !vouch attestation
 * rather than through the trusted-onboarder path. Uses the attested
 * creator's trust score instead of the on-chain creator.
 */
async function evaluateVouchedNewbie(
  vouch: { newbie: string; attestedCreator: string; voucher: string },
  trustScores: Map<string, number>,
  trustParticipants: Set<string>,
  config: Config,
  windowStart: Date,
): Promise<EligibleNewbie | null> {
  const [account] = await getAccounts([vouch.newbie]);
  if (!account) return null;

  const createdAt = getAccountCreatedDate(account);
  if (createdAt < windowStart) return null;

  const hasIntro = await hasQualifyingIntroPost(vouch.newbie, trustParticipants);
  if (!hasIntro) return null;

  const onboarders = await getOnboarderAttribution(vouch.newbie);
  onboarders.vouchedCreator = vouch.attestedCreator;
  onboarders.voucher = vouch.voucher;

  const creatorTrust = trustScores.get(vouch.attestedCreator) || 0;
  const referrerTrust = onboarders.referrer ? (trustScores.get(onboarders.referrer) || 0) : 0;
  const onboarderTrust = creatorTrust + referrerTrust;

  if (onboarderTrust === 0) return null;

  const postCount = await getPostCommentCount(vouch.newbie, createdAt);
  const weight = activityWeight(postCount, config.activityCap);
  const score = onboarderTrust * weight;

  return {
    account: vouch.newbie,
    createdAt,
    onboarders,
    activityWeight: weight,
    onboarderTrust,
    score,
  };
}

/**
 * Evaluate a sponsored newbie — one where a trust participant has claimed
 * responsibility via !sponsor. The sponsor's trust score is used directly
 * and must meet the sponsorMinTrust threshold (checked by caller).
 * The sponsor takes the creator beneficiary slot.
 */
async function evaluateSponsoredNewbie(
  sponsorship: { newbie: string; sponsor: string },
  trustScores: Map<string, number>,
  trustParticipants: Set<string>,
  config: Config,
  windowStart: Date,
): Promise<EligibleNewbie | null> {
  const [account] = await getAccounts([sponsorship.newbie]);
  if (!account) return null;

  const createdAt = getAccountCreatedDate(account);
  if (createdAt < windowStart) return null;

  const hasIntro = await hasQualifyingIntroPost(sponsorship.newbie, trustParticipants);
  if (!hasIntro) return null;

  const onboarders = await getOnboarderAttribution(sponsorship.newbie);
  onboarders.sponsor = sponsorship.sponsor;

  const sponsorTrust = trustScores.get(sponsorship.sponsor) || 0;

  const postCount = await getPostCommentCount(sponsorship.newbie, createdAt);
  const weight = activityWeight(postCount, config.activityCap);
  const score = sponsorTrust * weight;

  return {
    account: sponsorship.newbie,
    createdAt,
    onboarders,
    activityWeight: weight,
    onboarderTrust: sponsorTrust,
    score,
  };
}

/**
 * Find a newbie's best introduction post and return detailed status.
 * Returns null if no introduceyourself post with an image exists.
 *
 * Unlike hasQualifyingIntroPost, this returns the post data and
 * per-criterion breakdown regardless of whether all criteria are met.
 */
export async function findIntroPostWithStatus(
  username: string,
  trustParticipants: Set<string>,
): Promise<IntroPostStatus | null> {
  const posts = await withRetry<any[]>(() =>
    hiveCall<any[]>('condenser_api', 'get_discussions_by_blog', [{
      tag: username,
      limit: 20,
    }])
  );

  if (!posts || posts.length === 0) return null;

  for (const post of posts) {
    if (post.author !== username || post.parent_author !== '') continue;

    let tags: string[] = [];
    let images: string[] = [];
    try {
      const meta = JSON.parse(post.json_metadata);
      tags = meta.tags || [];
      images = meta.image || meta.images || [];
      if (!Array.isArray(images)) images = [];
    } catch {
      continue;
    }

    const hasIntroTag = tags.includes('introduceyourself');
    const hasImage = images.length > 0;

    if (!hasIntroTag || !hasImage) continue;

    // Post must be at least 24 hours old so the community has time to validate
    const postAge = Date.now() - new Date(post.created + 'Z').getTime();
    const isOldEnough = postAge >= 24 * 60 * 60 * 1000;

    // Check for net positive voting weight from trust participants
    const votes = await getActiveVotes(post.author, post.permlink);
    const trustedVotes = votes.filter((v: any) => trustParticipants.has(v.voter));
    const netTrustedRshares = trustedVotes.reduce(
      (sum: number, v: any) => sum + (Number(v.rshares) || 0), 0,
    );
    const trustedVoters = trustedVotes
      .filter((v: any) => v.rshares > 0 || v.percent > 0)
      .map((v: any) => v.voter);

    return {
      author: post.author,
      permlink: post.permlink,
      title: post.title,
      created: post.created,
      images,
      url: `https://peakd.com/@${post.author}/${post.permlink}`,
      hasImage,
      hasIntroTag,
      hasTrustedVote: netTrustedRshares > 0,
      isOldEnough,
      trustedVoters,
    };
  }

  return null;
}

/**
 * Check if a newbie has a qualifying introduction post:
 * - Tagged with "introduceyourself"
 * - Contains at least one image in json_metadata.image
 * - Has net positive rshares from web-of-trust participants (sum of all trust participant votes > 0)
 */
async function hasQualifyingIntroPost(
  username: string,
  trustParticipants: Set<string>,
): Promise<boolean> {
  const status = await findIntroPostWithStatus(username, trustParticipants);
  return status !== null && status.hasTrustedVote && status.isOldEnough;
}

/**
 * Find accounts created by a specific onboarder within the eligibility window.
 */
export async function findNewbiesCreatedBy(
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
        creator, start, batchSize, ACCOUNT_CREATE_BITMASK,
      ])
    );

    if (!history || history.length === 0) break;

    // Process ALL entries in the batch. The op-type filter makes entries
    // sparse in time, so we can't break inside the loop on an "old" entry
    // without risk of skipping newer-in-window entries later in the batch.
    let oldestInBatch: Date | null = null;
    for (const [, entry] of history) {
      const timestamp = new Date(entry.timestamp + 'Z');
      if (!oldestInBatch || timestamp < oldestInBatch) oldestInBatch = timestamp;

      if (timestamp < windowStart || timestamp > windowEnd) continue;

      const [opType, opData] = entry.op;
      if (
        (opType === 'account_create' || opType === 'create_claimed_account') &&
        opData.creator === creator
      ) {
        newbies.push(opData.new_account_name);
      }
    }

    // Stop paginating once we've crossed past the window — nothing older
    // can be in-window.
    if (oldestInBatch && oldestInBatch < windowStart) break;
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

    // Round 1's beneficiaries live on the root post itself, not a -round-1 comment.
    const rootPost = await withRetry(() =>
      hiveCall<any>('condenser_api', 'get_content', [config.botAccount, rootPermlink])
    );
    if (rootPost?.beneficiaries) {
      for (const ben of rootPost.beneficiaries) {
        selected.add(ben.account);
      }
    }

    // Rounds 2+ are comments
    for (let round = 2; round <= config.roundsPerDay; round++) {
      const commentPermlink = `swarm-post-${dateStr}-round-${round}`;
      const commentExists = await postExists(config.botAccount, commentPermlink);
      if (!commentExists) continue;

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
