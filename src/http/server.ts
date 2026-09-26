import http, { type Server } from 'node:http';

import { log } from '../support/log.ts';
import { notFound, sendText } from './respond.ts';
import { Router } from './router.ts';
import { registerAssetRoutes } from './routes/assetRoutes.ts';
import { registerLibraryRoutes } from './routes/libraryRoutes.ts';
import { registerMediaRoutes } from './routes/mediaRoutes.ts';
import { registerStreamRoutes } from './routes/streamRoutes.ts';
import type { Services } from './services.ts';

const clientAddress = (remote: string | undefined): string => (remote ?? '').replace('::ffff:', '');
const isLocal = (address: string): boolean =>
  address === '127.0.0.1' || address === '::1' || address === '';

/**
 * Builds the HTTP server from the services it depends on.
 *
 * Dependencies are passed in rather than imported here, which keeps this file
 * about routing and error handling only.
 */
export function createServer(services: Services): Server {
  const router = new Router();
  registerAssetRoutes(router, services);
  registerLibraryRoutes(router, services);
  registerMediaRoutes(router, services);
  registerStreamRoutes(router, services);

  return http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const pathname = decodeURIComponent(url.pathname);

    // Nagle's algorithm adds latency to the small writes that start a stream.
    req.socket.setNoDelay(true);

    // Log requests from other devices. This is what tells you whether a TV
    // reached the server at all when it claims it cannot find it.
    const from = clientAddress(req.socket.remoteAddress);
    if (!isLocal(from)) log.request(from, req.method ?? 'GET', pathname);

    try {
      const match = router.resolve(req.method ?? 'GET', pathname);
      if (!match) return notFound(res);
      await match.handler({ req, res, url, params: match.params });
    } catch (err) {
      const detail = err instanceof Error ? (err.stack ?? err.message) : String(err);
      log.error(`${req.method} ${pathname} failed: ${detail}`);
      // Headers may already be on the wire mid-stream; the only honest response
      // then is to drop the connection.
      if (res.headersSent) res.destroy();
      else sendText(res, 'server error', 500);
    }
  });
}
