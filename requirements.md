# Hive Swarm Post

## Overview

The Hive Swarm Post is a daily automated post on the Hive blockchain that distributes author rewards to newly onboarded users, selected via a trust-weighted lottery. It is the growth counterpart to the burn post: where burn posts reduce supply by sending rewards to `@null`, the Swarm Post grows the network by funding new users.

The system is designed to be sybil-resistant, fully auditable, and trustless. Selection is determined by an on-chain web of trust combined with verifiable randomness from Bitcoin block hashes.

## Core Concept

- One root post per day, created by a bot account
- 10 comments posted throughout the day, each a separate lottery round
- Each comment has 8 beneficiaries selected from the eligible newbie pool
- 80 unique newbies funded per day, up to ~2,400 per month
- Supporters upvote the root post and comments, same as burn post supporters do today
- No pool account, no trusted operator required for distribution

## Newbie Eligibility

A Hive account is eligible for the Swarm Post lottery when:

- Created within the last 30 days (configurable)
- Has published at least 1 post or comment (social proof of genuine engagement)
- Has not already been selected as a beneficiary during their eligibility window (each newbie can only win once)

## Activity Weighting

Eligible newbies are weighted by their posting activity using a diminishing returns formula:

```
activity_weight = ln(1 + post_comment_count) / ln(1 + cap)
```

Where `cap` = 10 (configurable). This produces:

| Posts/Comments | Weight (normalized) |
|---|---|
| 1 | 0.29 |
| 2 | 0.46 |
| 3 | 0.58 |
| 5 | 0.74 |
| 10 | 1.00 |

The first post gets nearly a third of max weight. Subsequent posts have diminishing impact. Activity beyond the cap provides no additional benefit, preventing spam-posting as a strategy.

## Web of Trust

### Trust Declarations

Any Hive account can declare trust in an onboarder via `custom_json` operations:

- **Operation ID**: `swarm_trust` (or similar, TBD)
- **Trust**: `{"trust": "onboarder_account"}`
- **Revoke**: `{"revoke": "onboarder_account"}`

Trust is binary (trust or no trust). The magnitude of trust is determined entirely by the truster's stake (HP) and the path length.

### Trust Score Computation

The trust score for an onboarder O is computed as:

```
score(O) = Sum over all voters V with any trust path to O:
    HP(V) * 0.5^(hops - 1)
```

Where:
- **Voters** = accounts that voted on the Swarm Post in the last 7 days (rolling window)
- **Hops** = number of edges in the trust path from V to O
- **Attenuation** = 0.5 per hop (configurable)
- **Multiple paths** from the same voter to the same onboarder are accumulated (summed), reflecting breadth of trust

#### Trust Degrees

| Degree | Meaning | Weight multiplier |
|---|---|---|
| 1 (direct) | "I personally vouch for this onboarder" | 1.0 |
| 2 | "Someone I trust vouches for them" | 0.5 |
| 3 | "A friend of a friend vouches" | 0.25 |
| 4+ | Diminishing signal | 0.125, 0.0625, ... |

Trust is capped at a reasonable depth (3-4 hops) to prevent noise from distant connections.

### Voter Trust Roots

Only accounts that voted on the Swarm Post (root post or comments) within the last 7 days are used as trust roots. This means:

- Voting = "I endorse the trust model and want my trust declarations counted"
- Not voting = "My trust declarations are inactive"
- The 7-day rolling window smooths out daily voter turnout variance
- The trust graph updates daily as voters come and go

## Onboarder Attribution

Each new Hive account has up to two trust sources, derived from on-chain data:

| Field | Source | Example (Propolis) |
|---|---|---|
| **Creator** | Account that signed the `account_create` operation | Issuer |
| **Referrer** | Referral metadata set at account creation | Distributor |

If both exist, the newbie's score draws from both trust paths:

```
onboarder_trust = trust_score(creator) + trust_score(referrer)
```

If only a creator exists, full weight goes through the creator's trust score.

This maps naturally to systems like Propolis (issuer = creator, distributor = referrer) and any other onboarding tool that sets these fields.

## Newbie Scoring

The final score for each eligible newbie:

```
score(N) = onboarder_trust(N) * activity_weight(N)
```

Where:
- `onboarder_trust(N)` = sum of trust scores for N's creator and referrer
- `activity_weight(N)` = diminishing returns function of N's post/comment count

## Lottery Selection

### Randomness Source

Each lottery round uses the hash of the most recent Bitcoin block at time of posting as the randomness seed. This provides:

- **Unpredictability**: No Hive actor can influence Bitcoin mining
- **Verifiability**: Anyone can check the block hash and reproduce the selection
- **Public availability**: No oracle or trusted third party needed

### Selection Algorithm

For each lottery round (comment):

```
seed = SHA256(btc_block_hash + "hive-swarm-post" + date + round_number)
pool = all eligible newbies not yet selected in their eligibility window

for i in 1..8:
    weights = [score(n) for n in pool]
    selected = weighted_random(pool, weights, seed, i)
    beneficiaries.append(selected)
    pool.remove(selected)
```

