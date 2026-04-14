# How the Swarm Post Lottery Selects Winners (v1)

> Companion post to [The Hive Swarm Post](INSERT_ANNOUNCEMENT_URL_AFTER_IT_GOES_LIVE). Read that first if you haven't — this post goes under the hood.

**This is the v1 algorithm.** It will evolve. What's written here is what goes live at launch; the parameters and some of the structure are already configurable, and bigger changes (e.g., replacing how trust propagates, adjusting how vouch-weight factors in, tuning the beneficiary split) are on the table as the system gathers real usage. Read this as *"how it works right now"* rather than *"how it will always work."*

Two guarantees drive the v1 design:

1. **Anyone can reproduce every selection** from public inputs.
2. **No single party determines who wins.**

If that sounds interesting, read on.

## 1. The Eligible Pool

A newbie qualifies on a given day when all of these are true:

- **Account age** — created within the last 30 days (configurable via `ELIGIBILITY_WINDOW_DAYS`).
- **Introduction post** — at least one image, tagged `introduceyourself`, published at least 24 hours before the round.
- **Vouched** — the intro post has net positive `rshares` from accounts in the trust graph (the sum of HP-weighted upvotes from trust participants must be greater than zero).
- **Onboarder is trusted** — the account's creator (and optionally its referrer, via the HiveOnBoard standard) is reachable in the trust graph with a positive trust score.
- **Not already funded** — hasn't been selected as a beneficiary of a prior round in the current 30-day window.

## 2. The Trust Graph

The graph is rebuilt every run from two ingredients:

**Trust declarations.** Each `swarm_trust` custom_json operation is a trust edge (with `revoke` ops removing one). These are maintained by the [HiveInvite trust indexer](https://swarm-trust-api.fly.dev/api/trust/edges), which watches the Hive chain and keeps the current set of active edges in a local database.

**Active voters.** Accounts that have voted on recent Swarm Posts (7-day rolling window) are the *roots* of the graph, with their HP as weight. During bootstrap — before any Swarm Post has received votes — all trust declarers are treated as roots with equal weight.

Trust propagates via breadth-first search, attenuated per hop:

```
trust_score(account) = Σ [ HP(voter) × attenuation ^ (hops - 1) ]
```

- `attenuation = 0.5` (configurable) — each hop halves the contribution.
- `depth_cap = 4` hops — beyond that, trust doesn't propagate.
- Cycles are safe: each account is finalized at the first level it's reached, so a cycle just short-circuits.

Example: if @alice (50,000 HP) directly trusts @bob, @bob's trust score gets +50,000. If @bob also trusts @carol, @carol gets +25,000 (half-attenuated from @alice's vote, one hop further). And so on, down to depth 4.

## 3. Newbie Score

Each eligible newbie gets a single score:

```
score = onboarder_trust × activity_weight
```

- `onboarder_trust` = sum of trust scores of the newbie's creator plus referrer (if different).
- `activity_weight` = `ln(1 + post_count) / ln(1 + ACTIVITY_CAP)` — diminishing returns, saturates at 1.0 when the newbie has hit `ACTIVITY_CAP = 10` total posts/comments.

Higher trust and more activity means higher score means better odds. Every eligible newbie has non-zero odds.

## 4. Randomness from Bitcoin

Each round's randomness is seeded by a Bitcoin block hash:

```
seed = SHA256(btcBlockHash + "hive-swarm-post" + date + roundNumber)
```

`btcBlockHash` is the hash of the Bitcoin block mined **at or before the round's scheduled time** — not the actual posting time.

The scheduled-time pin matters: it prevents the bot operator from influencing outcomes by delaying a post. If the bot is late posting Round 3 by an hour, the seed is still pinned to the block that was current at Round 3's original 04:48 UTC slot, which can't be retroactively changed.

Bitcoin is the randomness source because:

- It's public and unpredictable — nobody knows the next block's hash before it's mined.
- It has no governance body that can rewrite history.
- Blocks arrive ~every 10 minutes, giving plenty of granularity for 10 rounds/day.
- It has no dependency on Hive's own state — so a Hive-side attacker can't game both systems at once.

## 5. Weighted Selection

Given the seed and the scored pool, selection is a deterministic weighted-sample-without-replacement:

