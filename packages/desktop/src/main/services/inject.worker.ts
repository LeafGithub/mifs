// Runs in a worker thread: reading, patching and writing a 60-85 MB page must not block the main process.
import { buildModHtml, resolveDependencies, type BundleManifest } from '@mifs/core';
import { readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parentPort, workerData } from 'node:worker_threads';

export interface WorkerInput {
  bundleDir: string;
  manifest: BundleManifest;
  modIds: string[];
  gamePath: string;
  outputPath: string;
}

export type WorkerMessage =
  | { type: 'progress'; label: string; fraction: number | null }
  | { type: 'done'; size: number; modIds: string[]; warnings: string[]; ms: number }
  | { type: 'error'; code: string; message: string };

const send = (m: WorkerMessage) => parentPort!.postMessage(m);

async function main(input: WorkerInput) {
  const started = Date.now();
  const { ids } = resolveDependencies(input.manifest, input.modIds);
  const mods = input.manifest.mods.filter((m) => ids.includes(m.id));

  send({ type: 'progress', label: 'Reading the game…', fraction: 0.1 });
  const original = await readFile(input.gamePath, 'utf8');

  send({ type: 'progress', label: 'Loading ModLoader and mods…', fraction: 0.3 });
  const beforeSC2 = await readFile(join(input.bundleDir, input.manifest.beforeSC2.path), 'utf8');
  const zips = await Promise.all(mods.map(async (m) => new Uint8Array(await readFile(join(input.bundleDir, m.path)))));

  send({ type: 'progress', label: 'Patching the game and embedding mods…', fraction: 0.5 });
  const { html, warnings } = buildModHtml(original, { beforeSC2, mods: zips });

  send({ type: 'progress', label: 'Writing the file…', fraction: 0.85 });
  const tmp = `${input.outputPath}.part`;
  await writeFile(tmp, html, 'utf8');
  await rename(tmp, input.outputPath);

  send({ type: 'done', size: Buffer.byteLength(html), modIds: ids, warnings, ms: Date.now() - started });
}

main(workerData as WorkerInput).catch((e: unknown) => {
  const code = e instanceof Error && 'code' in e && typeof (e as { code: unknown }).code === 'string' ? (e as { code: string }).code : 'INJECT_FAILED';
  send({ type: 'error', code, message: e instanceof Error ? e.message : String(e) });
});
