/**
 * Turns a release filename into something worth reading on a TV.
 *
 * Scene releases carry a lot of noise a viewer does not care about -- tracker
 * prefixes, resolution, codec, audio layout, subtitle markers. The one piece of
 * structure worth rescuing is the season/episode number, so that is pulled out
 * before the brackets it usually hides in are stripped.
 */

const TRACKER_PREFIX = /^\s*(www\.)?[A-Z0-9]+\.(TOP|COM|NET|ORG|ME|CC|IN)\s*-\s*/i;
const EPISODE = /S(\d{1,2})[ .]?E(\d{1,3}(?:-(?:E?\d{1,3}))?)/i;
const BRACKETED = /[[({][^[\]()}]*[\])}]/g;

const NOISE_TOKENS = [
  '\\d{3,4}p', 'WEB-?DL', 'WEB-?Rip', 'BluRay', 'BRRip', 'HDRip', 'DVDRip', 'HDTV',
  'x26[45]', 'H\\.?26[45]', 'HEVC', 'AVC', 'AAC(?:\\d(?:\\.\\d)?)?', 'DDP?\\d(?:\\.\\d)?',
  'EAC3', 'AC3', 'DTS', 'Atmos', '10bit', '8bit', 'HDR', 'SDR', 'Dual[ .]?Audio',
  'ESub(?:s)?', 'MSub(?:s)?', 'Sub(?:bed)?', 'Uncut', 'REPACK', 'PROPER', 'Complete', 'Season',
];
const RELEASE_NOISE = new RegExp(`\\b(${NOISE_TOKENS.join('|')})\\b`, 'gi');

export function prettyTitle(filename: string): string {
  let name = filename.replace(/\.[^.]+$/, '').replace(TRACKER_PREFIX, '');

  // Capture the episode marker before the bracket strip removes it.
  const episode = EPISODE.exec(name);

  name = name
    .replace(BRACKETED, ' ')
    .replace(RELEASE_NOISE, ' ')
    .replace(/[._]+/g, ' ')
    .replace(/\s*-\s*$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  if (episode?.[1] && episode[2] && !new RegExp(`S${episode[1]}`, 'i').test(name)) {
    name += `  S${episode[1].padStart(2, '0')}E${episode[2].toUpperCase()}`;
  }

  return name || filename;
}
