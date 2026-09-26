import type { LibraryResponse, MediaResponse } from '../../shared/contracts.ts';
import type { PlaybackMode } from '../../shared/playback.ts';

/** The only module that knows the server's URL shapes. */

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} -> HTTP ${response.status}`);
  return (await response.json()) as T;
}

export interface StreamRequest {
  id: string;
  mode: PlaybackMode;
  audioOrder: number;
  startSeconds: number;
}

export const api = {
  fetchLibrary: (): Promise<LibraryResponse> => getJson<LibraryResponse>('/api/library'),

  fetchMedia: (id: string): Promise<MediaResponse> => getJson<MediaResponse>(`/api/media/${id}`),

  rescan: (): Promise<{ ok: boolean; count: number }> => getJson('/api/rescan'),

  posterUrl: (id: string): string => `/poster/${id}`,

  /**
   * `startSeconds` is where in the source to begin. For remuxed and transcoded
   * streams it restarts ffmpeg at that point, which is how seeking works when
   * the stream cannot answer byte ranges. The cache-buster matters: without it
   * a browser will happily replay the previous position from cache.
   */
  streamUrl: ({ id, mode, audioOrder, startSeconds }: StreamRequest): string =>
    `/stream/${id}?mode=${mode}&audio=${audioOrder}&t=${Math.floor(startSeconds)}&_=${Date.now()}`,

  /** Resolves to null when the file has no usable text subtitle track. */
  async fetchSubtitles(id: string, track: number): Promise<string | null> {
    const response = await fetch(`/subs/${id}?track=${track}`);
    return response.ok ? response.text() : null;
  },

  /** Fire-and-forget: a dropped resume position is not worth surfacing. */
  saveProgress(id: string, seconds: number, duration: number): void {
    void fetch('/api/progress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, seconds, duration }),
    }).catch(() => {});
  },
};
