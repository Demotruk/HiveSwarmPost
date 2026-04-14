# The Hive Swarm Post

![swarm-post-header](https://files.peakd.com/file/peakd-hive/demotruk/23vhMrK7JCfo54PqqJ198PXNbcmd9kT3LJiCSLNk6P8F2KX6aE9LspF4tqNeSehAGEqZa.png)

This post allocates beneficiary rewards to a randomly pre-selected new hiver and the accounts that onboarded them.

## How It Works

Every day, the `@swarmpost` bot publishes a root post and up to 10 comments throughout the day. Each is a lottery round that selects 1 newbie from the eligible pool. Rewards are split between the newbie and their onboarder(s):

| Recipient | Share |
|-----------|-------|
| Newbie | 50% |
| Their onboarder(s) | 50% |

That's it. 10 newbies funded per day. Up to 300 per month. All you have to do is vote.

## Who Gets Selected?

Not random accounts. Not sybils. Newbies who:

- Were **created in the last 30 days**
- Published an **introduction post with a photo**
- Have **net positive voting weight from web-of-trust participants** on their introduction post (i.e., the sum of `rshares` from accounts in the trust graph must be > 0)
- Are **actively posting** (more activity = better odds, with diminishing returns)

The more active and well-connected the newbie, the better their chances. But every eligible newcomer has a shot.

## The Trust Layer

Selection is powered by the [web of trust](https://hiveinvite.com/trust/). If you've declared trust in onboarders on HiveInvite, you have already influenced the selection of who became beneficiary for this post, and you can influence how this is allocated going forward.

Here's how it flows:

1. **You vote on the Swarm Post** — this activates your trust declarations
2. **Your HP weights your trust** — more stake = more influence on who gets funded
3. **Trust propagates through degrees** — if you trust Alice and Alice trusts Bob, Bob's newbies benefit from your support, but at reduced weight

Only voters' trust declarations are active. Voting on the Swarm Post is saying: *"I endorse this system and want my trust to count."*

**Vouching strengthens the signal.** If you're in the web of trust and you come across an `introduceyourself` post, your upvote is a vouch — its weight is your HP, propagated through the trust graph. The Swarm Post works better when those vouches reflect real social proof: a selfie with the onboarder, a geotagged checkin, a photo with real-world context. If that kind of evidence is there, upvote with confidence. If it isn't, your restraint is part of the mechanism too.

## Why Onboarders Get Paid Too

This is deliberate. The 50/50 split between newbies and their onboarders creates a direct financial incentive to:

- Bring in **real people** (sybils dilute your rewards across more accounts)
- **Support them after onboarding** (active newbies score higher)
- **Maintain quality** (your trust is revocable if you start gaming the system)

The best strategy is the honest one: find real humans, help them get started, and watch them stick around.

## Sybil Resistance

Every incentive system gets tested. Here's why gaming this one is hard:

- **Trust requires real stake** — sybil accounts don't generate trust; real stakeholders do
- **Each newbie needs a real introduction** — photo, public post, approval from a trusted member
- **Onboarder dilution** — more fake accounts = less reward per account, with constant effort per sybil
- **Trust is revocable** — get caught, lose everything instantly
- **The lottery is verifiable** — selection uses Bitcoin block hashes as randomness seeds, so anyone can independently audit every round

## Verifiable Randomness

Each lottery round is seeded by a Bitcoin block hash — unpredictable before it happens, publicly verifiable after. The full selection algorithm is deterministic: given the same inputs, anyone can reproduce the result and confirm the right newbies were chosen.

No trusted operator. No hidden RNG. Just math and public data.

## How to Participate

**As a voter/stakeholder:**
1. Vote on the daily `@swarmpost` post — that's all it takes to fund newbie onboarding
2. [Declare trust](https://hiveinvite.com/trust/) in onboarders you believe in — your trust shapes who gets funded

**As an onboarder:**
1. Keep doing what you're doing — bring real people to Hive
2. Make sure your newbies publish an introduction post tagged `introduceyourself` with a photo
3. Get them engaged — posting activity improves their lottery odds

**As a new user:**
1. Publish your introduction post with a photo and the `introduceyourself` tag
2. Start posting and commenting — engagement improves your chances
3. That's it — if you're eligible, you're automatically in the lottery

## The Burn Post Grows the Network

The burn post has been one of Hive's most successful experiments. Simple mechanism, community-driven, no trust required. The Swarm Post takes the same model and points it at growth.

Where the burn post reduces supply, the Swarm Post increases demand — by funding the people who are actually growing the user base.

They complement each other. And they work the same way: just vote.

---

*The Swarm Post bot, trust system, and selection algorithm are fully open source. Questions, feedback, or ideas? Drop a comment below.*

*Built with the help of [Claude](https://claude.ai) by Anthropic.*
