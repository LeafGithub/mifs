// Pure helpers for the user's own mod zips (no Electron imports, so the worker and tests can use them).
import { BootJsonError, normalizeZipPath, parseBootJson, type LocalModInfo } from '@mifs/core';
import { strFromU8, unzipSync, zipSync } from 'fflate';

export type Inside = { kind: 'folder' | 'zip'; name: string };

/** One mod found in a file. A file can hold several (a pack of folders, or a wrapper around .mod.zip files). */
export interface FoundMod {
  inside?: Inside;
  info?: LocalModInfo;
  /** Why this mod cannot be used. */
  error?: string;
  warnings: string[];
  notes: string[];
  /** Bytes as embedded (approximate for a repacked folder). */
  size: number;
}

const MAX_ENTRIES = 50_000;
const MAX_TOTAL = 1024 * 1024 * 1024;
/** Listed files to name before "and N more". */
const SHOW_MISSING = 3;

export class ModZipError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ModZipError';
  }
}

const isZipName = (n: string) => n.toLowerCase().endsWith('.zip');
const depth = (n: string) => n.split('/').length - 1;

/**
 * Lists entries and decompresses only boot.json files and inner zips near the top. Entry count and total size
 * are capped so a hostile archive cannot exhaust memory.
 */
function scan(bytes: Uint8Array): { names: string[]; sizes: Map<string, number>; files: Record<string, Uint8Array> } {
  const names: string[] = [];
  const sizes = new Map<string, number>();
  let total = 0;
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, {
      filter: (f) => {
        if (f.name.endsWith('/')) return false;
        if (names.length >= MAX_ENTRIES) throw new ModZipError('The zip has too many files.');
        total += f.originalSize;
        if (total > MAX_TOTAL) throw new ModZipError('The zip is too large.');
        const name = normalizeZipPath(f.name);
        names.push(name);
        sizes.set(name, f.originalSize);
        const base = name.split('/').pop()!;
        return (base === 'boot.json' && depth(name) <= 1) || (isZipName(name) && depth(name) <= 1);
      },
    });
  } catch (e) {
    if (e instanceof ModZipError) throw e;
    throw new ModZipError('This is not a zip file, or it is damaged.');
  }
  // fflate keys by the raw entry name; re-key by the normalized one
  const out: Record<string, Uint8Array> = {};
  for (const [k, v] of Object.entries(files)) out[normalizeZipPath(k)] = v;
  return { names, sizes, files: out };
}

function readBoot(data: Uint8Array): LocalModInfo {
  let json: unknown;
  try {
    json = JSON.parse(strFromU8(data).replace(/^﻿/, ''));
  } catch {
    throw new BootJsonError('it is not valid JSON');
  }
  return parseBootJson(json);
}

/** Checks the boot.json at `prefix` (`''` or `Folder/`) against the entries. */
function modAt(prefix: string, names: Set<string>, files: Record<string, Uint8Array>): Omit<FoundMod, 'size' | 'inside'> {
  try {
    const info = readBoot(files[`${prefix}boot.json`]!);
    const missing = info.files.filter((f) => !names.has(prefix + f));
    const warnings = missing.length
      ? [`boot.json lists files that are not in the zip: ${missing.slice(0, SHOW_MISSING).join(', ')}${missing.length > SHOW_MISSING ? ` and ${missing.length - SHOW_MISSING} more` : ''}`]
      : [];
    return { info, warnings, notes: [] };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e), warnings: [], notes: [] };
  }
}

/** Finds the mods in a zip the user picked. Throws `ModZipError` when the file holds none at all. */
export function inspectModZip(bytes: Uint8Array, nested = false): FoundMod[] {
  const { names, sizes, files } = scan(bytes);
  const set = new Set(names);

  if (files['boot.json']) return [{ ...modAt('', set, files), size: bytes.length }];

  const folders = Object.keys(files)
    .filter((n) => depth(n) === 1 && n.endsWith('/boot.json'))
    .map((n) => n.slice(0, -'/boot.json'.length));
  if (folders.length > 0 && !nested) {
    return folders.map((folder) => {
      const found = modAt(`${folder}/`, set, files);
      const size = names.filter((n) => n.startsWith(`${folder}/`)).reduce((s, n) => s + (sizes.get(n) ?? 0), 0);
      const note = folders.length === 1 ? `Repacked: boot.json was inside the folder "${folder}"` : `Repacked from the folder "${folder}" (one of ${folders.length} mods in this zip)`;
      return { ...found, inside: { kind: 'folder' as const, name: folder }, notes: [...found.notes, note], size };
    });
  }

  const inner = Object.keys(files).filter(isZipName);
  if (inner.length > 0 && !nested) {
    return inner.map((name): FoundMod => {
      const inside: Inside = { kind: 'zip', name };
      const note = `Found inside this zip as ${name}`;
      try {
        const [found] = inspectModZip(files[name]!, true);
        return { ...found!, inside, notes: [note] };
      } catch (e) {
        return { inside, error: e instanceof Error ? e.message : String(e), warnings: [], notes: [note], size: files[name]!.length };
      }
    });
  }

  throw new ModZipError(folders.length > 0 ? 'boot.json is inside a folder of a zip that is itself inside a zip; unpack the outer zip first.' : 'Not a ModLoader mod: no boot.json found.');
}

/** The zip to embed: the file itself, an inner zip, or a folder repacked so boot.json is at the top. */
export function modBytes(bytes: Uint8Array, inside?: Inside): Uint8Array {
  if (!inside) return bytes;
  if (inside.kind === 'zip') {
    const files = unzipSync(bytes, { filter: (f) => normalizeZipPath(f.name) === inside.name });
    const data = Object.values(files)[0];
    if (!data) throw new ModZipError(`${inside.name} is no longer in the zip.`);
    return data;
  }
  const prefix = `${inside.name}/`;
  const files = unzipSync(bytes, { filter: (f) => !f.name.endsWith('/') && normalizeZipPath(f.name).startsWith(prefix) });
  const out: Record<string, Uint8Array> = {};
  for (const [name, data] of Object.entries(files)) {
    const rel = normalizeZipPath(name).slice(prefix.length);
    if (rel.startsWith('/') || rel.split('/').some((p) => p === '..')) throw new ModZipError(`The zip contains an unsafe path: ${JSON.stringify(name)}`);
    out[rel] = data;
  }
  if (!out['boot.json']) throw new ModZipError(`The folder "${inside.name}" no longer has a boot.json.`);
  return zipSync(out);
}
