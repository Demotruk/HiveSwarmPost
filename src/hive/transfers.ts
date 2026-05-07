import { hiveCall, withRetry } from './client.js';

export interface IncomingTransfer {
  from: string;
  amount: string;
  memo: string;
  timestamp: string;
}

/**
 * Scan incoming transfers to `account` since `since`.
 * Uses the transfer operation bitmask to avoid fetching irrelevant ops.
 */
export async function getIncomingTransfers(
  account: string,
  since: Date,
): Promise<IncomingTransfer[]> {
  const TRANSFER_BITMASK = 1 << 2; // transfer op
  const transfers: IncomingTransfer[] = [];
  let start = -1;
  const batchSize = 1000;

  while (true) {
    const limit = start === -1 ? batchSize : Math.min(batchSize, start + 1);
    const history = await withRetry<any[][]>(() =>
      hiveCall<any[][]>('condenser_api', 'get_account_history', [
        account, start, limit, TRANSFER_BITMASK,
      ])
    );

    if (!history || history.length === 0) break;

    let oldestInBatch: Date | null = null;
    for (const [, entry] of history) {
      const timestamp = new Date(entry.timestamp + 'Z');
      if (!oldestInBatch || timestamp < oldestInBatch) oldestInBatch = timestamp;
      if (timestamp < since) continue;

      const [opType, opData] = entry.op;
      if (opType === 'transfer' && opData.to === account) {
        transfers.push({
          from: opData.from,
          amount: opData.amount,
          memo: opData.memo.trim(),
          timestamp: timestamp.toISOString(),
        });
      }
    }

    if (oldestInBatch && oldestInBatch < since) break;
    if (history.length < limit) break;
    start = history[0][0] - 1;
    if (start < 0) break;
  }

  return transfers;
}
