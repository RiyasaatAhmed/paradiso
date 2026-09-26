import path from 'node:path';

import type { AudioTrack, MediaInfo, ProbeResult, SubtitleTrack } from '../../shared/contracts.ts';
import type { LibraryEntry } from '../catalog/catalog.ts';
import type { MetadataCache } from '../storage/metadataCache.ts';
import { run } from './ffmpeg.ts';
import { chooseMode } from './playbackPolicy.ts';

/** The slice of ffprobe's JSON we rely on. Its raw output does not escape this file. */
interface FfprobeStream {
  index: number;
  codec_type?: string;
  codec_name?: string;
  width?: number;
  height?: number;
  profile?: string;
  channels?: number;
  disposition?: { attached_pic?: number };
  tags?: { language?: string; title?: string };
}

interface FfprobeOutput {
  streams?: FfprobeStream[];
  format?: { duration?: string; bit_rate?: string };
}

// Subtitles that are pictures, not text. They cannot become WebVTT, so the UI
// must not offer them.
const IMAGE_SUBTITLE_CODECS: ReadonlySet<string> = new Set([
  'hdmv_pgs_subtitle', 'dvd_subtitle', 'dvb_subtitle',
]);
const COVER_ART_CODECS: ReadonlySet<string> = new Set(['png', 'mjpeg', 'bmp', 'gif']);

/** Cover art is stored as a video stream; it must not be mistaken for the film. */
const isCoverArt = (stream: FfprobeStream): boolean =>
  COVER_ART_CODECS.has(stream.codec_name ?? '') || stream.disposition?.attached_pic === 1;

/**
 * Reads a file's structure with ffprobe and normalises it into the shape the
 * rest of the app uses.
 */
export async function probeFile(absPath: string): Promise<MediaInfo> {
  const raw = await run('ffprobe', [
    '-v', 'error',
    '-print_format', 'json',
    '-show_format',
    '-show_streams',
    absPath,
  ]);

  const parsed = JSON.parse(raw) as FfprobeOutput;
  const streams = parsed.streams ?? [];

  const video = streams.find((s) => s.codec_type === 'video' && !isCoverArt(s));
  const audio: AudioTrack[] = streams
    .filter((s) => s.codec_type === 'audio')
    .map((stream, order) => ({
      index: stream.index,
      order,
      codec: stream.codec_name ?? 'unknown',
      channels: stream.channels ?? 0,
      lang: stream.tags?.language ?? '',
      title: stream.tags?.title ?? '',
    }));
  const subs: SubtitleTrack[] = streams
    .filter((s) => s.codec_type === 'subtitle')
    .map((stream, order) => ({
      index: stream.index,
      order,
      codec: stream.codec_name ?? 'unknown',
      lang: stream.tags?.language ?? '',
      title: stream.tags?.title ?? '',
      text: !IMAGE_SUBTITLE_CODECS.has(stream.codec_name ?? ''),
    }));

  const shape = {
    container: path.extname(absPath).toLowerCase().slice(1),
    video: video
      ? {
          codec: video.codec_name ?? 'unknown',
          width: video.width ?? 0,
          height: video.height ?? 0,
          profile: video.profile,
        }
      : null,
    audio,
  };

  return {
    ...shape,
    duration: Number(parsed.format?.duration) || 0,
    bitrate: Number(parsed.format?.bit_rate) || 0,
    subs,
    mode: chooseMode(shape),
  };
}

/** Probes a file, or returns a cached result. */
export type DescribeFn = (item: LibraryEntry) => Promise<ProbeResult>;

/**
 * Probing is slow, so results are cached by content identity.
 * A file that cannot be probed caches its failure too, rather than retrying on
 * every request for a card the viewer keeps scrolling past.
 */
export function createProbeService(cache: MetadataCache): DescribeFn {
  return async function describe(item) {
    const cached = cache.get(item);
    if (cached) return cached;

    let result: ProbeResult;
    try {
      result = await probeFile(item.absPath);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      result = { error: message.split('\n')[0] || 'could not read this file' };
    }

    cache.set(item, result);
    return result;
  };
}
