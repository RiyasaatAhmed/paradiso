/**
 * The wire format between server and client.
 *
 * Both sides import these, so a change to what the server sends is a compile
 * error in the client rather than `undefined` appearing on a TV across the room.
 */

import type { PlaybackMode } from './playback.ts';

/** One video file, as the client sees it. The absolute path never leaves the server. */
export interface LibraryItem {
  /** Hash of the absolute path. Requests can only name files the scan found. */
  id: string;
  file: string;
  title: string;
  folder: string;
  size: number;
  sizeLabel: string;
  mtime: number;
  /** Below the configured size filter: hidden until "Show everything". */
  small: boolean;
}

export interface VideoStream {
  codec: string;
  width: number;
  height: number;
  profile?: string;
}

export interface AudioTrack {
  /** Real ffmpeg stream index, used for -map. */
  index: number;
  /** Position among audio tracks only, used by the UI. */
  order: number;
  codec: string;
  channels: number;
  lang: string;
  title: string;
}

export interface SubtitleTrack {
  index: number;
  order: number;
  codec: string;
  lang: string;
  title: string;
  /** False for image-based subtitles, which cannot become WebVTT. */
  text: boolean;
}

export interface MediaInfo {
  duration: number;
  bitrate: number;
  container: string;
  video: VideoStream | null;
  audio: AudioTrack[];
  subs: SubtitleTrack[];
  mode: PlaybackMode;
}

export interface ProbeFailure {
  error: string;
}

/**
 * Probing can fail on a corrupt file. Modelling that as a union forces every
 * caller to handle it rather than reading `.duration` off a failure.
 */
export type ProbeResult = MediaInfo | ProbeFailure;

export const isProbeFailure = (result: ProbeResult): result is ProbeFailure =>
  'error' in result;

export interface ResumePosition {
  seconds: number;
  duration: number;
  /** When it was recorded, so Continue Watching can sort by recency. */
  at: number;
}

export interface LibraryResponse {
  items: LibraryItem[];
  progress: Record<string, ResumePosition>;
  minSizeMB: number;
  libraries: string[];
}

export interface MediaResponse extends LibraryItem {
  meta: ProbeResult;
  resume: ResumePosition | null;
}
