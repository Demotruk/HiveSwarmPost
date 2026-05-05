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
