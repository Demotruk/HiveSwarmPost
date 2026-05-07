import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { PrivateKey } from '@hiveio/dhive';
import { getIncomingTransfers } from '../hive/transfers.js';
import { createClaimedAccount, isAccountAvailable } from '../hive/accountCreate.js';
import { delegateVestingShares } from '../hive/delegation.js';
import { getAccountHP } from '../hive/accounts.js';
import { getAccounts } from '../hive/accounts.js';
import { getClient, withRetry } from '../hive/client.js';
import { computeTrustScores } from '../trust/graph.js';
import { findNewbiesCreatedBy } from '../newbies/eligibility.js';
import { findRebloggableIntroPosts, executeReblogs, expireOldReblogs } from './shared.js';
import type { ReblogFeedConfig, PersonalFeedState, PersonalFeedSubscriber, TrustGraph, VoterInfo } from '../types.js';

function stateFilePath(config: ReblogFeedConfig): string {
  return path.join(config.dataDir, 'personal-state.json');
}

function loadState(config: ReblogFeedConfig): PersonalFeedState {
  try {
    return JSON.parse(fs.readFileSync(stateFilePath(config), 'utf-8'));
  } catch {
    return { lastPaymentScanAt: '', subscribers: {} };
  }
}

function saveState(config: ReblogFeedConfig, state: PersonalFeedState): void {
  const filePath = stateFilePath(config);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(state, null, 2));
}

/**
 * Derive a managed account name from the subscriber's username.
 * Hive accounts are 3–16 chars, lowercase alphanumeric + dots/hyphens.
 */
function deriveManagedAccountName(subscriber: string, prefix: string): string {
  const maxLen = 16;
  const available = maxLen - prefix.length;

  if (subscriber.length <= available) {
    return prefix + subscriber;
  }

  // Truncate + 3-char hash suffix for longer names
  const hash = crypto.createHash('sha256').update(subscriber).digest('hex').slice(0, 3);
  return prefix + subscriber.slice(0, available - 3) + hash;
}

/**
 * Derive all four key pairs for a managed account deterministically.
 * Keys are derived from masterSecret + accountName + role.
 */
function deriveAccountKeys(masterSecret: string, accountName: string) {
  const roles = ['owner', 'active', 'posting', 'memo'] as const;
  const keys: Record<string, { private: PrivateKey; public: string }> = {};

  for (const role of roles) {
    const seed = `${masterSecret}:${accountName}:${role}`;
    const privKey = PrivateKey.fromSeed(seed);
    keys[role] = {
      private: privKey,
      public: privKey.createPublic().toString(),
    };
  }

  return keys;
}

export async function runPersonalFeedCycle(
  config: ReblogFeedConfig,
  graph: TrustGraph,
  trustParticipants: Set<string>,
): Promise<void> {
  console.log('\n--- Feed 3: Personal Trust Network ---');
  if (!config.personalFeedEnabled) {
    console.log('Personal feed disabled (PERSONAL_FEED_ENABLED=false). Skipping.');
    return;
  }

  const state = loadState(config);
  const activeKey = PrivateKey.fromString(config.botActiveKey);

  // Phase A: Detect new payments and provision accounts
  await processPayments(config, state, activeKey);

  // Phase B: Reblog cycle for each subscriber
  const dgp = await withRetry(() => getClient().database.getDynamicGlobalProperties());

  for (const [subscriberName, subscriber] of Object.entries(state.subscribers)) {
    try {
      await processSubscriber(config, subscriber, graph, trustParticipants, dgp);
    } catch (err) {
      console.error(`  Error processing subscriber @${subscriberName}: ${err}`);
    }
  }

  state.lastPaymentScanAt = new Date().toISOString();
  if (!config.dryRun) {
    saveState(config, state);
  }
  console.log(`Feed 3 complete: ${Object.keys(state.subscribers).length} subscribers processed`);
}

