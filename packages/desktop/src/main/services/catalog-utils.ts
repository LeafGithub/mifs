// Pure helpers for the bundle catalog (no Electron imports).
import { unzipSync } from 'fflate';

export interface RawCatalogEntry {
  id: string;
  kind: 'upstream' | 'fork';
  version: string;
  ref: string;
  commit: string;
  builtAt: string;
  modCount: number;
  bundleSize: number;
  prerelease: boolean;
  bundleAssetId: number;
  manifestAssetId: number;
  /** sha256 of the bundle zip, as recorded by GitHub. */
  bundleSha256?: string;
  /** Content fingerprint (see bundleFingerprint); absent in older catalogs. */
  fingerprint?: string;
}

const REPO_RE = /^([A-Za-z0-9][A-Za-z0-9._-]{0,99})\/([A-Za-z0-9][A-Za-z0-9._-]{0,99})$/;
const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;

/** `owner/repo` or a GitHub URL -> `owner/repo`. */
export function normalizeCatalogRepo(input: string): string {
  const s = input.trim().replace(/^https:\/\/github\.com\//, '').replace(/\.git$/, '').replace(/\/$/, '');
  if (!REPO_RE.test(s)) throw new Error('Enter the catalog repository as owner/repo.');
  return s;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
const int = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;

/** Validates catalog.json (untrusted). Drops invalid entries. */
export function parseCatalog(json: unknown): RawCatalogEntry[] {
  if (!isObj(json) || json.schema !== 1 || !Array.isArray(json.bundles)) throw new Error('The catalog has an unexpected format.');
  const out: RawCatalogEntry[] = [];
  for (const b of json.bundles as unknown[]) {
    if (!isObj(b)) continue;
    const ok =
      str(b.id) && SAFE_NAME.test(b.id) && (b.kind === 'upstream' || b.kind === 'fork') && str(b.version) && str(b.ref) && str(b.commit) && str(b.builtAt) &&
      int(b.modCount) && int(b.bundleSize) && int(b.bundleAssetId) && int(b.manifestAssetId);
    if (!ok) continue;
    const sha = typeof b.bundleSha256 === 'string' && /^[0-9a-f]{64}$/.test(b.bundleSha256) ? b.bundleSha256 : undefined;
    const fingerprint = typeof b.fingerprint === 'string' && /^[0-9a-f]{64}$/.test(b.fingerprint) ? b.fingerprint : undefined;
    out.push({
      id: b.id as string,
      kind: b.kind as 'upstream' | 'fork',
      version: b.version as string,
      ref: b.ref as string,
      commit: b.commit as string,
      builtAt: b.builtAt as string,
      modCount: b.modCount as number,
      bundleSize: b.bundleSize as number,
      prerelease: b.prerelease === true,
      bundleAssetId: b.bundleAssetId as number,
      manifestAssetId: b.manifestAssetId as number,
      ...(sha ? { bundleSha256: sha } : {}),
      ...(fingerprint ? { fingerprint } : {}),
    });
  }
  return out;
}

const MAX_FILES = 2000;
const MAX_TOTAL = 400 * 1024 * 1024;
const SAFE_ENTRY = /^[A-Za-z0-9._ +()-]+(\/[A-Za-z0-9._ +()-]+)*$/;

/**
 * Unpacks a bundle zip into memory. Entry names must be plain relative paths, and entry count and total size
 * are capped, so a hostile archive cannot escape the target or exhaust memory.
 */
export function extractBundleZip(zip: Uint8Array): Map<string, Uint8Array> {
  let total = 0;
  let count = 0;
  const files = unzipSync(zip, {
    filter: (f) => {
      if (f.name.endsWith('/')) return false; // directories are implied by file paths
      if (++count > MAX_FILES) throw new Error('The bundle archive has too many files.');
      if (!SAFE_ENTRY.test(f.name) || f.name.split('/').some((p) => p === '.' || p === '..')) throw new Error(`The bundle archive contains an unsafe path: ${JSON.stringify(f.name)}`);
      total += f.originalSize;
      if (total > MAX_TOTAL) throw new Error('The bundle archive is too large.');
      return true;
    },
  });
  return new Map(Object.entries(files));
}

/**
 * True when the catalog's build is newer than the installed one. A republished bundle keeps its id but gets
 * a new `builtAt`. Unreadable dates never count.
 */
export function isNewerBuild(installedBuiltAt: string | undefined, catalogBuiltAt: string): boolean {
  if (!installedBuiltAt) return false;
  const installed = Date.parse(installedBuiltAt);
  const catalog = Date.parse(catalogBuiltAt);
  return Number.isFinite(installed) && Number.isFinite(catalog) && catalog > installed;
}

/**
 * Whether the catalog's copy updates an installed bundle: a newer build with different content.
 * Same content under a newer date is just a local build versus the CI build.
 * If either fingerprint is missing, the date alone decides.
 */
export function isUpdate(i: { installedBuiltAt?: string; catalogBuiltAt: string; installedFingerprint?: string; catalogFingerprint?: string }): boolean {
  if (!isNewerBuild(i.installedBuiltAt, i.catalogBuiltAt)) return false;
  return !(i.installedFingerprint && i.catalogFingerprint && i.installedFingerprint === i.catalogFingerprint);
}

/** Maps a GitHub API failure to an actionable message. */
export function explainHttpError(status: number, hasToken: boolean, rateLimited: boolean): string {
  if (status === 401) return 'GitHub rejected the access token. Check it in the catalog settings.';
  if (status === 403 && rateLimited) return 'GitHub rate limit reached. Try again later, or add an access token in the catalog settings.';
  if (status === 403) return 'The access token does not have permission to read this repository.';
  if (status === 404) {
    return hasToken
      ? 'The catalog was not found. Check the repository name, and that the token can read it.'
      : 'The catalog was not found. If the repository is private, add an access token in the catalog settings.';
  }
  return `GitHub returned an error (HTTP ${status}).`;
}
