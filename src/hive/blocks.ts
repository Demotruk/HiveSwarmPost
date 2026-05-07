import { getClient, withRetry } from './client.js';

const BLOCK_INTERVAL_SECONDS = 3;
const BLOCKS_PER_BATCH = 1000;

export interface NewAccount {
  account: string;
  createdAt: string; // ISO timestamp
}

export interface BlockScanResult {
  accounts: NewAccount[];
  lastBlock: number;
}

/**
 * Scan blocks from `fromBlock` to head for account creation ops.
 * Returns the new accounts found and the last block scanned.
 */
export async function scanBlocksForNewAccounts(fromBlock: number): Promise<BlockScanResult> {
  const dgp = await withRetry(() => getClient().database.getDynamicGlobalProperties());
  const headBlock = dgp.head_block_number;

  if (fromBlock >= headBlock) {
    return { accounts: [], lastBlock: headBlock };
  }

  const totalBlocks = headBlock - fromBlock;
  console.log(`Scanning blocks ${fromBlock}–${headBlock} (${totalBlocks.toLocaleString()} blocks)...`);

  const accounts: NewAccount[] = [];
  let scanned = 0;

  for (let from = fromBlock; from <= headBlock; from += BLOCKS_PER_BATCH) {
    const count = Math.min(BLOCKS_PER_BATCH, headBlock - from + 1);

    const result = await withRetry(() =>
      getClient().call('block_api', 'get_block_range', {
        starting_block_num: from,
        count,
      })
    );

    if (result?.blocks) {
      for (const block of result.blocks) {
        if (!block?.transactions) continue;
        const timestamp = block.timestamp;
        for (const tx of block.transactions) {
          for (const op of tx.operations) {
            const [opType, opData] = op;
            if (opType === 'account_create' || opType === 'create_claimed_account') {
              accounts.push({
                account: opData.new_account_name,
                createdAt: timestamp + 'Z',
              });
            }
          }
        }
      }
    }

    scanned += count;
    if (scanned % 50_000 < BLOCKS_PER_BATCH) {
      console.log(`  ${scanned.toLocaleString()}/${totalBlocks.toLocaleString()} blocks scanned, ${accounts.length} accounts found`);
    }
  }

  return { accounts, lastBlock: headBlock };
}

/**
 * Calculate the block number approximately `days` ago from head.
 */
export async function getBlockDaysAgo(days: number): Promise<number> {
  const dgp = await withRetry(() => getClient().database.getDynamicGlobalProperties());
  const blocksBack = Math.ceil((days * 24 * 3600) / BLOCK_INTERVAL_SECONDS);
  return Math.max(1, dgp.head_block_number - blocksBack);
}
