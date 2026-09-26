import path from 'node:path';

import type { ResumePosition } from '../../shared/contracts.ts';
import { JsonStore } from './jsonStore.ts';

// Below this, the viewer barely started -- not worth offering to resume.
const MIN_RESUME_SECONDS = 30;
// Within this of the end, treat it as finished and forget the position.
const END_CREDITS_SECONDS = 90;

/** Remembers how far into each title the viewer got. */
export class ProgressStore {
  readonly #store: JsonStore<ResumePosition>;

  private constructor(store: JsonStore<ResumePosition>) {
    this.#store = store;
  }

  static async open(cacheDir: string): Promise<ProgressStore> {
    return new ProgressStore(await JsonStore.open<ResumePosition>(path.join(cacheDir, 'progress.json')));
  }

  get all(): Record<string, ResumePosition> {
    return this.#store.all;
  }

  get(id: string): ResumePosition | null {
    return this.#store.get(id) ?? null;
  }

  /**
   * Records a position, or clears it when the title is effectively unwatched or
   * finished -- so "Continue Watching" only ever holds things worth returning to.
   */
  record(id: string, seconds: number, duration: number): void {
    const finished = duration > 0 && seconds > duration - END_CREDITS_SECONDS;
    if (seconds < MIN_RESUME_SECONDS || finished) {
      this.#store.delete(id);
      return;
    }
    this.#store.set(id, { seconds, duration, at: Date.now() });
  }

  flush(): Promise<void> {
    return this.#store.flush();
  }
}
