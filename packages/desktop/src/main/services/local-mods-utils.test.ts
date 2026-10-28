import { strToU8, unzipSync, zipSync, type Zippable } from 'fflate';
import { describe, expect, it } from 'vitest';
import { inspectModZip, modBytes } from './local-mods-utils';

const boot = (name: string, extra: Record<string, unknown> = {}) => strToU8(JSON.stringify({ name, version: '1.0.0', ...extra }));
const zip = (files: Zippable) => zipSync(files);

describe('inspectModZip', () => {
  it('reads a mod with boot.json at the top and embeds it byte for byte', () => {
    const bytes = zip({ 'boot.json': boot('A', { scriptFileList: ['./dist/a.js'] }), dist: { 'a.js': strToU8('1') } });
    const [found, ...rest] = inspectModZip(bytes);
    expect(rest).toEqual([]);
    expect(found).toMatchObject({ info: { name: 'A', version: '1.0.0' }, warnings: [], notes: [], size: bytes.length });
    expect(found!.inside).toBeUndefined();
    expect(modBytes(bytes)).toBe(bytes);
  });

  it('warns about listed files that are missing, naming the first few', () => {
    const [found] = inspectModZip(zip({ 'boot.json': boot('A', { tweeFileList: ['a.twee', 'b.twee', 'c.twee', 'd.twee', 'e.twee'], styleFileList: ['s.css'] }), 's.css': strToU8('') }));
    expect(found!.warnings).toEqual(['boot.json lists files that are not in the zip: a.twee, b.twee, c.twee and 2 more']);
  });

  it('repacks a mod whose boot.json sits inside a folder', () => {
    const bytes = zip({ MyMod: { 'boot.json': boot('MyMod'), img: { 'a.png': new Uint8Array([1, 2, 3]) } } });
    const [found] = inspectModZip(bytes);
    expect(found).toMatchObject({ inside: { kind: 'folder', name: 'MyMod' }, info: { name: 'MyMod' } });
    expect(found!.notes[0]).toMatch(/Repacked/);
    const repacked = unzipSync(modBytes(bytes, found!.inside));
    expect(Object.keys(repacked).sort()).toEqual(['boot.json', 'img/a.png']);
    expect([...repacked['img/a.png']!]).toEqual([1, 2, 3]);
    expect(inspectModZip(modBytes(bytes, found!.inside))[0]!.info!.name).toBe('MyMod');
  });

  it('finds every mod in a pack of folders', () => {
    const found = inspectModZip(zip({ A: { 'boot.json': boot('A') }, B: { 'boot.json': boot('B') }, 'readme.txt': strToU8('hi') }));
    expect(found.map((f) => f.info?.name)).toEqual(['A', 'B']);
    expect(found[1]!.notes[0]).toMatch(/one of 2 mods/);
  });

  it('uses the .mod.zip files inside a download wrapper', () => {
    const inner = zip({ 'boot.json': boot('Inner') });
    const bytes = zip({ 'Inner.mod.zip': inner, 'broken.mod.zip': strToU8('nope'), 'README.txt': strToU8('') });
    const found = inspectModZip(bytes);
    expect(found).toHaveLength(2);
    expect(found[0]).toMatchObject({ inside: { kind: 'zip', name: 'Inner.mod.zip' }, info: { name: 'Inner' } });
    expect(found[1]!.error).toMatch(/not a zip/);
    expect([...modBytes(bytes, found[0]!.inside)]).toEqual([...inner]);
  });

  it('reports a broken boot.json on the mod instead of failing the whole file', () => {
    const [found] = inspectModZip(zip({ 'boot.json': strToU8('{ name: ') }));
    expect(found!.error).toMatch(/not valid JSON/);
    expect(inspectModZip(zip({ 'boot.json': strToU8('{"version":"1"}') }))[0]!.error).toMatch(/"name"/);
  });

  it('accepts a boot.json with a byte order mark', () => {
    expect(inspectModZip(zip({ 'boot.json': new Uint8Array([0xef, 0xbb, 0xbf, ...boot('Bom')]) }))[0]!.info!.name).toBe('Bom');
  });

  it('rejects files that are no mod at all', () => {
    expect(() => inspectModZip(strToU8('plain text'))).toThrow(/not a zip/);
    expect(() => inspectModZip(zip({ 'readme.txt': strToU8('') }))).toThrow(/no boot\.json/);
    expect(() => inspectModZip(zip({ a: { b: { 'boot.json': boot('Deep') } } }))).toThrow(/no boot\.json/);
  });

  it('caps the number of entries', () => {
    const many: Zippable = { 'boot.json': boot('A') };
    for (let i = 0; i < 50_001; i++) many[`f${i}`] = new Uint8Array(0);
    expect(() => inspectModZip(zip(many))).toThrow(/too many files/);
  }, 30_000); // building 50k entries is slow
});

describe('modBytes', () => {
  it('refuses a folder that lost its boot.json and an inner zip that is gone', () => {
    const bytes = zip({ X: { 'a.js': strToU8('') } });
    expect(() => modBytes(bytes, { kind: 'folder', name: 'X' })).toThrow(/no longer has a boot\.json/);
    expect(() => modBytes(bytes, { kind: 'zip', name: 'Y.mod.zip' })).toThrow(/no longer in the zip/);
  });
});
