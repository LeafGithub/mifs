import type { LocalModInfo } from '@mifs/core';
import type { LocalMod, LocalModsChange } from '@mifs/ui/platform';
import { app, dialog, type BrowserWindow } from 'electron';
import log from 'electron-log/main';
import { createHash, randomUUID } from 'node:crypto';
import { readFile, rename, stat, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { AppError } from '../ipc';
import { inspectModZip, type FoundMod, type Inside } from './local-mods-utils';

/** One remembered mod. Several entries can share a file (a pack or a wrapper zip). */
interface Entry {
  id: string;
  path: string;
  inside?: Inside;
  /** Of the whole file, when it was last checked. */
  sha256: string;
  fileSize: number;
  mtimeMs: number;
  enabled: boolean;
  info?: LocalModInfo;
  error?: string;
  warnings: string[];
  notes: string[];
  size: number;
}

const MAX_FILE = 500 * 1024 * 1024;

const file = () => join(app.getPath('userData'), 'local-mods.json');
let entries: Entry[] | null = null;
/** Ids whose file was not found on the last check (not stored: the file may come back). */
const missing = new Set<string>();

// Mutations run one at a time so two quick clicks cannot interleave reads and writes of the list.
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const next = queue.then(fn, fn);
  queue = next.catch(() => undefined);
  return next;
}

async function save(): Promise<void> {
  const tmp = `${file()}.tmp`;
  await writeFile(tmp, JSON.stringify({ schema: 1, mods: entries }, null, 2), 'utf8');
  await rename(tmp, file());
}

const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

async function readZip(path: string): Promise<{ bytes: Uint8Array; size: number; mtimeMs: number }> {
  const st = await stat(path);
  if (!st.isFile()) throw new AppError('NOT_A_FILE', 'That is not a file.');
  if (st.size > MAX_FILE) throw new AppError('TOO_LARGE', 'The file is too large to be a mod.');
  return { bytes: new Uint8Array(await readFile(path)), size: st.size, mtimeMs: st.mtimeMs };
}

const sameSpot = (a?: Inside, b?: Inside) => a?.kind === b?.kind && a?.name === b?.name;

function toEntry(path: string, f: { sha256: string; size: number; mtimeMs: number }, found: FoundMod, enabled = true, id: string = randomUUID()): Entry {
  return {
    id,
    path,
    ...(found.inside ? { inside: found.inside } : {}),
    sha256: f.sha256,
    fileSize: f.size,
    mtimeMs: f.mtimeMs,
    enabled,
    ...(found.info ? { info: found.info } : {}),
    ...(found.error ? { error: found.error } : {}),
    warnings: found.warnings,
    notes: found.notes,
    size: found.size,
  };
}

function view(e: Entry): LocalMod {
  return {
    id: e.id,
    fileName: basename(e.path),
    path: e.path,
    ...(e.inside ? { inside: e.inside } : {}),
    name: e.info?.name ?? '',
    version: e.info?.version ?? '',
    aliases: e.info?.aliases ?? [],
    dependsOn: e.info?.dependsOn ?? [],
    size: e.size,
    enabled: e.enabled,
    status: missing.has(e.id) ? 'missing' : e.error ? 'invalid' : 'ok',
    ...(missing.has(e.id) ? { error: `File not found: ${e.path}` } : e.error ? { error: e.error } : {}),
    warnings: e.warnings,
    notes: e.notes,
  };
}

const views = () => (entries ?? []).map(view);

