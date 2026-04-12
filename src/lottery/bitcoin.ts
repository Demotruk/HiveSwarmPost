import { withRetry } from '../hive/client.js';

/**
 * Fetch the Bitcoin block that was most recently mined at or before the
 * given UNIX timestamp (seconds).
 *
 * Uses the Blockstream `/api/blocks/:timestamp` endpoint which returns
 * the 10 blocks whose timestamps are closest to (and <=) the target.
 * We take the first one (highest block that was mined at or before the
 * target time).
 *
 * This is the core primitive for the "expected-time" lottery design:
 * each round's randomness is pinned to the block that existed at the
 * round's *scheduled* time, not the actual posting time.
 */
export async function getBtcBlockAtTimestamp(
  scheduledTimestamp: number,
): Promise<{ hash: string; height: number }> {
  return withRetry(async () => {
    const resp = await fetch(
      `https://blockstream.info/api/blocks/${scheduledTimestamp}`,
    );
    if (!resp.ok) {
      throw new Error(`Blockstream blocks-at-timestamp ${scheduledTimestamp}: ${resp.status}`);
    }
    const blocks = await resp.json() as Array<{ id: string; height: number }>;
    if (!blocks.length) {
      throw new Error(`No blocks found at timestamp ${scheduledTimestamp}`);
    }
    // First entry is the most recent block at or before the timestamp
    return { hash: blocks[0].id, height: blocks[0].height };
  });
}
