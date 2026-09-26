import type { Config } from '../config.ts';
import type { Catalog } from '../catalog/catalog.ts';
import type { H264Encoder } from '../media/ffmpeg.ts';
import type { PosterFn } from '../media/posters.ts';
import type { DescribeFn } from '../media/probe.ts';
import type { SubtitlesFn } from '../media/subtitles.ts';
import type { ProgressStore } from '../storage/progressStore.ts';

/**
 * Everything the HTTP layer depends on, constructed in main.ts and passed down.
 *
 * Routes receive this rather than importing singletons, which is what lets them
 * be exercised against stand-ins and keeps wiring in exactly one file.
 */
export interface Services {
  config: Config;
  catalog: Catalog;
  progress: ProgressStore;
  describe: DescribeFn;
  posterFor: PosterFn;
  subtitlesFor: SubtitlesFn;
  h264Encoder: H264Encoder;
  publicDir: string;
}
