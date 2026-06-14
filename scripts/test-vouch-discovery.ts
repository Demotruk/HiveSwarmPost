import { initClient } from '../src/hive/client.js';
import { fetchTrustGraph } from '../src/hive/trustApi.js';
import { computeTrustScores } from '../src/trust/graph.js';
import { getVoterRoots } from '../src/trust/voters.js';
import { discoverVouchesAndSponsorships } from '../src/hive/vouches.js';
import { findIntroPostWithStatus } from '../src/newbies/eligibility.js';
import { loadConfig } from '../src/config.js';

const TRUST_API_URL = 'https://swarm-trust-api.fly.dev';

async function main() {
  const config = loadConfig({ requireKeys: false });
  initClient({ hiveNodes: config.hiveNodes });

  // Build trust graph
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

  // Run the actual vouch discovery
  const windowStart = new Date();
  windowStart.setUTCDate(windowStart.getUTCDate() - config.eligibilityWindowDays);

  console.log('=== Running vouch discovery ===\n');
  const { vouches, sponsorships, rejections } = await discoverVouchesAndSponsorships(
    trustParticipants, windowStart,
  );

  console.log(`\n=== Results ===`);
  console.log(`Vouches found: ${vouches.length}`);
  for (const v of vouches) {
    const creatorTrust = trustScores.get(v.attestedCreator) || 0;
    console.log(`  @${v.newbie} — vouched by @${v.voucher}, creator @${v.attestedCreator} (trust: ${creatorTrust.toFixed(0)})`);
  }
  console.log(`Sponsorships: ${sponsorships.length}`);
  console.log(`Rejections: ${rejections.length}`);

  // For first 3 vouched newbies, check intro post status
  console.log('\n=== Intro post status for vouched newbies ===');
  const eventNewbies = vouches.filter(v =>
    ['sweetgemstone', 'gr33nm4ster', 'konchix'].includes(v.attestedCreator)
  ).slice(0, 5);

  for (const v of eventNewbies) {
    const status = await findIntroPostWithStatus(v.newbie, trustParticipants);
    if (status) {
      console.log(`@${v.newbie}:`);
      console.log(`  hasImage: ${status.hasImage}, hasIntroTag: ${status.hasIntroTag}`);
      console.log(`  hasTrustedVote: ${status.hasTrustedVote}, isOldEnough: ${status.isOldEnough}`);
      console.log(`  trustedVoters: ${status.trustedVoters.join(', ')}`);
      const allPass = status.hasImage && status.hasIntroTag && status.hasTrustedVote && status.isOldEnough;
      console.log(`  Would pass hasQualifyingIntroPost: ${allPass}`);
    } else {
      console.log(`@${v.newbie}: findIntroPostWithStatus returned null (no qualifying intro post found)`);
    }
  }
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
