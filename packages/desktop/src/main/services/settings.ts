import type { CatalogSettings } from '@mifs/ui/platform';
import { app, safeStorage } from 'electron';
import { readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { AppError } from '../ipc';
import { normalizeCatalogRepo } from './catalog-utils';

export const DEFAULT_CATALOG_REPO = 'LeafGithub/mifs';

interface Stored {
  catalogRepo?: string;
  /** Access token encrypted with the OS keychain (DPAPI on Windows) and base64-encoded. */
  tokenEnc?: string;
}

const file = () => join(app.getPath('userData'), 'settings.json');

async function read(): Promise<Stored> {
  try {
    return JSON.parse(await readFile(file(), 'utf8')) as Stored;
  } catch {
    return {};
  }
}

async function write(s: Stored): Promise<void> {
  const tmp = `${file()}.tmp`;
  await writeFile(tmp, JSON.stringify(s, null, 2), 'utf8');
  await rename(tmp, file());
}

export async function getCatalogRepo(): Promise<string> {
  return (await read()).catalogRepo ?? DEFAULT_CATALOG_REPO;
}

/** The decrypted token, for main-process use only. It is never sent to the renderer. */
export async function getToken(): Promise<string | null> {
  const enc = (await read()).tokenEnc;
  if (!enc || !safeStorage.isEncryptionAvailable()) return null;
  try {
    return safeStorage.decryptString(Buffer.from(enc, 'base64'));
  } catch {
    return null; // e.g. the OS profile changed; the user needs to enter it again
  }
}

export async function getCatalogSettings(): Promise<CatalogSettings> {
  const s = await read();
  return { repo: s.catalogRepo ?? DEFAULT_CATALOG_REPO, hasToken: Boolean(s.tokenEnc) };
}

export async function saveCatalogSettings(patch: { repo?: string; token?: string | null }): Promise<CatalogSettings> {
  const s = await read();
  if (patch.repo !== undefined) {
    try {
      s.catalogRepo = normalizeCatalogRepo(patch.repo);
    } catch (e) {
      throw new AppError('BAD_REPO', e instanceof Error ? e.message : 'Invalid repository');
    }
  }
  if (patch.token === null) delete s.tokenEnc;
  else if (patch.token !== undefined) {
    const t = patch.token.trim();
    if (!t) delete s.tokenEnc;
    else {
      if (!safeStorage.isEncryptionAvailable()) throw new AppError('NO_KEYCHAIN', 'Secure storage is not available on this computer, so the token cannot be saved.');
      s.tokenEnc = safeStorage.encryptString(t).toString('base64');
    }
  }
  await write(s);
  return getCatalogSettings();
}
