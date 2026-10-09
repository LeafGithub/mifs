import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ManifestError, buildModHtml, parseManifest, sha256Hex, verifySha256 } from '../src/index.ts';

const sha = 'a'.repeat(64);
const good = () => ({
  schema: 1,
  id: 'upstream-2.101.1-17c16d9',
  kind: 'upstream',
  loader: { version: '2.101.1', repo: 'https://example/x.git', ref: '2.101.1', commit: 'abc', builtAt: '2026-10-09T00:00:00Z' },
  beforeSC2: { path: 'BeforeSC2.js', sha256: sha, size: 10 },
  mods: [
    { id: 'A', name: 'A', version: '1.0.0', aliases: [], path: 'mods/A.mod.zip', sha256: sha, size: 5, dependsOn: [{ name: 'ModLoader', range: '^2.0.0' }], default: true },
  ],
  licenses: ['licenses/LICENSE'],
});
const bad = (mutate: (m: ReturnType<typeof good>) => void) => {
  const m = good();
  mutate(m);
  return () => parseManifest(m);
};

describe('parseManifest', () => {
  it('accepts a valid manifest', () => {
    const m = parseManifest(good());
    expect(m.mods[0]?.dependsOn).toEqual([{ name: 'ModLoader', range: '^2.0.0' }]);
    expect(m.mods[0]?.default).toBe(true);
  });

  it('rejects wrong shapes with ManifestError', () => {
    expect(() => parseManifest(null)).toThrow(ManifestError);
    expect(bad((m) => ((m as any).schema = 2))).toThrow(/unsupported schema/);
    expect(bad((m) => ((m as any).kind = 'x'))).toThrow(/kind/);
    expect(bad((m) => (m.beforeSC2.sha256 = 'XYZ'))).toThrow(/sha256/);
    expect(bad((m) => (m.mods[0]!.size = -1))).toThrow(/size/);
    expect(bad((m) => (m.mods = []))).toThrow(/mods/);
    expect(bad((m) => m.mods.push({ ...m.mods[0]! }))).toThrow(/duplicate/);
    expect(bad((m) => (m.loader.version = 'latest'))).toThrow(/version/);
  });

  it('rejects paths that could escape the bundle folder', () => {
    for (const p of ['../evil.zip', '/etc/passwd', 'C:/x.zip', 'a\\b.zip', 'mods//a.zip', './a.zip']) {
      expect(bad((m) => (m.mods[0]!.path = p)), p).toThrow(/safe relative path/);
    }
    expect(bad((m) => (m.licenses = ['../LICENSE']))).toThrow(/safe relative path/);
  });
});

describe('hashing', () => {
  it('sha256Hex matches the known digest of "abc"', async () => {
    expect(await sha256Hex(new TextEncoder().encode('abc'))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(await verifySha256(new TextEncoder().encode('abc'), 'BA7816BF8F01CFEA414140DE5DAE2223B00361A396177A9CB410FF61F20015AD')).toBe(true);
    expect(await verifySha256(new TextEncoder().encode('abd'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')).toBe(false);
  });
});

// Uses the bundle produced by `node bundle/scripts/build-bundle.mjs --src <built checkout> --out bundle/dist`.
const here = dirname(fileURLToPath(import.meta.url));
const DIST = process.env.MIFS_BUNDLE ?? resolve(here, '../../../bundle/dist');
describe.skipIf(!existsSync(join(DIST, 'manifest.json')))('a real built bundle', () => {
  const manifest = () => parseManifest(JSON.parse(readFileSync(join(DIST, 'manifest.json'), 'utf8')));

  it('parses, and every listed file exists with the recorded size and hash', async () => {
    const m = manifest();
    expect(m.mods.length).toBeGreaterThan(20);
    for (const f of [m.beforeSC2, ...m.mods]) {
      const bytes = new Uint8Array(readFileSync(join(DIST, f.path)));
      expect(bytes.length, f.path).toBe(f.size);
      expect(await verifySha256(bytes, f.sha256), f.path).toBe(true);
    }
    for (const l of m.licenses) expect(existsSync(join(DIST, l)), l).toBe(true);
  });

  it('declares only dependencies that are in the bundle (besides the virtual ModLoader / GameVersion)', () => {
    const m = manifest();
    const names = new Set(m.mods.map((x) => x.name));
    const aliases = new Set(['ModLoader', 'GameVersion', 'ImageLoaderHook', 'ImageLoaderHookCore']);
    const missing = m.mods.flatMap((x) => x.dependsOn.filter((d) => !names.has(d.name) && !aliases.has(d.name)).map((d) => `${x.name} -> ${d.name}`));
    expect(missing).toEqual([]);
  });

  it('feeds the injector: bundle files in, page with all mods out', () => {
    const m = manifest();
    const page =
      `<html><head><meta content="default-src 'self' 'unsafe-eval' 'unsafe-inline'; x"/></head><body>` +
      `<script id="script-sugarcube" type="text/javascript">window.SugarCube={},jQuery((()=>{}))})(window,window.document,jQuery);</script></body></html>`;
    const { html } = buildModHtml(page, {
      beforeSC2: readFileSync(join(DIST, m.beforeSC2.path), 'utf8'),
      mods: m.mods.map((x) => new Uint8Array(readFileSync(join(DIST, x.path)))),
    });
    const list = /window\.modDataValueZipList = (\[.*?\]);/.exec(html)?.[1];
    expect(JSON.parse(list!)).toHaveLength(m.mods.length);
  });
});