/** Re-checks one file against what was stored: gone, unchanged, or changed (re-read). */
async function recheckFile(path: string, group: Entry[]): Promise<Entry[]> {
  let st;
  try {
    st = await stat(path);
  } catch {
    for (const e of group) missing.add(e.id);
    return group;
  }
  for (const e of group) missing.delete(e.id);
  const first = group[0]!;
  if (st.size === first.fileSize && st.mtimeMs === first.mtimeMs) return group;

  let f: { bytes: Uint8Array; size: number; mtimeMs: number };
  try {
    f = await readZip(path);
  } catch (e) {
    return group.map((g) => ({ ...g, error: e instanceof Error ? e.message : String(e) }));
  }
  const hash = sha256(f.bytes);
  const meta = { sha256: hash, size: f.size, mtimeMs: f.mtimeMs };
  if (hash === first.sha256) return group.map((g) => ({ ...g, fileSize: f.size, mtimeMs: f.mtimeMs }));

  let found: FoundMod[];
  try {
    found = inspectModZip(f.bytes);
  } catch (e) {
    return group.map((g) => ({ ...g, ...meta, error: e instanceof Error ? e.message : String(e) }));
  }
  return group.map((g) => {
    const match = found.find((x) => sameSpot(x.inside, g.inside)) ?? (found.length === 1 ? found[0] : undefined);
    if (!match) return { ...g, ...meta, error: 'This mod is no longer in the file.' };
    const updated = toEntry(path, meta, match, g.enabled, g.id);
    const was = g.info?.version;
    if (match.info && was && was !== match.info.version) updated.notes = [`Updated from the file (was v${was})`, ...updated.notes];
    return updated;
  });
}

async function load(): Promise<Entry[]> {
  if (entries) return entries;
  let stored: Entry[] = [];
  try {
    const json = JSON.parse(await readFile(file(), 'utf8')) as { mods?: Entry[] };
    stored = Array.isArray(json.mods) ? json.mods.filter((e) => e && typeof e.id === 'string' && typeof e.path === 'string') : [];
  } catch {
    // no list yet
  }
  const byPath = new Map<string, Entry[]>();
  for (const e of stored) byPath.set(e.path, [...(byPath.get(e.path) ?? []), e]);
  const checked = new Map<string, Entry>();
  await Promise.all(
    [...byPath].map(async ([path, group]) => {
      try {
        for (const e of await recheckFile(path, group)) checked.set(e.id, e);
      } catch (err) {
        log.warn('local mod re-check failed', path, err);
        for (const e of group) checked.set(e.id, e);
      }
    }),
  );
  entries = stored.map((e) => checked.get(e.id) ?? e);
  await save().catch((e) => log.warn('could not save local mods', e));
  return entries;
}

export const listLocalMods = () => serial(async () => (await load(), views()));

/** Adds every mod found in `paths`. A mod with the same name as one already in the list replaces it in place. */
async function addFiles(paths: string[]): Promise<LocalModsChange> {
  const list = [...(await load())];
  const rejected: LocalModsChange['rejected'] = [];
  const notices: string[] = [];
  for (const path of paths) {
    const fileName = basename(path);
    if (!fileName.toLowerCase().endsWith('.zip')) {
      rejected.push({ fileName, error: 'Only .zip files can be added.' });
      continue;
    }
    let found: FoundMod[];
    let meta: { sha256: string; size: number; mtimeMs: number };
    try {
      const f = await readZip(path);
      meta = { sha256: sha256(f.bytes), size: f.size, mtimeMs: f.mtimeMs };
      found = inspectModZip(f.bytes);
    } catch (e) {
      rejected.push({ fileName, error: e instanceof Error ? e.message : String(e) });
      continue;
    }
    for (const m of found) {
      if (!m.info) {
        rejected.push({ fileName: m.inside ? `${fileName} › ${m.inside.name}` : fileName, error: m.error ?? 'Unreadable mod.' });
        continue;
      }
      const entry = toEntry(path, meta, m);
      const old = list.findIndex((e) => e.info?.name === m.info!.name || (e.path === path && sameSpot(e.inside, m.inside)));
      if (old === -1) list.push(entry);
      else {
        const prev = list[old]!;
        missing.delete(prev.id);
        list[old] = { ...entry, id: prev.id, enabled: prev.enabled };
        notices.push(prev.info && prev.info.version !== m.info.version ? `Replaced ${m.info.name} v${prev.info.version} with v${m.info.version}` : `${m.info.name} was already in the list; it now uses ${fileName}`);
      }
    }
  }
  entries = list;
  await save();
  return { mods: views(), rejected, notices };
}

export function pickLocalMods(win: BrowserWindow | null): Promise<LocalModsChange> {
  return serial(async () => {
    const res = await dialog.showOpenDialog(win ?? undefined!, {
      title: 'Add your own mods',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Mod zip', extensions: ['zip'] }],
    });
    if (res.canceled || res.filePaths.length === 0) return { mods: (await load(), views()), rejected: [], notices: [] };
    return addFiles(res.filePaths);
  });
}

