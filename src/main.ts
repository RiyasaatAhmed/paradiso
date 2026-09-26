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
import { lanAddresses } from './support/network.ts';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const paths = {
  config: path.join(projectRoot, 'config.json'),
  public: path.join(projectRoot, 'public'),
  cache: path.join(projectRoot, '.cache'),
  posters: path.join(projectRoot, '.cache', 'posters'),
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

  const catalog = new Catalog(config);
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

function announce(port: number): void {
  const addresses = lanAddresses();
  log.blank();
  log.info('Open this on your TV browser:');
  if (addresses.length === 0) {
    log.info('    no network interface found — are you connected to wifi?');
  }
  for (const { address, name } of addresses) {
    log.info(`    http://${address}:${port}      (${name})`);
  }
  log.blank();
  log.info(`On this laptop:  http://localhost:${port}`);
  log.info('Ctrl-C to stop.');
  log.blank();
}

main().catch((err: unknown) => {
  log.blank();
  log.error(`failed to start: ${err instanceof Error ? err.message : String(err)}`);
  log.blank();
  process.exit(1);
});
