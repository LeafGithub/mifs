import type { LocalProvider } from './localMod.ts';
import type { BundleManifest, ModEntry } from './manifest.ts';

/** Names that are not mods: the loader and the game version. */
const VIRTUAL = new Set(['ModLoader', 'GameVersion']);

/** Maps every name a mod can be depended on by (name, aliases) to the mod's id. */
function nameIndex(manifest: BundleManifest): Map<string, string> {
  const index = new Map<string, string>();
  for (const m of manifest.mods) {
    index.set(m.name, m.id);
    for (const a of m.aliases) if (!index.has(a)) index.set(a, m.id);
  }
  return index;
}

export interface Resolution {
  /** Selected ids plus everything they need, in the bundle's load order. */
  ids: string[];
  /** Ids that were not selected but had to be added. */
  added: string[];
  /** Dependencies that no bundled or local mod provides (virtual names excluded). `mod` may be a local id. */
  missing: { mod: string; dependency: string }[];
}

/**
 * Closes a selection over `dependsOn`, keeping the manifest's load order. `local` are the user's own mods that go
 * in too: they satisfy dependencies by name, and the bundled mods they need are added.
 */
export function resolveDependencies(manifest: BundleManifest, selected: Iterable<string>, local: LocalProvider[] = []): Resolution {
  const byId = new Map(manifest.mods.map((m) => [m.id, m]));
  const names = nameIndex(manifest);
  const localNames = new Set(local.flatMap((m) => [m.name, ...m.aliases]));
  const want = new Set<string>();
  const missing: Resolution['missing'] = [];
  const need = (from: string, dep: string) => {
    if (VIRTUAL.has(dep)) return;
    const target = names.get(dep);
    if (target) visit(target);
    else if (!localNames.has(dep)) missing.push({ mod: from, dependency: dep });
  };
  const visit = (id: string) => {
    if (want.has(id)) return;
    const mod = byId.get(id);
    if (!mod) return; // unknown ids are ignored; the UI only offers ids from the manifest
    want.add(id);
    for (const dep of mod.dependsOn) need(mod.id, dep.name);
  };
  const initial = new Set(selected);
  for (const id of initial) visit(id);
  for (const m of local) for (const dep of m.dependsOn) need(m.id, dep.name);
  const ids = manifest.mods.filter((m) => want.has(m.id)).map((m) => m.id);
  return { ids, added: ids.filter((id) => !initial.has(id)), missing };
}

/**
 * Selected mods (bundled ids, then local ids) that need `id`, directly or not: what unchecking it would break.
 * Every mod in `local` counts as selected.
 */
export function dependentsOf(manifest: BundleManifest, id: string, selected: Iterable<string>, local: LocalProvider[] = []): string[] {
  const chosen = new Set([...selected, ...local.map((m) => m.id)]);
  const names = nameIndex(manifest);
  for (const m of local) for (const n of [m.name, ...m.aliases]) if (!names.has(n)) names.set(n, m.id);
  const direct = new Map<string, string[]>(); // id -> mods that depend on it
  for (const m of [...manifest.mods, ...local]) {
    for (const dep of m.dependsOn) {
      const target = names.get(dep.name);
      if (target) direct.set(target, [...(direct.get(target) ?? []), m.id]);
    }
  }
  const found = new Set<string>();
  const walk = (cur: string) => {
    for (const d of direct.get(cur) ?? []) {
      if (chosen.has(d) && !found.has(d) && d !== id) {
        found.add(d);
        walk(d);
      }
    }
  };
  walk(id);
  return [...manifest.mods.map((m) => m.id), ...local.map((m) => m.id)].filter((x) => found.has(x));
}

/** The bundle's default selection, dependency-closed. */
export function defaultSelection(manifest: BundleManifest): string[] {
  return resolveDependencies(manifest, manifest.mods.filter((m: ModEntry) => m.default).map((m) => m.id)).ids;
}
