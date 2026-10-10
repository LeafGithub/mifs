import { zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { explainHttpError, extractBundleZip, isNewerBuild, isUpdate, normalizeCatalogRepo, parseCatalog } from './catalog-utils';

const bytes = (s: string) => new TextEncoder().encode(s);

describe('normalizeCatalogRepo', () => {
  it('accepts owner/repo and GitHub URLs', () => {
    expect(normalizeCatalogRepo('LeafGithub/mifs')).toBe('LeafGithub/mifs');
    expect(normalizeCatalogRepo(' https://github.com/LeafGithub/mifs.git ')).toBe('LeafGithub/mifs');
    expect(normalizeCatalogRepo('https://github.com/a/b/')).toBe('a/b');
  });

  it('rejects anything else', () => {
    for (const bad of ['', 'justname', 'a/b/c', '../x', 'a/b c', 'https://evil.com/a/b', 'a/..', '-x/y']) expect(() => normalizeCatalogRepo(bad), bad).toThrow();
  });
});

describe('parseCatalog', () => {
  const entry = { id: 'upstream-2.101.1-17c16d9', kind: 'upstream', version: '2.101.1', ref: '2.101.1', commit: 'abc', builtAt: '2026-10-09T00:00:00Z', modCount: 23, bundleSize: 8, bundleAssetId: 5, manifestAssetId: 4 };

  it('reads valid entries and ignores the optional hash when malformed', () => {
    const r = parseCatalog({ schema: 1, bundles: [{ ...entry, bundleSha256: 'a'.repeat(64) }, { ...entry, id: 'x', bundleSha256: 'nope' }] });
    expect(r).toHaveLength(2);
    expect(r[0]?.bundleSha256).toBe('a'.repeat(64));
    expect(r[1]?.bundleSha256).toBeUndefined();
  });

  it('drops entries that could be used to attack the app', () => {
    const r = parseCatalog({ schema: 1, bundles: [{ ...entry, id: '../../evil' }, { ...entry, id: 'ok' }, { ...entry, bundleAssetId: 'https://evil/x' }, { ...entry, kind: 'other' }, 'junk', null] });
    expect(r.map((e) => e.id)).toEqual(['ok']);
  });

  it('rejects a catalog with the wrong shape or schema', () => {
    expect(() => parseCatalog(null)).toThrow();
    expect(() => parseCatalog({ schema: 2, bundles: [] })).toThrow();
    expect(() => parseCatalog({ schema: 1 })).toThrow();
  });
});

describe('extractBundleZip', () => {
  it('extracts normal bundle layouts, including names with spaces', () => {
    const files = extractBundleZip(zipSync({ 'manifest.json': bytes('{}'), 'mods/ModLoader DoL ImageLoaderHook.mod.zip': bytes('z'), 'licenses/mods/A.LICENSE': bytes('MIT') }));
    expect([...files.keys()].sort()).toEqual(['licenses/mods/A.LICENSE', 'manifest.json', 'mods/ModLoader DoL ImageLoaderHook.mod.zip']);
    expect(new TextDecoder().decode(files.get('manifest.json'))).toBe('{}');
  });

  it('refuses path traversal and absolute paths (zip-slip)', () => {
    for (const evil of ['../evil.txt', 'mods/../../evil.txt', '/etc/passwd', 'C:/Windows/evil.txt', 'a\\b.txt', 'mods//x.txt']) {
      expect(() => extractBundleZip(zipSync({ [evil]: bytes('x') })), evil).toThrow(/unsafe path/);
    }
  });

  it('caps the number of files', () => {
    const many: Record<string, Uint8Array> = {};
    for (let i = 0; i < 2100; i++) many[`f${i}.txt`] = bytes('x');
    expect(() => extractBundleZip(zipSync(many))).toThrow(/too many files/);
  });
});

describe('explainHttpError', () => {
  it('gives actionable advice, especially for private repos', () => {
    expect(explainHttpError(404, false, false)).toMatch(/private.*token/i);
    expect(explainHttpError(404, true, false)).toMatch(/token can read/);
    expect(explainHttpError(401, true, false)).toMatch(/rejected/);
    expect(explainHttpError(403, false, true)).toMatch(/rate limit/i);
    expect(explainHttpError(500, false, false)).toMatch(/HTTP 500/);
  });
});

describe('isNewerBuild', () => {
  it('is true only when the catalog build is strictly newer', () => {
    expect(isNewerBuild('2026-10-09T17:04:11.407Z', '2026-10-10T11:03:40.095Z')).toBe(true);
    expect(isNewerBuild('2026-10-09T17:04:11.407Z', '2026-10-09T17:04:11.408Z')).toBe(true);
    expect(isNewerBuild('2026-10-10T11:03:40.095Z', '2026-10-10T11:03:40.095Z')).toBe(false); // same build
    expect(isNewerBuild('2026-10-10T11:03:40.095Z', '2026-10-09T17:04:11.407Z')).toBe(false); // catalog is older
  });

  it('never claims an update for dates it cannot read', () => {
    expect(isNewerBuild(undefined, '2026-10-10T00:00:00Z')).toBe(false);
    expect(isNewerBuild('not a date', '2026-10-10T00:00:00Z')).toBe(false);
    expect(isNewerBuild('2026-10-10T00:00:00Z', 'garbage')).toBe(false);
  });

  it('compares instants, not text (different formats of the same moment)', () => {
    expect(isNewerBuild('2026-10-10T12:00:00+01:00', '2026-10-10T11:00:00Z')).toBe(false); // equal instants
    expect(isNewerBuild('2026-10-10T12:00:00+01:00', '2026-10-10T11:30:00Z')).toBe(true);
  });
});

describe('isUpdate', () => {
  const older = '2026-10-09T15:38:39.646Z';
  const newer = '2026-10-09T17:04:11.407Z';
  const fp1 = 'a'.repeat(64);
  const fp2 = 'b'.repeat(64);

  it('is an update when the catalog build is newer and the content differs', () => {
    expect(isUpdate({ installedBuiltAt: older, catalogBuiltAt: newer, installedFingerprint: fp1, catalogFingerprint: fp2 })).toBe(true);
  });

  it('is not an update when only the build date differs (a local build versus the CI build of the same content)', () => {
    expect(isUpdate({ installedBuiltAt: older, catalogBuiltAt: newer, installedFingerprint: fp1, catalogFingerprint: fp1 })).toBe(false);
  });

  it('falls back to the date when a fingerprint is missing (older catalogs)', () => {
    expect(isUpdate({ installedBuiltAt: older, catalogBuiltAt: newer, installedFingerprint: fp1 })).toBe(true);
    expect(isUpdate({ installedBuiltAt: older, catalogBuiltAt: newer })).toBe(true);
  });

  it('is never an update for the same or an older catalog build, whatever the content', () => {
    expect(isUpdate({ installedBuiltAt: newer, catalogBuiltAt: newer, installedFingerprint: fp1, catalogFingerprint: fp2 })).toBe(false);
    expect(isUpdate({ installedBuiltAt: newer, catalogBuiltAt: older, installedFingerprint: fp1, catalogFingerprint: fp2 })).toBe(false);
  });
});

describe('parseCatalog fingerprint', () => {
  const entry = { id: 'x', kind: 'upstream', version: '2.101.1', ref: 'r', commit: 'c', builtAt: '2026-10-09T00:00:00Z', modCount: 1, bundleSize: 1, bundleAssetId: 2, manifestAssetId: 1 };

  it('keeps a valid fingerprint and drops a malformed one', () => {
    const r = parseCatalog({ schema: 1, bundles: [{ ...entry, fingerprint: 'c'.repeat(64) }, { ...entry, id: 'y', fingerprint: 'nope' }, { ...entry, id: 'z' }] });
    expect(r.map((e) => e.fingerprint)).toEqual(['c'.repeat(64), undefined, undefined]);
  });
});
