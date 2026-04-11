import { getClient, getPrivateKey, withRetry } from './client.js';
import type { BeneficiaryEntry } from '../types.js';

/**
 * Check if a post/comment exists on chain by its author and permlink.
 */
export async function postExists(author: string, permlink: string): Promise<boolean> {
  const content = await withRetry(() =>
    getClient().database.call('get_content', [author, permlink])
  );
  // get_content returns an object with empty author if post doesn't exist
  return content && content.author !== '';
}

/**
 * Get the content of a post/comment.
 */
export async function getPost(author: string, permlink: string): Promise<any> {
  return withRetry(() =>
    getClient().database.call('get_content', [author, permlink])
  );
}

/**
 * Get replies to a post/comment.
 */
export async function getReplies(author: string, permlink: string): Promise<any[]> {
  return withRetry(() =>
    getClient().database.call('get_content_replies', [author, permlink])
  );
}

/**
 * Get active votes on a post/comment.
 */
export async function getActiveVotes(author: string, permlink: string): Promise<any[]> {
  return withRetry(() =>
    getClient().database.call('get_active_votes', [author, permlink])
  );
}

/**
 * Broadcast a root post.
 */
export async function broadcastPost(
  author: string,
  permlink: string,
  title: string,
  body: string,
  tags: string[],
  appMetadata: string,
): Promise<void> {
  const jsonMetadata = JSON.stringify({
    tags,
    app: appMetadata,
  });

  await withRetry(() =>
    getClient().broadcast.comment(
      {
        parent_author: '',
        parent_permlink: tags[0],
        author,
        permlink,
        title,
        body,
        json_metadata: jsonMetadata,
      },
      getPrivateKey(),
    )
  );
}

/**
 * Broadcast a comment with beneficiaries (atomic: comment + comment_options).
 */
export async function broadcastCommentWithBeneficiaries(
  author: string,
  parentAuthor: string,
  parentPermlink: string,
  permlink: string,
  body: string,
  tags: string[],
  appMetadata: string,
  beneficiaries: BeneficiaryEntry[],
): Promise<void> {
  const jsonMetadata = JSON.stringify({
    tags,
    app: appMetadata,
  });

  // Beneficiaries must be sorted alphabetically by account (Hive requirement)
  const sortedBeneficiaries = [...beneficiaries].sort((a, b) =>
    a.account.localeCompare(b.account)
  );

  const operations: any[] = [
    [
      'comment',
      {
        parent_author: parentAuthor,
        parent_permlink: parentPermlink,
        author,
        permlink,
        title: '',
        body,
        json_metadata: jsonMetadata,
      },
    ],
    [
      'comment_options',
      {
        author,
        permlink,
        max_accepted_payout: '1000000.000 HBD',
        percent_hbd: 10000,
        allow_votes: true,
        allow_curation_rewards: true,
        extensions: [
          [0, { beneficiaries: sortedBeneficiaries }],
        ],
      },
    ],
  ];

  await withRetry(() =>
    getClient().broadcast.sendOperations(operations, getPrivateKey())
  );
}
