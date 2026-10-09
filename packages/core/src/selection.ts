import type { BundleManifest, ModEntry } from './manifest.ts';

/** Names that are not mods: the loader itself and the game's version (checked at runtime by CheckGameVersion). */
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
  /** Dependencies that no mod in the bundle provides (virtual names excluded). */
  missing: { mod: string; dependency: string }[];
}

/** Closes a selection over `dependsOn`, keeping the manifest's load order. */
export function resolveDependencies(manifest: BundleManifest, selected: Iterable<string>): Resolution {
  const byId = new Map(manifest.mods.map((m) => [m.id, m]));
  const names = nameIndex(manifest);
  const want = new Set<string>();
  const missing: Resolution['missing'] = [];
  const visit = (id: string) => {
    if (want.has(id)) return;
    const mod = byId.get(id);
    if (!mod) return; // unknown ids are ignored; the UI only offers ids from the manifest
    want.add(id);
    for (const dep of mod.dependsOn) {
      if (VIRTUAL.has(dep.name)) continue;
      const target = names.get(dep.name);
      if (target) visit(target);
      else missing.push({ mod: mod.id, dependency: dep.name });
    }
  };
  const initial = new Set(selected);
  for (const id of initial) visit(id);
  const ids = manifest.mods.filter((m) => want.has(m.id)).map((m) => m.id);
  return { ids, added: ids.filter((id) => !initial.has(id)), missing };
}

/** Selected mods that (directly or transitively) need `id`, i.e. what unchecking `id` would break. */
export function dependentsOf(manifest: BundleManifest, id: string, selected: Iterable<string>): string[] {
  const chosen = new Set(selected);
  const names = nameIndex(manifest);
  const direct = new Map<string, string[]>(); // id -> mods that depend on it
  for (const m of manifest.mods) {
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
  return manifest.mods.filter((m) => found.has(m.id)).map((m) => m.id);
}

/** Convenience for UIs: the default selection of a bundle, dependency-closed. */
export function defaultSelection(manifest: BundleManifest): string[] {
  return resolveDependencies(manifest, manifest.mods.filter((m: ModEntry) => m.default).map((m) => m.id)).ids;
}
