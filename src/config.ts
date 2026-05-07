import type { Config, ReblogFeedConfig } from './types.js';

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
