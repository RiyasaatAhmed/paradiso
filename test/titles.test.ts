import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { prettyTitle } from '../src/catalog/titles.ts';

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
});
