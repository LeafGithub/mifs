import { parseManifest, verifySha256, type BundleManifest } from '@mifs/core';
import type { BundleInfo, ProgressEvent } from '@mifs/ui/platform';
import { dialog, type BrowserWindow } from 'electron';
import log from 'electron-log/main';
import { cp, mkdir, readFile, readdir, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { AppError } from '../ipc';
import { SAFE_NAME, bundlesDir } from '../paths';

type Progress = (e: ProgressEvent) => void;

async function readManifest(dir: string): Promise<BundleManifest> {
  let json: unknown;
  try {
    json = JSON.parse(await readFile(join(dir, 'manifest.json'), 'utf8'));
  } catch {
    throw new AppError('NO_MANIFEST', 'That folder has no readable manifest.json. Pick the folder a loader bundle was built into.');
  }
  try {
    return parseManifest(json);
  } catch (e) {
    throw new AppError('BAD_MANIFEST', e instanceof Error ? e.message : 'Invalid manifest');
  }
}

/** Every file listed in the manifest must exist and match its recorded size and sha256. */
async function verifyFiles(dir: string, m: BundleManifest, progress: Progress): Promise<void> {
  const files = [m.beforeSC2, ...m.mods];
  for (const [i, f] of files.entries()) {
    progress({ kind: 'verify', label: `Checking ${f.path}`, fraction: i / files.length });
    let bytes: Uint8Array;
    try {
      bytes = new Uint8Array(await readFile(join(dir, f.path)));
    } catch {
      throw new AppError('MISSING_FILE', `The bundle is missing ${f.path}.`);
    }
    if (bytes.length !== f.size || !(await verifySha256(bytes, f.sha256))) {
      throw new AppError('HASH_MISMATCH', `${f.path} does not match its checksum; the bundle is damaged or was modified.`);
    }
  }
}

const toInfo = (manifest: BundleManifest): BundleInfo => ({ id: manifest.id, manifest, origin: 'local' });

export function bundleDir(id: string): string {
  if (!SAFE_NAME.test(id)) throw new AppError('BAD_ID', 'Invalid bundle id');
  return join(bundlesDir(), id);
}

export async function listBundles(): Promise<BundleInfo[]> {
  const out: BundleInfo[] = [];
  for (const e of await readdir(bundlesDir(), { withFileTypes: true })) {
    if (!e.isDirectory() || !SAFE_NAME.test(e.name)) continue;
    try {
      out.push(toInfo(await readManifest(join(bundlesDir(), e.name))));
    } catch (err) {
      log.warn(`ignoring broken bundle folder ${e.name}:`, err);
    }
  }
  return out.sort((a, b) => b.manifest.loader.builtAt.localeCompare(a.manifest.loader.builtAt));
}

/** Loads an installed bundle and checks its files again right before use. */
export async function loadBundle(id: string, progress: Progress): Promise<{ dir: string; manifest: BundleManifest }> {
  const dir = bundleDir(id);
  const manifest = await readManifest(dir).catch(() => {
    throw new AppError('NO_BUNDLE', 'That loader bundle is no longer installed.');
  });
  await verifyFiles(dir, manifest, progress);
  return { dir, manifest };
}

export async function importBundleFolder(win: BrowserWindow | null, progress: Progress): Promise<BundleInfo | null> {
  const pick = await dialog.showOpenDialog(win ?? undefined!, { title: 'Select a loader bundle folder', properties: ['openDirectory'] });
  const src = pick.filePaths[0];
  if (pick.canceled || !src) return null;
  return importBundleFrom(src, progress);
}

/** Verifies a bundle folder and installs a copy of it into the app's data folder. */
export async function importBundleFrom(src: string, progress: Progress): Promise<BundleInfo> {
  const manifest = await readManifest(src);
  if (!SAFE_NAME.test(manifest.id)) throw new AppError('BAD_MANIFEST', 'The bundle id contains characters that are not allowed.');
  await verifyFiles(src, manifest, progress);

  // Copy only what the manifest lists (plus licenses), never stray files from the picked folder.
  const dest = bundleDir(manifest.id);
  await rm(dest, { recursive: true, force: true });
  for (const rel of ['manifest.json', manifest.beforeSC2.path, ...manifest.mods.map((m) => m.path), ...manifest.licenses]) {
    const to = join(dest, rel);
    await mkdir(dirname(to), { recursive: true });
    await cp(join(src, rel), to);
  }
  return toInfo(manifest);
}

export async function removeBundle(id: string): Promise<void> {
  await rm(bundleDir(id), { recursive: true, force: true });
}
