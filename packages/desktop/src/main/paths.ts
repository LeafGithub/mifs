import { app } from 'electron';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const dir = (...parts: string[]) => {
  const p = join(app.getPath('userData'), ...parts);
  mkdirSync(p, { recursive: true });
  return p;
};

/** Installed loader bundles: one folder per bundle id. */
export const bundlesDir = () => dir('bundles');
/** Downloaded and unpacked game files. */
export const gamesDir = () => dir('games');

/** Scratch space for builds from source (cleaned up after each build). */
export const buildsDir = () => dir('builds');
/** One log file per build, kept for troubleshooting. */
export const logsDir = () => dir('logs');

/** Ids and tags become folder names and must not escape their parent folder. */
export const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;
