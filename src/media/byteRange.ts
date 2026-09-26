/**
 * Parsing of the HTTP `Range` header, kept separate from the streaming code so
 * the edge cases (open-ended, suffix, out-of-bounds) can be tested on their own.
 */

export interface ByteRange {
  start: number;
  end: number;
}

/** A range the file cannot satisfy; the caller must answer 416. */
export const UNSATISFIABLE = 'unsatisfiable';
export type RangeResult = ByteRange | typeof UNSATISFIABLE | null;

const RANGE = /^bytes=(\d*)-(\d*)$/;

/**
 * @returns null when there is no usable range header and the whole file should
 *   be sent, UNSATISFIABLE when the request cannot be met, otherwise the range.
 */
export function parseByteRange(header: string | undefined, totalSize: number): RangeResult {
  if (!header) return null;

  const match = RANGE.exec(header.trim());
  if (!match) return null;

  const rawStart = match[1] ?? '';
  const rawEnd = match[2] ?? '';
  if (rawStart === '' && rawEnd === '') return null;

  // "bytes=-500" means the final 500 bytes, not "up to byte 500".
  if (rawStart === '') {
    const suffixLength = Number(rawEnd);
    if (!Number.isFinite(suffixLength) || suffixLength <= 0) return UNSATISFIABLE;
    return { start: Math.max(0, totalSize - suffixLength), end: totalSize - 1 };
  }

  const start = Number(rawStart);
  if (!Number.isFinite(start) || start >= totalSize) return UNSATISFIABLE;

  const end = rawEnd === '' ? totalSize - 1 : Math.min(Number(rawEnd), totalSize - 1);
  if (end < start) return UNSATISFIABLE;

  return { start, end };
}
