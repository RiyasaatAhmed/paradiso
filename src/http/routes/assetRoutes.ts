import type { Router } from '../router.ts';
import { sendStaticFile } from '../respond.ts';
import type { Services } from '../services.ts';

// Only these extensions are servable. Combined with the root check in
// sendStaticFile, nothing outside public/ can be reached.
const SERVABLE = /^\/[\w./-]+\.(?:html|js|css|map|svg|png|jpg|ico)$/;

/**
 * Paths that belong to the server rather than to the browser app. Anything
 * matching these has already had its chance at a real route, so falling through
 * to the app would turn a genuine 404 -- a stream id that no longer exists --
 * into a page that silently loads and then cannot explain itself.
 */
const SERVER_OWNED = /^\/(?:api|stream|poster|subs)(?:\/|$)/;

/** The web app itself. */
export function registerAssetRoutes(router: Router, { publicDir }: Services): void {
  router.get(/^\/$/, ({ res }) => sendStaticFile(res, publicDir, 'index.html'));
  router.get(SERVABLE, ({ res, url }) => sendStaticFile(res, publicDir, url.pathname.slice(1)));
}

/**
 * The client owns /folder/..., /title/... and /watch/..., so a reload or a
 * pasted link on one of those has to be answered with the app rather than a
 * 404. It then reads the address itself and opens the right screen.
 *
 * Registered after every other route, since the router matches in order: this
 * only ever sees paths nothing else wanted.
 */
export function registerAppFallback(router: Router, { publicDir }: Services): void {
  router.get(/^\/[^.]*$/, ({ res, url }) => {
    if (SERVER_OWNED.test(url.pathname)) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('not found');
      return;
    }
    sendStaticFile(res, publicDir, 'index.html');
  });
}
