import { hiveCall, withRetry } from './client.js';

// Hive account names: 3–16 chars, lowercase letters/digits/dots/hyphens.
const VOUCH_PATTERN = /!vouch\s+@?([a-z][a-z0-9.-]{2,15})/i;
const SPONSOR_PATTERN = /!sponsor\b/i;
const REJECT_PATTERN = /!reject\b/i;

export interface VouchAttestation {
  newbie: string;
  attestedCreator: string;
  voucher: string;
  introPermlink: string;
}

export interface SponsorAttestation {
  newbie: string;
  sponsor: string;
  introPermlink: string;
}

export interface RejectionAttestation {
  newbie: string;
  rejector: string;
  introPermlink: string;
}

export interface DiscoveryResult {
  vouches: VouchAttestation[];
  sponsorships: SponsorAttestation[];
  rejections: RejectionAttestation[];
}

/**
 * Discover !vouch and !sponsor attestations by scanning comments on recent
 * introduceyourself posts.
 *
 * Rules:
 * - !vouch takes precedence over !sponsor for the same newbie
 * - A trust participant cannot both vouch and sponsor the same newbie
 *   (first valid action from that person wins; vouch from anyone else
 *   still overrides a sponsor)
 * - One attestation per newbie: first valid vouch wins; if no vouch,
 *   first valid sponsor wins
 */
export async function discoverVouchesAndSponsorships(
  trustParticipants: Set<string>,
  windowStart: Date,
  authorizedRejectors?: Set<string>,
): Promise<DiscoveryResult> {
  const vouches: VouchAttestation[] = [];
  const sponsorships: SponsorAttestation[] = [];
  const rejections: RejectionAttestation[] = [];
  const vouchedNewbies = new Set<string>();
  const sponsoredNewbies = new Set<string>();
  const rejectedNewbies = new Set<string>();
  let startAuthor = '';
  let startPermlink = '';
  const batchSize = 20;
  let totalScanned = 0;

  console.log('Scanning introduceyourself posts for !vouch, !sponsor, and !reject attestations...');

  while (true) {
    const query: Record<string, unknown> = {
      tag: 'introduceyourself',
      limit: batchSize,
    };
    if (startAuthor) {
      query.start_author = startAuthor;
      query.start_permlink = startPermlink;
    }

    const posts = await withRetry<any[]>(() =>
      hiveCall<any[]>('condenser_api', 'get_discussions_by_created', [query])
    );

    if (!posts || posts.length === 0) break;

    const startIdx = startAuthor ? 1 : 0;

    for (let i = startIdx; i < posts.length; i++) {
      const post = posts[i];
      const postDate = new Date(post.created + 'Z');

      if (postDate < windowStart) {
        logSummary(totalScanned, vouches.length, sponsorships.length, rejections.length);
        return { vouches, sponsorships, rejections };
      }

      totalScanned++;
      if (post.parent_author !== '') continue;
      if (vouchedNewbies.has(post.author)) continue;

      const replies = await withRetry<any[]>(() =>
        hiveCall<any[]>('condenser_api', 'get_content_replies', [post.author, post.permlink])
      );
      if (!replies) continue;

      // Check for !reject from authorized rejectors first — a single
      // rejection disqualifies the newbie regardless of vouches/sponsors.
      if (authorizedRejectors && !rejectedNewbies.has(post.author)) {
        for (const reply of replies) {
          if (!authorizedRejectors.has(reply.author)) continue;
          if (REJECT_PATTERN.test(reply.body)) {
            rejectedNewbies.add(post.author);
            rejections.push({
              newbie: post.author,
              rejector: reply.author,
              introPermlink: post.permlink,
            });
            console.log(
              `  Reject: @${reply.author} rejected @${post.author}`
            );
            break;
          }
        }
      }

      if (rejectedNewbies.has(post.author)) continue;

      // Collect all vouches and sponsors from trust participants on this post.
      // A single person can only contribute one action (vouch OR sponsor).
      const postVouches: VouchAttestation[] = [];
      const postSponsors: SponsorAttestation[] = [];
      const acted = new Set<string>();

      for (const reply of replies) {
        if (!trustParticipants.has(reply.author)) continue;
        if (acted.has(reply.author)) continue;

        const vouchMatch = reply.body.match(VOUCH_PATTERN);
        if (vouchMatch) {
          acted.add(reply.author);
          postVouches.push({
            newbie: post.author,
            attestedCreator: vouchMatch[1].toLowerCase(),
            voucher: reply.author,
            introPermlink: post.permlink,
          });
          continue;
        }

        if (SPONSOR_PATTERN.test(reply.body)) {
          acted.add(reply.author);
          postSponsors.push({
            newbie: post.author,
            sponsor: reply.author,
            introPermlink: post.permlink,
          });
        }
      }

      // Vouch takes precedence over sponsor
      if (postVouches.length > 0) {
        const vouch = postVouches[0];
        vouchedNewbies.add(post.author);
        // If this newbie had a pending sponsor, remove it
        if (sponsoredNewbies.has(post.author)) {
          const idx = sponsorships.findIndex(s => s.newbie === post.author);
          if (idx !== -1) sponsorships.splice(idx, 1);
          sponsoredNewbies.delete(post.author);
        }
        vouches.push(vouch);
        console.log(
          `  Vouch: @${vouch.voucher} attests @${vouch.attestedCreator} onboarded @${post.author}`
        );
      } else if (postSponsors.length > 0 && !sponsoredNewbies.has(post.author)) {
        const sponsor = postSponsors[0];
        sponsoredNewbies.add(post.author);
        sponsorships.push(sponsor);
        console.log(
          `  Sponsor: @${sponsor.sponsor} sponsors @${post.author}`
        );
      }
    }

    const lastPost = posts[posts.length - 1];
    if (posts.length < batchSize) break;
    startAuthor = lastPost.author;
    startPermlink = lastPost.permlink;
  }

  logSummary(totalScanned, vouches.length, sponsorships.length, rejections.length);
  return { vouches, sponsorships, rejections };
}

function logSummary(scanned: number, vouches: number, sponsors: number, rejections: number): void {
  console.log(
    `  Scanned ${scanned} intro posts, found ${vouches} vouches, ${sponsors} sponsorships, ${rejections} rejections`
  );
}

/**
 * Backward-compatible wrapper — returns only vouches.
 */
export async function discoverVouches(
  trustParticipants: Set<string>,
  windowStart: Date,
): Promise<VouchAttestation[]> {
  const result = await discoverVouchesAndSponsorships(trustParticipants, windowStart);
  return result.vouches;
}

/** Parse a !vouch command from a comment body. Exported for testing. */
export function parseVouch(body: string): string | null {
  const match = body.match(VOUCH_PATTERN);
  return match ? match[1].toLowerCase() : null;
}

/** Parse a !sponsor command from a comment body. Exported for testing. */
export function parseSponsor(body: string): boolean {
  return SPONSOR_PATTERN.test(body);
}

/** Parse a !reject command from a comment body. Exported for testing. */
export function parseReject(body: string): boolean {
  return REJECT_PATTERN.test(body);
}
