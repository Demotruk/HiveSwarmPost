# The Hive Swarm Post

![swarm-post-header](https://files.peakd.com/file/peakd-hive/demotruk/23vhMrK7JCfo54PqqJ198PXNbcmd9kT3LJiCSLNk6P8F2KX6aE9LspF4tqNeSehAGEqZa.png)

This post allocates beneficiary rewards to a randomly pre-selected new hiver and the accounts that onboarded them.

## How It Works

Every day, the `@swarmpost` bot publishes a root post and up to 10 comments throughout the day. Each is a lottery round that selects 1 newbie from the eligible pool. Rewards are split between the newbie and their onboarder(s):

| Recipient | Share |
|-----------|-------|
| Newbie | 50% |
| Their onboarder(s) | 50% |

That's it. Up to 10 newbies funded per day, up to 300 per month. All you have to do is vote.

## Who Gets Selected?

To qualify as a beneficiary, a new account must meet all of these:

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

## A Feed for Curators

The `@swarmpost` account also **follows every potentially eligible newbie** — not just the ones who've already qualified for the lottery, but any account a trusted onboarder has created recently. That means its follow feed is a live, trust-filtered stream of newly-onboarded Hive users.

You don't have to wait for the lottery to support someone. Visit [@swarmpost's feed](https://peakd.com/@swarmpost/feed) and you'll see real newbies as they appear. This part of the design is directly inspired by [@pioneersupporter](/@pioneersupporter), which provides a feed of all new users brought in by CheckInWithXYZ.

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
3. Follow `@swarmpost` — its feed is a live, trust-filtered stream of newly-onboarded users worth supporting directly

**As an onboarder:**
1. Keep doing what you're doing — bring real people to Hive
2. Make sure your newbies publish an introduction post tagged `introduceyourself` with a photo
3. Get them engaged — posting activity improves their lottery odds

**As a new user:**
1. Publish your introduction post with a photo and the `introduceyourself` tag
2. Start posting and commenting — engagement improves your chances
3. That's it — if you're eligible, you're automatically in the lottery

## Onboarding Must Scale Beyond the Hive Believers

In practice, most onboarding on Hive today is done by a small group of highly-motivated users — people ideologically invested in the platform who put in the day-to-day work of bringing newcomers in, and whose posts about that work get curated by whales. It's a real model, it gives us the best retention that we have, and the people doing it deserve real credit. But it doesn't scale. The supply of invested and established Hive users is always going to be small; there are only so many people who will learn the chain deeply, evangelize it in their communities, and put their reputation behind newcomers for the love of it.

The onboarders that would take Hive to the next order of magnitude likely aren't deeply committed to Hive. They're community organizers, event runners, people embedded in local networks the current core can't reach. They'll onboard if it's worth their time and pays back, and not otherwise.

The Swarm Post is that payback — and it's for everyone doing the work, not just new entrants. For the established core that's been onboarding on love and curation, years of uncompensated effort convert into direct, per-newbie income, with no need to post about the work or wait for a curator to notice. For community organizers who would onboard if the economics added up, it's a working reason to start. Either way: a direct, automatic share of rewards every time a newbie you brought in gets selected.

If you run an onboarding initiative — CheckInWithXYZ, OCD, a community program, or just a habit of walking friends through sign-up — this is built for you. The onboarders this reaches go wider than the people already deeply invested in Hive. Community builders, event runners, educators, local organizers — they have the networks Hive wants to connect to, and they'll include Hive in their work when the economics make it worth including. This is the economics.

---

*The Swarm Post bot, trust system, and selection algorithm are fully open source. Questions, feedback, or ideas? Drop a comment below.*

*Built with the help of [Claude](https://claude.ai) by Anthropic.*
