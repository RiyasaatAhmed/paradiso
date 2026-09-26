/**
 * Decides *how* to deliver a file, and builds the ffmpeg arguments to do it.
 *
 * This module is deliberately pure -- no filesystem, no processes, no ffmpeg.
 * Choosing a playback mode is the one piece of real judgement in the server, so
 * it is kept somewhere it can be reasoned about and tested directly.
 *
 * See shared/playback.ts for what the three modes mean.
 */

import type { AudioTrack, MediaInfo } from '../../shared/contracts.ts';
import { PlaybackMode } from '../../shared/playback.ts';
import type { H264Encoder } from './ffmpeg.ts';

/** What a Samsung Tizen browser will decode. Other TVs are a superset in practice. */
export const PLAYABLE_VIDEO_CODECS: ReadonlySet<string> = new Set(['h264', 'hevc', 'mpeg4', 'vp9']);
export const PLAYABLE_AUDIO_CODECS: ReadonlySet<string> = new Set(['aac', 'mp3']);
/** ...but only when wrapped in one of these. MKV is the usual stumbling block. */
export const PLAYABLE_CONTAINERS: ReadonlySet<string> = new Set(['.mp4', '.m4v', '.mov']);

/** The parts of MediaInfo the decision actually depends on. */
export type PlaybackShape = Pick<MediaInfo, 'container' | 'video' | 'audio'>;

export function chooseMode(info: PlaybackShape): PlaybackMode {
  if (!info.video) return PlaybackMode.TRANSCODE;
  if (!PLAYABLE_VIDEO_CODECS.has(info.video.codec)) return PlaybackMode.TRANSCODE;

  const firstAudio = info.audio[0];
  const audioPlayable = firstAudio === undefined || PLAYABLE_AUDIO_CODECS.has(firstAudio.codec);
  const containerPlayable = PLAYABLE_CONTAINERS.has(`.${info.container}`);

  // Video is fine either way, so the only question is whether anything needs
  // rewrapping or the audio needs swapping -- both are remux territory.
  if (containerPlayable && audioPlayable) return PlaybackMode.DIRECT;
  return PlaybackMode.REMUX;
}

export interface FfmpegArgsOptions {
  inputPath: string;
  info: PlaybackShape;
  /** `direct` never reaches here -- it is served straight off disk. */
  mode: Exclude<PlaybackMode, typeof PlaybackMode.DIRECT>;
  startSeconds?: number;
  audioOrder?: number;
  h264Encoder?: H264Encoder;
}

export function buildFfmpegArgs({
  inputPath,
  info,
  mode,
  startSeconds = 0,
  audioOrder = 0,
  h264Encoder = 'libx264',
}: FfmpegArgsOptions): string[] {
  const audio: AudioTrack | undefined = info.audio[audioOrder] ?? info.audio[0];
  const args = ['-nostdin', '-hide_banner', '-loglevel', 'error'];

  // Seeking before -i makes ffmpeg jump via the index instead of decoding up to
  // the point, which is what makes restart-based seeking feel immediate.
  if (startSeconds > 0) args.push('-ss', String(startSeconds));
  args.push('-i', inputPath);

  // Exactly one video and one audio stream. Cover art is a video stream too,
  // and would otherwise be picked up as a second one.
  args.push('-map', '0:v:0');
  if (audio) args.push('-map', `0:${audio.index}`);
  args.push('-sn', '-dn', '-map_chapters', '-1');

  if (mode === PlaybackMode.REMUX) {
    args.push('-c:v', 'copy');
    // Note: no -tag:v hvc1 for HEVC. Many rips keep their parameter sets in-band
    // behind a stub hvcC; hvc1 requires them out-of-band, so forcing it makes
    // ffmpeg emit a corrupt hvcC that nothing will play. ffmpeg's own choice
    // (hev1) is valid and plays on Tizen.
  } else {
    args.push(...videoEncoderArgs(h264Encoder));
  }

  if (audio) {
    const canCopyAudio = mode === PlaybackMode.REMUX && PLAYABLE_AUDIO_CODECS.has(audio.codec);
    if (canCopyAudio) args.push('-c:a', 'copy');
    else args.push('-c:a', 'aac', '-b:a', '192k', '-ac', '2');
  }

  // Fragmented MP4: playback can begin before ffmpeg knows the total duration,
  // which a normal MP4 header would have to state up front.
  args.push(
    '-movflags', '+frag_keyframe+empty_moov+default_base_moof',
    '-frag_duration', '1000000',
    '-f', 'mp4',
    'pipe:1'
  );

  return args;
}

function videoEncoderArgs(encoder: H264Encoder): string[] {
  const common = ['-profile:v', 'high', '-pix_fmt', 'yuv420p', '-vf', "scale=-2:'min(1080,ih)'", '-g', '48'];

  if (encoder === 'h264_videotoolbox') {
    // Hardware encoding is rate-controlled rather than CRF, and -realtime keeps
    // it pinned to playback speed instead of racing ahead and heating the laptop.
    return [
      '-c:v', 'h264_videotoolbox',
      '-b:v', '6M', '-maxrate', '8M', '-bufsize', '16M',
      '-realtime', 'true',
      ...common,
    ];
  }
  return ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22', '-maxrate', '8M', '-bufsize', '16M', ...common];
}
