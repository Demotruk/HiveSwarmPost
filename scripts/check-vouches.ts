import { initClient, hiveCall, withRetry } from '../src/hive/client.js';
import { fetchTrustGraph } from '../src/hive/trustApi.js';
import { computeTrustScores } from '../src/trust/graph.js';
import { getVoterRoots } from '../src/trust/voters.js';
import { loadConfig } from '../src/config.js';

const TRUST_API_URL = 'https://swarm-trust-api.fly.dev';

// Check a sample of event accounts for !vouch comments
const EVENT_ACCOUNTS = [
  'amphybian', 'joce-knc', 'noktur87', 'mariangelbch', 'morts',
  'maxsob', 'luisrebolledo2', 'dan142', 'akkarie',
];

async function main() {
  const config = loadConfig({ requireKeys: false });
  initClient({ hiveNodes: config.hiveNodes });

  // Build trust participants
  const { graph } = await fetchTrustGraph(TRUST_API_URL);
  const today = new Date().toISOString().slice(0, 10);
  const voters = await getVoterRoots(config, today);
  const trustScores = computeTrustScores(graph, voters, config.trustAttenuation, config.trustDepthCap);

  const trustParticipants = new Set<string>();
  for (const v of voters) trustParticipants.add(v.account);
  for (const [account] of graph) trustParticipants.add(account);
  for (const [, trusted] of graph) {
    for (const t of trusted) trustParticipants.add(t);
  }

  console.log(`Trust participants (${trustParticipants.size}): ${Array.from(trustParticipants).sort().join(', ')}\n`);

  // For each event account, find their intro post and check comments
  for (const account of EVENT_ACCOUNTS) {
    console.log(`=== @${account} ===`);

    // Get their blog posts to find the intro post
    const posts = await withRetry<any[]>(() =>
      hiveCall<any[]>('condenser_api', 'get_discussions_by_blog', [{
        tag: account,
        limit: 10,
      }])
    );

    const introPost = posts?.find((p: any) => {
      if (p.author !== account || p.parent_author !== '') return false;
      try {
        const meta = JSON.parse(p.json_metadata);
        return (meta.tags || []).includes('introduceyourself');
      } catch { return false; }
    });

    if (!introPost) {
      console.log('  No intro post found\n');
      continue;
    }

    console.log(`  Intro post: ${introPost.permlink}`);

    // Get comments on the intro post
    const replies = await withRetry<any[]>(() =>
      hiveCall<any[]>('condenser_api', 'get_content_replies', [introPost.author, introPost.permlink])
    );

    if (!replies || replies.length === 0) {
      console.log('  No comments on intro post\n');
      continue;
    }

    console.log(`  ${replies.length} comments on intro post:`);
    for (const reply of replies) {
      const isTrustParticipant = trustParticipants.has(reply.author);
      const bodyPreview = reply.body.replace(/\n/g, ' ').slice(0, 120);
      const hasVouch = /!vouch/i.test(reply.body);
      const hasSponsor = /!sponsor/i.test(reply.body);
      const marker = isTrustParticipant ? '[TRUSTED]' : '[not-trusted]';
      const cmd = hasVouch ? ' << !VOUCH' : hasSponsor ? ' << !SPONSOR' : '';
      console.log(`    ${marker} @${reply.author}: "${bodyPreview}"${cmd}`);
    }

    // Check if the attested creator has a trust score
    const vouchMatch = replies.find(r => /!vouch/i.test(r.body));
    if (vouchMatch) {
      const creatorMatch = vouchMatch.body.match(/!vouch\s+@?([a-z][a-z0-9.-]{2,15})/i);
      if (creatorMatch) {
        const attestedCreator = creatorMatch[1].toLowerCase();
        const score = trustScores.get(attestedCreator) || 0;
        console.log(`  Attested creator @${attestedCreator}: trust score = ${score}`);
      }
    }
    console.log();
  }
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
