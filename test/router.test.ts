import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { Router, type ResolvedRoute } from '../src/http/router.ts';

/** resolve() is nullable by design; these tests assert a match was found. */
function found(route: ResolvedRoute | null): ResolvedRoute {
  assert.ok(route, 'expected the route to resolve');
  return route;
}

describe('Router', () => {
  it('matches a path and returns its handler', () => {
    const router = new Router();
    const handler = (): void => {};
    router.get(/^\/api\/library$/, handler);

    assert.equal(found(router.resolve('GET', '/api/library')).handler, handler);
  });

  it('exposes capture groups as params', () => {
    const router = new Router();
    router.get(/^\/poster\/([0-9a-f]{12})$/, () => {});

    assert.deepEqual(found(router.resolve('GET', '/poster/b5adb73b1806')).params, ['b5adb73b1806']);
  });

  it('answers HEAD wherever it answers GET, so range probes work', () => {
    const router = new Router();
    router.get(/^\/stream$/, () => {});

    assert.ok(router.resolve('HEAD', '/stream'));
  });

  it('does not match a GET route for POST', () => {
    const router = new Router();
    router.get(/^\/api\/progress$/, () => {});

    assert.equal(router.resolve('POST', '/api/progress'), null);
  });

  it('returns null for an unknown path', () => {
    assert.equal(new Router().resolve('GET', '/nope'), null);
  });

  it('prefers the first matching route', () => {
    const order: string[] = [];
    const router = new Router();
    router.get(/^\/a$/, () => void order.push('first'));
    router.get(/^\/a$/, () => void order.push('second'));

    void found(router.resolve('GET', '/a')).handler({} as never);
    assert.deepEqual(order, ['first']);
  });

  it('rejects an id that is not exactly twelve hex characters', () => {
    const router = new Router();
    router.get(/^\/poster\/([0-9a-f]{12})$/, () => {});

    assert.equal(router.resolve('GET', '/poster/../../etc/passwd'), null);
    assert.equal(router.resolve('GET', '/poster/XYZ'), null);
  });
});
