import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseByteRange } from '../src/media/byteRange.ts';

const SIZE = 1000;

describe('parseByteRange', () => {
  it('returns null with no header, meaning send the whole file', () => {
    assert.equal(parseByteRange(undefined, SIZE), null);
  });

  it('reads a closed range', () => {
    assert.deepEqual(parseByteRange('bytes=100-199', SIZE), { start: 100, end: 199 });
  });

  it('treats an open-ended range as running to the last byte', () => {
    assert.deepEqual(parseByteRange('bytes=500-', SIZE), { start: 500, end: 999 });
  });

  it('reads a suffix range as the final N bytes, not the first N', () => {
    assert.deepEqual(parseByteRange('bytes=-300', SIZE), { start: 700, end: 999 });
  });

  it('clamps a suffix longer than the file to the whole file', () => {
    assert.deepEqual(parseByteRange('bytes=-5000', SIZE), { start: 0, end: 999 });
  });

  it('clamps an end past the last byte', () => {
    assert.deepEqual(parseByteRange('bytes=900-99999', SIZE), { start: 900, end: 999 });
  });

  it('rejects a start beyond the end of the file', () => {
    assert.equal(parseByteRange('bytes=1000-', SIZE), 'unsatisfiable');
  });

  it('rejects a reversed range', () => {
    assert.equal(parseByteRange('bytes=800-200', SIZE), 'unsatisfiable');
  });

  it('rejects a zero-length suffix', () => {
    assert.equal(parseByteRange('bytes=-0', SIZE), 'unsatisfiable');
  });

  it('ignores units it does not understand', () => {
    assert.equal(parseByteRange('items=0-10', SIZE), null);
  });

  it('ignores a malformed header rather than throwing', () => {
    assert.equal(parseByteRange('bytes=abc-def', SIZE), null);
    assert.equal(parseByteRange('bytes=-', SIZE), null);
  });

  it('accepts the first byte', () => {
    assert.deepEqual(parseByteRange('bytes=0-0', SIZE), { start: 0, end: 0 });
  });
});
