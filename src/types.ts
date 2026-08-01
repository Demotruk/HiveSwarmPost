export interface Config {
  hiveNodes: string[];
  postingKey: string;
  botAccount: string;
  eligibilityWindowDays: number;
  activityCap: number;
  trustAttenuation: number;
  trustDepthCap: number;
  voterWindowDays: number;
  roundsPerDay: number;
  newbiesPerRound: number;
  trustApiUrl: string;
  sponsorMinTrust: number;
  rejectTopVoters: number;
  dryRun: boolean;
  syncFollows: boolean;
  testMode: boolean;
}

export interface OnboarderAttribution {
  creator: string;
  referrer: string | null;
  /** Attested creator via !vouch — overrides on-chain creator for trust scoring and rewards */
  vouchedCreator?: string;
  /** Trust participant who made the !vouch attestation */
  voucher?: string;
  /** Trust participant who !sponsor-ed this newbie — takes the creator beneficiary slot */
  sponsor?: string;
}

export interface EligibleNewbie {
  account: string;
  createdAt: Date;
  onboarders: OnboarderAttribution;
  activityWeight: number;
  onboarderTrust: number;
  score: number;
}

export interface BeneficiaryEntry {
  account: string;
  weight: number; // basis points (10000 = 100%)
}

export interface SelectedNewbie {
  newbie: EligibleNewbie;
  creator: string;
  referrer: string | null;
  voucher?: string;
  sponsor?: string;
}

export interface LotteryRound {
  roundNumber: number;
  date: string;
  scheduledTimestamp: number; // UNIX seconds — the round's expected post time
  btcBlockHash: string;
  btcBlockHeight: number;
  seed: string;
  selected: SelectedNewbie[];
  beneficiaries: BeneficiaryEntry[];
}

export interface IntroPostStatus {
  author: string;
  permlink: string;
  title: string;
  created: string;
  images: string[];
  url: string;
  hasImage: boolean;
  hasIntroTag: boolean;
  hasTrustedVote: boolean;
  isOldEnough: boolean;
  trustedVoters: string[];
}

export interface FeedNewbie {
  account: string;
  createdAt: Date;
  onboarders: OnboarderAttribution;
  activityWeight: number;
  onboarderTrust: number;
  score: number;
  introPost: IntroPostStatus;
}

/** Adjacency list: account -> Set of accounts they trust */
export type TrustGraph = Map<string, Set<string>>;

/** Voter with their HP for trust root computation */
export interface VoterInfo {
  account: string;
  hp: number;
}


export interface ReblogFeedConfig {
  hiveNodes: string[];
  trustApiUrl: string;
  trustAttenuation: number;
  trustDepthCap: number;
  voterWindowDays: number;
  roundsPerDay: number;
  dataDir: string;
  dryRun: boolean;
  // Feed 1: Trusted Network Newbies
  trustedFeedAccount: string;
  trustedFeedPostingKey: string;
  trustedFeedWindowDays: number;
  // Feed 2: All New Users
  allFeedAccount: string;
  allFeedPostingKey: string;
  allFeedWindowDays: number;
  // Feed 3: Personal Trust Network
  personalFeedEnabled: boolean;
  botAccount: string;
  botActiveKey: string;
  masterSecret: string;
  personalFeedWindowDays: number;
  delegationVests: string;
  accountPrefix: string;
  paymentAmount: string;
  paymentMemo: string;
}

/**
 * Config for the RC-delegation service: automatically delegate resource
 * credits to trustworthy newbies who have posted a qualifying intro, and
 * reclaim those delegations once the account ages out of the window.
 */
export interface RcDelegationConfig {
  enabled: boolean;
  /** Account that delegates RC (separate funded account). Uses its posting key. */
  delegatorAccount: string;
  /** Posting key of the delegator account (empty in dry-run). */
  postingKey: string;
  /** RC to delegate to each newbie, in raw RC units (e.g. 15000000000 = 15B). */
  amount: number;
  /** How many delegatees to include per custom_json op. */
  batchSize: number;
  /**
   * Accounts the bot must never touch — neither reclaim from nor delegate to.
   * The delegator's outgoing delegations include any made by hand, and those
   * would otherwise look like aged-out bot delegations and get wiped.
   */
  exemptAccounts: string[];
  /**
   * Every RC amount this bot has ever delegated (current `amount` plus any
   * historical values). A delegation of some other size was made by hand and is
   * never reclaimed. Historical values must stay listed, or delegations made
   * under an older amount become permanently unreclaimable.
   */
  managedAmounts: number[];
  dryRun: boolean;
}

export interface SharedReblogState {
  lastProcessedAt: string;
  reblogged: Record<string, string>; // "author/permlink" -> ISO timestamp
}

export interface AllFeedState extends SharedReblogState {
  lastBlock: number;
}

export interface PersonalFeedSubscriber {
  subscriber: string;
  managedAccount: string;
  paymentTimestamp: string;
  delegated: boolean;
  lastProcessedAt: string;
  reblogged: Record<string, string>;
}

export interface PersonalFeedState {
  lastPaymentScanAt: string;
  subscribers: Record<string, PersonalFeedSubscriber>;
}
