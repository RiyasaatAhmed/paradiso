import fsp from 'node:fs/promises';
import path from 'node:path';

import { isProbeFailure } from '../../shared/contracts.ts';
import type { LibraryEntry } from '../catalog/catalog.ts';
import { run } from './ffmpeg.ts';
import type { DescribeFn } from './probe.ts';

/** Resolves to WebVTT text, or null when the track cannot be converted. */
export type SubtitlesFn = (item: LibraryEntry, order: number) => Promise<string | null>;

/**
 * Lifts an embedded text subtitle track out of a file as WebVTT.
 *
 * Only text formats (SRT, ASS) can be converted; image-based tracks are marked
 * unusable during probing and never reach here.
 */
export function createSubtitleService({
  cacheDir,
  describe,
}: {
  cacheDir: string;
  describe: DescribeFn;
}): SubtitlesFn {
  return async function subtitlesFor(item, order) {
    const output = path.join(cacheDir, `${item.id}.${order}.vtt`);

    try {
      return await fsp.readFile(output, 'utf8');
    } catch {
      // not extracted yet
    }

    const info = await describe(item);
    if (isProbeFailure(info)) return null;

    const track = info.subs[order];
    if (!track || !track.text) return null;

    await run('ffmpeg', [
      '-nostdin', '-hide_banner', '-loglevel', 'error',
      '-i', item.absPath,
      '-map', `0:${track.index}`,
      '-f', 'webvtt',
      '-y', output,
    ]);

    return fsp.readFile(output, 'utf8');
  };
}
