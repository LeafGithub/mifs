// Pure helpers for build-from-source (no Electron imports, so they are unit-testable).

export const UPSTREAM_REPO = 'https://github.com/Lyoko-Jeremie/sugarcube-2-ModLoader.git';

const REPO_RE = /^https:\/\/github\.com\/([A-Za-z0-9][A-Za-z0-9._-]{0,99})\/([A-Za-z0-9][A-Za-z0-9._-]{0,99}?)(\.git)?$/;
const REF_RE = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,99}$/;

/** Only plain GitHub https URLs are accepted; the result always ends in `.git`. */
export function normalizeRepo(repo: string): string {
  const m = REPO_RE.exec(repo.trim());
  if (!m) throw new Error('Enter a GitHub repository address like https://github.com/owner/repo');
  return `https://github.com/${m[1]}/${m[2]}.git`;
}

/** A tag, branch or commit. Rejects anything that could be read as a git option or a path escape. */
export function normalizeRef(ref: string): string {
  const r = ref.trim();
  if (!REF_RE.test(r) || r.includes('..') || r.endsWith('/') || r.endsWith('.lock')) throw new Error('That tag or branch name is not valid.');
  return r;
}

export const isUpstream = (repo: string): boolean => normalizeRepo(repo).toLowerCase() === UPSTREAM_REPO.toLowerCase();

type Triple = [number, number, number];
const triple = (v: string): Triple | null => {
  const m = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(v);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
};

/** `git ls-remote --tags --refs` output -> release-style tags (x.y.z) sorted newest first. */
export function parseTags(lsRemote: string): string[] {
  const tags: { name: string; v: Triple }[] = [];
  for (const line of lsRemote.split(/\r?\n/)) {
    const name = /\trefs\/tags\/(.+)$/.exec(line)?.[1]?.trim();
    const v = name ? triple(name) : null;
    if (name && v) tags.push({ name, v });
  }
  tags.sort((a, b) => b.v[0] - a.v[0] || b.v[1] - a.v[1] || b.v[2] - a.v[2]);
  return tags.map((t) => t.name);
}

/** `v24.15.0` -> 24 */
export const nodeMajor = (version: string): number | null => {
  const m = /^v?(\d+)\./.exec(version.trim());
  return m ? Number(m[1]) : null;
};

export interface Mark {
  label: string;
  fraction: number;
}

/** Parses the `##mifs {"label":..,"fraction":..}` progress lines printed by bundle/scripts/build-bundle.mjs. */
export function parseMark(line: string): Mark | null {
  if (!line.startsWith('##mifs ')) return null;
  try {
    const v = JSON.parse(line.slice('##mifs '.length)) as Partial<Mark>;
    return typeof v.label === 'string' && typeof v.fraction === 'number' ? { label: v.label, fraction: Math.min(1, Math.max(0, v.fraction)) } : null;
  } catch {
    return null;
  }
}

/** Turns the end of the build output into something readable: a known cause when recognizable, no stack traces. */
export function failureMessage(code: number | null, tail: string[], logFile: string): string {
  const text = tail.join('\n');
  let known: string | null = null;
  if (/Remote branch|pathspec .* did not match/i.test(text)) known = 'That tag or branch does not exist in the repository.';
  else if (/Could not resolve host|unable to access|Failed to connect/i.test(text)) known = 'Could not reach GitHub. Check your internet connection.';
  else if (/ENOSPC|no space left/i.test(text)) known = 'The disk is full.';
  const lines = tail.filter((l) => l.trim() && !/^\s+at |^Node\.js v|^\s*\^+\s*$|^file:\/\//.test(l)).slice(-4);
  return `${known ?? `The build failed (exit ${code}).`}${lines.length ? `\n\n${lines.join('\n')}` : ''}\n\nFull log: ${logFile}`;
}

/** Splits a stream into complete lines, keeping the unfinished tail for the next chunk. */
export function lineSplitter(onLine: (line: string) => void) {
  let tail = '';
  return {
    push(chunk: string) {
      const parts = (tail + chunk).split(/\r?\n/);
      tail = parts.pop() ?? '';
      for (const p of parts) onLine(p);
    },
    end() {
      if (tail) onLine(tail);
      tail = '';
    },
  };
}