/** Dropped files. The paths come from the renderer, so only existing .zip files are read (see readZip). */
export const addLocalModPaths = (paths: string[]) => serial(() => addFiles(paths));

export function locateLocalMod(win: BrowserWindow | null, id: string): Promise<LocalModsChange> {
  return serial(async () => {
    const list = await load();
    const entry = list.find((e) => e.id === id);
    if (!entry) throw new AppError('NO_LOCAL_MOD', 'That mod is no longer in the list.');
    const res = await dialog.showOpenDialog(win ?? undefined!, {
      title: `Find ${entry.info?.name ?? basename(entry.path)}`,
      defaultPath: entry.path,
      properties: ['openFile'],
      filters: [{ name: 'Mod zip', extensions: ['zip'] }],
    });
    const path = res.filePaths[0];
    if (res.canceled || !path) return { mods: views(), rejected: [], notices: [] };
    let found: FoundMod[];
    let meta: { sha256: string; size: number; mtimeMs: number };
    try {
      const f = await readZip(path);
      meta = { sha256: sha256(f.bytes), size: f.size, mtimeMs: f.mtimeMs };
      found = inspectModZip(f.bytes);
    } catch (e) {
      return { mods: views(), rejected: [{ fileName: basename(path), error: e instanceof Error ? e.message : String(e) }], notices: [] };
    }
    const match = found.find((m) => m.info && m.info.name === entry.info?.name) ?? found.find((m) => m.info);
    if (!match) return { mods: views(), rejected: [{ fileName: basename(path), error: found[0]?.error ?? 'No usable mod in this file.' }], notices: [] };
    missing.delete(id);
    entries = list.map((e) => (e.id === id ? toEntry(path, meta, match, e.enabled, e.id) : e));
    await save();
    return { mods: views(), rejected: [], notices: [] };
  });
}

function mutate(fn: (list: Entry[]) => Entry[]): Promise<LocalMod[]> {
  return serial(async () => {
    entries = fn(await load());
    await save();
    return views();
  });
}

export const setLocalModEnabled = (id: string, enabled: boolean) => mutate((l) => l.map((e) => (e.id === id ? { ...e, enabled } : e)));
export const removeLocalMod = (id: string) => mutate((l) => (missing.delete(id), l.filter((e) => e.id !== id)));
export const moveLocalMod = (id: string, to: number) =>
  mutate((l) => {
    const from = l.findIndex((e) => e.id === id);
    if (from === -1) return l;
    const next = [...l];
    const [e] = next.splice(from, 1);
    next.splice(Math.max(0, Math.min(to, next.length)), 0, e!);
    return next;
  });

/** What the inject worker needs for each requested mod, in the user's order. Refuses mods that cannot be used. */
export async function localModsForInject(ids: string[]): Promise<{ id: string; name: string; aliases: string[]; dependsOn: LocalModInfo['dependsOn']; path: string; inside?: Inside; sha256: string }[]> {
  if (ids.length === 0) return [];
  const list = await serial(load);
  const wanted = new Set(ids);
  const out = [];
  for (const e of list) {
    if (!wanted.has(e.id)) continue;
    wanted.delete(e.id);
    const v = view(e);
    if (v.status !== 'ok' || !e.info) throw new AppError('LOCAL_MOD_UNUSABLE', `${v.name || v.fileName} cannot be used: ${v.error ?? 'unreadable'}`);
    out.push({ id: e.id, name: e.info.name, aliases: e.info.aliases, dependsOn: e.info.dependsOn, path: e.path, ...(e.inside ? { inside: e.inside } : {}), sha256: e.sha256 });
  }
  if (wanted.size > 0) throw new AppError('BAD_MODS', 'Some of your mods are no longer in the list.');
  return out;
}

/** The file changed between the last check and creating the game: re-check it so the list shows what is there now. */
export const recheckLocalMod = (id: string) =>
  serial(async () => {
    const list = await load();
    const entry = list.find((e) => e.id === id);
    if (!entry) return;
    const group = list.filter((e) => e.path === entry.path).map((e) => ({ ...e, mtimeMs: -1 }));
    const checked = new Map((await recheckFile(entry.path, group)).map((e) => [e.id, e]));
    entries = list.map((e) => checked.get(e.id) ?? e);
    await save();
  });
