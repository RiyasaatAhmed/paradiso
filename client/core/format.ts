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

/**
 * A folder is identified by its path relative to the library it was found in,
 * which is what keeps two folders of the same name apart. That path is the
 * wrong thing to put on screen -- "Downloads/The Tom and Jerry Show (2014-2022)"
 * is mostly the route to the thing rather than the thing.
 *
 * So these two split it: the name to show, and the route to offer quietly
 * underneath when there is one worth mentioning.
 */
export function folderName(folder: string): string {
  const segments = folder.split('/').filter(Boolean);
  return segments[segments.length - 1] ?? folder;
}

/** Everything above the folder itself, or an empty string at the top level. */
export function folderParent(folder: string): string {
  const segments = folder.split('/').filter(Boolean);
  return segments.slice(0, -1).join('/');
}
