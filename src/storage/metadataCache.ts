import path from 'node:path';

import type { ProbeResult } from '../../shared/contracts.ts';
import type { LibraryEntry } from '../catalog/catalog.ts';
import { JsonStore } from './jsonStore.ts';

/**
 * Caches ffprobe results, which are slow enough to be worth never repeating.
 *
 * The key includes size and mtime, so replacing a file with a different cut of
 * the same name invalidates the entry instead of serving stale dimensions.
 */
export class MetadataCache {
  readonly #store: JsonStore<ProbeResult>;

  private constructor(store: JsonStore<ProbeResult>) {
    this.#store = store;
  }

  static async open(cacheDir: string): Promise<MetadataCache> {
    return new MetadataCache(await JsonStore.open<ProbeResult>(path.join(cacheDir, 'metadata.json')));
  }

  static keyFor(item: LibraryEntry): string {
    return `${item.id}:${item.size}:${Math.round(item.mtime)}`;
  }

  get(item: LibraryEntry): ProbeResult | null {
    return this.#store.get(MetadataCache.keyFor(item)) ?? null;
  }

  set(item: LibraryEntry, metadata: ProbeResult): void {
    this.#store.set(MetadataCache.keyFor(item), metadata);
  }
}
