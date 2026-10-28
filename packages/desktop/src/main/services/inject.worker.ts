// Worker thread, so handling a 60-85 MB page does not block the main process.
import { buildModHtml, resolveDependencies, type BundleManifest, type LocalProvider } from '@mifs/core';
import { createHash } from 'node:crypto';
import { readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parentPort, workerData } from 'node:worker_threads';
import { modBytes, type Inside } from './local-mods-utils';

/** One of the user's own mods, in load order. */
export interface WorkerLocalMod extends LocalProvider {
  path: string;
  inside?: Inside;
  /** Of the whole file when it was checked; a mismatch means it changed since. */
  sha256: string;
}

export interface WorkerInput {
  bundleDir: string;
  manifest: BundleManifest;
  modIds: string[];
  local: WorkerLocalMod[];
  gamePath: string;
  outputPath: string;
}

export type WorkerMessage =
  | { type: 'progress'; label: string; fraction: number | null }
  | { type: 'done'; size: number; modIds: string[]; localModIds: string[]; warnings: string[]; ms: number }
  | { type: 'error'; code: string; message: string };

const send = (m: WorkerMessage) => parentPort!.postMessage(m);

async function main(input: WorkerInput) {
  const started = Date.now();
  const { ids } = resolveDependencies(input.manifest, input.modIds, input.local);
  const mods = input.manifest.mods.filter((m) => ids.includes(m.id));

  send({ type: 'progress', label: 'Reading the game…', fraction: 0.1 });
  const original = await readFile(input.gamePath, 'utf8');

  send({ type: 'progress', label: 'Loading ModLoader and mods…', fraction: 0.3 });
  const beforeSC2 = await readFile(join(input.bundleDir, input.manifest.beforeSC2.path), 'utf8');
  const zips: Uint8Array[] = await Promise.all(mods.map(async (m) => new Uint8Array(await readFile(join(input.bundleDir, m.path)))));
  for (const m of input.local) {
    let bytes: Uint8Array;
    try {
      bytes = new Uint8Array(await readFile(m.path));
    } catch {
      throw Object.assign(new Error(m.id), { code: 'LOCAL_MISSING' });
    }
    if (createHash('sha256').update(bytes).digest('hex') !== m.sha256) throw Object.assign(new Error(m.id), { code: 'LOCAL_CHANGED' });
    zips.push(modBytes(bytes, m.inside));
  }

  send({ type: 'progress', label: 'Patching the game and embedding mods…', fraction: 0.5 });
  const { html, warnings } = buildModHtml(original, { beforeSC2, mods: zips });

  send({ type: 'progress', label: 'Writing the file…', fraction: 0.85 });
  const tmp = `${input.outputPath}.part`;
  await writeFile(tmp, html, 'utf8');
  await rename(tmp, input.outputPath);

  send({ type: 'done', size: Buffer.byteLength(html), modIds: ids, localModIds: input.local.map((m) => m.id), warnings, ms: Date.now() - started });
}

main(workerData as WorkerInput).catch((e: unknown) => {
  const code = e instanceof Error && 'code' in e && typeof (e as { code: unknown }).code === 'string' ? (e as { code: string }).code : 'INJECT_FAILED';
  send({ type: 'error', code, message: e instanceof Error ? e.message : String(e) });
});
