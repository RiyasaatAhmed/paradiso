import fsp from 'node:fs/promises';
import path from 'node:path';

import { isProbeFailure } from '../../shared/contracts.ts';
import type { LibraryEntry } from '../catalog/catalog.ts';
import { run } from './ffmpeg.ts';
import type { DescribeFn } from './probe.ts';

// Far enough in to clear distributor logos and black intros, but capped so a
// long film does not pull its thumbnail from the middle of the story.
const FRACTION_INTO_FILE = 0.12;
const EARLIEST_SECONDS = 4;
const LATEST_SECONDS = 600;
const POSTER_WIDTH = 480;

/** Resolves to a file path, or null when no frame could be extracted. */
export type PosterFn = (item: LibraryEntry) => Promise<string | null>;

export function createPosterService({
  posterDir,
  describe,
}: {
  posterDir: string;
  describe: DescribeFn;
}): PosterFn {
  return async function posterFor(item) {
    const output = path.join(posterDir, `${item.id}.jpg`);

    try {
      await fsp.access(output);
      return output; // already generated
    } catch {
      // fall through and make it
    }

    const info = await describe(item);
    if (isProbeFailure(info)) return null;

    const seekTo = Math.max(
      EARLIEST_SECONDS,
      Math.min(info.duration * FRACTION_INTO_FILE || 60, LATEST_SECONDS)
    );

    try {
      await run('ffmpeg', [
        '-nostdin', '-hide_banner', '-loglevel', 'error',
        '-ss', String(seekTo),
        '-i', item.absPath,
        '-map', '0:v:0',
        '-frames:v', '1',
        '-vf', `scale=${POSTER_WIDTH}:-2`,
        '-q:v', '5',
        '-y', output,
      ]);
      return output;
    } catch {
      return null; // the card falls back to a placeholder glyph
    }
  };
}
