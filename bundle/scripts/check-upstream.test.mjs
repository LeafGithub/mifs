// Run with: node --test bundle/scripts/check-upstream.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compareVersions, parseUpstreamTags, pickTags, publishedUpstreamVersions } from './check-upstream.mjs';

test('parseUpstreamTags keeps plain x.y.z tags only', () => {
  const out = ['a\trefs/tags/v1.0.6', 'b\trefs/tags/tools-1', 'c\trefs/tags/2.100.1', 'd\trefs/tags/2.101.1', 'e\trefs/tags/2.61.0'].join('\n');
  assert.deepEqual(parseUpstreamTags(out), ['2.100.1', '2.101.1', '2.61.0']);
  assert.deepEqual(parseUpstreamTags(out.replace(/\n/g, '\r\n')), ['2.100.1', '2.101.1', '2.61.0']);
  assert.deepEqual(parseUpstreamTags(''), []);
});

test('compareVersions is numeric, not alphabetical', () => {
  assert.ok(compareVersions('2.101.1', '2.61.0') > 0);
  assert.ok(compareVersions('2.9.0', '2.10.0') < 0);
  assert.equal(compareVersions('2.101.1', '2.101.1'), 0);
});

test('publishedUpstreamVersions ignores forks, the catalog and malformed tags', () => {
  const tags = ['loader-upstream-2.101.1-17c16d9', 'loader-maplebirchleaf-2.102.0-aae1d5d', 'catalog', 'loader-upstream-2.100.0-zzz', 'loader-upstream-2.99.0-abcdef0'];
  assert.deepEqual(publishedUpstreamVersions(tags), ['2.101.1', '2.99.0']);
});

test('nothing to do when the newest official release already has a bundle', () => {
  assert.deepEqual(pickTags({ upstreamTags: ['2.100.1', '2.101.1', '2.61.0'], publishedVersions: ['2.101.1'] }), []);
});

test('picks releases newer than the newest published one, oldest first', () => {
  const upstreamTags = ['2.61.0', '2.101.1', '2.101.2', '2.102.0'];
  assert.deepEqual(pickTags({ upstreamTags, publishedVersions: ['2.101.1'] }), ['2.101.2', '2.102.0']);
});

test('never rebuilds older releases, even when they are missing', () => {
  // 2.100.1 has no bundle, but 2.101.1 does: older tags stay unbuilt
  assert.deepEqual(pickTags({ upstreamTags: ['2.100.1', '2.101.1'], publishedVersions: ['2.101.1'] }), []);
});

test('caps the number of builds per run, keeping the newest', () => {
  const upstreamTags = ['2.102.0', '2.102.1', '2.102.2', '2.102.3'];
  assert.deepEqual(pickTags({ upstreamTags, publishedVersions: ['2.101.1'], max: 2 }), ['2.102.2', '2.102.3']);
});

test('with nothing published yet, only the newest release is built', () => {
  assert.deepEqual(pickTags({ upstreamTags: ['2.100.1', '2.101.1', '2.61.0'], publishedVersions: [] }), ['2.101.1']);
  assert.deepEqual(pickTags({ upstreamTags: [], publishedVersions: [] }), []);
});

test('duplicates in the tag list do not cause duplicate builds', () => {
  assert.deepEqual(pickTags({ upstreamTags: ['2.102.0', '2.102.0'], publishedVersions: ['2.101.1'] }), ['2.102.0']);
});
