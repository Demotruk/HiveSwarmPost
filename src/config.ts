import type { Config } from './types.js';

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

export function loadConfig(opts?: { requireKeys?: boolean }): Config {
  const requireKeys = opts?.requireKeys ?? true;
  return {
    postingKey: requireKeys ? requireEnv('POSTING_KEY') : env('POSTING_KEY', ''),
    botAccount: env('BOT_ACCOUNT', 'swarmpost'),
    hiveNodes: [
      'https://api.hive.blog',
      'https://api.deathwing.me',
      'https://api.openhive.network',
    ],
    eligibilityWindowDays: intEnv('ELIGIBILITY_WINDOW_DAYS', 30),
    activityCap: intEnv('ACTIVITY_CAP', 10),
    trustAttenuation: floatEnv('TRUST_ATTENUATION', 0.5),
    trustDepthCap: intEnv('TRUST_DEPTH_CAP', 4),
    voterWindowDays: intEnv('VOTER_WINDOW_DAYS', 7),
    roundsPerDay: intEnv('ROUNDS_PER_DAY', 10),
    newbiesPerRound: intEnv('NEWBIES_PER_ROUND', 2),
    trustApiUrl: env('TRUST_API_URL', 'https://swarm-trust-api.fly.dev'),
    dryRun: boolEnv('DRY_RUN', false),
  };
}
