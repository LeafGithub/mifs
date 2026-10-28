import type { BundleManifest, DepRange } from './manifest.ts';

/** What MIFS needs from a user's own mod's boot.json. */
export interface LocalModInfo {
  name: string;
  version: string;
  aliases: string[];
  /** `dependenceInfo` plus the mods that `addonPlugin` entries hook into. */
  dependsOn: DepRange[];
  /** Files boot.json says are in the zip, normalized (no leading `./`). */
  files: string[];
}

export class BootJsonError extends Error {
  constructor(message: string) {
    super(`boot.json is broken: ${message}`);
    this.name = 'BootJsonError';
  }
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const nonEmpty = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '';

/** boot.json lists that name files inside the zip. `imgFileReplaceList` holds pairs whose second item is the file. */
const FILE_LISTS = ['styleFileList', 'scriptFileList', 'scriptFileList_earlyload', 'scriptFileList_inject_early', 'scriptFileList_preload', 'tweeFileList', 'imgFileList', 'additionFile'];

export const normalizeZipPath = (p: string) => p.replace(/\\/g, '/').replace(/^(\.\/)+/, '');

/** Validates an untrusted boot.json (already JSON-parsed). Throws `BootJsonError`. */
export function parseBootJson(json: unknown): LocalModInfo {
  if (!isObj(json)) throw new BootJsonError('it is not a JSON object');
  if (!nonEmpty(json.name)) throw new BootJsonError('"name" is missing');
  if (!nonEmpty(json.version)) throw new BootJsonError('"version" is missing');

  const aliases = Array.isArray(json.alias) ? json.alias.filter(nonEmpty) : [];

  const dependsOn: DepRange[] = [];
  const seen = new Set<string>();
  const add = (name: unknown, range: unknown) => {
    if (!nonEmpty(name) || seen.has(name)) return;
    seen.add(name);
    dependsOn.push({ name, range: nonEmpty(range) ? range : '*' });
  };
  if (json.dependenceInfo !== undefined) {
    if (!Array.isArray(json.dependenceInfo)) throw new BootJsonError('"dependenceInfo" must be a list');
    for (const d of json.dependenceInfo) if (isObj(d)) add(d.modName, d.version);
  }
  // An addon plugin only works when the mod that provides the addon loads first.
  if (Array.isArray(json.addonPlugin)) for (const a of json.addonPlugin) if (isObj(a)) add(a.modName, a.modVersion);

  const files = new Set<string>();
  for (const key of FILE_LISTS) {
    const list = json[key];
    if (Array.isArray(list)) for (const f of list) if (nonEmpty(f)) files.add(normalizeZipPath(f));
  }
  if (Array.isArray(json.imgFileReplaceList)) {
    for (const pair of json.imgFileReplaceList) if (Array.isArray(pair) && nonEmpty(pair[1])) files.add(normalizeZipPath(pair[1]));
  }

  return { name: json.name.trim(), version: json.version.trim(), aliases, dependsOn, files: [...files] };
}

/** A user's mod as dependency resolution sees it. `id` is the host's handle. */
export interface LocalProvider {
  id: string;
  name: string;
  aliases: string[];
  dependsOn: DepRange[];
}

/** Bundled mods that share a name or alias with `local`; ModLoader would refuse to load both. */
export function bundleClashes(manifest: BundleManifest, local: Pick<LocalProvider, 'name' | 'aliases'>): string[] {
  const names = new Set([local.name, ...local.aliases]);
  return manifest.mods.filter((m) => names.has(m.name) || m.aliases.some((a) => names.has(a))).map((m) => m.id);
}

/**
 * Orders local mods so each comes after the local mods it needs, otherwise keeping the user's order.
 * Cycles are left as they are (ModLoader reports them).
 */
export function orderLocal<T extends LocalProvider>(mods: T[]): T[] {
  const byName = new Map<string, T>();
  for (const m of mods) for (const n of [m.name, ...m.aliases]) if (!byName.has(n)) byName.set(n, m);
  const out: T[] = [];
  const state = new Map<string, 'visiting' | 'done'>();
  const visit = (m: T) => {
    if (state.has(m.id)) return;
    state.set(m.id, 'visiting');
    for (const d of m.dependsOn) {
      const dep = byName.get(d.name);
      if (dep && dep !== m) visit(dep);
    }
    state.set(m.id, 'done');
    out.push(m);
  };
  mods.forEach(visit);
  return out;
}
