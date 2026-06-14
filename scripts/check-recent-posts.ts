import { initClient } from '../src/hive/client.js';
import { postExists, getPost } from '../src/hive/posts.js';
import { loadConfig } from '../src/config.js';

async function main() {
  const config = loadConfig({ requireKeys: false });
  initClient({ hiveNodes: config.hiveNodes });

  // Check last 5 days of swarm posts
  const now = new Date();
  for (let dayOffset = 0; dayOffset < 5; dayOffset++) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - dayOffset);
    const dateStr = d.toISOString().slice(0, 10);

    // Check both test and prod permlinks
    for (const prefix of ['swarm-post', 'swarm-test']) {
      const permlink = `${prefix}-${dateStr}`;
      const exists = await postExists(config.botAccount, permlink);
      if (exists) {
        const post = await getPost(config.botAccount, permlink);
        const roundCount = post.children || 0;
        console.log(`${dateStr}: ${permlink} EXISTS (${roundCount} replies)`);

        // Check what rounds exist
        for (let round = 2; round <= config.roundsPerDay; round++) {
          const roundPermlink = `${prefix}-${dateStr}-round-${round}`;
          const roundExists = await postExists(config.botAccount, roundPermlink);
          if (roundExists) {
            const roundPost = await getPost(config.botAccount, roundPermlink);
            // Check beneficiaries
            const bens = roundPost.beneficiaries || [];
            const benStr = bens.map((b: any) => `@${b.account}(${b.weight/100}%)`).join(', ');
            console.log(`  Round ${round}: ${benStr}`);
          }
        }
      } else {
        console.log(`${dateStr}: ${permlink} — not found`);
      }
    }
  }
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
