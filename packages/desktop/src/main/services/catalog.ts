import { bundleFingerprint, verifySha256 } from '@mifs/core';
import type { BundleInfo, CatalogList, ProgressEvent } from '@mifs/ui/platform';
import { app } from 'electron';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { AppError } from '../ipc';
import { buildsDir } from '../paths';
import { importBundleFrom, listBundles } from './bundles';
import { explainHttpError, extractBundleZip, isUpdate, parseCatalog, type RawCatalogEntry } from './catalog-utils';
import { getCatalogRepo, getToken } from './settings';

// Test seam (unpackaged builds only): points the e2e suite at a fake GitHub.
const apiBase = () => (!app.isPackaged && process.env.MIFS_API_BASE) || 'https://api.github.com';

async function request(path: string, token: string | null, accept: string): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(`${apiBase()}${path}`, {
      headers: { accept, 'user-agent': 'MIFS', 'x-github-api-version': '2022-11-28', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      signal: AbortSignal.timeout(60_000),
    });
  } catch {
    throw new AppError('NETWORK', 'Could not reach GitHub. Check your internet connection.');
  }
  if (!res.ok) {
    const limited = res.headers.get('x-ratelimit-remaining') === '0';
    throw new AppError(`HTTP_${res.status}`, explainHttpError(res.status, token !== null, limited));
  }
  return res;
}

const JSON_ACCEPT = 'application/vnd.github+json';
const BINARY_ACCEPT = 'application/octet-stream';

async function fetchEntries(repo: string, token: string | null): Promise<RawCatalogEntry[]> {
  const rel = (await (await request(`/repos/${repo}/releases/tags/catalog`, token, JSON_ACCEPT)).json()) as { assets?: { id: number; name: string }[] };
  const asset = rel.assets?.find((a) => a.name === 'catalog.json');
  if (!asset) throw new AppError('NO_CATALOG', 'The catalog release has no catalog.json yet. Publish a bundle first.');
  const res = await request(`/repos/${repo}/releases/assets/${asset.id}`, token, BINARY_ACCEPT);
  try {
    return parseCatalog(await res.json());
  } catch (e) {
    throw new AppError('BAD_CATALOG', e instanceof Error ? e.message : 'The catalog could not be read.');
  }
}

export async function listCatalog(): Promise<CatalogList> {
  const repo = await getCatalogRepo();
  const entries = await fetchEntries(repo, await getToken());
  const installed = new Map(await Promise.all((await listBundles()).map(async (b) => [b.id, { builtAt: b.manifest.loader.builtAt, fingerprint: await bundleFingerprint(b.manifest) }] as const)));
  return {
    source: repo,
    entries: entries
      .map(({ bundleAssetId: _a, manifestAssetId: _m, bundleSha256: _s, fingerprint, ...e }) => ({
        ...e,
        installed: installed.has(e.id),
        updateAvailable: isUpdate({ installedBuiltAt: installed.get(e.id)?.builtAt, catalogBuiltAt: e.builtAt, installedFingerprint: installed.get(e.id)?.fingerprint, catalogFingerprint: fingerprint }),
      }))
      .sort((a, b) => b.builtAt.localeCompare(a.builtAt)),
  };
}

export async function installFromCatalog(id: string, progress: (e: ProgressEvent) => void): Promise<BundleInfo> {
  const repo = await getCatalogRepo();
  const token = await getToken();
  // Look the entry up again here: the renderer only sends an id, never a URL or asset.
  const entry = (await fetchEntries(repo, token)).find((e) => e.id === id);
  if (!entry) throw new AppError('NOT_FOUND', 'That bundle is no longer in the catalog.');

  const label = `ModLoader ${entry.version}`;
  progress({ kind: 'download', label: `Downloading ${label}…`, fraction: null });
  const res = await request(`/repos/${repo}/releases/assets/${entry.bundleAssetId}`, token, BINARY_ACCEPT);
  if (!res.body) throw new AppError('NETWORK', 'The download returned no data.');
  const total = Number(res.headers.get('content-length')) || entry.bundleSize;
  const chunks: Uint8Array[] = [];
  let received = 0;
  for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
    chunks.push(chunk);
    received += chunk.length;
    progress({ kind: 'download', label: `Downloading ${label}… ${(received / 1e6).toFixed(1)} MB`, fraction: total ? Math.min(1, received / total) : null });
  }
  const zip = new Uint8Array(received);
  let at = 0;
  for (const c of chunks) {
    zip.set(c, at);
    at += c.length;
  }

  if (entry.bundleSha256 && !(await verifySha256(zip, entry.bundleSha256))) {
    throw new AppError('HASH_MISMATCH', 'The downloaded bundle does not match its published checksum, so it was discarded.');
  }

  progress({ kind: 'verify', label: 'Unpacking…', fraction: null });
  let files: Map<string, Uint8Array>;
  try {
    files = extractBundleZip(zip);
  } catch (e) {
    throw new AppError('BAD_ARCHIVE', e instanceof Error ? e.message : 'The bundle archive is invalid.');
  }

  const work = join(buildsDir(), `catalog-${Date.now()}`);
  try {
    for (const [name, data] of files) {
      const to = join(work, name);
      await mkdir(dirname(to), { recursive: true });
      await writeFile(to, data);
    }
    // importBundleFrom re-checks every file's size and sha256 before installing.
    const info = await importBundleFrom(work, progress);
    if (info.id !== entry.id) throw new AppError('ID_MISMATCH', 'The bundle does not match the catalog entry, so it was not installed.');
    return info;
  } finally {
    await rm(work, { recursive: true, force: true }).catch(() => undefined);
  }
}
