import fs from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';

import { PlaybackMode } from '../../shared/playback.ts';
import type { LibraryEntry } from '../catalog/catalog.ts';
import { log } from '../support/log.ts';
import { parseByteRange, UNSATISFIABLE } from './byteRange.ts';
import { spawnFfmpeg, type H264Encoder } from './ffmpeg.ts';
import { buildFfmpegArgs, type PlaybackShape } from './playbackPolicy.ts';

const READ_CHUNK = 1 << 20; // 1 MiB: fewer, larger reads keep the pipe full

const contentTypeFor = (absPath: string): string =>
  path.extname(absPath).toLowerCase() === '.webm' ? 'video/webm' : 'video/mp4';

/**
 * Serves the file straight off disk with byte-range support.
 *
 * This is the cheapest path in the whole server: no ffmpeg, no re-encoding, and
 * the browser gets real seeking because it can ask for any range it likes.
 */
export function streamFile(req: IncomingMessage, res: ServerResponse, item: LibraryEntry): void {
  const total = item.size;
  const range = parseByteRange(req.headers.range, total);

  if (range === UNSATISFIABLE) {
    res.writeHead(416, { 'Content-Range': `bytes */${total}` });
    res.end();
    return;
  }

  const { start, end } = range ?? { start: 0, end: total - 1 };
  const isPartial = range !== null;

  res.writeHead(isPartial ? 206 : 200, {
    'Content-Type': contentTypeFor(item.absPath),
    'Content-Length': end - start + 1,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-store',
    ...(isPartial && { 'Content-Range': `bytes ${start}-${end}/${total}` }),
  });

  if (req.method === 'HEAD') {
    res.end();
    return;
  }

  const file = fs.createReadStream(item.absPath, { start, end, highWaterMark: READ_CHUNK });
  file.pipe(res);
  res.on('close', () => file.destroy());
}

export interface TranscodeOptions {
  item: LibraryEntry;
  info: PlaybackShape;
  mode: Exclude<PlaybackMode, typeof PlaybackMode.DIRECT>;
  startSeconds: number;
  audioOrder: number;
  h264Encoder: H264Encoder;
}

/**
 * Runs ffmpeg and pipes its output to the response.
 *
 * Two details matter here:
 *
 *   Backpressure. `pipe` propagates it, so ffmpeg produces at the speed the TV
 *   consumes rather than racing ahead and buffering a film into memory.
 *
 *   Cleanup. The process must die the moment the client disconnects, or every
 *   seek would leave an orphan transcode running for the rest of the film.
 */
export function streamTranscode(
  req: IncomingMessage,
  res: ServerResponse,
  { item, info, mode, startSeconds, audioOrder, h264Encoder }: TranscodeOptions
): void {
  const args = buildFfmpegArgs({ inputPath: item.absPath, info, mode, startSeconds, audioOrder, h264Encoder });

  log.info(`${mode} "${item.title}" from ${Math.round(startSeconds)}s`);
  const ffmpeg = spawnFfmpeg(args);

  let stderr = '';
  ffmpeg.stderr.on('data', (chunk: Buffer) => {
    stderr = (stderr + chunk.toString()).slice(-4000);
  });

  res.writeHead(200, {
    'Content-Type': 'video/mp4',
    // A live pipe cannot answer byte ranges; the client seeks by restarting instead.
    'Accept-Ranges': 'none',
    'Cache-Control': 'no-store',
    Connection: 'close',
  });

  ffmpeg.stdout.pipe(res);

  const kill = (): void => {
    if (!ffmpeg.killed) ffmpeg.kill('SIGKILL');
  };
  res.on('close', kill);
  req.on('aborted', kill);

  ffmpeg.on('error', (err: Error) => {
    log.error(`ffmpeg failed to start: ${err.message}`);
    res.destroy();
  });

  ffmpeg.on('close', (code: number | null) => {
    // 255 is ffmpeg's own code for "killed", which is the normal path here.
    if (code && code !== 255 && !res.writableEnded) {
      log.error(`ffmpeg exited ${code}: ${stderr.trim().split('\n').slice(-3).join(' | ')}`);
    }
    if (!res.writableEnded) res.end();
  });
}
