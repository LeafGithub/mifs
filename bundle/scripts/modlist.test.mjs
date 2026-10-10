// Run with: node --test bundle/scripts/modlist.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { parseModList, resolveMods } from './modlist.mjs';

const fixture = (name) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'); // real files from the two repositories

test('parses the thalia fork list: no ImageLoaderHook, no ImageLoaderHook2BeautySelectorAddon, no ModuleCssReplacer', () => {
  const list = parseModList(fixture('modList.thalia.json'));
  assert.equal(list.length, 20);
  assert.ok(list.includes('BeautySelectorAddon/BeautySelectorAddon.mod.zip'));
  for (const gone of ['ImageLoaderHook', 'ImageLoaderHook2BeautySelectorAddon', 'ModuleCssReplacer']) assert.ok(!list.some((p) => p.startsWith(`${gone}/`)), gone);
});

test('parses the upstream list: skips commented-out entries and the .modpack variants', () => {
  const list = parseModList(fixture('modList.upstream-2.101.1.json'));
  assert.equal(list.length, 22);
  assert.ok(list.includes('ImageLoaderHook/ModLoader DoL ImageLoaderHook.mod.zip')); // names with spaces survive
  assert.ok(list.includes('ImageLoaderHook2BeautySelectorAddon/ImageLoaderHook2BeautySelectorAddon.mod.zip'));
  for (const skipped of ['ModuleCssReplacer', 'DoLHookWidget', 'HookMacroRng']) assert.ok(!list.some((p) => p.startsWith(`${skipped}/`)), skipped);
  assert.ok(list.every((p) => p.endsWith('.mod.zip') && !p.startsWith('mod/')));
});

test('tolerates comments, trailing commas, CRLF and duplicates', () => {
  const text = '[\r\n  // a comment\r\n  "mod/A/A.mod.zip",\r\n  "mod/A/A.mod.zip",\r\n  "mod/B/B.mod.zip",\r\n]';
  assert.deepEqual(parseModList(text), ['A/A.mod.zip', 'B/B.mod.zip']);
});

test('rejects broken JSON and wrong shapes', () => {
  assert.throws(() => parseModList('[ "mod/A/A.mod.zip" '), /could not be parsed/);
  assert.throws(() => parseModList('{"a": 1}'), /array of strings/);
  assert.throws(() => parseModList('[1, 2]'), /array of strings/);
});

test('rejects entries that could escape the mod folder', () => {
  for (const evil of ['mod/../../x/evil.mod.zip', 'mod/A/../B.mod.zip', '/etc/evil.mod.zip', 'mod/A\\B.mod.zip', 'mod/A/B/C.mod.zip', 'mod/evil.mod.zip']) {
    assert.throws(() => parseModList(JSON.stringify([evil])), /not a mod zip path/, evil);
  }
});

const fallback = ['F1/F1.mod.zip', 'F2/F2.mod.zip'];
const extras = { upstream: ['X/X.mod.zip'], fork: [] };

test('uses the ref list; the upstream extra is added once, forks get none', () => {
  const refList = ['A/A.mod.zip', 'B/B.mod.zip'];
  assert.deepEqual(resolveMods({ refList, fallback, extras, kind: 'upstream' }), { mods: ['A/A.mod.zip', 'B/B.mod.zip', 'X/X.mod.zip'], source: 'modList.json', extras: ['X/X.mod.zip'] });
  assert.deepEqual(resolveMods({ refList, fallback, extras, kind: 'fork' }), { mods: refList, source: 'modList.json', extras: [] });
  assert.deepEqual(resolveMods({ refList: [...refList, 'X/X.mod.zip'], fallback, extras, kind: 'upstream' }).extras, []); // already listed
});

test('falls back to our list only when the ref has none', () => {
  for (const refList of [null, []]) {
    assert.deepEqual(resolveMods({ refList, fallback, extras, kind: 'fork' }), { mods: fallback, source: 'fallback', extras: [] });
  }
});

test('the real fork list resolves to 20 mods and the real upstream list to 23 (22 plus ModuleCssReplacer)', () => {
  const real = JSON.parse(readFileSync(new URL('../mods.json', import.meta.url), 'utf8'));
  const fork = resolveMods({ refList: parseModList(fixture('modList.thalia.json')), fallback: real.fallback, extras: real.extras, kind: 'fork' });
  const up = resolveMods({ refList: parseModList(fixture('modList.upstream-2.101.1.json')), fallback: real.fallback, extras: real.extras, kind: 'upstream' });
  assert.equal(fork.mods.length, 20);
  assert.equal(up.mods.length, 23);
  assert.ok(up.mods.includes('ModuleCssReplacer/ModuleCssReplacer.mod.zip'));
});
