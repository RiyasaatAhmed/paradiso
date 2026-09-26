import fsp from 'node:fs/promises';
import path from 'node:path';

import { log } from '../support/log.ts';

/**
 * A small JSON file held in memory and written back in the background.
 *
 * Writes are queued rather than concurrent: two saves racing on the same file
 * can interleave and leave invalid JSON behind. Callers never await a save --
 * losing the last few seconds of a resume position is not worth blocking a
 * request for.
 */
export class JsonStore<T> {
  readonly #file: string;
  readonly #data: Record<string, T>;
  #queue: Promise<void> = Promise.resolve();

  private constructor(file: string, initial: Record<string, T>) {
    this.#file = file;
    this.#data = initial;
  }

  static async open<T>(file: string): Promise<JsonStore<T>> {
    let data: Record<string, T> = {};
    try {
      data = JSON.parse(await fsp.readFile(file, 'utf8')) as Record<string, T>;
    } catch {
      // Missing or corrupt: start clean. This file is a cache, never a source of truth.
    }
    await fsp.mkdir(path.dirname(file), { recursive: true });
    return new JsonStore<T>(file, data);
  }

  get all(): Record<string, T> {
    return this.#data;
  }

  get(key: string): T | undefined {
    return this.#data[key];
  }

  set(key: string, value: T): void {
    this.#data[key] = value;
    this.#save();
  }

  delete(key: string): void {
    delete this.#data[key];
    this.#save();
  }

  /** Only needed on shutdown, or in tests that assert on the file. */
  flush(): Promise<void> {
    return this.#queue;
  }

  #save(): void {
    this.#queue = this.#queue.then(() =>
      fsp
        .writeFile(this.#file, JSON.stringify(this.#data))
        .catch((err: Error) => log.warn(`could not write ${path.basename(this.#file)}: ${err.message}`))
    );
  }
}
