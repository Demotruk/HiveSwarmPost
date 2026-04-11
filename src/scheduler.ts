/**
 * Determine which lottery rounds should have been posted by now.
 *
 * 10 rounds evenly spaced across 24 hours (UTC):
 *   Round 1:  00:00
 *   Round 2:  02:24
 *   Round 3:  04:48
 *   ...
 *   Round 10: 21:36
 */
export function getRoundSchedule(roundsPerDay: number): number[] {
  const intervalMinutes = (24 * 60) / roundsPerDay;
  const schedule: number[] = [];
  for (let i = 0; i < roundsPerDay; i++) {
    schedule.push(Math.floor(i * intervalMinutes));
  }
  return schedule;
}

/**
 * Get the rounds that should have been posted by the given time,
 * minus any rounds that already exist.
 */
export function getPendingRounds(
  currentMinuteOfDay: number,
  roundsPerDay: number,
  existingRounds: Set<number>,
): number[] {
  const schedule = getRoundSchedule(roundsPerDay);
  const pending: number[] = [];

  for (let i = 0; i < schedule.length; i++) {
    const roundNumber = i + 1;
    if (schedule[i] <= currentMinuteOfDay && !existingRounds.has(roundNumber)) {
      pending.push(roundNumber);
    }
  }

  return pending;
}

/**
 * Get the current minute of day in UTC.
 */
export function currentMinuteOfDayUTC(): number {
  const now = new Date();
  return now.getUTCHours() * 60 + now.getUTCMinutes();
}

/**
 * Get today's date string in YYYY-MM-DD format (UTC).
 */
export function todayUTC(): string {
  const now = new Date();
  return now.toISOString().slice(0, 10);
}
