import { execFile, spawn, type ChildProcessByStdio } from 'node:child_process';
import type { Readable } from 'node:stream';

const MAX_OUTPUT = 64 * 1024 * 1024; // ffprobe JSON for a long file can be large

/** H.264 encoders we know how to drive, in order of preference. */
export type H264Encoder = 'h264_videotoolbox' | 'libx264';

/** Run a tool to completion and resolve with its stdout. */
export function run(command: string, args: readonly string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(command, args, { maxBuffer: MAX_OUTPUT }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr || err.message));
      else resolve(stdout);
    });
  });
}

/** stdin is ignored, so the type says so: only stdout and stderr are streams. */
export type FfmpegProcess = ChildProcessByStdio<null, Readable, Readable>;

/** Start ffmpeg with stdout as a readable stream, for piping to a response. */
export function spawnFfmpeg(args: readonly string[]): FfmpegProcess {
  return spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
}

export async function assertFfmpegAvailable(): Promise<void> {
  try {
    await run('ffmpeg', ['-version']);
    await run('ffprobe', ['-version']);
  } catch {
    throw new Error('ffmpeg and ffprobe are required. Install them with:  brew install ffmpeg');
  }
}

/**
 * Picks the H.264 encoder to use when a file has to be re-encoded.
 *
 * VideoToolbox hands the work to Apple Silicon's media engine, which is both far
 * faster than libx264 and leaves the CPU free -- worth detecting once at boot.
 */
export async function detectH264Encoder(): Promise<H264Encoder> {
  try {
    const encoders = await run('ffmpeg', ['-hide_banner', '-encoders']);
    return encoders.includes('h264_videotoolbox') ? 'h264_videotoolbox' : 'libx264';
  } catch {
    return 'libx264';
  }
}
