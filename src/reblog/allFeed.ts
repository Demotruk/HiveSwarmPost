import * as fs from 'node:fs';
import * as path from 'node:path';
import { scanBlocksForNewAccounts, getBlockDaysAgo } from '../hive/blocks.js';
import { findRebloggableIntroPosts, executeReblogs, expireOldReblogs } from './shared.js';
import type { ReblogFeedConfig, AllFeedState } from '../types.js';

function stateFilePath(config: ReblogFeedConfig): string {
  return path.join(config.dataDir, 'all-state.json');
}

function loadState(config: ReblogFeedConfig): AllFeedState {
  try {
    return JSON.parse(fs.readFileSync(stateFilePath(config), 'utf-8'));
  } catch {
    return { lastBlock: 0, lastProcessedAt: '', reblogged: {} };
  }
}

function saveState(config: ReblogFeedConfig, state: AllFeedState): void {
  const filePath = stateFilePath(config);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(state, null, 2));
}

export async function runAllFeedCycle(config: ReblogFeedConfig): Promise<void> {
  console.log('\n--- Feed 2: All New Users ---');
  console.log(`Feed account: @${config.allFeedAccount}`);

  const state = loadState(config);
  state.reblogged = expireOldReblogs(state.reblogged, config.allFeedWindowDays);
  const alreadyReblogged = new Set(Object.keys(state.reblogged));
  console.log(`Tracked reblogs: ${alreadyReblogged.size} (after expiry)`);

  // On first run, start from N days ago
  let fromBlock = state.lastBlock + 1;
  if (state.lastBlock === 0) {
    fromBlock = await getBlockDaysAgo(config.allFeedWindowDays);
    console.log(`First run — scanning from ${config.allFeedWindowDays} days ago (block ${fromBlock})`);
  } else {
    console.log(`Resuming from block ${fromBlock}`);
  }

  const { accounts: newAccounts, lastBlock } = await scanBlocksForNewAccounts(
    fromBlock,
    (_accounts, scannedBlock) => {
      state.lastBlock = scannedBlock;
      saveState(config, state);
    },
  );
  console.log(`Found ${newAccounts.length} new accounts`);

  // Filter to accounts within the window
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - config.allFeedWindowDays);
  const inWindow = newAccounts
    .filter(a => new Date(a.createdAt).getTime() >= cutoff.getTime())
    .map(a => a.account);

  console.log(`Accounts in ${config.allFeedWindowDays}-day window: ${inWindow.length}`);

  // Pass empty trust participants — Feed 2 doesn't filter on trusted votes
  const posts = await findRebloggableIntroPosts(inWindow, alreadyReblogged, new Set());
  console.log(`Rebloggable intro posts: ${posts.length}`);

  const reblogged = await executeReblogs(config.allFeedAccount, posts, config.dryRun);

  const timestamp = new Date().toISOString();
  for (const key of reblogged) {
    state.reblogged[key] = timestamp;
  }
  state.lastBlock = lastBlock;
  state.lastProcessedAt = timestamp;

  if (!config.dryRun) {
    saveState(config, state);
  }
  console.log(`Feed 2 complete: ${reblogged.length} reblogged`);
}
