import { bundleClashes, orderLocal } from '@mifs/core';
import type { InjectRequest, InjectResult, ProgressEvent } from '@mifs/ui/platform';
import { Worker } from 'node:worker_threads';
import { AppError } from '../ipc';
import { gamePath } from './games';
import { loadBundle } from './bundles';
import { localModsForInject, recheckLocalMod } from './localMods';
import workerPath from './inject.worker?modulePath';
import type { WorkerInput, WorkerMessage } from './inject.worker';

/** Save-dialog locations. Inject refuses to write anywhere else. */
export const allowedOutputs = new Set<string>();

export async function runInject(req: InjectRequest, progress: (e: ProgressEvent) => void): Promise<InjectResult> {
  if (!allowedOutputs.has(req.outputPath)) throw new AppError('BAD_OUTPUT', 'Choose where to save the file first.');
  const bundle = await loadBundle(req.bundleId, progress);
  if (req.modIds.length === 0) throw new AppError('NO_MODS', 'Select at least one mod.');
  const known = new Set(bundle.manifest.mods.map((m) => m.id));
  if (req.modIds.some((id) => !known.has(id))) throw new AppError('BAD_MODS', 'The selection does not match this loader bundle.');
  const local = orderLocal(await localModsForInject(req.localModIds ?? []));
  for (const m of local) {
    const clash = bundleClashes(bundle.manifest, m);
    if (clash.length) throw new AppError('LOCAL_CLASH', `${m.name} is already in the loader bundle. Turn it off in Your mods.`);
  }
  const localName = (id: string) => local.find((m) => m.id === id)?.name ?? 'One of your mods';

  const input: WorkerInput = {
    bundleDir: bundle.dir,
    manifest: bundle.manifest,
    modIds: req.modIds,
    local,
    gamePath: gamePath(req.gameId),
    outputPath: req.outputPath,
  };

  return new Promise<InjectResult>((resolve, reject) => {
    const worker = new Worker(workerPath, { workerData: input });
    worker.on('message', (m: WorkerMessage) => {
      if (m.type === 'progress') progress({ kind: 'inject', label: m.label, fraction: m.fraction });
      else if (m.type === 'done') resolve({ outputPath: req.outputPath, size: m.size, modIds: m.modIds, localModIds: m.localModIds, warnings: m.warnings, ms: m.ms });
      else if (m.code === 'LOCAL_CHANGED' || m.code === 'LOCAL_MISSING') {
        // the list should show what is on disk now
        void recheckLocalMod(m.message).finally(() =>
          reject(new AppError(m.code, m.code === 'LOCAL_CHANGED' ? `${localName(m.message)} changed since it was checked. Look at Your mods, then try again.` : `The file of ${localName(m.message)} is gone. Look at Your mods, then try again.`)),
        );
      } else reject(new AppError(m.code, friendly(m.code, m.message)));
    });
    worker.on('error', (e) => reject(new AppError('INJECT_FAILED', e.message)));
    worker.on('exit', (code) => code !== 0 && reject(new AppError('INJECT_FAILED', `The worker stopped unexpectedly (exit ${code}).`)));
  });
}

function friendly(code: string, message: string): string {
  switch (code) {
    case 'NO_SC2_SCRIPT':
      return 'This does not look like a SugarCube 2 game page, so ModLoader cannot be installed into it.';
    case 'ANCHOR_HEAD_MISSING':
    case 'ANCHOR_TAIL_MISSING':
      return 'This game version uses a SugarCube build that this tool does not recognize yet, so it cannot be patched safely.';
    case 'ALREADY_INJECTED':
      return 'This game already has ModLoader installed. Use the original game file instead.';
    case 'ENOENT':
      return 'A file went missing while working. Try again.';
    default:
      return message;
  }
}
