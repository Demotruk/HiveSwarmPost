import type { LotteryRound, EligibleNewbie } from '../types.js';

/**
 * Break a Hive @mention so it displays the account name
 * but does not trigger a notification or create a profile link.
 * Inserts a zero-width space after the @ symbol.
 */
function breakMention(account: string): string {
  return `@\u200B${account}`;
}

/** Format an account mention — real link in prod, broken in test */
function mention(account: string, testMode: boolean): string {
  return testMode ? breakMention(account) : `@${account}`;
}

/** Bold account mention */
function boldMention(account: string, testMode: boolean): string {
  return `**${mention(account, testMode)}**`;
}

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
  testMode: boolean = false,
): string {
  let body = '';

  if (testMode) {
    body += `# ⚠️ TEST — DO NOT UPVOTE ⚠️ — ${date}\n\n`;
    body += `> **This is a test post from a development account. Do not upvote.**\n\n`;
  } else {
    body += `# Hive Swarm Post — ${date}\n\n`;
    body += `The Swarm Post distributes author rewards to newly onboarded Hive users, `;
    body += `selected via a trust-weighted lottery with verifiable randomness.\n\n`;
  }

  body += `## Today's Pool\n\n`;
  body += `| Metric | Value |\n`;
  body += `|---|---|\n`;
  body += `| Eligible newbies | ${poolSize} |\n`;
  body += `| Active onboarders | ${onboarderCount} |\n`;
  body += `| Trust root voters | ${activeVoters} |\n`;
  body += `| Trust declarations | ${trustDeclarations} |\n\n`;

  if (!testMode) {
    body += `## How It Works\n\n`;
    body += `- 10 lottery rounds at fixed times: 00:00, 02:24, 04:48, 07:12, 09:36, 12:00, 14:24, 16:48, 19:12, 21:36 UTC\n`;
    body += `- **Round 1 is this post.** Rounds 2–10 are posted as comments below.\n`;
    body += `- Each round selects 1 newbie as beneficiary alongside their onboarder(s)\n`;
    body += `- Selection is weighted by onboarder trust and newbie activity\n`;
    body += `- Randomness sourced from the Bitcoin block at each round's **scheduled** time (not posting time)\n`;
    body += `- This means the operator cannot influence outcomes by delaying a post\n`;
    body += `- [Full documentation](https://github.com/Demotruk/HiveSwarmPost)\n\n`;

    body += `## Support\n\n`;
    body += `Upvote this post and its comments to fund new Hive users. `;
    body += `Your vote weight counts toward the trust graph.\n\n`;
  }

  if (round1) {
    body += `## Round 1 — Selected Newbies\n\n`;

    for (const selected of round1.selected) {
      const n = selected.newbie;
      body += `${boldMention(n.account, testMode)}\n`;
      body += `- Creator: ${mention(selected.creator, testMode)}\n`;
      if (selected.referrer && selected.referrer !== selected.creator) {
        body += `- Referrer: ${mention(selected.referrer, testMode)}\n`;
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
      body += `| ${mention(ben.account, testMode)} | ${pct}% |\n`;
    }
    body += `\n`;

    const scheduledTime = new Date(round1.scheduledTimestamp * 1000).toISOString();

    body += `### Verification\n\n`;
    body += `- Scheduled time: \`${scheduledTime}\`\n`;
    body += `- Bitcoin block: height \`${round1.btcBlockHeight}\`, hash \`${round1.btcBlockHash}\`\n`;
    body += `- Block selection rule: latest BTC block at or before the scheduled time\n`;
    body += `- Seed: \`SHA256("${round1.btcBlockHash}hive-swarm-post${round1.date}${round1.roundNumber}")\`\n`;
    body += `- Result: \`${round1.seed}\`\n\n`;
    if (!testMode) {
      body += `The block used for randomness is determined by the round's scheduled time, not the actual posting time. `;
      body += `This prevents the operator from influencing the outcome by delaying the post. `;
      body += `Anyone can independently verify this selection by looking up the BTC block at the scheduled timestamp.\n\n`;
    }
  }

  if (previousResults && previousResults.length > 0) {
    body += `## Yesterday's Results\n\n`;
    for (const round of previousResults) {
      body += `**Round ${round.roundNumber}**: `;
      const names = round.selected.map(s => mention(s.newbie.account, testMode)).join(', ');
      body += `${names}\n`;
    }
    body += `\n`;
  }

  body += `---\n`;
  if (testMode) {
    body += `*Test post — do not upvote*\n`;
  } else {
    body += `*Posted by [@swarmpost](/@swarmpost) — `;
    body += `[source code](https://github.com/Demotruk/HiveSwarmPost)*\n`;
  }

  return body;
}

/**
 * Generate the markdown body for a lottery round comment.
 */
export function roundCommentBody(round: LotteryRound, testMode: boolean = false): string {
  let body = '';

  if (testMode) {
    body += `## ⚠️ TEST Round ${round.roundNumber} — DO NOT UPVOTE ⚠️ — ${round.date}\n\n`;
  } else {
    body += `## 🎲 Swarm Post Round ${round.roundNumber} — ${round.date}\n\n`;
  }

  body += `### Selected Newbies\n\n`;

  for (const selected of round.selected) {
    const n = selected.newbie;
    body += `${boldMention(n.account, testMode)}\n`;
    body += `- Creator: ${mention(selected.creator, testMode)}\n`;
    if (selected.referrer && selected.referrer !== selected.creator) {
      body += `- Referrer: ${mention(selected.referrer, testMode)}\n`;
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
    body += `| ${mention(ben.account, testMode)} | ${pct}% |\n`;
  }
  body += `\n`;

  const scheduledTime = new Date(round.scheduledTimestamp * 1000).toISOString();

  body += `### Verification\n\n`;
  body += `- Scheduled time: \`${scheduledTime}\`\n`;
  body += `- Bitcoin block: height \`${round.btcBlockHeight}\`, hash \`${round.btcBlockHash}\`\n`;
  body += `- Block selection rule: latest BTC block at or before the scheduled time\n`;
  body += `- Seed: \`SHA256("${round.btcBlockHash}hive-swarm-post${round.date}${round.roundNumber}")\`\n`;
  body += `- Result: \`${round.seed}\`\n\n`;
  if (!testMode) {
    body += `The block used for randomness is determined by the round's scheduled time, not the actual posting time. `;
    body += `This prevents the operator from influencing the outcome by delaying the post. `;
    body += `Anyone can independently verify this selection by looking up the BTC block at the scheduled timestamp.\n`;
  }

  return body;
}
