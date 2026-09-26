import crypto from 'node:crypto';
import fsp from 'node:fs/promises';
import path from 'node:path';
import type { Stats } from 'node:fs';

import type { LibraryItem } from '../../shared/contracts.ts';
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

/** The library: what was found on disk, and how to look it up by id. */
export class Catalog {
  readonly #config: Config;
  #entries: LibraryEntry[] = [];
  #byId = new Map<string, LibraryEntry>();

  constructor(config: Config) {
    this.#config = config;
  }

  get size(): number {
    return this.#entries.length;
  }

  /** How many survive the size filter -- i.e. what the TV shows by default. */
  get featuredCount(): number {
    return this.#entries.filter((entry) => !entry.small).length;
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
      folder: path.relative(folderBase, path.dirname(absPath)) || path.basename(folderBase),
      size: stats.size,
      sizeLabel: formatSize(stats.size),
      mtime: stats.mtimeMs,
      // Not hidden, just demoted: the UI filters these out until asked otherwise.
      small: stats.size < this.#config.minSizeBytes,
    };
  }
}
