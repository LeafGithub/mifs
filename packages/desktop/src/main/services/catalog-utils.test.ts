import { zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { explainHttpError, extractBundleZip, normalizeCatalogRepo, parseCatalog } from './catalog-utils';

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