The algorithm is deterministic given the inputs. Anyone can independently verify that the correct beneficiaries were selected.

### Daily Schedule

- 10 lottery rounds per day
- Comments posted at regular intervals (~2.4 hours apart, configurable)
- Each round removes its 8 winners from the pool for the remainder of their eligibility window

## Post Structure

### Root Post (1 per day)

The root post is the Schelling point for voter support. It contains:

- Summary of today's eligible pool (total newbies, total onboarders)
- Trust graph statistics (active voters, total trust declarations)
- Link to rules/documentation
- Results from the previous day's rounds

### Comments (10 per day)

Each comment is a lottery round. It contains:

- The 8 selected beneficiaries (set via `comment_options`)
- For each beneficiary: their onboarder(s), trust path, score breakdown
- The Bitcoin block hash used as the randomness seed
- Enough information for anyone to independently verify the selection

## Sybil Resistance

The system has multiple layers of sybil defense:

1. **Stake-weighted trust**: Trust declarations carry weight proportional to HP. Creating sybil accounts doesn't generate trust — you need real stakeholders to trust you.

2. **Activity requirement**: Newbies must post or comment (social proof). Sybil accounts that don't produce content get zero weight.

3. **Diminishing activity returns**: Spam-posting provides minimal additional benefit beyond the first few posts.

4. **Trust revocation**: If an onboarder starts sybiling, the community can revoke trust via `custom_json`. The effect is immediate in the next trust graph computation.

5. **Onboarder dilution**: An onboarder's trust score is shared across all their newbies. Creating more sybil accounts dilutes the per-account reward, while the effort per sybil (must post content) stays constant.

6. **Verifiable lottery**: The Bitcoin block hash makes selection auditable. Any manipulation of the eligible pool or scoring is publicly detectable.

### Attack Cost Analysis

To profit from sybil attacks, an attacker needs:
- Stake (HP) to generate meaningful trust, or social capital to get staked accounts to trust them — **expensive**
- Each sybil account must post at least once — **effort per account**
- Trust is revocable if detected — **risk of losing investment**
- Per-sybil reward is small (share of one comment's rewards, split 8 ways) — **low return**

The system is designed so that the most profitable strategy is genuinely onboarding active users.

## Hive Blockchain Constraints

- **Max 8 beneficiaries per post/comment** (witness-enforced limit)
- **Beneficiaries are immutable** — set at creation via `comment_options`, before any votes
- **5-minute minimum between root posts** per account
- **`custom_json` operations** are free (no author reward implications)

## Configuration Parameters

| Parameter | Default | Description |
|---|---|---|
| Eligibility window | 30 days | How long after account creation a newbie is eligible |
| Activity threshold | 1 post/comment | Minimum to enter the pool |
| Activity cap | 10 posts/comments | Point of maximum activity weight |
| Trust attenuation | 0.5 per hop | How much trust decays per degree of indirection |
| Trust depth cap | 4 hops | Maximum trust path length |
| Voter window | 7 days | Rolling window for counting active voters as trust roots |
| Rounds per day | 10 | Number of lottery comments per day |
| Beneficiaries per round | 8 | Limited by Hive protocol |

## Trust Declaration Web UI

A minimal static web page allows users to manage their trust declarations. No backend is required — the page queries public Hive API nodes directly and uses the Hive Keychain browser extension for signing transactions.

### Features

1. **Connect** — User enters their Hive username. The page verifies the account exists and that Hive Keychain is installed.
2. **Declare trust** — User inputs an onboarder's username. The page broadcasts a `custom_json` operation: `{"trust": "onboarder_account"}`.
3. **Revoke trust** — User selects from their trusted accounts list. The page broadcasts: `{"revoke": "onboarder_account"}`.
4. **View trusted accounts** — Displays all accounts the user currently trusts, derived by replaying their `swarm_trust` `custom_json` history (applying trusts and revocations in order).
5. **View downstream trust tree** — For each trusted account, recursively shows who they trust (degree 2), who those accounts trust (degree 3), etc., up to the trust depth cap. Each level displays the attenuation factor (1.0x → 0.5x → 0.25x → 0.125x).

### Technical Requirements

- Single static HTML page (no build step, no backend)
- Queries `condenser_api.get_account_history` on public Hive API nodes to read `custom_json` history
- Uses Hive Keychain (`window.hive_keychain.requestCustomJson`) for signing with Posting authority
- Can be hosted on GitHub Pages or any static file host

## Open Questions

- **Naming the custom_json ID**: `swarm_trust`? `hive_swarm_trust`? Needs to be unique and not conflict with existing operations.
- **Bot account name**: What account runs the daily posts?
- **Voter window tuning**: 7 days is a starting point. Too short = volatile. Too long = stale trust from inactive voters.
- **Expiry boost**: Should newbies approaching the end of their eligibility window get a weight multiplier to reduce the chance of never being selected? Deferred to v2.
- **Governance**: Who controls the bot account? How are parameter changes decided?
- **Multiple competing Swarm Posts**: Could there be rival implementations with different trust graphs? Is that desirable or fragmenting?
