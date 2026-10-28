import { describe, expect, it } from 'vitest';
import { BootJsonError, bundleClashes, dependentsOf, orderLocal, parseBootJson, parseManifest, resolveDependencies, satisfies, type LocalProvider } from '../src/index.ts';

const mod = (id: string, deps: string[] = [], aliases: string[] = []) => ({
  id,
  name: id,
  version: '1.0.0',
  aliases,
  path: `mods/${id}.zip`,
  sha256: 'b'.repeat(64),
  size: 1,
  dependsOn: [{ name: 'ModLoader', range: '^2' }, ...deps.map((name) => ({ name, range: '*' }))],
  default: true,
});
const manifest = parseManifest({
  schema: 1,
  id: 't',
  kind: 'upstream',
  loader: { version: '2.0.0', repo: 'r', ref: 'x', commit: 'c', builtAt: 'now' },
  beforeSC2: { path: 'BeforeSC2.js', sha256: 'a'.repeat(64), size: 1 },
  mods: [mod('Base'), mod('Mid', ['Base'], ['MidAlias']), mod('Lone')],
  licenses: [],
});
const local = (id: string, deps: string[] = [], aliases: string[] = []): LocalProvider => ({ id, name: id, aliases, dependsOn: deps.map((name) => ({ name, range: '*' })) });

describe('parseBootJson', () => {
  it('reads name, version, aliases, dependencies (with addon plugins) and listed files', () => {
    const info = parseBootJson({
      name: ' MyMod ',
      version: '1.2.0',
      alias: ['Mine', 3],
      dependenceInfo: [{ modName: 'ModLoader', version: '^2.0.0' }, { modName: 'TweeReplacer', version: '^1.0.0' }],
      addonPlugin: [{ modName: 'TweeReplacer', addonName: 'x', modVersion: '1.0.0' }, { modName: 'ImageHook', addonName: 'y' }],
      scriptFileList: ['./dist/a.js'],
      tweeFileList: ['t\\a.twee'],
      imgFileReplaceList: [['img/old.png', 'img/new.png']],
    });
    expect(info).toEqual({
      name: 'MyMod',
      version: '1.2.0',
      aliases: ['Mine'],
      dependsOn: [{ name: 'ModLoader', range: '^2.0.0' }, { name: 'TweeReplacer', range: '^1.0.0' }, { name: 'ImageHook', range: '*' }],
      files: ['dist/a.js', 't/a.twee', 'img/new.png'],
    });
  });

  it('rejects missing name or version and a malformed dependency list', () => {
    expect(() => parseBootJson([])).toThrow(BootJsonError);
    expect(() => parseBootJson({ version: '1' })).toThrow(/"name"/);
    expect(() => parseBootJson({ name: 'a' })).toThrow(/"version"/);
    expect(() => parseBootJson({ name: 'a', version: '1', dependenceInfo: {} })).toThrow(/dependenceInfo/);
  });
});

describe('local mods in dependency resolution', () => {
  it('pulls in the bundled mods a local mod needs, through aliases', () => {
    const r = resolveDependencies(manifest, ['Lone'], [local('Mine', ['MidAlias'])]);
    expect(r.ids).toEqual(['Base', 'Mid', 'Lone']);
    expect(r.added).toEqual(['Base', 'Mid']);
    expect(r.missing).toEqual([]);
  });

  it('lets local mods satisfy each other and reports what nobody provides', () => {
    const r = resolveDependencies(manifest, [], [local('A', ['B', 'GameVersion']), local('B', [], ['Bee']), local('C', ['Bee', 'Nope'])]);
    expect(r.ids).toEqual([]);
    expect(r.missing).toEqual([{ mod: 'C', dependency: 'Nope' }]);
  });

  it('blocks unchecking a bundled mod that a local mod needs', () => {
    expect(dependentsOf(manifest, 'Base', ['Base', 'Lone'], [local('Mine', ['Base'])])).toEqual(['Mine']);
    expect(dependentsOf(manifest, 'Base', ['Base', 'Mid'], [local('Mine', ['MidAlias'])])).toEqual(['Mid', 'Mine']);
    expect(dependentsOf(manifest, 'Lone', ['Lone'], [local('Mine', ['Base'])])).toEqual([]);
  });

  it('finds name and alias clashes with bundled mods', () => {
    expect(bundleClashes(manifest, { name: 'Mid', aliases: [] })).toEqual(['Mid']);
    expect(bundleClashes(manifest, { name: 'Other', aliases: ['MidAlias'] })).toEqual(['Mid']);
    expect(bundleClashes(manifest, { name: 'Other', aliases: [] })).toEqual([]);
  });

  it('orders local mods after the local mods they need, otherwise keeping the user order', () => {
    const order = orderLocal([local('A', ['C']), local('B'), local('C', ['Bee']), local('D', [], ['Bee'])]).map((m) => m.id);
    expect(order).toEqual(['D', 'C', 'A', 'B']);
    expect(orderLocal([local('X', ['Y']), local('Y', ['X'])]).map((m) => m.id)).toEqual(['Y', 'X']); // cycle: no crash
  });
});

describe('satisfies', () => {
  it.each([
    ['2.101.1', '^1.6.1 || ^2.0.0', true],
    ['1.5.0', '^1.6.1 || ^2.0.0', false],
    ['0.5.3', '>0.5 && <0.6', false], // >0.5 means above every 0.5.x
    ['0.6.0', '>=0.5 <0.7', true],
    ['1.2.9', '~1.2.3', true],
    ['1.3.0', '~1.2.3', false],
    ['0.2.5', '^0.2.3', true],
    ['0.3.0', '^0.2.3', false],
    ['2.0.0', '2.x', true],
    ['3.0.0', '2', false],
    ['1.0.0', '*', true],
    ['1.0.0', '1.0.0', true],
    ['1.0.1', '1.0.0', false],
  ])('%s in %s -> %s', (v, r, want) => expect(satisfies(v, r)).toBe(want));

  it('returns null for ranges it cannot read', () => {
    expect(satisfies('1.0.0', 'latest')).toBeNull();
    expect(satisfies('abc', '^1.0.0')).toBeNull();
  });
});
