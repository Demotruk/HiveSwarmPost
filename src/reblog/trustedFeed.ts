import * as fs from 'node:fs';
import * as path from 'node:path';
import { findNewbiesCreatedBy } from '../newbies/eligibility.js';
import { findRebloggableIntroPosts, executeReblogs, expireOldReblogs } from './shared.js';
import type { ReblogFeedConfig, SharedReblogState, TrustGraph } from '../types.js';

function stateFilePath(config: ReblogFeedConfig): string {
  return path.join(config.dataDir, 'trusted-state.json');
}

function loadState(config: ReblogFeedConfig): SharedReblogState {
  try {
    return JSON.parse(fs.readFileSync(stateFilePath(config), 'utf-8'));
  } catch {
    return { lastProcessedAt: '', reblogged: {} };
  }
}

function saveState(config: ReblogFeedConfig, state: SharedReblogState): void {
  const filePath = stateFilePath(config);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(state, null, 2));
}

export async function runTrustedFeedCycle(
  config: ReblogFeedConfig,
  trustScores: Map<string, number>,
  trustParticipants: Set<string>,
): Promise<void> {
  console.log('\n--- Feed 1: Trusted Network Newbies ---');
  console.log(`Feed account: @${config.trustedFeedAccount}`);

  const state = loadState(config);
  state.reblogged = expireOldReblogs(state.reblogged, config.trustedFeedWindowDays);
  const alreadyReblogged = new Set(Object.keys(state.reblogged));
  console.log(`Tracked reblogs: ${alreadyReblogged.size} (after expiry)`);

  const now = new Date();
  const windowStart = new Date(now);
  windowStart.setUTCDate(windowStart.getUTCDate() - config.trustedFeedWindowDays);

  const scoredOnboarders = Array.from(trustScores.keys()).filter(o => (trustScores.get(o) || 0) > 0);
  console.log(`Scanning ${scoredOnboarders.length} trusted onboarders...`);

  const allNewbies: string[] = [];
  for (const onboarder of scoredOnboarders) {
    const newbies = await findNewbiesCreatedBy(onboarder, windowStart, now);
    if (newbies.length > 0) {
      allNewbies.push(...newbies);
    }
  }
  console.log(`Found ${allNewbies.length} newbies from trusted onboarders`);

  const posts = await findRebloggableIntroPosts(allNewbies, alreadyReblogged, trustParticipants);
  console.log(`Rebloggable intro posts: ${posts.length}`);

  const reblogged = await executeReblogs(config.trustedFeedAccount, posts, config.dryRun);

  const timestamp = now.toISOString();
  for (const key of reblogged) {
    state.reblogged[key] = timestamp;
  }
  state.lastProcessedAt = timestamp;

  if (!config.dryRun) {
    saveState(config, state);
  }
  console.log(`Feed 1 complete: ${reblogged.length} reblogged`);
}
