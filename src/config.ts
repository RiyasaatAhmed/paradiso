import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** Configuration after resolution: absolute paths, real numbers, no optionals. */
export interface Config {
  port: number;
  libraries: string[];
  maxDepth: number;
  minSizeBytes: number;
  minSizeMB: number;
  isExcludedDir: (name: string) => boolean;
}

interface RawConfig {
  port?: number;
  libraries?: string[];
  maxDepth?: number;
  minSizeMB?: number;
  exclude?: string[];
}

const DEFAULTS = {
  port: 8080,
  libraries: [] as string[],
  maxDepth: 2,
  minSizeMB: 0,
  exclude: [] as string[],
};

/** `~/Movies` -> `/Users/you/Movies`. */
function expandHome(target: string): string {
  return target.startsWith('~') ? path.join(os.homedir(), target.slice(1)) : target;
}

/** Turns a shell-style pattern such as `ZeroToMastery*` into an anchored regex. */
function globToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`, 'i');
}

/**
 * Reads config.json and returns a fully resolved configuration.
 * Everything downstream can then assume absolute paths and correct types.
 */
export function loadConfig(configPath: string): Config {
  const raw = JSON.parse(fs.readFileSync(configPath, 'utf8')) as RawConfig & Record<string, unknown>;

  // Keys beginning with "//" are documentation inside config.json; ignore them.
  const merged = { ...DEFAULTS };
  for (const key of Object.keys(DEFAULTS) as (keyof typeof DEFAULTS)[]) {
    const value = raw[key];
    if (value !== undefined) merged[key] = value as never;
  }

  const libraries = merged.libraries.map((entry) => path.resolve(expandHome(entry)));
  if (libraries.length === 0) {
    throw new Error(`No libraries configured in ${configPath}. Add at least one folder.`);
  }

  const excludePatterns = merged.exclude.map(globToRegExp);

  return {
    port: Number(merged.port),
    libraries,
    maxDepth: Number(merged.maxDepth),
    minSizeBytes: Number(merged.minSizeMB) * 1024 * 1024,
    minSizeMB: Number(merged.minSizeMB),
    isExcludedDir: (name) => excludePatterns.some((pattern) => pattern.test(name)),
  };
}
