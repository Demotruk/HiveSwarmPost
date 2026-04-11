import type { LotteryRound, EligibleNewbie } from '../types.js';

/**
 * Generate the markdown body for the daily root post.
 */
export function rootPostBody(
  date: string,
  poolSize: number,
  onboarderCount: number,
  activeVoters: number,
  trustDeclarations: number,
  previousResults: LotteryRound[] | null,
): string {
  let body = `# Hive Swarm Post — ${date}\n\n`;
  body += `The Swarm Post distributes author rewards to newly onboarded Hive users, `;
  body += `selected via a trust-weighted lottery with verifiable randomness.\n\n`;

  body += `## Today's Pool\n\n`;
  body += `| Metric | Value |\n`;
  body += `|---|---|\n`;
  body += `| Eligible newbies | ${poolSize} |\n`;
  body += `| Active onboarders | ${onboarderCount} |\n`;
  body += `| Trust root voters | ${activeVoters} |\n`;
  body += `| Trust declarations | ${trustDeclarations} |\n\n`;

  body += `## How It Works\n\n`;
  body += `- 10 lottery rounds throughout the day, each selecting 2 newbies\n`;
  body += `- Newbies and their onboarders receive rewards as beneficiaries\n`;
  body += `- Selection is weighted by onboarder trust and newbie activity\n`;
  body += `- Randomness sourced from Bitcoin block hashes (verifiable)\n`;
  body += `- [Full documentation](https://github.com/user/hive-swarm-post)\n\n`;

  body += `## Support\n\n`;
  body += `Upvote this post and its comments to fund new Hive users. `;
  body += `Your vote weight counts toward the trust graph.\n\n`;

  if (previousResults && previousResults.length > 0) {
    body += `## Yesterday's Results\n\n`;
    for (const round of previousResults) {
      body += `**Round ${round.roundNumber}**: `;
      const names = round.selected.map(s => `@${s.newbie.account}`).join(', ');
      body += `${names}\n`;
    }
    body += `\n`;
  }

  body += `---\n`;
  body += `*Posted by [@swarmpost](/@swarmpost) — `;
  body += `[source code](https://github.com/user/hive-swarm-post)*\n`;

  return body;
}

/**
 * Generate the markdown body for a lottery round comment.
 */
export function roundCommentBody(round: LotteryRound): string {
  let body = `## 🎲 Swarm Post Round ${round.roundNumber} — ${round.date}\n\n`;

  body += `### Selected Newbies\n\n`;

  for (const selected of round.selected) {
    const n = selected.newbie;
    body += `**@${n.account}**\n`;
    body += `- Creator: @${selected.creator}\n`;
    if (selected.referrer && selected.referrer !== selected.creator) {
      body += `- Referrer: @${selected.referrer}\n`;
    }
    body += `- Onboarder trust: ${n.onboarderTrust.toFixed(2)}\n`;
    body += `- Activity weight: ${n.activityWeight.toFixed(4)}\n`;
    body += `- Score: ${n.score.toFixed(4)}\n\n`;
  }

  body += `### Beneficiaries\n\n`;
  body += `| Account | Share |\n`;
  body += `|---|---|\n`;
  for (const ben of round.beneficiaries) {
    const pct = (ben.weight / 100).toFixed(1);
    body += `| @${ben.account} | ${pct}% |\n`;
  }
  body += `\n`;

  body += `### Verification\n\n`;
  body += `- Bitcoin block hash: \`${round.btcBlockHash}\`\n`;
  body += `- Seed: \`SHA256("${round.btcBlockHash}hive-swarm-post${round.date}${round.roundNumber}")\`\n`;
  body += `- Result: \`${round.seed}\`\n\n`;
  body += `Anyone can independently verify this selection by running the algorithm with the above inputs.\n`;

  return body;
}
