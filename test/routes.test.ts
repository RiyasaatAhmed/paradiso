import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { HOME, parseRoute, routePath, sameRoute } from '../client/navigation/routes.ts';

describe('routePath', () => {
  it('encodes a folder whole, since folders contain slashes and spaces', () => {
    assert.equal(
      routePath({ name: 'folder', folder: 'Downloads/The Tom and Jerry Show (2014-2022)' }),
      '/folder/Downloads%2FThe%20Tom%20and%20Jerry%20Show%20(2014-2022)'
    );
  });

  it('gives home the root path', () => {
    assert.equal(routePath(HOME), '/');
  });
});

describe('parseRoute', () => {
  it('round-trips a folder containing slashes', () => {
    const route = { name: 'folder', folder: 'Downloads/Shows/Season 1' } as const;
    assert.deepEqual(parseRoute(routePath(route)), route);
  });

  it('reads a title id', () => {
    assert.deepEqual(parseRoute('/title/a884e912c1b2'), { name: 'title', id: 'a884e912c1b2' });
  });

  it('reads a watch id', () => {
    assert.deepEqual(parseRoute('/watch/a884e912c1b2'), { name: 'watch', id: 'a884e912c1b2' });
  });

  // Ids are hashes the scan produced, so anything else in that slot is a
  // hand-edited URL and must not become a lookup.
  it('refuses an id that is not twelve hex characters', () => {
    assert.deepEqual(parseRoute('/title/../../etc/passwd'), HOME);
    assert.deepEqual(parseRoute('/title/NOTHEXATALL'), HOME);
    assert.deepEqual(parseRoute('/watch/a884e912c1b'), HOME);
  });

  it('falls back to home for anything it does not recognise', () => {
    assert.deepEqual(parseRoute('/'), HOME);
    assert.deepEqual(parseRoute('/nonsense/here'), HOME);
  });

  it('survives a malformed escape sequence rather than throwing', () => {
    assert.deepEqual(parseRoute('/folder/%E0%A4%A'), HOME);
  });
});

describe('sameRoute', () => {
  it('compares by what the address bar would show', () => {
    assert.ok(sameRoute({ name: 'title', id: 'a884e912c1b2' }, { name: 'title', id: 'a884e912c1b2' }));
    assert.ok(!sameRoute(HOME, { name: 'folder', folder: 'CP' }));
  });
});
