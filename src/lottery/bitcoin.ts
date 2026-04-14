import { withRetry } from '../hive/client.js';

/**
 * Fetch the Bitcoin block that was most recently mined at or before the
 * given UNIX timestamp (seconds).
 *
 * Uses the mempool.space `/api/v1/mining/blocks/timestamp/:ts` endpoint,
 * which returns the single block whose timestamp is closest to (and <=)
 * the target.
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
      `https://mempool.space/api/v1/mining/blocks/timestamp/${scheduledTimestamp}`,
    );
    if (!resp.ok) {
      throw new Error(`mempool.space block-at-timestamp ${scheduledTimestamp}: ${resp.status}`);
    }
    const block = await resp.json() as { hash: string; height: number; timestamp: string };
    if (!block?.hash || typeof block.height !== 'number') {
      throw new Error(`Unexpected response from mempool.space: ${JSON.stringify(block)}`);
    }
    return { hash: block.hash, height: block.height };
  });
}
