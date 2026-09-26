import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { AudioTrack } from '../shared/contracts.ts';
import { buildFfmpegArgs, chooseMode, type PlaybackShape } from '../src/media/playbackPolicy.ts';
import { PlaybackMode } from '../shared/playback.ts';

/** Builds the minimum a playback decision needs, so tests read as intent. */
function file({
  container = 'mkv',
  video = 'h264' as string | null,
  audio = 'aac' as string | null,
}: { container?: string; video?: string | null; audio?: string | null } = {}): PlaybackShape {
  const audioTracks: AudioTrack[] = audio
    ? [{ index: 1, order: 0, codec: audio, channels: 2, lang: 'eng', title: '' }]
    : [];
  return {
    container,
    video: video ? { codec: video, width: 1920, height: 1080 } : null,
    audio: audioTracks,
  };
}

describe('chooseMode', () => {
  it('plays a compatible MP4 directly, touching nothing', () => {
    assert.equal(chooseMode(file({ container: 'mp4' })), PlaybackMode.DIRECT);
  });

  it('remuxes an MKV whose streams the TV can already decode', () => {
    // The whole point: H.264 in MKV needs a new container, not a new encode.
    assert.equal(chooseMode(file({ container: 'mkv' })), PlaybackMode.REMUX);
  });

  it('remuxes HEVC rather than re-encoding it', () => {
    assert.equal(chooseMode(file({ container: 'mkv', video: 'hevc' })), PlaybackMode.REMUX);
  });

  it('remuxes when only the audio codec is unsupported', () => {
    // Video is copied; just the audio is re-encoded inside the remux.
    assert.equal(chooseMode(file({ container: 'mp4', audio: 'ac3' })), PlaybackMode.REMUX);
  });

  it('transcodes when the video codec cannot be decoded', () => {
    assert.equal(chooseMode(file({ container: 'avi', video: 'vc1' })), PlaybackMode.TRANSCODE);
  });

  it('transcodes when there is no video stream at all', () => {
    assert.equal(chooseMode(file({ video: null })), PlaybackMode.TRANSCODE);
  });

  it('treats a silent file as playable rather than broken', () => {
    assert.equal(chooseMode(file({ container: 'mp4', audio: null })), PlaybackMode.DIRECT);
  });
});

describe('buildFfmpegArgs', () => {
  const info = file();

  it('copies both streams when remuxing, so quality is untouched', () => {
    const args = buildFfmpegArgs({ inputPath: '/x.mkv', info, mode: PlaybackMode.REMUX });
    assert.ok(args.join(' ').includes('-c:v copy'));
    assert.ok(args.join(' ').includes('-c:a copy'));
  });

  it('never forces the hvc1 tag on HEVC', () => {
    // Forcing it corrupts the hvcC box on rips with in-band parameter sets,
    // which makes the file unplayable everywhere. Regression guard.
    const hevc = file({ video: 'hevc' });
    const args = buildFfmpegArgs({ inputPath: '/x.mkv', info: hevc, mode: PlaybackMode.REMUX });
    assert.ok(!args.includes('hvc1'));
  });

  it('re-encodes audio during a remux when the codec is unplayable', () => {
    const withAc3 = file({ audio: 'ac3' });
    const args = buildFfmpegArgs({ inputPath: '/x.mkv', info: withAc3, mode: PlaybackMode.REMUX });
    assert.ok(args.join(' ').includes('-c:a aac'));
    assert.ok(!args.join(' ').includes('-c:a copy'));
  });

  it('seeks before -i so ffmpeg jumps by index instead of decoding up to the point', () => {
    const args = buildFfmpegArgs({
      inputPath: '/x.mkv',
      info,
      mode: PlaybackMode.REMUX,
      startSeconds: 1200,
    });
    assert.ok(args.indexOf('-ss') < args.indexOf('-i'), '-ss must precede -i');
    assert.equal(args[args.indexOf('-ss') + 1], '1200');
  });

  it('omits -ss when starting from the beginning', () => {
    const args = buildFfmpegArgs({ inputPath: '/x.mkv', info, mode: PlaybackMode.REMUX });
    assert.ok(!args.includes('-ss'));
  });

  it('maps exactly one video stream, so cover art cannot sneak in', () => {
    const args = buildFfmpegArgs({ inputPath: '/x.mkv', info, mode: PlaybackMode.REMUX });
    assert.equal(args.filter((a) => a === '0:v:0').length, 1);
  });

  it('selects the requested audio track by its real stream index', () => {
    const multi: PlaybackShape = {
      ...file(),
      audio: [
        { index: 1, order: 0, codec: 'aac', channels: 2, lang: 'hin', title: '' },
        { index: 4, order: 1, codec: 'aac', channels: 2, lang: 'eng', title: '' },
      ],
    };
    const args = buildFfmpegArgs({
      inputPath: '/x.mkv',
      info: multi,
      mode: PlaybackMode.REMUX,
      audioOrder: 1,
    });
    assert.ok(args.includes('0:4'));
  });

  it('produces fragmented MP4 so playback can start before the length is known', () => {
    const args = buildFfmpegArgs({ inputPath: '/x.mkv', info, mode: PlaybackMode.REMUX });
    assert.ok(args.join(' ').includes('empty_moov'));
    assert.equal(args.at(-1), 'pipe:1');
  });

  it('uses hardware encoding when VideoToolbox is available', () => {
    const args = buildFfmpegArgs({
      inputPath: '/x.mkv',
      info,
      mode: PlaybackMode.TRANSCODE,
      h264Encoder: 'h264_videotoolbox',
    });
    assert.ok(args.includes('h264_videotoolbox'));
    assert.ok(args.includes('-realtime'));
  });

  it('falls back to libx264 when it is not', () => {
    const args = buildFfmpegArgs({
      inputPath: '/x.mkv',
      info,
      mode: PlaybackMode.TRANSCODE,
      h264Encoder: 'libx264',
    });
    assert.ok(args.includes('libx264'));
  });
});
