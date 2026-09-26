import { isProbeFailure } from '../../../shared/contracts.ts';
import { isPlaybackMode, PlaybackMode } from '../../../shared/playback.ts';
import { streamFile, streamTranscode } from '../../media/streaming.ts';
import { notFound, sendText } from '../respond.ts';
import type { Router } from '../router.ts';
import type { Services } from '../services.ts';

/** The video itself. Everything else in the server exists to support this route. */
export function registerStreamRoutes(router: Router, { catalog, describe, h264Encoder }: Services): void {
  router.get(/^\/stream\/([0-9a-f]{12})$/, async ({ req, res, url, params }) => {
    const item = catalog.find(params[0] ?? '');
    if (!item) return notFound(res);

    const info = await describe(item);
    if (isProbeFailure(info)) return sendText(res, info.error, 500);

    // The client may override the mode -- that is how the on-screen fallback
    // ladder works when a TV rejects a file the probe thought it would accept.
    const requested = url.searchParams.get('mode');
    const mode = isPlaybackMode(requested) ? requested : info.mode;

    if (mode === PlaybackMode.DIRECT) return streamFile(req, res, item);

    streamTranscode(req, res, {
      item,
      info,
      mode,
      startSeconds: Math.max(0, Number(url.searchParams.get('t')) || 0),
      audioOrder: Math.max(0, Number.parseInt(url.searchParams.get('audio') ?? '0', 10) || 0),
      h264Encoder,
    });
  });
}
