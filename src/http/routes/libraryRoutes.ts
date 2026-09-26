import type { LibraryResponse } from '../../../shared/contracts.ts';
import { log } from '../../support/log.ts';
import { readJsonBody, sendJson } from '../respond.ts';
import type { Router } from '../router.ts';
import type { Services } from '../services.ts';

interface ProgressUpdate {
  id: string;
  seconds: number;
  duration: number;
}

/** Browsing the library: what exists, and how far through each title you are. */
export function registerLibraryRoutes(router: Router, { catalog, progress, config }: Services): void {
  router.get(/^\/api\/library$/, ({ res }) => {
    const body: LibraryResponse = {
      items: catalog.toPublicJSON(),
      progress: progress.all,
      minSizeMB: config.minSizeMB,
      libraries: config.libraries,
    };
    sendJson(res, body);
  });

  router.get(/^\/api\/rescan$/, async ({ res }) => {
    await catalog.scan();
    log.info(`rescanned: ${catalog.size} files (${catalog.featuredCount} above the size filter)`);
    sendJson(res, { ok: true, count: catalog.size });
  });

  router.post(/^\/api\/progress$/, async ({ req, res }) => {
    const { id, seconds, duration } = await readJsonBody<ProgressUpdate>(req);

    // Ignore positions for titles we do not know about -- a stale client tab
    // should not be able to grow the store without bound.
    if (typeof id === 'string' && catalog.find(id) && Number.isFinite(seconds)) {
      progress.record(id, seconds as number, Number(duration) || 0);
    }
    sendJson(res, { ok: true });
  });
}
