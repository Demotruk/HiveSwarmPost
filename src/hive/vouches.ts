import { hiveCall, withRetry } from './client.js';

// Matches "!vouch @creator" or "!vouch creator" anywhere in the comment body.
// Hive account names: 3–16 chars, lowercase letters/digits/dots/hyphens.
const VOUCH_PATTERN = /!vouch\s+@?([a-z][a-z0-9.-]{2,15})/i;

export interface VouchAttestation {
  newbie: string;
  attestedCreator: string;
  voucher: string;
  introPermlink: string;
}

/**
 * Discover !vouch attestations by scanning comments on recent
 * introduceyourself posts. A vouch is valid when a trust participant
 * comments "!vouch @creator" on a newbie's intro post, attesting that
 * @creator is the real onboarder.
 *
 * Returns one attestation per newbie (first valid vouch wins).
 */
export async function discoverVouches(
  trustParticipants: Set<string>,
  windowStart: Date,
): Promise<VouchAttestation[]> {
  const attestations: VouchAttestation[] = [];
  const seen = new Set<string>();
  let startAuthor = '';
  let startPermlink = '';
  const batchSize = 100;
  let totalScanned = 0;

  console.log('Scanning introduceyourself posts for !vouch attestations...');

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

    // When paginating, the first result is the last result of the previous page
    const startIdx = startAuthor ? 1 : 0;

    for (let i = startIdx; i < posts.length; i++) {
      const post = posts[i];
      const postDate = new Date(post.created + 'Z');

      if (postDate < windowStart) {
        console.log(`  Scanned ${totalScanned} intro posts, found ${attestations.length} vouches`);
        return attestations;
      }

      totalScanned++;
      if (post.parent_author !== '') continue;
      if (seen.has(post.author)) continue;

      const replies = await withRetry<any[]>(() =>
        hiveCall<any[]>('condenser_api', 'get_content_replies', [post.author, post.permlink])
      );
      if (!replies) continue;

      for (const reply of replies) {
        if (!trustParticipants.has(reply.author)) continue;

        const match = reply.body.match(VOUCH_PATTERN);
        if (match) {
          const attestedCreator = match[1].toLowerCase();
          seen.add(post.author);
          attestations.push({
            newbie: post.author,
            attestedCreator,
            voucher: reply.author,
            introPermlink: post.permlink,
          });
          console.log(
            `  Vouch found: @${reply.author} attests @${attestedCreator} onboarded @${post.author}`
          );
          break;
        }
      }
    }

    const lastPost = posts[posts.length - 1];
    if (posts.length < batchSize) break;
    startAuthor = lastPost.author;
    startPermlink = lastPost.permlink;
  }

  console.log(`  Scanned ${totalScanned} intro posts, found ${attestations.length} vouches`);
  return attestations;
}

/**
 * Parse a !vouch command from a comment body. Exported for testing.
 */
export function parseVouch(body: string): string | null {
  const match = body.match(VOUCH_PATTERN);
  return match ? match[1].toLowerCase() : null;
}
