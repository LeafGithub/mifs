import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { defaultSelection, dependentsOf, parseManifest, resolveDependencies, type BundleManifest } from '../src/index.ts';

const mod = (id: string, deps: string[] = [], aliases: string[] = []) => ({
  id,
  name: id,
  version: '1.0.0',
  aliases,
  path: `mods/${id}.zip`,
  sha256: 'b'.repeat(64),
  size: 1,
  dependsOn: [{ name: 'ModLoader', range: '^2' }, { name: 'GameVersion', range: '>0.5' }, ...deps.map((name) => ({ name, range: '*' }))],
  default: true,
});
// load order: Base, Mid (needs Base), Top (needs Mid via alias), Lone, Broken (needs a mod the bundle lacks)
const manifest: BundleManifest = parseManifest({
  schema: 1,
  id: 't',
  kind: 'upstream',
  loader: { version: '2.0.0', repo: 'r', ref: 'x', commit: 'c', builtAt: 'now' },
  beforeSC2: { path: 'BeforeSC2.js', sha256: 'a'.repeat(64), size: 1 },
  mods: [mod('Base'), mod('Mid', ['Base']), mod('Top', ['MidAlias'], []), mod('Lone'), mod('Broken', ['Nope'])].map((m) => (m.id === 'Mid' ? { ...m, aliases: ['MidAlias'] } : m)),
  licenses: [],
});

describe('resolveDependencies', () => {
  it('adds transitive dependencies (through aliases) and keeps load order', () => {
    const r = resolveDependencies(manifest, ['Top']);
    expect(r.ids).toEqual(['Base', 'Mid', 'Top']);
    expect(r.added).toEqual(['Base', 'Mid']);
    expect(r.missing).toEqual([]);
  });

  it('ignores the virtual ModLoader / GameVersion names and unknown ids', () => {
    expect(resolveDependencies(manifest, ['Lone', 'nonexistent']).ids).toEqual(['Lone']);
  });

  it('reports dependencies that no mod provides', () => {
    expect(resolveDependencies(manifest, ['Broken']).missing).toEqual([{ mod: 'Broken', dependency: 'Nope' }]);
  });
});

describe('dependentsOf', () => {
  it('lists selected mods that would break, transitively', () => {
    expect(dependentsOf(manifest, 'Base', ['Base', 'Mid', 'Top', 'Lone'])).toEqual(['Mid', 'Top']);
    expect(dependentsOf(manifest, 'Base', ['Base', 'Lone'])).toEqual([]);
    expect(dependentsOf(manifest, 'Mid', ['Base', 'Mid', 'Top'])).toEqual(['Top']);
  });
});

const here = dirname(fileURLToPath(import.meta.url));
const DIST = process.env.MIFS_BUNDLE ?? resolve(here, '../../../bundle/dist');
describe.skipIf(!existsSync(join(DIST, 'manifest.json')))('a real built bundle', () => {
  it('resolves the default selection with nothing missing and nothing added', () => {
    const m = parseManifest(JSON.parse(readFileSync(join(DIST, 'manifest.json'), 'utf8')));
    const r = resolveDependencies(m, m.mods.filter((x) => x.default).map((x) => x.id));
    expect(r.missing).toEqual([]);
    expect(r.added).toEqual([]);
    expect(defaultSelection(m)).toHaveLength(m.mods.length);
  });

  it('protects ModLoaderGui prerequisites', () => {
    const m = parseManifest(JSON.parse(readFileSync(join(DIST, 'manifest.json'), 'utf8')));
    const all = m.mods.map((x) => x.id);
    expect(dependentsOf(m, 'ConflictChecker', all).length).toBeGreaterThan(0);
  });
});
