import { PrivateKey } from '@hiveio/dhive';
import { findIntroPostWithStatus } from '../newbies/eligibility.js';
import { hiveCall, withRetry } from '../hive/client.js';
import { reblog, REBLOG_DELAY_MS } from '../hive/reblog.js';
import type { IntroPostStatus } from '../types.js';

export interface RebloggablePost {
  author: string;
  permlink: string;
}

/**
 * Find rebloggable intro posts for a list of newbie accounts.
 * Returns posts that have an image + introduceyourself tag and haven't been reblogged yet.
 */
export async function findRebloggableIntroPosts(
  newbieAccounts: string[],
  alreadyReblogged: Set<string>,
  trustParticipants: Set<string>,
): Promise<IntroPostStatus[]> {
  const posts: IntroPostStatus[] = [];

  for (const account of newbieAccounts) {
    try {
      const post = await findIntroPostWithStatus(account, trustParticipants);
      if (!post) continue;
      if (!post.hasImage || !post.hasIntroTag) continue;
      if (alreadyReblogged.has(`${post.author}/${post.permlink}`)) continue;
      posts.push(post);
    } catch (err) {
      console.log(`  Error checking intro post for @${account}: ${err}`);
    }
  }

  return posts;
}

/**
 * Find the first root post by each newbie account.
 * Returns the earliest root post (not a comment) for each account,
 * skipping accounts that haven't posted or are already reblogged.
 */
export async function findFirstPosts(
  newbieAccounts: string[],
  alreadyReblogged: Set<string>,
): Promise<RebloggablePost[]> {
  const posts: RebloggablePost[] = [];

  for (const account of newbieAccounts) {
    try {
      const blog = await withRetry<any[]>(() =>
        hiveCall<any[]>('condenser_api', 'get_discussions_by_blog', [{
          tag: account,
          limit: 20,
        }])
      );

      if (!blog || blog.length === 0) continue;

      // Find the earliest root post by this author (not a reblog, not a comment)
      let firstPost: { author: string; permlink: string } | null = null;
      for (const post of blog) {
        if (post.author !== account) continue; // skip reblogs
        if (post.parent_author !== '') continue; // skip comments
        firstPost = { author: post.author, permlink: post.permlink };
      }

      if (!firstPost) continue;
      if (alreadyReblogged.has(`${firstPost.author}/${firstPost.permlink}`)) continue;
      posts.push(firstPost);
    } catch (err) {
      console.log(`  Error checking first post for @${account}: ${err}`);
    }
  }

  return posts;
}

/**
 * Execute reblogs with rate limiting.
 * Returns the list of successfully reblogged keys ("author/permlink").
 */
export async function executeReblogs(
  feedAccount: string,
  posts: RebloggablePost[],
  dryRun: boolean,
  key?: PrivateKey,
): Promise<string[]> {
  const reblogged: string[] = [];

  for (let i = 0; i < posts.length; i++) {
    const post = posts[i];
    const postId = `${post.author}/${post.permlink}`;

    if (dryRun) {
      console.log(`  [DRY RUN] Would reblog: ${postId}`);
      reblogged.push(postId);
      continue;
    }

    try {
      await reblog(feedAccount, post.author, post.permlink, key);
      reblogged.push(postId);
      console.log(`  Reblogged: ${postId}`);
      if (i < posts.length - 1) {
        await delay(REBLOG_DELAY_MS);
      }
    } catch (err) {
      const msg = String(err);
      if (msg.includes('already reblogged') || msg.includes('blog_itr == blog_comment_idx')) {
        console.log(`  Already reblogged (skipping): ${postId}`);
        reblogged.push(postId);
      } else {
        console.error(`  Failed to reblog ${postId}: ${err}`);
      }
    }
  }

  return reblogged;
}

/**
 * Remove entries older than `windowDays` from a reblogged map.
 */
export function expireOldReblogs(
  reblogged: Record<string, string>,
  windowDays: number,
): Record<string, string> {
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - windowDays);
  const cutoffMs = cutoff.getTime();

  const result: Record<string, string> = {};
  for (const [key, timestamp] of Object.entries(reblogged)) {
    if (new Date(timestamp).getTime() >= cutoffMs) {
      result[key] = timestamp;
    }
  }
  return result;
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
