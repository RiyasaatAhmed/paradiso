import type { Router } from '../router.ts';
import { sendStaticFile } from '../respond.ts';
import type { Services } from '../services.ts';

// Only these extensions are servable. Combined with the root check in
// sendStaticFile, nothing outside public/ can be reached.
const SERVABLE = /^\/[\w./-]+\.(?:html|js|css|map|svg|png|jpg|ico)$/;

/** The web app itself. */
export function registerAssetRoutes(router: Router, { publicDir }: Services): void {
  router.get(/^\/$/, ({ res }) => sendStaticFile(res, publicDir, 'index.html'));
  router.get(SERVABLE, ({ res, url }) => sendStaticFile(res, publicDir, url.pathname.slice(1)));
}
