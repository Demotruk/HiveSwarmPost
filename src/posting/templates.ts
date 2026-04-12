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
  round1: LotteryRound | null = null,
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
  body += `- 10 lottery rounds at fixed times: 00:00, 02:24, 04:48, 07:12, 09:36, 12:00, 14:24, 16:48, 19:12, 21:36 UTC\n`;
  body += `- **Round 1 is this post.** Rounds 2\u201310 are posted as comments below.\n`;
  body += `- Each round selects 2 newbies as beneficiaries alongside their onboarders\n`;
  body += `- Selection is weighted by onboarder trust and newbie activity\n`;
  body += `- Randomness sourced from the Bitcoin block at each round's **scheduled** time (not posting time)\n`;
  body += `- This means the operator cannot influence outcomes by delaying a post\n`;
  body += `- [Full documentation](https://github.com/user/hive-swarm-post)\n\n`;

  body += `## Support\n\n`;
  body += `Upvote this post and its comments to fund new Hive users. `;
  body += `Your vote weight counts toward the trust graph.\n\n`;

  if (round1) {
    body += `## Round 1 — Selected Newbies\n\n`;

    for (const selected of round1.selected) {
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
    for (const ben of round1.beneficiaries) {
      const pct = (ben.weight / 100).toFixed(1);
      body += `| @${ben.account} | ${pct}% |\n`;
    }
    body += `\n`;

    const scheduledTime = new Date(round1.scheduledTimestamp * 1000).toISOString();

    body += `### Verification\n\n`;
    body += `- Scheduled time: \`${scheduledTime}\`\n`;
    body += `- Bitcoin block: height \`${round1.btcBlockHeight}\`, hash \`${round1.btcBlockHash}\`\n`;
    body += `- Block selection rule: latest BTC block at or before the scheduled time\n`;
    body += `- Seed: \`SHA256("${round1.btcBlockHash}hive-swarm-post${round1.date}${round1.roundNumber}")\`\n`;
    body += `- Result: \`${round1.seed}\`\n\n`;
    body += `The block used for randomness is determined by the round's scheduled time, not the actual posting time. `;
    body += `This prevents the operator from influencing the outcome by delaying the post. `;
    body += `Anyone can independently verify this selection by looking up the BTC block at the scheduled timestamp.\n\n`;
  }

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

  const scheduledTime = new Date(round.scheduledTimestamp * 1000).toISOString();

  body += `### Verification\n\n`;
  body += `- Scheduled time: \`${scheduledTime}\`\n`;
  body += `- Bitcoin block: height \`${round.btcBlockHeight}\`, hash \`${round.btcBlockHash}\`\n`;
  body += `- Block selection rule: latest BTC block at or before the scheduled time\n`;
  body += `- Seed: \`SHA256("${round.btcBlockHash}hive-swarm-post${round.date}${round.roundNumber}")\`\n`;
  body += `- Result: \`${round.seed}\`\n\n`;
  body += `The block used for randomness is determined by the round's scheduled time, not the actual posting time. `;
  body += `This prevents the operator from influencing the outcome by delaying the post. `;
  body += `Anyone can independently verify this selection by looking up the BTC block at the scheduled timestamp.\n`;

  return body;
}
