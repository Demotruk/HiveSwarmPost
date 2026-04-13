/**
 * Feed server: lightweight HTTP endpoint showing newbie introduction posts
 * with eligibility status.
 *
 * Usage: npm run feed
 */

import http from 'node:http';
import { loadConfig } from './config.js';
import { initClient } from './hive/client.js';
import { buildTrustGraph } from './hive/trust.js';
import { getVoterRoots } from './trust/voters.js';
import { computeTrustScores } from './trust/graph.js';
import { buildFeedPool } from './feed/pool.js';
import { feedPageHtml } from './feed/page.js';
import { todayUTC } from './scheduler.js';
import type { FeedNewbie } from './types.js';

const PORT = parseInt(process.env.FEED_PORT || '3000', 10);

// Cache feed data to avoid rebuilding on every request
let cachedFeed: FeedNewbie[] | null = null;
let cacheTime = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

async function buildFeed(): Promise<FeedNewbie[]> {
  const now = Date.now();
  if (cachedFeed && now - cacheTime < CACHE_TTL_MS) {
    return cachedFeed;
  }

  console.log('Building feed...');
  const config = loadConfig({ requireKeys: false });
  initClient(config);

  const date = todayUTC();

  // Build trust graph (same as main bot flow)
  const voters = await getVoterRoots(config, date);
  if (voters.length === 0) {
    console.log('No trust roots found.');
    cachedFeed = [];
    cacheTime = now;
    return [];
  }

  const allTrustAccounts = new Set<string>();
  for (const v of voters) allTrustAccounts.add(v.account);

  const graph = await buildTrustGraph(Array.from(allTrustAccounts));

  const trustedByVoters = new Set<string>();
  for (const [, trusted] of graph) {
    for (const t of trusted) trustedByVoters.add(t);
  }
  const expandedGraph = await buildTrustGraph(Array.from(trustedByVoters));
  for (const [account, trusted] of expandedGraph) {
    if (!graph.has(account)) graph.set(account, trusted);
  }

  const trustScores = computeTrustScores(graph, voters, config.trustAttenuation, config.trustDepthCap);
  console.log(`Trust scores computed for ${trustScores.size} onboarders`);

  const trustParticipants = new Set<string>();
  for (const v of voters) trustParticipants.add(v.account);
  for (const [account] of graph) trustParticipants.add(account);
  for (const [, trusted] of graph) {
    for (const t of trusted) trustParticipants.add(t);
  }
  console.log(`Trust participants: ${trustParticipants.size}`);

  // Build feed pool (includes newbies without trusted votes)
  const onboarderAccounts = Array.from(trustScores.keys());
  console.log(`Scanning ${onboarderAccounts.length} onboarders for newbies: ${onboarderAccounts.join(', ')}`);
  const feed = await buildFeedPool(onboarderAccounts, trustScores, trustParticipants, config, date);

  console.log(`Feed built: ${feed.length} newbie intro posts (${feed.filter(n => n.introPost.hasTrustedVote).length} eligible)`);

  cachedFeed = feed;
  cacheTime = now;
  return feed;
}

const pageHtml = feedPageHtml();

const server = http.createServer(async (req, res) => {
  try {
    if (req.url === '/api/feed' && req.method === 'GET') {
      const feed = await buildFeed();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(feed));
    } else if (req.url === '/' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(pageHtml);
    } else {
      res.writeHead(404);
      res.end('Not found');
    }
  } catch (err) {
    console.error('Request error:', err);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: String(err) }));
  }
});

server.listen(PORT, () => {
  console.log(`Feed server running at http://localhost:${PORT}/`);
});
