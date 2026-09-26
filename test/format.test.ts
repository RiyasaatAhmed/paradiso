import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { formatClock, formatDuration } from '../client/core/format.ts';
import { formatSize } from '../src/support/format.ts';

describe('formatClock', () => {
  it('formats under an hour as M:SS', () => {
    assert.equal(formatClock(0), '0:00');
    assert.equal(formatClock(95), '1:35');
    assert.equal(formatClock(2794), '46:34');
  });

  it('pads the minutes once hours appear', () => {
    assert.equal(formatClock(7265), '2:01:05');
    assert.equal(formatClock(3600), '1:00:00');
  });

  it('treats nonsense as zero rather than printing NaN', () => {
    assert.equal(formatClock(NaN), '0:00');
    assert.equal(formatClock(-10), '0:00');
  });
});

describe('formatDuration', () => {
  it('states time in words, as Netflix does', () => {
    assert.equal(formatDuration(1380), '23m');
    assert.equal(formatDuration(4320), '1h 12m');
  });

  it('drops a zero minute count', () => {
    assert.equal(formatDuration(3600), '1h');
  });

  it('never claims zero minutes remain while time is left', () => {
    assert.equal(formatDuration(20), '1m');
  });
});

describe('formatSize', () => {
  it('uses MB below a gigabyte and GB above', () => {
    assert.equal(formatSize(603 * 1024 ** 2), '603 MB');
    assert.equal(formatSize(2.5 * 1024 ** 3), '2.5 GB');
  });
});
