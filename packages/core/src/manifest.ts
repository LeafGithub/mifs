/** A file inside a bundle. `path` is relative to the bundle root and never escapes it. */
export interface FileRef {
  path: string;
  sha256: string;
  size: number;
}

export interface DepRange {
  /**
   * Mod name as it appears in the dependent's boot.json. Two names are virtual: `"ModLoader"` is the loader itself
   * and `"GameVersion"` is the game's version, which the CheckGameVersion mod verifies at runtime (e.g. `>0.5 && <0.6`).
   */
  name: string;
  /** npm-style semver range, e.g. `^2.100.0`. */
  range: string;
}

export interface ModEntry extends FileRef {
  /** Folder name in the ModLoader repo; stable key for UI selections. */
  id: string;
  /** Name from boot.json; what other mods' `dependsOn` refers to. */
  name: string;
  version: string;
  /** Other names other mods may use to depend on this one (boot.json `alias`). */
  aliases: string[];
  /** Submodule commit, when it differs from the loader commit. */
  commit?: string;
  dependsOn: DepRange[];
  /** Included in the default install. */
  default: boolean;
}

/** `manifest.json` at the root of a ModLoader bundle (see bundle/scripts/build-bundle.mjs). */
export interface BundleManifest {
  schema: 1;
  /** `<upstream|owner>-<loader version>-<short commit>`, also the release tag suffix. */
  id: string;
  kind: 'upstream' | 'fork';
  loader: { version: string; repo: string; ref: string; commit: string; builtAt: string };
  /** `dist-BeforeSC2/BeforeSC2.js`, the in-page loader. */
  beforeSC2: FileRef;
  /** In default load order. */
  mods: ModEntry[];
  /** License files to ship alongside any copy of the bundle. */
  licenses: string[];
  builder?: { node?: string; runUrl?: string };
}

export class ManifestError extends Error {
  constructor(message: string) {
    super(`Invalid bundle manifest: ${message}`);
    this.name = 'ManifestError';
  }
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

function str(o: Obj, key: string, where: string): string {
  const v = o[key];
  if (typeof v !== 'string' || v === '') throw new ManifestError(`${where}.${key} must be a non-empty string`);
  return v;
}

function strArray(v: unknown, where: string): string[] {
  if (v === undefined) return [];
  if (!Array.isArray(v) || v.some((x) => typeof x !== 'string')) throw new ManifestError(`${where} must be an array of strings`);
  return v as string[];
}

/** Relative, forward-slash paths only: the app reads and writes these, so no absolute paths or `..`. */
function safePath(p: string, where: string): string {
  if (p.startsWith('/') || p.includes('\\') || /^[a-zA-Z]:/.test(p) || p.split('/').some((s) => s === '..' || s === '' || s === '.')) {
    throw new ManifestError(`${where} is not a safe relative path: ${JSON.stringify(p)}`);
  }
  return p;
}

function fileRef(v: unknown, where: string): FileRef {
  if (!isObj(v)) throw new ManifestError(`${where} must be an object`);
  const sha256 = str(v, 'sha256', where);
  if (!/^[0-9a-f]{64}$/.test(sha256)) throw new ManifestError(`${where}.sha256 must be 64 lowercase hex chars`);
  const size = v.size;
  if (typeof size !== 'number' || !Number.isInteger(size) || size < 0) throw new ManifestError(`${where}.size must be a non-negative integer`);
  return { path: safePath(str(v, 'path', where), `${where}.path`), sha256, size };
}

/** Validates untrusted JSON (a downloaded manifest) and returns it typed. Throws `ManifestError`. */
export function parseManifest(json: unknown): BundleManifest {
  if (!isObj(json)) throw new ManifestError('not an object');
  if (json.schema !== 1) throw new ManifestError(`unsupported schema ${JSON.stringify(json.schema)} (this app understands 1)`);
  const kind = json.kind;
  if (kind !== 'upstream' && kind !== 'fork') throw new ManifestError('kind must be "upstream" or "fork"');

  const l = json.loader;
  if (!isObj(l)) throw new ManifestError('loader must be an object');
  const loader = { version: str(l, 'version', 'loader'), repo: str(l, 'repo', 'loader'), ref: str(l, 'ref', 'loader'), commit: str(l, 'commit', 'loader'), builtAt: str(l, 'builtAt', 'loader') };
  if (!/^\d+\.\d+\.\d+/.test(loader.version)) throw new ManifestError(`loader.version looks wrong: ${loader.version}`);

  if (!Array.isArray(json.mods) || json.mods.length === 0) throw new ManifestError('mods must be a non-empty array');
  const seen = new Set<string>();
  const mods = json.mods.map((m: unknown, i): ModEntry => {
    const where = `mods[${i}]`;
    if (!isObj(m)) throw new ManifestError(`${where} must be an object`);
    const ref = fileRef(m, where);
    const id = str(m, 'id', where);
    if (seen.has(id)) throw new ManifestError(`duplicate mod id ${id}`);
    seen.add(id);
    const deps = m.dependsOn ?? [];
    if (!Array.isArray(deps)) throw new ManifestError(`${where}.dependsOn must be an array`);
    return {
      ...ref,
      id,
      name: str(m, 'name', where),
      version: str(m, 'version', where),
      aliases: strArray(m.aliases, `${where}.aliases`),
      ...(typeof m.commit === 'string' ? { commit: m.commit } : {}),
      dependsOn: deps.map((d: unknown, j) => {
        if (!isObj(d)) throw new ManifestError(`${where}.dependsOn[${j}] must be an object`);
        return { name: str(d, 'name', `${where}.dependsOn[${j}]`), range: str(d, 'range', `${where}.dependsOn[${j}]`) };
      }),
      default: m.default !== false,
    };
  });

  const licenses = json.licenses ?? [];
  if (!Array.isArray(licenses) || licenses.some((x) => typeof x !== 'string')) throw new ManifestError('licenses must be an array of strings');

  return {
    schema: 1,
    id: str(json, 'id', 'manifest'),
    kind,
    loader,
    beforeSC2: fileRef(json.beforeSC2, 'beforeSC2'),
    mods,
    licenses: (licenses as string[]).map((p, i) => safePath(p, `licenses[${i}]`)),
    ...(isObj(json.builder) ? { builder: json.builder as BundleManifest['builder'] } : {}),
  };
}
