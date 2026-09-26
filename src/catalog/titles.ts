/**
 * Turns a release filename into something worth reading on a TV.
 *
 * Scene releases carry a lot of noise a viewer does not care about -- tracker
 * prefixes, resolution, codec, audio layout, subtitle markers. Two pieces of
 * structure are worth rescuing before the rest is thrown away: the episode
 * number, and the episode's own name.
 *
 * The bracket style is what tells those apart. Releases put metadata in square
 * brackets -- [S01E14], [Hindi], [1080p] -- while an episode title is
 * conventionally parenthesised: (For the Love of Ruggles). So square brackets
 * are always stripped, and round ones are kept unless they hold something that
 * is plainly not a name.
 */

const TRACKER_PREFIX = /^\s*(www\.)?[A-Z0-9]+\.(TOP|COM|NET|ORG|ME|CC|IN)\s*-\s*/i;
const SEASON_EPISODE = /S(\d{1,2})[ .]?E(\d{1,3}(?:-(?:E?\d{1,3}))?)/i;
/** A bare episode marker, for the many collections that have no season at all. */
const BARE_EPISODE = /\bE(?:p|pisode)?[ .]?(\d{1,3})\b/i;
const SQUARE_BRACKETED = /[[{][^[\]{}]*[\]}]/g;
const PARENTHESISED = /\(([^()]*)\)/g;

const NOISE_TOKENS = [
  '\\d{3,4}p', 'WEB-?DL', 'WEB-?Rip', 'BluRay', 'BRRip', 'HDRip', 'DVDRip', 'HDTV',
  'x26[45]', 'H\\.?26[45]', 'HEVC', 'AVC', 'AAC(?:\\d(?:\\.\\d)?)?', 'DDP?\\d(?:\\.\\d)?',
  'EAC3', 'AC3', 'DTS', 'Atmos', '10bit', '8bit', 'HDR', 'SDR', 'Dual[ .]?Audio',
  'ESub(?:s)?', 'MSub(?:s)?', 'Sub(?:bed)?', 'Uncut', 'REPACK', 'PROPER', 'Complete', 'Season',
];
const RELEASE_NOISE = new RegExp(`\\b(${NOISE_TOKENS.join('|')})\\b`, 'gi');

/** A year, a year range, or an episode marker -- parenthesised, but not a name. */
const NOT_A_NAME = /^\s*(\d{4}(\s*-\s*\d{4})?|S\d{1,2}E\d{1,3}|E\d{1,3})\s*$/i;

interface ParsedName {
  /** What to show, already cleaned. */
  title: string;
  /** Sortable position within its folder, or null when there is no marker. */
  episode: number | null;
}

/**
 * Season and episode collapse into one number so a folder can be ordered with a
 * single comparison. Seasons are spaced far enough apart that an episode count
 * can never run into the next one.
 */
const sortKey = (season: number, episode: number): number => season * 1000 + episode;

/**
 * An underscore in a filename is doing one of two jobs: standing in for a space,
 * or standing in for an apostrophe a filesystem would rather not have. Which one
 * is decided by whether the name has real spaces already -- `Cat_s Ruffled
 * Fur-niture` is plainly an apostrophe, `Cat_s_Ruffled` just as plainly is not.
 */
function cleanEpisodeName(raw: string): string {
  const name = raw.trim();
  const separator = name.includes(' ') ? "'" : ' ';
  return name
    .replace(/_/g, separator)
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function parse(filename: string): ParsedName {
  const withoutExtension = filename.replace(/\.[^.]+$/, '').replace(TRACKER_PREFIX, '');

  // Both markers are captured before any stripping, since they usually live
  // inside the brackets that are about to be removed.
  const seasonEpisode = SEASON_EPISODE.exec(withoutExtension);
  const bare = seasonEpisode ? null : BARE_EPISODE.exec(withoutExtension);

  // Pull out a parenthesised episode name, and drop parentheses holding
  // anything else -- a year, a year range, a duplicate episode marker.
  let episodeName = '';
  const withoutParens = withoutExtension.replace(PARENTHESISED, (whole, inner: string) => {
    if (NOT_A_NAME.test(inner)) return ' ';
    if (!episodeName && inner.trim()) {
      episodeName = cleanEpisodeName(inner);
      return ' ';
    }
    return whole;
  });

  let name = withoutParens
    .replace(SQUARE_BRACKETED, ' ')
    .replace(RELEASE_NOISE, ' ')
    .replace(/[._]+/g, ' ')
    .replace(/\s*-\s*$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  const marker = seasonEpisode
    ? `S${(seasonEpisode[1] ?? '').padStart(2, '0')}E${(seasonEpisode[2] ?? '').toUpperCase()}`
    : bare
      ? `E${(bare[1] ?? '').padStart(3, '0')}`
      : '';

  // Inside a folder of episodes the series name is on every single card and the
  // episode name is the only thing that differs, so when both a marker and a
  // name are present the label leads with them and drops the rest. This is what
  // makes three hundred cards tellable apart at a glance.
  if (marker && episodeName) {
    return {
      title: `${marker} · ${episodeName}`,
      episode: seasonEpisode
        ? sortKey(Number(seasonEpisode[1]), parseInt(seasonEpisode[2] ?? '0', 10))
        : sortKey(0, Number(bare?.[1] ?? 0)),
    };
  }

  // No name to lead with, so keep the old shape: the cleaned filename, with the
  // marker appended if the strip removed it.
  if (seasonEpisode?.[1] && seasonEpisode[2] && !new RegExp(`S${seasonEpisode[1]}`, 'i').test(name)) {
    name += `  ${marker}`;
  }
  if (episodeName) name = name ? `${name} (${episodeName})` : episodeName;

  return {
    title: name || filename,
    episode: seasonEpisode
      ? sortKey(Number(seasonEpisode[1]), parseInt(seasonEpisode[2] ?? '0', 10))
      : bare
        ? sortKey(0, Number(bare[1] ?? 0))
        : null,
  };
}

export function prettyTitle(filename: string): string {
  return parse(filename).title;
}

/**
 * Where a file sits in its series, for ordering a folder.
 * Null when the name carries no episode marker at all.
 */
export function episodeOrder(filename: string): number | null {
  return parse(filename).episode;
}
