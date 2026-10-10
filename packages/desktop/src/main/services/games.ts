import type { GameAdapter, GameFile, ProgressEvent } from '@mifs/ui/platform';
import { dialog, type BrowserWindow } from 'electron';
import { unzipSync } from 'fflate';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { AppError } from '../ipc';
import { SAFE_NAME, gamesDir } from '../paths';

type Progress = (e: ProgressEvent) => void;

interface AdapterDef extends GameAdapter {
  gitlabProject: string;
  /** Substring of the release asset name that holds the HTML (zip). */
  assetName: string;
}

// Hosts a release asset may be downloaded from; the release JSON is untrusted input.
const ALLOWED_HOSTS = ['gitgud.io', 'dolp.download'];

const ADAPTERS: AdapterDef[] = [
  { id: 'dolp', name: 'Degrees of Lewdity Plus', description: 'Latest HTML-only release from GitGud', gitlabProject: 'Frostberg/degrees-of-lewdity-plus', assetName: 'DoLP_HTML_only' },
  { id: 'xchange', name: 'DoL X-Change Edition', description: 'Latest HTML release (images and audio are separate downloads)', gitlabProject: 'Akoz/dol-xchange', assetName: 'DoLX_HTML' },
];

export const listAdapters = (): GameAdapter[] => ADAPTERS.map(({ id, name, description }) => ({ id, name, description }));

/** Files the renderer may refer to, by opaque id. The renderer never sees or supplies paths for games. */
const registry = new Map<string, { path: string; name: string; size: number; originDir?: string }>();

/** `originDir` is the folder the user's own file came from; downloads and unpacked copies have none. */
async function register(path: string, name: string, source: GameFile['source'], originDir?: string): Promise<GameFile> {
  const id = randomUUID();
  const size = (await stat(path)).size;
  registry.set(id, { path, name, size, originDir });
  return { id, name, size, source };
}

/** Folder to offer when saving the result: next to the file the user picked, so the page sits beside the game's image folders. */
export const gameOriginDir = (id: string): string | undefined => registry.get(id)?.originDir;

export function gamePath(id: string): string {
  const g = registry.get(id);
  if (!g) throw new AppError('NO_GAME', 'That game file is no longer available. Choose it again.');
  return g.path;
}

/** Largest .html inside a zip. */
function extractHtml(zip: Uint8Array): { name: string; data: Uint8Array } {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(zip, { filter: (f) => f.name.toLowerCase().endsWith('.html') });
  } catch {
    throw new AppError('BAD_ZIP', 'That archive could not be read.');
  }
  const best = Object.entries(files).sort((a, b) => b[1].length - a[1].length)[0];
  if (!best) throw new AppError('NO_HTML', 'No .html file found inside the archive.');
  return { name: basename(best[0]), data: best[1] };
}

export async function pickGameFile(win: BrowserWindow | null): Promise<GameFile | null> {
  const pick = await dialog.showOpenDialog(win ?? undefined!, {
    title: 'Select the game',
    properties: ['openFile'],
    filters: [{ name: 'Game (.html or .zip)', extensions: ['html', 'htm', 'zip'] }],
  });
  const file = pick.filePaths[0];
  if (pick.canceled || !file) return null;

  const originDir = dirname(file);
  if (!file.toLowerCase().endsWith('.zip')) return register(file, basename(file), 'file', originDir);

  const html = extractHtml(new Uint8Array(await readFile(file)));
  const dir = join(gamesDir(), 'imported', randomUUID());
  await mkdir(dir, { recursive: true });
  const out = join(dir, html.name);
  await writeFile(out, html.data);
  return register(out, html.name, 'file', originDir);
}

interface Release {
  tag_name: string;
  assets: { links: { name: string; direct_asset_url?: string; url: string }[] };
}

export async function fetchLatestGame(adapterId: string, progress: Progress): Promise<GameFile> {
  const adapter = ADAPTERS.find((a) => a.id === adapterId);
  if (!adapter) throw new AppError('NO_ADAPTER', 'Unknown game');

  progress({ kind: 'download', label: 'Looking up the latest release…', fraction: null });
  const api = `https://gitgud.io/api/v4/projects/${encodeURIComponent(adapter.gitlabProject)}/releases?per_page=1`;
  let rel: Release | undefined;
  try {
    const res = await fetch(api, { headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    rel = ((await res.json()) as Release[])[0];
  } catch (e) {
    throw new AppError('NETWORK', `Could not reach GitGud (${e instanceof Error ? e.message : e}). Check your connection, or choose a file you already have.`);
  }
  const asset = rel?.assets.links.find((l) => l.name.includes(adapter.assetName));
  const url = asset?.direct_asset_url ?? asset?.url;
  if (!rel || !url) throw new AppError('NO_ASSET', `The latest ${adapter.name} release has no ${adapter.assetName} download.`);
  if (!SAFE_NAME.test(rel.tag_name)) throw new AppError('BAD_RELEASE', 'The release has an unexpected version tag.');

  const target = new URL(url);
  if (target.protocol !== 'https:' || !ALLOWED_HOSTS.includes(target.hostname)) {
    throw new AppError('BAD_HOST', `Refusing to download from ${target.hostname}.`);
  }

  const label = `${adapter.name} ${rel.tag_name}`;
  const dir = join(gamesDir(), adapter.id, rel.tag_name);
  const cached = join(dir, 'game.html');
  try {
    await stat(cached);
    return register(cached, label, 'download'); // already downloaded
  } catch {
    /* not cached yet */
  }

  const res = await fetch(target);
  if (!res.ok || !res.body) throw new AppError('NETWORK', `Download failed (HTTP ${res.status}).`);
  const total = Number(res.headers.get('content-length')) || 0;
  const chunks: Uint8Array[] = [];
  let received = 0;
  for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
    chunks.push(chunk);
    received += chunk.length;
    progress({ kind: 'download', label: `Downloading ${label}… ${(received / 1e6).toFixed(1)} MB`, fraction: total ? received / total : null });
  }
  const zip = new Uint8Array(received);
  let at = 0;
  for (const c of chunks) (zip.set(c, at), (at += c.length));

  progress({ kind: 'download', label: 'Unpacking…', fraction: null });
  const html = extractHtml(zip);
  await mkdir(dir, { recursive: true });
  await writeFile(cached, html.data);
  return register(cached, label, 'download');
}
