import { describe, expect, it } from 'vitest';
import { BUILD_NEEDS_BYTES, diskStatus, UPSTREAM_REPO, failureMessage, isUpstream, lineSplitter, nodeMajor, normalizeRef, normalizeRepo, parseMark, parseTags } from './build-utils';

describe('normalizeRepo', () => {
  it('accepts GitHub https URLs and adds .git', () => {
    expect(normalizeRepo('https://github.com/MaplebirchLeaf/sugarcube-2-ModLoader')).toBe('https://github.com/MaplebirchLeaf/sugarcube-2-ModLoader.git');
    expect(normalizeRepo(' https://github.com/a/b.git ')).toBe('https://github.com/a/b.git');
  });

  it('rejects everything else', () => {
    for (const bad of ['http://github.com/a/b', 'https://gitlab.com/a/b', 'git@github.com:a/b.git', 'https://github.com/a', 'https://github.com/a/b/c', 'file:///C:/x', '--upload-pack=calc', 'https://github.com/a/b.git; rm -rf /', 'https://evil.com/github.com/a/b']) {
      expect(() => normalizeRepo(bad), bad).toThrow();
    }
  });

  it('recognizes upstream regardless of .git and case', () => {
    expect(isUpstream(UPSTREAM_REPO)).toBe(true);
    expect(isUpstream('https://github.com/lyoko-jeremie/sugarcube-2-modloader')).toBe(true);
    expect(isUpstream('https://github.com/MaplebirchLeaf/sugarcube-2-ModLoader')).toBe(false);
  });
});

describe('normalizeRef', () => {
  it('accepts tags, branches and commits', () => {
    for (const ok of ['2.101.1', 'thalia', 'feature/x-1', 'v1.0.6', '17c16d91b6c10ea14ee19a4ddd49a3f76bd1655f']) expect(normalizeRef(ok)).toBe(ok);
  });

  it('rejects option-like, traversal and malformed refs', () => {
    for (const bad of ['', '-x', '--upload-pack=x', '../x', 'a..b', 'a b', 'a;b', 'x/', 'x.lock', 'a\nb']) expect(() => normalizeRef(bad), bad).toThrow();
  });
});

describe('parseTags', () => {
  const out = [
    'aaa\trefs/tags/v1.0.6',
    'bbb\trefs/tags/tools-1',
    'ccc\trefs/tags/2.100.1',
    'ddd\trefs/tags/2.101.1',
    'eee\trefs/tags/2.61.0',
    'fff\trefs/tags/2.9.0',
  ].join('\n');

  it('keeps release-style tags and sorts newest first (numerically)', () => {
    expect(parseTags(out)).toEqual(['2.101.1', '2.100.1', '2.61.0', '2.9.0', 'v1.0.6']);
  });

  it('copes with CRLF and empty output', () => {
    expect(parseTags(out.replace(/\n/g, '\r\n'))[0]).toBe('2.101.1');
    expect(parseTags('')).toEqual([]);
  });
});

describe('nodeMajor / parseMark', () => {
  it('reads node versions', () => {
    expect(nodeMajor('v24.15.0')).toBe(24);
    expect(nodeMajor('18.0.0')).toBe(18);
    expect(nodeMajor('nonsense')).toBeNull();
  });

  it('parses progress markers and ignores everything else', () => {
    expect(parseMark('##mifs {"label":"Building","fraction":0.25}')).toEqual({ label: 'Building', fraction: 0.25 });
    expect(parseMark('##mifs {"label":"x","fraction":7}')?.fraction).toBe(1);
    expect(parseMark('##mifs {broken')).toBeNull();
    expect(parseMark('$ corepack yarn install')).toBeNull();
    expect(parseMark('##mifs {"label":1,"fraction":"a"}')).toBeNull();
  });
});

describe('failureMessage', () => {
  const trace = ['fatal: Remote branch nope not found in upstream origin', 'Error: failed (128): git clone', '    at file:///x/build-bundle.mjs:47:3', '    at ModuleJob.run (node:internal/modules/esm/module_job:437:25)', 'Node.js v24.15.0'];

  it('names a known cause and drops stack frames', () => {
    const m = failureMessage(1, trace, 'C:\\logs\\b.log');
    expect(m).toMatch(/^That tag or branch does not exist/);
    expect(m).toContain('fatal: Remote branch nope');
    expect(m).not.toContain('ModuleJob');
    expect(m).not.toContain('Node.js v24');
    expect(m).toContain('Full log: C:\\logs\\b.log');
  });

  it('falls back to the exit code and recognizes network and disk errors', () => {
    expect(failureMessage(2, ['something odd'], 'l')).toMatch(/^The build failed \(exit 2\)\./);
    expect(failureMessage(1, ['fatal: unable to access https://github.com/x'], 'l')).toMatch(/^Could not reach GitHub/);
    expect(failureMessage(1, ['npm ERR! ENOSPC: no space left on device'], 'l')).toMatch(/^The disk is full/);
  });
});

describe('lineSplitter', () => {
  it('reassembles lines across chunks', () => {
    const lines: string[] = [];
    const s = lineSplitter((l) => lines.push(l));
    s.push('one\ntw');
    s.push('o\r\nthree');
    s.end();
    expect(lines).toEqual(['one', 'two', 'three']);
  });
});

describe('diskStatus', () => {
  const GB = 1024 ** 3;

  it('passes when there is room for a build and says how much is free', () => {
    expect(diskStatus(108 * GB)).toEqual({ found: true, version: '108 GB free', ok: true });
    expect(diskStatus(BUILD_NEEDS_BYTES).ok).toBe(true); // exactly enough is enough
  });

  it('fails with advice when space is short', () => {
    const s = diskStatus(2.5 * GB);
    expect(s.ok).toBe(false);
    expect(s.version).toBe('2.5 GB free');
    expect(s.hint).toMatch(/needs about 5\.0 GB/);
    expect(diskStatus(BUILD_NEEDS_BYTES - 1).ok).toBe(false);
  });

  it('never blocks when the OS cannot report free space', () => {
    expect(diskStatus(null)).toEqual({ found: true, version: 'unknown', ok: true });
  });
});