async function processPayments(
  config: ReblogFeedConfig,
  state: PersonalFeedState,
  activeKey: PrivateKey,
): Promise<void> {
  const since = state.lastPaymentScanAt
    ? new Date(state.lastPaymentScanAt)
    : new Date(Date.now() - 30 * 24 * 3600 * 1000); // 30 days back on first run

  console.log(`Scanning payments since ${since.toISOString()}...`);
  const transfers = await getIncomingTransfers(config.botAccount, since);

  const newPayments = transfers.filter(t =>
    t.amount === config.paymentAmount &&
    t.memo.toLowerCase().includes(config.paymentMemo.toLowerCase()) &&
    !state.subscribers[t.from]
  );

  if (newPayments.length === 0) {
    console.log('No new Feed 3 payments found.');
    return;
  }

  console.log(`Found ${newPayments.length} new payment(s)`);

  for (const payment of newPayments) {
    const managedName = deriveManagedAccountName(payment.from, config.accountPrefix);
    console.log(`  Provisioning @${managedName} for subscriber @${payment.from}...`);

    if (config.dryRun) {
      console.log(`  [DRY RUN] Would create account @${managedName}`);
      state.subscribers[payment.from] = {
        subscriber: payment.from,
        managedAccount: managedName,
        paymentTimestamp: payment.timestamp,
        delegated: false,
        lastProcessedAt: '',
        reblogged: {},
      };
      continue;
    }

    try {
      const available = await isAccountAvailable(managedName);
      if (!available) {
        console.log(`  Account @${managedName} already exists — assuming prior run created it`);
      } else {
        const keys = deriveAccountKeys(config.masterSecret, managedName);
        await createClaimedAccount(config.botAccount, managedName, activeKey, {
          owner: keys.owner.public,
          active: keys.active.public,
          posting: keys.posting.public,
          memo: keys.memo.public,
        });
        console.log(`  Created account @${managedName}`);
      }

      state.subscribers[payment.from] = {
        subscriber: payment.from,
        managedAccount: managedName,
        paymentTimestamp: payment.timestamp,
        delegated: false,
        lastProcessedAt: '',
        reblogged: {},
      };

      // Delegate HP for resource credits
      await delegateVestingShares(
        config.botAccount, managedName, config.delegationVests, activeKey,
      );
      state.subscribers[payment.from].delegated = true;
      console.log(`  Delegated ${config.delegationVests} to @${managedName}`);
    } catch (err) {
      console.error(`  Failed to provision @${managedName}: ${err}`);
    }
  }
}

async function processSubscriber(
  config: ReblogFeedConfig,
  subscriber: PersonalFeedSubscriber,
  graph: TrustGraph,
  trustParticipants: Set<string>,
  dgp: any,
): Promise<void> {
  console.log(`\n  Processing subscriber @${subscriber.subscriber} (feed: @${subscriber.managedAccount})`);

  subscriber.reblogged = expireOldReblogs(subscriber.reblogged, config.personalFeedWindowDays);
  const alreadyReblogged = new Set(Object.keys(subscriber.reblogged));

  // Compute personal trust scores: BFS from subscriber as sole root
  const [subAccount] = await getAccounts([subscriber.subscriber]);
  if (!subAccount) {
    console.log(`  Subscriber @${subscriber.subscriber} not found — skipping`);
    return;
  }

  const hp = await getAccountHP(subAccount, dgp);
  const personalVoters: VoterInfo[] = [{ account: subscriber.subscriber, hp }];
  const personalScores = computeTrustScores(
    graph, personalVoters, config.trustAttenuation, config.trustDepthCap,
  );

  const scoredOnboarders = Array.from(personalScores.keys()).filter(o => (personalScores.get(o) || 0) > 0);
  console.log(`  Personal trust network: ${scoredOnboarders.length} trusted onboarders`);

  const now = new Date();
  const windowStart = new Date(now);
  windowStart.setUTCDate(windowStart.getUTCDate() - config.personalFeedWindowDays);

  const allNewbies: string[] = [];
  for (const onboarder of scoredOnboarders) {
    const newbies = await findNewbiesCreatedBy(onboarder, windowStart, now);
    if (newbies.length > 0) {
      allNewbies.push(...newbies);
    }
  }
  console.log(`  Found ${allNewbies.length} newbies from personal trust network`);

  const posts = await findRebloggableIntroPosts(allNewbies, alreadyReblogged, trustParticipants);
  console.log(`  Rebloggable intro posts: ${posts.length}`);

  if (posts.length === 0) return;

  // Reblog using the managed account's posting key
  const keys = deriveAccountKeys(config.masterSecret, subscriber.managedAccount);
  const reblogged = await executeReblogs(
    subscriber.managedAccount, posts, config.dryRun, keys.posting.private,
  );

  const timestamp = now.toISOString();
  for (const key of reblogged) {
    subscriber.reblogged[key] = timestamp;
  }
  subscriber.lastProcessedAt = timestamp;
  console.log(`  Subscriber @${subscriber.subscriber}: ${reblogged.length} reblogged`);
}
