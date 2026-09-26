import fsp from 'node:fs/promises';
import path from 'node:path';

export const VIDEO_EXTENSIONS: ReadonlySet<string> = new Set([
  '.mp4', '.m4v', '.mkv', '.mov', '.avi', '.webm',
  '.ts', '.m2ts', '.wmv', '.flv', '.mpg', '.mpeg',
]);

export interface ScanOptions {
  libraries: string[];
  maxDepth: number;
  isExcludedDir: (name: string) => boolean;
}

const isVideo = (name: string): boolean => VIDEO_EXTENSIONS.has(path.extname(name).toLowerCase());

/**
 * Walks the configured folders and returns absolute paths of every video found.
 *
 * Unreadable folders are skipped rather than thrown: one permission-denied
 * directory should never take down a scan of the whole library.
 */
export async function findVideoFiles({ libraries, maxDepth, isExcludedDir }: ScanOptions): Promise<string[]> {
  const found: string[] = [];

  async function walk(dir: string, depthRemaining: number): Promise<void> {
    let entries;
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const absolute = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        if (depthRemaining > 0 && !isExcludedDir(entry.name)) {
          await walk(absolute, depthRemaining - 1);
        }
      } else if (entry.isFile() && isVideo(entry.name)) {
        found.push(absolute);
      }
    }
  }

  for (const library of libraries) await walk(library, maxDepth);
  return found;
}
