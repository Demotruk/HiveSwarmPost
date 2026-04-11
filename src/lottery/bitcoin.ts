import { withRetry } from '../hive/client.js';

const BLOCKSTREAM_LATEST = 'https://blockstream.info/api/blocks/tip/hash';
const BLOCKSTREAM_HEIGHT = 'https://blockstream.info/api/blocks/tip/height';
const BLOCKCHAIN_INFO_LATEST = 'https://blockchain.info/q/latesthash';

/**
 * Fetch the latest Bitcoin block hash and height.
 * Uses Blockstream API with blockchain.info as fallback.
 */
export async function getLatestBtcBlock(): Promise<{ hash: string; height: number }> {
  try {
    return await fetchFromBlockstream();
  } catch (err) {
    console.log(`Blockstream API failed, trying blockchain.info: ${err}`);
    return fetchFromBlockchainInfo();
  }
}

/**
 * Get a Bitcoin block hash for a specific lottery round.
 *
 * Round 1 uses the latest block, round N uses latest - (N-1).
 */
export async function getBtcBlockHashForRound(
  roundNumber: number,
  latestHeight: number,
): Promise<string> {
  const targetHeight = latestHeight - (roundNumber - 1);
  return withRetry(async () => {
    const resp = await fetch(`https://blockstream.info/api/block-height/${targetHeight}`);
    if (!resp.ok) throw new Error(`Blockstream height ${targetHeight}: ${resp.status}`);
    return resp.text();
  });
}

async function fetchFromBlockstream(): Promise<{ hash: string; height: number }> {
  const [hashResp, heightResp] = await Promise.all([
    fetch(BLOCKSTREAM_LATEST),
    fetch(BLOCKSTREAM_HEIGHT),
  ]);

  if (!hashResp.ok) throw new Error(`Blockstream hash: ${hashResp.status}`);
  if (!heightResp.ok) throw new Error(`Blockstream height: ${heightResp.status}`);

  const hash = await hashResp.text();
  const height = parseInt(await heightResp.text(), 10);

  return { hash: hash.trim(), height };
}

async function fetchFromBlockchainInfo(): Promise<{ hash: string; height: number }> {
  const hashResp = await fetch(BLOCKCHAIN_INFO_LATEST);
  if (!hashResp.ok) throw new Error(`blockchain.info: ${hashResp.status}`);
  const hash = (await hashResp.text()).trim();

  // blockchain.info doesn't have a clean height endpoint, so we use blockstream for height
  // If blockstream is also down, we use a placeholder height
  try {
    const heightResp = await fetch(BLOCKSTREAM_HEIGHT);
    const height = parseInt(await heightResp.text(), 10);
    return { hash, height };
  } catch {
    throw new Error('Cannot determine Bitcoin block height from any source');
  }
}
