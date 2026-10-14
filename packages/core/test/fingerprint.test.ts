import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { bundleFingerprint, parseManifest, type BundleManifest } from '../src/index.ts';

const mod = (id: string, version: string, commit?: string) => ({
  id, name: id, version, aliases: [], path: `mods/${id}.zip`, sha256: 'b'.repeat(64), size: 1, dependsOn: [], default: true, ...(commit ? { commit } : {}),
});
const make = (over: Partial<{ version: string; commit: string; builtAt: string; mods: ReturnType<typeof mod>[]; sha: string }> = {}): BundleManifest =>
  parseManifest({
    schema: 1, id: 't', kind: 'upstream',
    loader: { version: over.version ?? '2.101.1', repo: 'r', ref: 'x', commit: over.commit ?? 'c1', builtAt: over.builtAt ?? '2026-10-09T00:00:00Z' },
    beforeSC2: { path: 'BeforeSC2.js', sha256: over.sha ?? 'a'.repeat(64), size: 1 },
    mods: over.mods ?? [mod('A', '1.0.0'), mod('B', '2.0.0', 'abc')],
    licenses: [],
  });

describe('bundleFingerprint', () => {
  it('is stable across rebuilds: build time, file hashes and mod order do not matter', async () => {
    const a = await bundleFingerprint(make());
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(await bundleFingerprint(make({ builtAt: '2027-01-01T00:00:00Z', sha: 'd'.repeat(64) }))).toBe(a);
    expect(await bundleFingerprint(make({ mods: [mod('B', '2.0.0', 'abc'), mod('A', '1.0.0')] }))).toBe(a);
  });

  it('changes when the content changes: a mod added, removed, upgraded, or the loader moved', async () => {
    const base = await bundleFingerprint(make());
    expect(await bundleFingerprint(make({ mods: [mod('A', '1.0.0')] }))).not.toBe(base);
    expect(await bundleFingerprint(make({ mods: [mod('A', '1.0.0'), mod('B', '2.0.0', 'abc'), mod('C', '1.0.0')] }))).not.toBe(base);
    expect(await bundleFingerprint(make({ mods: [mod('A', '1.0.1'), mod('B', '2.0.0', 'abc')] }))).not.toBe(base);
    expect(await bundleFingerprint(make({ mods: [mod('A', '1.0.0'), mod('B', '2.0.0', 'def')] }))).not.toBe(base);
    expect(await bundleFingerprint(make({ commit: 'c2' }))).not.toBe(base);
    expect(await bundleFingerprint(make({ version: '2.102.0' }))).not.toBe(base);
  });
});

// The CI catalog script and the app must compute the same value for the same manifest.
const here = dirname(fileURLToPath(import.meta.url));
const DIST = process.env.MIFS_BUNDLE ?? resolve(here, '../../../bundle/dist');
describe.skipIf(!existsSync(join(DIST, 'manifest.json')))('agreement with bundle/scripts/fingerprint.mjs', () => {
  it('computes the same fingerprint for a real built bundle', async () => {
    const script = await import(pathToFileURL(resolve(here, '../../../bundle/scripts/fingerprint.mjs')).href);
    const manifest = parseManifest(JSON.parse(readFileSync(join(DIST, 'manifest.json'), 'utf8')));
    expect(await bundleFingerprint(manifest)).toBe(script.bundleFingerprint(manifest));
  });
});
