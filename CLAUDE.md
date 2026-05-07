# HiveSwarmPost

Automated Hive blockchain bot that distributes onboarding rewards to new accounts via a trust-weighted, cryptographically-verified lottery.

## Tech Stack

- TypeScript (strict mode), Node.js v20
- `@hiveio/dhive` for blockchain interaction
- Vitest for testing
- Deployed on Fly.io (hourly scheduled machine)

## Commands

```bash
npm install          # Install dependencies
npm run build        # Compile TS to dist/
npm run start        # Production run (node dist/index.js)
npm run dev          # Dev run (tsx src/index.ts)
npm run simulate     # Offline simulation with fixtures
npm run feed         # HTTP feed server (port 3000)
npm run reblog-feeds # Reblog feed bots (3 feeds: trusted, all, personal)
npm run test         # Run tests (vitest)
npm run test:watch   # Watch mode
```

## Project Structure

- `src/index.ts` — Main orchestrator (checks pending rounds, builds trust graph, selects winners, posts)
- `src/config.ts` — Config from env vars with defaults
- `src/types.ts` — All TypeScript interfaces
- `src/hive/` — Blockchain interactions (client, accounts, posts, follows, trust ops)
- `src/lottery/` — Selection algorithm (weighted random, Bitcoin block seed, beneficiaries)
- `src/newbies/` — Eligibility pool building, activity scoring
- `src/trust/` — Trust graph (BFS with hop attenuation), voter discovery
- `src/posting/` — Post/comment generation and markdown templates
- `src/reblog-feeds.ts` — Reblog feed bots entry point (3 feeds in one cycle)
- `src/reblog/` — Reblog feed logic (trustedFeed, allFeed, personalFeed, shared utilities)
- `src/hive/blocks.ts` — Block-range scanning for account creation ops
- `src/hive/reblog.ts` — Reblog broadcast operation
- `src/hive/transfers.ts` — Incoming transfer history scanning
- `src/hive/accountCreate.ts` — Claimed account creation for Feed 3
- `src/hive/delegation.ts` — HP delegation for Feed 3 managed accounts
- `src/feed/` — Feed server (pool collection, HTML rendering)
- `tests/` — Unit tests (selection, trust-graph, beneficiaries, activity, scheduler)

## Key Architecture

- **Deterministic lottery**: SHA256(Bitcoin block hash + constant + date + round) seeds weighted random selection
- **Trust graph**: BFS from voter roots with configurable attenuation (0.5^hops) and depth cap
- **Eligibility**: Account age within 30-day window, intro post with `introduceyourself` tag, net positive votes from trust network, activity weight (logarithmic)
- **Daily structure**: 1 root post/day, 10 rounds spaced evenly in UTC. Round 1 in root post, rounds 2-10 as comments. Permlinks: `swarm-post-YYYY-MM-DD-round-N`
- **Beneficiaries**: 25% newbie, 12.5% creator, 12.5% referrer (or 25% creator if no referrer)
- **Error handling**: `withRetry()` wrapper with exponential backoff for flaky Hive nodes

## Configuration

Via `.env` (see `.env.example`). Key vars: `POSTING_KEY`, `BOT_ACCOUNT`, `DRY_RUN`, `TEST_MODE`, `TRUST_API_URL`, `SYNC_FOLLOWS`, `ROUNDS_PER_DAY`, `NEWBIES_PER_ROUND`.

- **`TEST_MODE=true`**: Posts with "DO NOT UPVOTE" warnings, broken `@mentions` (zero-width space prevents notifications), obscured descriptions, test-specific permlinks (`swarm-test-*`) and tags (`test`, `swarmpost-test`). On-chain beneficiaries are rewritten to a single `@null` entry (see `src/posting/beneficiariesTestMode.ts`) so the `comment_options` op doesn't notify real users — the body text still shows the would-be split for test inspection. Use with the `@swarmpost-test` account.

## Detailed Spec

See `requirements.md` for the full 17K-word specification covering governance, trust model, selection algorithm, and deployment.
