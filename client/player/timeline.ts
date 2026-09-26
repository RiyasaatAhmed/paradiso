/**
 * The virtual timeline.
 *
 * A remuxed or transcoded stream is produced live by ffmpeg, so it cannot answer
 * byte-range requests and the video element's `currentTime` always begins at
 * zero -- no matter where in the film the stream actually started. The real
 * position is therefore `offset + currentTime`, and *everything* the viewer sees
 * (scrubber, remaining time, subtitles, saved resume point) must read that
 * virtual value rather than the element's own clock.
 *
 * Seeking such a stream means restarting ffmpeg at a new offset. Doing that on
 * every key press would spawn a process per tap, so a requested position is held
 * as `pending` -- shown immediately, acted on only once the viewer stops pressing.
 *
 * Direct streams need none of this: their offset stays zero and the element
 * seeks natively. The same class covers both so the player has one notion of
 * "where are we".
 */

const DEFAULT_DEBOUNCE_MS = 500;

export interface TimelineOptions {
  onRestart: (seconds: number) => void;
  debounceMs?: number;
}

export class VirtualTimeline {
  #offset = 0;
  #pending: number | null = null;
  #timer: ReturnType<typeof setTimeout> | null = null;
  readonly #debounceMs: number;
  readonly #onRestart: (seconds: number) => void;

  constructor({ onRestart, debounceMs = DEFAULT_DEBOUNCE_MS }: TimelineOptions) {
    this.#onRestart = onRestart;
    this.#debounceMs = debounceMs;
  }

  get offset(): number {
    return this.#offset;
  }

  /** True while a restart-based seek is waiting to be committed. */
  get isSeeking(): boolean {
    return this.#pending !== null;
  }

  /** Called whenever a stream (re)starts at a known point in the source. */
  reset(offsetSeconds: number): void {
    this.#offset = offsetSeconds;
    this.#pending = null;
    this.#cancelTimer();
  }

  /**
   * Where the viewer currently is, in seconds from the start of the film.
   * A pending seek wins, so the scrubber tracks the key presses rather than
   * snapping back until the stream catches up.
   */
  position(videoCurrentTime: number | undefined): number {
    if (this.#pending !== null) return this.#pending;
    return this.#offset + (videoCurrentTime || 0);
  }

  /** Clamps a requested position into the film, leaving room before the end. */
  static clamp(target: number, duration: number): number {
    if (target < 0) return 0;
    if (duration > 0 && target > duration - 2) return Math.max(0, duration - 2);
    return target;
  }

  /**
   * Requests a seek on a stream that cannot seek natively.
   * The position is reflected immediately; ffmpeg restarts once presses stop.
   */
  requestSeek(target: number): void {
    this.#pending = target;
    this.#cancelTimer();
    this.#timer = setTimeout(() => {
      const destination = this.#pending;
      this.#timer = null;
      if (destination !== null) this.#onRestart(destination);
    }, this.#debounceMs);
  }

  /** Abandons any pending seek -- used when leaving the player. */
  cancel(): void {
    this.#pending = null;
    this.#cancelTimer();
  }

  #cancelTimer(): void {
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = null;
  }
}
