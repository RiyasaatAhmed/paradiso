#!/usr/bin/env node
/**
 * Composition root.
 *
 * Every dependency in the app is constructed here and passed downward, so this
 * is the one file that knows how the pieces fit together. Nothing else reaches
 * for a global or builds its own collaborators.
 */

import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Catalog } from './catalog/catalog.ts';
import { loadConfig } from './config.ts';
import { createServer } from './http/server.ts';
import { assertFfmpegAvailable, detectH264Encoder } from './media/ffmpeg.ts';
import { createPosterService } from './media/posters.ts';
import { createProbeService } from './media/probe.ts';
import { createSubtitleService } from './media/subtitles.ts';
import { MetadataCache } from './storage/metadataCache.ts';
import { ProgressStore } from './storage/progressStore.ts';
import { log } from './support/log.ts';
import { inContainer, lanAddresses } from './support/network.ts';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// The config file and the cache are overridable by environment, so a container
// can mount its own settings and keep thumbnails on a volume without writing
// anything back into the image. Everything else lives beside the source.
const cacheDir = path.resolve(process.env['PARADISO_CACHE'] ?? path.join(projectRoot, '.cache'));
const paths = {
  config: path.resolve(process.env['PARADISO_CONFIG'] ?? path.join(projectRoot, 'config.json')),
  public: path.join(projectRoot, 'public'),
  cache: cacheDir,
  posters: path.join(cacheDir, 'posters'),
};

async function main(): Promise<void> {
  log.blank();
  log.info('Paradiso — starting up');

  await assertFfmpegAvailable();
  await fsp.mkdir(paths.posters, { recursive: true });

  const config = loadConfig(paths.config);
  const h264Encoder = await detectH264Encoder();
  log.info(`fallback encoder: ${h264Encoder}`);

  const [metadataCache, progress] = await Promise.all([
    MetadataCache.open(paths.cache),
    ProgressStore.open(paths.cache),
  ]);

  const describe = createProbeService(metadataCache);
  const posterFor = createPosterService({ posterDir: paths.posters, describe });
  const subtitlesFor = createSubtitleService({ cacheDir: paths.cache, describe });

  // The catalog is given `describe` so a scan can read running times as it
  // goes. Results are cached by size and mtime, so only the first scan of a
  // given file pays for it.
  const catalog = new Catalog(config, describe);
  for (const library of config.libraries) log.info(`watching: ${library}`);
  await catalog.scan();
  log.info(`library: ${catalog.size} files (${catalog.featuredCount} above the size filter)`);

  const server = createServer({
    config,
    catalog,
    progress,
    describe,
    posterFor,
    subtitlesFor,
    h264Encoder,
    publicDir: paths.public,
  });

  server.listen(config.port, '0.0.0.0', () => announce(config.port));

  const shutdown = async (): Promise<void> => {
    log.blank();
    log.info('shutting down');
    await progress.flush();
    server.close(() => process.exit(0));
    // Streams in flight would otherwise hold the process open indefinitely.
    setTimeout(() => process.exit(0), 1500).unref();
  };
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}

/**
 * Prints the address to type into the TV.
 *
 * In a container the interfaces belong to the container, so the discovered
 * addresses are useless to a TV. PARADISO_ANNOUNCE_HOST lets whoever runs it
 * supply the address that actually reaches the machine; without it, the banner
 * says plainly that it does not know rather than printing something wrong.
 */
function announce(port: number): void {
  const announced = process.env['PARADISO_ANNOUNCE_HOST'];
  const contained = inContainer();

  log.blank();
  log.info('Open this on your TV browser:');

  if (announced) {
    // A port in the value wins: when the container's port is remapped from
    // outside, the port the server bound to is not the one to type into the TV.
    log.info(announced.includes(':') ? `    http://${announced}` : `    http://${announced}:${port}`);
  } else if (contained) {
    log.info(`    http://<this machine's wifi address>:${port}`);
  } else {
    const addresses = lanAddresses();
    if (addresses.length === 0) {
      log.info('    no network interface found — are you connected to wifi?');
    }
    for (const { address, name } of addresses) {
      log.info(`    http://${address}:${port}      (${name})`);
    }
  }

  if (contained && !announced) {
    log.blank();
    log.info('Running in a container, so the address above cannot be detected from');
    log.info('in here. Use the host machine\'s wifi address, or set');
    log.info('PARADISO_ANNOUNCE_HOST to have it printed for you.');
  }

  log.blank();
  if (!contained) log.info(`On this machine:  http://localhost:${port}`);
  log.info('Ctrl-C to stop.');
  log.blank();
}

main().catch((err: unknown) => {
  log.blank();
  log.error(`failed to start: ${err instanceof Error ? err.message : String(err)}`);
  log.blank();
  process.exit(1);
});
