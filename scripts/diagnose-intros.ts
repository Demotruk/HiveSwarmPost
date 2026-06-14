/**
 * Diagnostic script: fetches recent introduceyourself posts and checks
 * each eligibility gate to explain why newbies aren't showing up.
 *
 * Usage: npx tsx scripts/diagnose-intros.ts
 */

import { initClient, hiveCall, withRetry } from '../src/hive/client.js';
import { getActiveVotes } from '../src/hive/posts.js';
import { getAccounts, getAccountCreatedDate } from '../src/hive/accounts.js';
import { fetchTrustGraph } from '../src/hive/trustApi.js';
import { computeTrustScores } from '../src/trust/graph.js';
import { getVoterRoots } from '../src/trust/voters.js';
import { loadConfig } from '../src/config.js';

const TRUST_API_URL = 'https://swarm-trust-api.fly.dev';

async function main() {
  const config = loadConfig({ requireKeys: false });
  initClient({ hiveNodes: config.hiveNodes });

  // 1. Build trust graph & participants
  console.log('=== Fetching trust graph ===');
  const { graph, edgeCount } = await fetchTrustGraph(TRUST_API_URL);
  console.log(`Trust graph: ${edgeCount} edges, ${graph.size} declarers`);

  const today = new Date().toISOString().slice(0, 10);
  const voters = await getVoterRoots(config, today);
  console.log(`Voter roots: ${voters.length}`);

  const trustScores = computeTrustScores(graph, voters, config.trustAttenuation, config.trustDepthCap);
  console.log(`Trust scores computed for ${trustScores.size} accounts`);

  const trustParticipants = new Set<string>();
  for (const v of voters) trustParticipants.add(v.account);
  for (const [account] of graph) trustParticipants.add(account);
  for (const [, trusted] of graph) {
    for (const t of trusted) trustParticipants.add(t);
  }
  console.log(`Trust participants: ${trustParticipants.size}`);

  // 2. Fetch recent introduceyourself posts via direct API call
  console.log('\n=== Fetching recent introduceyourself posts ===');
  const HIVE_API = 'https://api.hive.blog';
  let posts: any[] = [];
  let startAuthor = '';
  let startPermlink = '';
  // Paginate to get ~60 posts (3 pages of 20)
  for (let page = 0; page < 3; page++) {
    const params: any = { sort: 'created', tag: 'introduceyourself', limit: 20 };
    if (startAuthor) {
      params.start_author = startAuthor;
      params.start_permlink = startPermlink;
    }
    const res = await fetch(HIVE_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'bridge.get_ranked_posts',
        params,
        id: 1,
      }),
    });
    const json = await res.json() as any;
    if (!json.result || json.result.length === 0) break;
    const batch = json.result as any[];
    // First result of pages 2+ is the last post from previous page
    const newPosts = page === 0 ? batch : batch.slice(1);
    posts.push(...newPosts);
    const last = batch[batch.length - 1];
    startAuthor = last.author;
    startPermlink = last.permlink;
    if (batch.length < 20) break;
  }

  console.log(`Found ${posts.length} recent introduceyourself posts\n`);

  // 3. Check each post against eligibility criteria
  const windowStart = new Date();
  windowStart.setUTCDate(windowStart.getUTCDate() - config.eligibilityWindowDays);

  let passCount = 0;
  let failCount = 0;

  // Debug first post structure
  if (posts.length > 0) {
    const sample = posts[0];
    console.log(`Sample post keys: ${Object.keys(sample).join(', ')}`);
    console.log(`  author=${sample.author}, parent_author="${sample.parent_author}", depth=${sample.depth}`);
    console.log(`  json_metadata type: ${typeof sample.json_metadata}`);
    const rawMeta = typeof sample.json_metadata === 'string'
      ? sample.json_metadata.slice(0, 300)
      : JSON.stringify(sample.json_metadata).slice(0, 300);
    console.log(`  json_metadata: ${rawMeta}`);
  }

  for (const post of posts) {
    // Skip reblogs / comments (bridge API uses depth=0 for root posts)
    if ((post.parent_author || '') !== '' && post.depth !== 0) continue;

    const author = post.author;
    const permlink = post.permlink;

    let tags: string[] = [];
    let images: string[] = [];
    try {
      const meta = typeof post.json_metadata === 'string'
        ? JSON.parse(post.json_metadata)
        : post.json_metadata;
      tags = meta.tags || [];
      images = meta.image || meta.images || [];
      if (!Array.isArray(images)) images = [];
    } catch {
      // skip
    }

    const hasIntroTag = tags.includes('introduceyourself');
    const hasImage = images.length > 0;

    const postAge = Date.now() - new Date(post.created + 'Z').getTime();
    const postAgeHours = (postAge / (1000 * 60 * 60)).toFixed(1);
    const isOldEnough = postAge >= 24 * 60 * 60 * 1000;

    // Get account creation info
    const [account] = await getAccounts([author]);
    const createdAt = account ? getAccountCreatedDate(account) : null;
    const inWindow = createdAt ? createdAt >= windowStart : false;

    // Check creator trust
    let creator = '?';
    let creatorTrust = 0;
    if (account) {
      try {
        const history = await withRetry<any[][]>(() =>
          hiveCall<any[][]>('condenser_api', 'get_account_history', [
            author, -1, 100,
          ])
        );
        for (const [, entry] of history) {
          const [opType, opData] = entry.op;
          if (
            (opType === 'account_create' || opType === 'create_claimed_account') &&
            opData.new_account_name === author
          ) {
            creator = opData.creator;
            break;
          }
        }
      } catch { /* skip */ }
      creatorTrust = trustScores.get(creator) || 0;
    }

    // Check trusted votes on intro post
    let netTrustedRshares = 0;
    let trustedVoters: string[] = [];
    let totalVotes = 0;
    try {
      const votes = await getActiveVotes(author, permlink);
      totalVotes = votes.length;
      const trustedVoteList = votes.filter((v: any) => trustParticipants.has(v.voter));
      netTrustedRshares = trustedVoteList.reduce(
        (sum: number, v: any) => sum + (Number(v.rshares) || 0), 0,
      );
      trustedVoters = trustedVoteList
        .filter((v: any) => v.rshares > 0 || v.percent > 0)
        .map((v: any) => v.voter);
    } catch { /* skip */ }
    const hasTrustedVote = netTrustedRshares > 0;

    // Determine pass/fail
    const allPass = hasIntroTag && hasImage && isOldEnough && hasTrustedVote && inWindow && creatorTrust > 0;

    // Build failure reasons
    const failures: string[] = [];
    if (!hasIntroTag) failures.push('NO_INTRO_TAG');
    if (!hasImage) failures.push('NO_IMAGE');
    if (!isOldEnough) failures.push(`TOO_NEW (${postAgeHours}h)`);
    if (!hasTrustedVote) failures.push(`NO_TRUSTED_VOTE (${totalVotes} total votes, ${trustedVoters.length} trusted)`);
    if (!inWindow) failures.push('OUTSIDE_WINDOW');
    if (creatorTrust === 0) failures.push(`CREATOR_NO_TRUST (creator=@${creator}, score=0)`);

    if (allPass) {
      passCount++;
    } else {
      failCount++;
    }

    const status = allPass ? 'PASS' : 'FAIL';
    console.log(`@${author} — ${status}`);
    console.log(`  Post: ${post.title.slice(0, 60)}`);
    console.log(`  Age: ${postAgeHours}h | Images: ${images.length} | Tags: ${tags.join(', ')}`);
    console.log(`  Creator: @${creator} (trust: ${creatorTrust.toFixed(0)}) | Account created: ${createdAt?.toISOString().slice(0, 10) || '?'}`);
    console.log(`  Votes: ${totalVotes} total, trusted: [${trustedVoters.join(', ')}] (net rshares: ${netTrustedRshares})`);
    if (failures.length > 0) {
      console.log(`  BLOCKED BY: ${failures.join(' | ')}`);
    }
    console.log();
  }

  console.log(`=== Summary: ${passCount} eligible, ${failCount} blocked ===`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
