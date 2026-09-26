import fsp from 'node:fs/promises';

import type { MediaResponse } from '../../../shared/contracts.ts';
import { notFound, sendBuffer, sendJson, sendText } from '../respond.ts';
import type { Router } from '../router.ts';
import type { Services } from '../services.ts';

const ID = '([0-9a-f]{12})';
const ONE_WEEK = 'public, max-age=604800';

/** Details about a single title: its metadata, artwork and subtitles. */
export function registerMediaRoutes(
  router: Router,
  { catalog, describe, posterFor, subtitlesFor, progress }: Services
): void {
  router.get(new RegExp(`^/api/media/${ID}$`), async ({ res, params }) => {
    const item = catalog.find(params[0] ?? '');
    if (!item) return sendJson(res, { error: 'unknown id' }, 404);

    const { absPath: _absPath, ...publicFields } = item;
    const body: MediaResponse = {
      ...publicFields,
      meta: await describe(item),
      resume: progress.get(item.id),
    };
    sendJson(res, body);
  });

  router.get(new RegExp(`^/poster/${ID}$`), async ({ res, params }) => {
    const item = catalog.find(params[0] ?? '');
    if (!item) return notFound(res);

    const file = await posterFor(item);
    if (!file) return notFound(res);

    // Content-addressed by id, so it can be cached hard.
    sendBuffer(res, await fsp.readFile(file), 'image/jpeg', ONE_WEEK);
  });

  router.get(new RegExp(`^/subs/${ID}$`), async ({ res, url, params }) => {
    const item = catalog.find(params[0] ?? '');
    if (!item) return notFound(res);

    const track = Number.parseInt(url.searchParams.get('track') ?? '0', 10) || 0;
    const vtt = await subtitlesFor(item, track);
    if (!vtt) return sendText(res, 'no text subtitle track', 404);

    sendBuffer(res, Buffer.from(vtt, 'utf8'), 'text/vtt; charset=utf-8', ONE_WEEK);
  });
}
