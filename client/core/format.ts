/** Pure formatting helpers. No DOM, so these are unit-tested directly. */

/** Clock format for a position within a film: "45:56", "1:12:30". */
export function formatClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const whole = Math.floor(seconds);
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const secs = whole % 60;

  const mm = hours > 0 && minutes < 10 ? `0${minutes}` : String(minutes);
  const ss = secs < 10 ? `0${secs}` : String(secs);
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

/**
 * Duration in words: "1h 12m", "1h", "23m".
 * Netflix states time remaining this way rather than as a ticking countdown --
 * it is easier to read at a glance from across a room.
 */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const totalMinutes = Math.round(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 0) return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
  return `${Math.max(1, minutes)}m`;
}
