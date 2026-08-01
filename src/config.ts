import type { Config, ReblogFeedConfig, RcDelegationConfig } from './types.js';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Required environment variable ${name} is not set`);
  }
  return value;
}

function env(name: string, defaultValue: string): string {
  return process.env[name] || defaultValue;
}

function intEnv(name: string, defaultValue: number): number {
  const value = process.env[name];
  return value ? parseInt(value, 10) : defaultValue;
}

function floatEnv(name: string, defaultValue: number): number {
  const value = process.env[name];
  return value ? parseFloat(value) : defaultValue;
}

function boolEnv(name: string, defaultValue: boolean): boolean {
  const value = process.env[name];
  if (!value) return defaultValue;
  return value === 'true' || value === '1';
}

const HIVE_NODES = [
  'https://api.hive.blog',
  'https://api.deathwing.me',
  'https://api.openhive.network',
  'https://anyx.io',
  'https://hive-api.arcange.eu',
  'https://api.c0ff33a.uk',
  'https://rpc.ausbit.dev',
  'https://techcoderx.com',
];

export function loadConfig(opts?: { requireKeys?: boolean }): Config {
  const requireKeys = opts?.requireKeys ?? true;
  return {
    postingKey: requireKeys ? requireEnv('POSTING_KEY') : env('POSTING_KEY', ''),
    botAccount: env('BOT_ACCOUNT', 'swarmpost'),
    hiveNodes: HIVE_NODES,
    eligibilityWindowDays: intEnv('ELIGIBILITY_WINDOW_DAYS', 30),
    activityCap: intEnv('ACTIVITY_CAP', 10),
    trustAttenuation: floatEnv('TRUST_ATTENUATION', 0.5),
    trustDepthCap: intEnv('TRUST_DEPTH_CAP', 4),
    voterWindowDays: intEnv('VOTER_WINDOW_DAYS', 7),
    roundsPerDay: intEnv('ROUNDS_PER_DAY', 10),
    newbiesPerRound: intEnv('NEWBIES_PER_ROUND', 1),
    trustApiUrl: env('TRUST_API_URL', 'https://swarm-trust-api.fly.dev'),
    sponsorMinTrust: intEnv('SPONSOR_MIN_TRUST', 1000),
    rejectTopVoters: intEnv('REJECT_TOP_VOTERS', 10),
    dryRun: boolEnv('DRY_RUN', false),
    syncFollows: boolEnv('SYNC_FOLLOWS', false),
    testMode: boolEnv('TEST_MODE', false),
  };
}

export function loadReblogFeedConfig(): ReblogFeedConfig {
  const dryRun = boolEnv('DRY_RUN', false);
  const personalEnabled = boolEnv('PERSONAL_FEED_ENABLED', false);
  // In dry-run mode, keys and account names are optional (no broadcasts)
  const reqKey = (name: string) => dryRun ? env(name, '') : requireEnv(name);
  return {
    hiveNodes: HIVE_NODES,
    trustApiUrl: env('TRUST_API_URL', 'https://swarm-trust-api.fly.dev'),
    trustAttenuation: floatEnv('TRUST_ATTENUATION', 0.5),
    trustDepthCap: intEnv('TRUST_DEPTH_CAP', 4),
    voterWindowDays: intEnv('VOTER_WINDOW_DAYS', 7),
    roundsPerDay: intEnv('ROUNDS_PER_DAY', 10),
    dataDir: env('REBLOG_FEED_DATA_DIR', './data/reblog-feeds'),
    dryRun,
    // Feed 1
    trustedFeedAccount: env('TRUSTED_FEED_ACCOUNT', 'swarmpost-newbies'),
    trustedFeedPostingKey: reqKey('TRUSTED_FEED_POSTING_KEY'),
    trustedFeedWindowDays: intEnv('TRUSTED_FEED_WINDOW_DAYS', 30),
    // Feed 2
    allFeedAccount: env('ALL_FEED_ACCOUNT', 'hive-newbies'),
    allFeedPostingKey: reqKey('ALL_FEED_POSTING_KEY'),
    allFeedWindowDays: intEnv('ALL_FEED_WINDOW_DAYS', 10),
    // Feed 3
    personalFeedEnabled: personalEnabled,
    botAccount: env('BOT_ACCOUNT', 'swarmpost'),
    botActiveKey: personalEnabled ? reqKey('BOT_ACTIVE_KEY') : '',
    masterSecret: personalEnabled ? reqKey('REBLOG_FEED_MASTER_SECRET') : '',
    personalFeedWindowDays: intEnv('REBLOG_FEED_WINDOW_DAYS', 30),
    delegationVests: env('REBLOG_FEED_DELEGATION_VESTS', '15.000000 VESTS'),
    accountPrefix: env('REBLOG_FEED_ACCOUNT_PREFIX', 'nf-'),
    paymentAmount: env('REBLOG_FEED_PAYMENT_AMOUNT', '0.500 HBD'),
    paymentMemo: env('REBLOG_FEED_PAYMENT_MEMO', 'feed3'),
  };
}

/**
 * Accounts that are always protected from RC reclaim, regardless of env config.
 * These hold manual delegations from the delegator account that predate (or sit
 * outside) the newbie programme. Baked in so a missing env var can't wipe them
 * a second time; RC_DELEGATION_EXEMPT_ACCOUNTS adds to this list, never replaces it.
 */
const DEFAULT_RC_EXEMPT_ACCOUNTS = ['hivepostify'];

/** Parse a comma/whitespace-separated account list: trims, drops '@', lowercases. */
function accountListEnv(name: string): string[] {
  return env(name, '')
    .split(/[,\s]+/)
    .map(a => a.trim().toLowerCase().replace(/^@/, ''))
    .filter(a => a.length > 0);
}

/** Parse a comma/whitespace-separated list of integers, dropping unparseable entries. */
function intListEnv(name: string): number[] {
  return env(name, '')
    .split(/[,\s]+/)
    .map(v => parseInt(v.trim(), 10))
    .filter(v => Number.isFinite(v));
}

export function loadRcDelegationConfig(): RcDelegationConfig {
  const dryRun = boolEnv('DRY_RUN', false);
  const enabled = boolEnv('RC_DELEGATION_ENABLED', false);
  const amount = intEnv('RC_DELEGATION_AMOUNT', 15_000_000_000);
  // The posting key is only needed when we actually broadcast — i.e. the
  // feature is enabled and not a dry run.
  const needsKey = enabled && !dryRun;
  return {
    enabled,
    delegatorAccount: env('RC_DELEGATOR_ACCOUNT', ''),
    postingKey: needsKey ? requireEnv('RC_DELEGATOR_POSTING_KEY') : env('RC_DELEGATOR_POSTING_KEY', ''),
    // Default 15B RC — comfortable daily activity for an engaged newbie.
    amount,
    // Only delegations of a size this bot hands out are ever reclaimed. Keep
    // past amounts in RC_DELEGATION_PAST_AMOUNTS whenever `amount` changes.
    managedAmounts: [...new Set([amount, ...intListEnv('RC_DELEGATION_PAST_AMOUNTS')])],
    batchSize: intEnv('RC_DELEGATION_BATCH_SIZE', 100),
    exemptAccounts: [
      ...new Set([
        ...DEFAULT_RC_EXEMPT_ACCOUNTS,
        ...accountListEnv('RC_DELEGATION_EXEMPT_ACCOUNTS'),
        // Never reclaim from ourselves if the delegator ever self-delegates.
        env('RC_DELEGATOR_ACCOUNT', '').toLowerCase(),
        env('BOT_ACCOUNT', 'swarmpost').toLowerCase(),
      ]),
    ].filter(a => a.length > 0),
    dryRun,
  };
}
