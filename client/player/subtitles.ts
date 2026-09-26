/**
 * WebVTT parsing and cue lookup.
 *
 * Subtitles are rendered by hand rather than through a <track> element, for two
 * reasons: native cues are far too small to read across a room and cannot be
 * restyled on a TV, and more importantly their timing is tied to the video
 * element's own clock -- which restarts at zero every time a remuxed stream
 * seeks. Cues are therefore matched against the virtual timeline instead.
 *
 * Pure functions, unit-tested directly.
 */

export interface Cue {
  start: number;
  end: number;
  text: string;
}

const TIMESTAMP = /(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{1,3})/;

/** Accepts both "00:02.000" and "01:23:45,678"; SRT-style commas are common. */
export function parseTimestamp(text: string): number | null {
  const match = TIMESTAMP.exec(text.trim());
  if (!match) return null;

  const [, hours, minutes, seconds, fraction] = match;
  const millis = Number((fraction ?? '0').padEnd(3, '0'));
  return Number(hours ?? 0) * 3600 + Number(minutes) * 60 + Number(seconds) + millis / 1000;
}

const stripMarkup = (text: string): string =>
  text
    .replace(/<[^>]*>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .trim();

export function parseVtt(source: string): Cue[] {
  const cues: Cue[] = [];

  for (const block of source.replace(/\r/g, '').split(/\n{2,}/)) {
    const lines = block.split('\n');
    const timingIndex = lines.findIndex((line) => line.includes('-->'));
    if (timingIndex === -1) continue; // header, cue id, or a stray comment

    const [rawStart, rawEnd] = (lines[timingIndex] ?? '').split('-->');
    const start = parseTimestamp(rawStart ?? '');
    const end = parseTimestamp(rawEnd ?? '');
    if (start === null || end === null) continue;

    const text = stripMarkup(lines.slice(timingIndex + 1).join('\n'));
    if (text) cues.push({ start, end, text });
  }

  return cues.sort((a, b) => a.start - b.start);
}

/**
 * The cue that should be on screen at `time`, or '' for a gap between cues.
 * Binary search, because this runs several times a second during playback.
 */
export function cueTextAt(cues: readonly Cue[], time: number): string {
  let low = 0;
  let high = cues.length - 1;
  let candidate = -1;

  while (low <= high) {
    const mid = (low + high) >> 1;
    if ((cues[mid] as Cue).start <= time) {
      candidate = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  if (candidate === -1) return '';
  const cue = cues[candidate] as Cue;
  return time <= cue.end ? cue.text : '';
}
