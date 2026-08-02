/**
 * Guard a scheduled run against hanging forever.
 *
 * A blocked network read that escapes dhive's per-request `timeout` can leave
 * the process asleep indefinitely (STAT S, no CPU) — `withRetry` never fires
 * because the call neither resolves nor rejects. On a Fly scheduled machine a
 * process that never exits keeps the machine in `started`, and Fly only fires
 * the next scheduled run once the machine is `stopped`. So a single hung read
 * dead-mans every future run: this silently killed the daily RC delegation job
 * for a week (Jul 2026) with no error surfaced anywhere.
 *
 * Arm this at the top of each entry point. After `minutes` it forces exit(1),
 * so Fly's on-failure restart policy recovers and the machine returns to
 * `stopped` for the next schedule. `.unref()` keeps the timer from holding the
 * event loop open on a normal, timely completion.
 *
 * The timeout is generous on purpose — a real run finishes in minutes, so any
 * value well above that both spares legitimate runs and still recovers a hang
 * within one schedule interval. Override with RUN_TIMEOUT_MINUTES if needed.
 */
export function startWatchdog(defaultMinutes: number): void {
  const override = Number(process.env.RUN_TIMEOUT_MINUTES);
  const minutes = Number.isFinite(override) && override > 0 ? override : defaultMinutes;
  setTimeout(() => {
    console.error(
      `Watchdog: run exceeded ${minutes}m without completing — forcing exit(1) ` +
        `so the next scheduled run is not blocked.`,
    );
    process.exit(1);
  }, minutes * 60 * 1000).unref();
}
