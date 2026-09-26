import fsp from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
};

export function sendJson(res: ServerResponse, body: unknown, status = 200): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Cache-Control': 'no-store',
  });
  res.end(payload);
}

export function sendText(res: ServerResponse, text: string, status = 200): void {
  res.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Length': Buffer.byteLength(text),
  });
  res.end(text);
}

export function sendBuffer(
  res: ServerResponse,
  buffer: Buffer,
  contentType: string,
  cacheControl = 'no-store'
): void {
  res.writeHead(200, {
    'Content-Type': contentType,
    'Content-Length': buffer.length,
    'Cache-Control': cacheControl,
  });
  res.end(buffer);
}

export const notFound = (res: ServerResponse): void => sendText(res, 'not found', 404);

/**
 * Serves a file from a fixed root directory.
 *
 * The resolved path is checked to still be inside that root, so `..` segments
 * and encoded variants cannot reach the project source or anything else on disk.
 */
export async function sendStaticFile(
  res: ServerResponse,
  rootDir: string,
  relativePath: string
): Promise<void> {
  const absolute = path.resolve(rootDir, `.${path.posix.resolve('/', relativePath)}`);
  if (absolute !== rootDir && !absolute.startsWith(rootDir + path.sep)) {
    sendText(res, 'forbidden', 403);
    return;
  }

  try {
    const body = await fsp.readFile(absolute);
    const contentType = MIME_TYPES[path.extname(absolute).toLowerCase()] ?? 'application/octet-stream';
    // Assets change whenever the app is edited; revalidate rather than cache hard.
    sendBuffer(res, body, contentType, 'no-cache');
  } catch {
    notFound(res);
  }
}

/** Reads a request body, refusing anything implausibly large. */
export function readJsonBody<T>(req: IncomingMessage, limitBytes = 1e6): Promise<Partial<T>> {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (chunk: Buffer) => {
      raw += chunk.toString();
      if (raw.length > limitBytes) req.destroy();
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(raw || '{}') as Partial<T>);
      } catch {
        resolve({});
      }
    });
    req.on('error', () => resolve({}));
  });
}
