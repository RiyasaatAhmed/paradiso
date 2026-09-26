/**
 * The three ways a file can reach the TV.
 *
 * Shared by server and client deliberately: the server decides the mode, the
 * client displays and overrides it, and before this module existed the ladder
 * was declared twice and could drift.
 *
 * Ordered cheapest first. Always prefer the mode that touches the video least.
 */

export const PlaybackMode = {
  /** Bytes served straight off disk. No CPU, native seeking, untouched quality. */
  DIRECT: 'direct',
  /** Streams copied into an MP4 wrapper. Container changes, nothing re-encodes. */
  REMUX: 'remux',
  /** Decoded and re-encoded. Works with anything, costs CPU, loses a little quality. */
  TRANSCODE: 'transcode',
} as const;

export type PlaybackMode = (typeof PlaybackMode)[keyof typeof PlaybackMode];

export const MODE_LADDER: readonly PlaybackMode[] = [
  PlaybackMode.DIRECT,
  PlaybackMode.REMUX,
  PlaybackMode.TRANSCODE,
];

export const MODE_LABELS: Record<PlaybackMode, string> = {
  [PlaybackMode.DIRECT]: 'Direct',
  [PlaybackMode.REMUX]: 'Remux',
  [PlaybackMode.TRANSCODE]: 'Convert',
};

export const MODE_DESCRIPTIONS: Record<PlaybackMode, string> = {
  [PlaybackMode.DIRECT]: 'Streams the file untouched — no CPU use, instant seeking. Best quality.',
  [PlaybackMode.REMUX]:
    'Repackages into MP4 as it streams. Video and audio are copied, not re-encoded, so quality is identical and your laptop barely works.',
  [PlaybackMode.TRANSCODE]:
    'Re-encodes on the fly. Use only if the other two show a black screen — it works everywhere but heats up the laptop.',
};

/** Narrows an untrusted query-string value to a mode. */
export function isPlaybackMode(value: unknown): value is PlaybackMode {
  return typeof value === 'string' && MODE_LADDER.includes(value as PlaybackMode);
}

/** Only a direct stream can seek without restarting ffmpeg. */
export const seeksNatively = (mode: PlaybackMode): boolean => mode === PlaybackMode.DIRECT;

/** The next mode to try after the given ones failed, or null when out of options. */
export function nextModeAfter(attempted: readonly PlaybackMode[]): PlaybackMode | null {
  return MODE_LADDER.find((mode) => !attempted.includes(mode)) ?? null;
}
