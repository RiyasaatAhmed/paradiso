import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { episodeOrder, prettyTitle } from '../src/catalog/titles.ts';

describe('prettyTitle', () => {
  it('strips a tracker prefix, release tags and brackets', () => {
    assert.equal(
      prettyTitle('CINEFREAK.TOP - Ali Baba aur 40 Bhoot [S01E09-12] WEB-DL [Hindi] 1080p ESub.mkv'),
      'Ali Baba aur 40 Bhoot  S01E09-12'
    );
  });

  it('keeps the episode number even though it lives inside brackets', () => {
    assert.equal(
      prettyTitle('Crime Patrol 2026 [S01E14] WEB-DL [Hindi] 1080p HEVC ESub.mkv'),
      'Crime Patrol 2026  S01E14'
    );
  });

  it('leaves an ordinary filename alone apart from its extension', () => {
    assert.equal(prettyTitle("Yashfeen's Birthday Trailer.mp4"), "Yashfeen's Birthday Trailer");
  });

  it('converts dot-separated release names into words', () => {
    assert.equal(prettyTitle('Some.Movie.2021.1080p.BluRay.x264.mkv'), 'Some Movie 2021');
  });

  it('does not repeat an episode marker that survived the strip', () => {
    const title = prettyTitle('Show S02E03 1080p.mkv');
    assert.equal(title.match(/S02/g)?.length, 1);
  });

  it('never returns an empty title, however much is stripped', () => {
    assert.equal(prettyTitle('1080p WEB-DL HEVC.mkv'), '1080p WEB-DL HEVC.mkv');
  });

  it('handles a name with no extension', () => {
    assert.equal(prettyTitle('Documentary'), 'Documentary');
  });

  // A folder of episodes repeats the series name on every single card, so the
  // parenthesised episode name is the only thing telling them apart. Stripping
  // it as though it were release noise made three hundred cards identical.
  it('keeps a parenthesised episode name and leads with the marker', () => {
    assert.equal(
      prettyTitle('The Tom and Jerry Show - E023 (For the Love of Ruggles).mp4'),
      'E023 · For the Love of Ruggles'
    );
  });

  it('recognises a bare episode marker with no season', () => {
    assert.equal(prettyTitle('Some Show - E7 (Pilot).mkv'), 'E007 · Pilot');
  });

  it('keeps the season when there is one', () => {
    assert.equal(prettyTitle('Breaking Bad S02E05 (Breakage) 1080p BluRay.mkv'), 'S02E05 · Breakage');
  });

  it('still strips square brackets, which carry release metadata', () => {
    assert.equal(prettyTitle('Show [S01E02] [Hindi] 1080p.mkv'), 'Show  S01E02');
  });

  it('drops parentheses holding a year rather than a name', () => {
    assert.equal(prettyTitle('Interstellar (2014).mkv'), 'Interstellar');
    assert.equal(prettyTitle('The Tom and Jerry Show (2014-2022).mkv'), 'The Tom and Jerry Show');
  });
});

describe('episodeOrder', () => {
  it('orders bare episode markers numerically, not as text', () => {
    assert.ok(episodeOrder('Show - E009 (A).mp4')! < episodeOrder('Show - E100 (B).mp4')!);
  });

  it('keeps seasons apart, so a late episode never overtakes the next season', () => {
    assert.ok(episodeOrder('Show S01E99 (A).mkv')! < episodeOrder('Show S02E01 (B).mkv')!);
  });

  it('is null for anything carrying no episode marker', () => {
    assert.equal(episodeOrder('Some.Movie.2021.1080p.mkv'), null);
  });
});