1. Let `total = Σ score(n) for n in pool`.
2. Derive a uniform random `r ∈ [0, 1)` from the seed: `SHA256(seed + selectionIndex)`, read the first 8 bytes as a big-endian uint64, divide by 2^64.
3. Compute threshold `r × total`.
4. Walk the sorted pool accumulating scores. The newbie whose cumulative score first exceeds the threshold is selected.
5. Remove the selected newbie; repeat for `NEWBIES_PER_ROUND = 1` (v1 default).

Higher-score newbies occupy more of the `[0, total)` range, so they win more often — but luck matters. An @alice with score 50,000 and an @bob with score 10,000 both have real chances; it's just that @alice wins roughly 5x as often over the long run.

## 6. Beneficiaries

The selected newbie's slot totals 50% of the post's rewards:

- **With distinct creator and referrer:** newbie 25%, creator 12.5%, referrer 12.5%.
- **With creator = referrer (or no referrer):** newbie 25%, creator 25%.

The other 50% goes to the post's curators and author. Beneficiaries are set in the `comment_options` op at post time and are immutable afterward — no changing them once the post exists.

## 7. Worked Example

Suppose the scheduled time for Round 3 on 2026-05-01 is `04:48:00 UTC`. The Bitcoin block at that moment has hash `00000000000000000002abc...`.

```
seed = SHA256("00000000000000000002abc...hive-swarm-post2026-05-013")
     = 4f2a9d…
```

Interpret `SHA256(seed + "0")`'s first 8 bytes as a uint64, divide by 2^64, yielding `r = 0.4721`.

The eligibility filter today returns three newbies:

| Newbie | Score | Cumulative |
|---|---|---|
| `@arenarius`  | 162,840 | 162,840 |
| `@the3rdcord` | 141,214 | 304,054 |
| `@sampleuser` |  83,721 | 387,775 |

Total weight = 387,775. Threshold = `0.4721 × 387,775 = 183,066`.

Walking cumulatively:
- 162,840 < 183,066 → skip
- 304,054 ≥ 183,066 → selected

→ **@the3rdcord** wins Round 3.

Anyone with the scheduled time, BTC block hash, and eligible pool can run the same calculation and arrive at the same answer.

## 8. Verify It Yourself

Every Swarm Post comment includes its own verification block: scheduled time, BTC block hash and height, seed, and result hex. Paste those into a SHA256 calculator and reproduce the selection.

The code is at [INSERT_REPO_URL]. Selection logic lives in `src/lottery/` — pure functions, no hidden state. The lottery unit tests (`tests/selection.test.ts`) include deterministic reproduction cases.

## 9. What Could Break This

Being honest about the attack surface:

- **Bitcoin reorgs.** In practice a block mined at time T is final within ~hours. If someone reorged BTC at depth (extraordinarily rare), the pinned block could change. Mitigated by the scheduled-time pin being hours in the past by the time a round actually posts.
- **API node lies.** The bot asks mempool.space for the block hash; a malicious response could supply a different hash. Mitigated by the public verifiability — anyone can cross-check with a different Bitcoin source and spot the lie.
- **Trust-graph sybils.** If the trust graph itself is captured (e.g., a whale trusting fake onboarders), selection becomes biased toward their picks. Mitigated by the social-proof layer at the intro-post level — vouches need real evidence, and trust is revocable. This is the softest link in the chain and why voter diligence matters.
- **Timing games.** If the bot is late, the scheduled-time pin ensures the seed is still pinned to the original slot's Bitcoin block. The operator can't cherry-pick a later block that favors a preferred newbie.

## 10. What v2 Might Look Like

This is intentionally the simplest design that works. Areas being considered for future iterations:

- **Explicit vouch scoring.** Right now, "vouched" is a binary gate — you're in or out. A later version could separate a continuous vouch-weight dimension from the onboarder-trust score so strong vouches and weak ones have different influence.
- **Adaptive attenuation or depth.** Fixed `0.5^hops` and depth 4 are reasonable guesses, not optimised numbers. As real usage data accumulates, these may be tuned.
- **Beneficiary split tweaks.** 50/50 between newbie and onboarders is a starting position. If onboarder incentives prove too strong (or too weak), the split can move.
- **Replacing the pool-exhaustion behaviour.** If on any given day the eligible pool is smaller than the number of rounds, later rounds currently just skip. A v2 might recycle the pool with cooldowns, or dynamically shrink the day's rounds.

These will come in response to what the system actually does in the wild — not preemptively.

---

*Swarm Post source: [INSERT_REPO_URL]. This post by [@demotruk](/@demotruk); the lottery bot is [@swarmpost](/@swarmpost).*
