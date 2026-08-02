# Deployment

Everything runs on Fly.io as **one app (`hive-swarm-post`) built from one image**, with a
separate scheduled machine per bot. Each machine runs a different entry point by overriding
the container command.

There is no CI. Deploys are manual `flyctl` commands run from a working copy.

> Machine inventory below was read from the live app on **2026-08-02**. Re-verify with
> `fly machines list -a hive-swarm-post` rather than trusting this table blindly.

## The app

| | |
|---|---|
| App | `hive-swarm-post` (Fly org `personal`) |
| Config | `fly.toml` |
| Image | built from `Dockerfile` (node:20-alpine, multi-stage, `npm run build`) |
| Default command | `node dist/index.js` (the lottery — set as `CMD` in the Dockerfile) |
| Latest release | v14, 2026-07-22 |

`fly.toml` holds almost nothing: app name, region, guest size, and two env vars for the
lottery. It does **not** describe the machines — see the caveat below.

## Machines

Three scheduled machines, each a different entry point into the same image:

| Machine | Schedule | Command | Process group | Region |
|---|---|---|---|---|
| `shy-haze-2651` (`0803196a007058`) | hourly | *(Dockerfile default →* `dist/index.js`*)* | `app` | iad |
| `reblog-feeds` (`0803d7dc13d2d8`) | hourly | `node dist/reblog-feeds.js` | `reblog-feeds` | iad |
| `twilight-breeze-2230` (`82d1de5c796068`) | daily | `node dist/rc-delegate.js` | *(none)* | lhr |

Per-machine env (set at machine creation, **not** in `fly.toml`):

- **Lottery** — `BOT_ACCOUNT=swarmpost`, `SYNC_FOLLOWS=true` (these two come from `fly.toml`'s
  `[env]`, so they land on every process-group machine).
- **Reblog feeds** — `TRUSTED_FEED_ACCOUNT=swarm-newbies`, `ALL_FEED_ACCOUNT=newbie-follower`,
  `PERSONAL_FEED_ENABLED=false`, `REBLOG_FEED_DATA_DIR=/app/data/reblog-feeds`.
  Has a 1 GB encrypted volume `reblog_data` mounted at `/app/data` for its state files.
- **RC delegation** — `RC_DELEGATION_ENABLED=true`, `RC_DELEGATOR_ACCOUNT=demotruk`.

A scheduled machine is `stopped` between runs; Fly starts it on the schedule, the process
runs to completion, exits 0, and the machine stops again.

## Secrets

App-wide, shared by all three machines (`fly secrets list -a hive-swarm-post`):

`POSTING_KEY`, `TRUSTED_FEED_POSTING_KEY`, `ALL_FEED_POSTING_KEY`, `RC_DELEGATOR_POSTING_KEY`

Set one with:

```bash
fly secrets set RC_DELEGATOR_POSTING_KEY=5K... -a hive-swarm-post
```

Keys live only in Fly secrets and your local `.env` — never in `fly.toml` or the repo.
Note that `fly secrets set` triggers a new release and restarts machines.

## Deploying a code change

```bash
fly deploy -a hive-swarm-post
```

**This does not necessarily update all three machines.** `fly deploy` acts on machines that
belong to a process group. The RC delegation machine has no process group and none of the
`fly_release_*` metadata the other two carry — the signature of a machine created ad hoc with
`fly machine run` — and at the time of writing it runs a *different* image than the other two.

So after every deploy, check that all three machines are on the new image:

```bash
fly machines list -a hive-swarm-post
```

If the RC machine's image lags, update it explicitly (this preserves its schedule, command,
and env):

```bash
fly machine update 82d1de5c796068 --image registry.fly.io/hive-swarm-post:<deployment-tag> -a hive-swarm-post
```

Take `<deployment-tag>` from the `IMAGE` column of a machine that did update.

## Adding a new scheduled machine

Schedules are a machine-level property and **cannot be expressed in `fly.toml`** — that is why
each bot was stood up by hand and why the inventory above isn't reconstructable from the repo.
The pattern:

```bash
fly machine run . --schedule daily --env FOO=bar -a hive-swarm-post node dist/<entrypoint>.js
```

- The trailing `node dist/<entrypoint>.js` is the critical override. Without it the machine
  runs the lottery, because that is the Dockerfile `CMD`.
- `--schedule` accepts `hourly`, `daily`, `weekly`, `monthly`.
- Prefer per-machine `--env` over app-level `[env]` in `fly.toml` so config doesn't leak onto
  the other bots.
- Record the new machine in the table above.

## Verifying and troubleshooting

```bash
fly machines list -a hive-swarm-post
```

```bash
fly machine status <machine-id> -a hive-swarm-post
```

`machine status` prints an event log — the `start` / `exit` pairs are the run history, and
`exit_code=0` means a clean run.

**Known failure mode: a scheduled machine silently stops firing.** If a run hangs, the machine
stays in state `started` and Fly will not fire the next scheduled run — the bot goes quiet
with no error anywhere. Symptom: `LAST UPDATED` days stale in `fly machines list`, and an
event log whose most recent entry is a `start` with no matching `exit`.

Check this *first* when a bot appears to have stopped working, before digging into eligibility
or trust-graph logic. Recover by restarting the machine:

```bash
fly machine restart <machine-id> -a hive-swarm-post
```

Log retention is short, so a hung run's output is usually gone by the time you notice. For a
manual run against production data without broadcasting, use `DRY_RUN=true` locally instead:

```bash
DRY_RUN=true npm run rc-delegate
```

## Test app

`fly.test.toml` defines `hive-swarm-post-test` (`BOT_ACCOUNT=testingnewuser`, `TEST_MODE=true`).
It is currently **suspended with zero machines**, and its `POSTING_KEY` secret is staged but
never deployed — so it is not a working staging environment as it stands. Deploy it with
`fly deploy -c fly.test.toml` if you want to revive it. See `CLAUDE.md` for what `TEST_MODE`
changes in the posted output.

## Related apps

- **`swarm-trust-api`** — the trust API at `https://swarm-trust-api.fly.dev` (the
  `TRUST_API_URL` default). Separate Fly app, deployed from a different repo.
- The feed server (`npm run feed`) is **not** deployed; it is a local-only tool.
