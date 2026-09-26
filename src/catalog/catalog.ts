import crypto from 'node:crypto';
import fsp from 'node:fs/promises';
import path from 'node:path';
import type { Stats } from 'node:fs';

import type { LibraryItem, ProbeResult } from '../../shared/contracts.ts';
import { isProbeFailure } from '../../shared/contracts.ts';
import type { Config } from '../config.ts';
import { formatSize } from '../support/format.ts';
import { findVideoFiles } from './scanner.ts';
import { episodeOrder, prettyTitle } from './titles.ts';

/** A library item plus the absolute path, which only the server may see. */
export interface LibraryEntry extends LibraryItem {
  absPath: string;
}

/**
 * Identifiers are a hash of the absolute path rather than the path itself.
 *
 * That keeps filesystem layout out of URLs, and means a request can only ever
 * name a file the scan already found -- there is no path for a caller to
 * manipulate, so traversal is impossible by construction rather than by filter.
 */
const idFor = (absolutePath: string): string =>
  crypto.createHash('sha1').update(absolutePath).digest('hex').slice(0, 12);

/**
 * Reading a file's metadata. Declared structurally rather than imported from
 * `src/media`, so the catalog stays a description of what is on disk and does
 * not gain a dependency on the half of the app that decodes it.
 */
type DescribeFn = (entry: LibraryEntry) => Promise<ProbeResult>;

/**
 * How many files to read at once while warming durations.
 *
 * ffprobe is mostly waiting on the disk, so running one at a time wastes the
 * machine and running hundreds thrashes it. Eight keeps a 325-file folder to a
 * few seconds, and every result is cached by size and mtime, so this cost is
 * paid once per file rather than once per start.
 */
const PROBE_CONCURRENCY = 8;

/** The library: what was found on disk, and how to look it up by id. */
export class Catalog {
  readonly #config: Config;
  readonly #probe: DescribeFn | null;
  #entries: LibraryEntry[] = [];
  #byId = new Map<string, LibraryEntry>();

  constructor(config: Config, describe: DescribeFn | null = null) {
    this.#config = config;
    this.#probe = describe;
  }

  get size(): number {
    return this.#entries.length;
  }

  find(id: string): LibraryEntry | null {
    return this.#byId.get(id) ?? null;
  }

  /** Everything a client needs, minus the absolute path. */
  toPublicJSON(): LibraryItem[] {
    return this.#entries.map(({ absPath: _absPath, ...rest }) => rest);
  }

  async scan(): Promise<void> {
    const paths = await findVideoFiles(this.#config);
    const entries: LibraryEntry[] = [];

    for (const absPath of paths) {
      let stats: Stats;
      try {
        stats = await fsp.stat(absPath);
      } catch {
        continue; // vanished between walk and stat
      }
      entries.push(this.#describe(absPath, stats));
    }

    entries.sort((a, b) => b.mtime - a.mtime);
    this.#entries = entries;
    this.#byId = new Map(entries.map((entry) => [entry.id, entry]));

    await this.#fillDurations(entries);
  }

  /**
   * Reads running times so the library can show them without the client having
   * to ask per file -- three hundred requests to draw one screen.
   *
   * A file that cannot be read keeps a null duration rather than failing the
   * scan: one corrupt download should not cost you the rest of the library.
   */
  async #fillDurations(entries: LibraryEntry[]): Promise<void> {
    const describe = this.#probe;
    if (!describe) return;

    let next = 0;
    const worker = async (): Promise<void> => {
      while (next < entries.length) {
        const entry = entries[next++];
        if (!entry) return;
        try {
          const probed = await describe(entry);
          entry.duration = isProbeFailure(probed) ? null : Math.round(probed.duration);
        } catch {
          entry.duration = null;
        }
      }
    };

    const workers = Array.from({ length: Math.min(PROBE_CONCURRENCY, entries.length) }, worker);
    await Promise.all(workers);
  }

  #describe(absPath: string, stats: Stats): LibraryEntry {
    const library = this.#config.libraries.find((lib) => absPath.startsWith(lib + path.sep));
    const folderBase = library ? path.dirname(library) : path.dirname(absPath);
    const file = path.basename(absPath);

    return {
      id: idFor(absPath),
      absPath,
      file,
      title: prettyTitle(file),
      episode: episodeOrder(file),
      // Filled by the warm-up at the end of the scan.
      duration: null,
      folder: path.relative(folderBase, path.dirname(absPath)) || path.basename(folderBase),
      size: stats.size,
      sizeLabel: formatSize(stats.size),
      mtime: stats.mtimeMs,
    };
  }
}
