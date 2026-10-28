/**
 * Just enough of npm-style ranges for boot.json `dependenceInfo`: `||`, `&&` or spaces between comparators,
 * `^`, `~`, `>=`, `<=`, `>`, `<`, `=`, `*`, `x` and partial versions. Pre-release tags are ignored.
 */
type V = [number, number, number];

function parse(v: string): { v: V; parts: number } | null {
  const m = /^v?(\d+|[xX*])(?:\.(\d+|[xX*]))?(?:\.(\d+|[xX*]))?(?:[-+].*)?$/.exec(v.trim());
  if (!m) return null;
  const raw = [m[1], m[2], m[3]];
  let parts = 0;
  const out: number[] = [];
  for (const p of raw) {
    if (p === undefined || /^[xX*]$/.test(p)) break;
    out.push(Number(p));
    parts++;
  }
  while (out.length < 3) out.push(0);
  return { v: out as V, parts };
}

const cmp = (a: V, b: V) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];

/** Smallest version above every version matching the first `parts` numbers of `v`. */
function bumpAt(v: V, parts: number): V {
  if (parts <= 0) return [Infinity, 0, 0];
  if (parts === 1) return [v[0] + 1, 0, 0];
  if (parts === 2) return [v[0], v[1] + 1, 0];
  return [v[0], v[1], v[2] + 1];
}

function comparator(c: string, version: V): boolean | null {
  const m = /^(\^|~|>=|<=|>|<|=)?\s*(.+)$/.exec(c);
  if (!m) return null;
  const op = m[1] ?? '';
  const p = parse(m[2]!);
  if (!p) return null;
  const { v, parts } = p;
  switch (op) {
    case '>=':
      return cmp(version, v) >= 0;
    case '<=':
      return parts < 3 ? cmp(version, bumpAt(v, parts)) < 0 : cmp(version, v) <= 0;
    case '>':
      return parts < 3 ? cmp(version, bumpAt(v, parts)) >= 0 : cmp(version, v) > 0;
    case '<':
      return cmp(version, v) < 0;
    case '^': {
      // ^1.2.3 := >=1.2.3 <2.0.0; ^0.2.3 := <0.3.0; ^0.0.3 := <0.0.4
      const first = v[0] !== 0 || parts <= 1 ? 1 : v[1] !== 0 || parts <= 2 ? 2 : 3;
      return cmp(version, v) >= 0 && cmp(version, bumpAt(v, first)) < 0;
    }
    case '~':
      return cmp(version, v) >= 0 && cmp(version, bumpAt(v, Math.min(Math.max(parts, 1), 2))) < 0;
    default:
      return cmp(version, v) >= 0 && cmp(version, bumpAt(v, parts)) < 0;
  }
}

/** Whether `version` is in `range`. Null when either cannot be read, so callers can stay quiet. */
export function satisfies(version: string, range: string): boolean | null {
  const ver = parse(version);
  if (!ver || ver.parts < 1) return null;
  const r = range.trim();
  if (r === '' || r === '*' || r.toLowerCase() === 'x') return true;
  let unreadable = false;
  for (const alt of r.split('||')) {
    const comps = alt
      .replace(/&&/g, ' ')
      .replace(/(\^|~|>=|<=|>|<|=)\s+/g, '$1')
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (comps.length === 0) return true;
    const results = comps.map((c) => comparator(c, ver.v));
    if (results.some((x) => x === null)) {
      unreadable = true;
      continue;
    }
    if (results.every(Boolean)) return true;
  }
  return unreadable ? null : false;
}
