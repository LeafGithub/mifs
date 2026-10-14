import type { InjectRequest, InjectResult, ProgressEvent } from '@mifs/ui/platform';
import { Worker } from 'node:worker_threads';
import { AppError } from '../ipc';
import { gamePath } from './games';
import { loadBundle } from './bundles';
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

  const input: WorkerInput = {
    bundleDir: bundle.dir,
    manifest: bundle.manifest,
    modIds: req.modIds,
    gamePath: gamePath(req.gameId),
    outputPath: req.outputPath,
  };

  return new Promise<InjectResult>((resolve, reject) => {
    const worker = new Worker(workerPath, { workerData: input });
    worker.on('message', (m: WorkerMessage) => {
      if (m.type === 'progress') progress({ kind: 'inject', label: m.label, fraction: m.fraction });
      else if (m.type === 'done') resolve({ outputPath: req.outputPath, size: m.size, modIds: m.modIds, warnings: m.warnings, ms: m.ms });
      else reject(new AppError(m.code, friendly(m.code, m.message)));
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
