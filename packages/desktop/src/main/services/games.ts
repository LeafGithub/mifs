import type { GameAdapter, GameFile, ProgressEvent } from '@mifs/ui/platform';
import { dialog, type BrowserWindow } from 'electron';
import { unzipSync } from 'fflate';
import { randomUUID } from 'node:crypto';
import { chmod, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { basename, dirname, join } from 'node:path';
import { AppError } from '../ipc';
import { SAFE_NAME, buildsDir, gamesDir } from '../paths';

type Progress = (e: ProgressEvent) => void;

interface AdapterDef extends GameAdapter {
  gitlabProject: string;
  /** Substring of the release asset name that holds the HTML (zip). Absent: the project ships source only and is compiled locally. */
  assetName?: string;
}

// Hosts a release asset may come from (the release JSON is untrusted).
const ALLOWED_HOSTS = ['gitgud.io', 'dolp.download'];

const ADAPTERS: AdapterDef[] = [
  { id: 'dolp', name: 'Degrees of Lewdity Plus', description: 'Community fork with extra content', tags: ['HTML only'], gitlabProject: 'Frostberg/degrees-of-lewdity-plus', assetName: 'DoLP_HTML_only' },
  { id: 'dol', name: 'Degrees of Lewdity', description: 'The original game, built from the official source', tags: ['Needs Git'], gitlabProject: 'Vrelnir/degrees-of-lewdity' },
  { id: 'xchange', name: 'DoL X-Change Edition', description: 'Gender-swap edition', tags: ['No images or audio'], gitlabProject: 'Akoz/dol-xchange', assetName: 'DoLX_HTML' },
];

export const listAdapters = (): GameAdapter[] => ADAPTERS.map(({ id, name, description, tags }) => ({ id, name, description, tags }));

/** Files the renderer refers to by opaque id; it never sees or supplies game paths. */
const registry = new Map<string, { path: string; name: string; size: number; originDir?: string }>();

/** `originDir` is the folder of the user's own file; downloads have none. */
async function register(path: string, name: string, source: GameFile['source'], originDir?: string): Promise<GameFile> {
  const id = randomUUID();
  const size = (await stat(path)).size;
  registry.set(id, { path, name, size, originDir });
  return { id, name, size, source };
}

/** Folder to offer when saving: next to the picked file, beside the game's image folders. */
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

/** Runs a tool with fixed arguments; rejects with the tail of its output on failure. */
function run(cmd: string, args: string[], opts: { cwd?: string; env?: NodeJS.ProcessEnv } = {}): Promise<void> {
  return new Promise((res, rej) => {
    const p = spawn(cmd, args, { ...opts, windowsHide: true });
    let tail = '';
    const keep = (d: Buffer) => (tail = (tail + d).slice(-600));
    p.stdout.on('data', keep);
    p.stderr.on('data', keep);
    p.on('error', (e: NodeJS.ErrnoException) => rej(e.code === 'ENOENT' && cmd === 'git' ? new AppError('NO_GIT', 'Git is not installed or not on the PATH. Install it, or choose a game file you already have.') : e));
    p.on('close', (code) => (code === 0 ? res() : rej(new Error(tail.trim() || `${cmd} exited with code ${code}`))));
  });
}

/** The tweego binary the vanilla repository ships for this platform. */
function bundledTweego(): string {
  const { platform, arch } = process;
  if (platform === 'win32') return arch === 'ia32' ? 'tweego_win86.exe' : 'tweego_win64.exe';
  if (platform === 'darwin') return arch === 'arm64' ? 'tweego_m1' : 'tweego_osx64';
  if (platform === 'linux' && arch === 'x64') return 'tweego_linux64';
  throw new AppError('UNSUPPORTED', 'Compiling the vanilla game is not supported on this platform. Choose a game file you already have.');
}

/** Builds the HTML like the repository's own compile script: only the folders it needs are fetched. */
async function compileFromSource(project: string, tag: string, out: string, progress: Progress): Promise<void> {
  const work = join(buildsDir(), `game-${randomUUID()}`);
  const src = join(work, 'src');
  try {
    progress({ kind: 'download', label: `Fetching the ${tag} source…`, fraction: null });
    await run('git', ['clone', '--depth', '1', '--branch', tag, '--filter=blob:none', '--sparse', `https://gitgud.io/${project}.git`, src]);
    await run('git', ['-C', src, 'sparse-checkout', 'set', 'game', 'modules', 'devTools/tweego']);

    progress({ kind: 'download', label: 'Compiling the game…', fraction: null });
    const exe = join(src, 'devTools', 'tweego', bundledTweego());
    await chmod(exe, 0o755);
    const html = join(work, 'game.html');
    await run(exe, ['-o', html, '--head', 'devTools/head.html', '--module', 'modules', 'game/'], {
      cwd: src,
      env: { ...process.env, TWEEGO_PATH: join(src, 'devTools', 'tweego', 'storyFormats') },
    });
    await mkdir(dirname(out), { recursive: true });
    await writeFile(out, await readFile(html));
  } catch (e) {
    if (e instanceof AppError) throw e;
    throw new AppError('COMPILE_FAILED', `Could not build the game from source: ${e instanceof Error ? e.message : e}`);
  } finally {
    await rm(work, { recursive: true, force: true, maxRetries: 3 }).catch(() => undefined);
  }
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
  if (!rel) throw new AppError('NO_ASSET', `${adapter.name} has no releases.`);
  if (!SAFE_NAME.test(rel.tag_name)) throw new AppError('BAD_RELEASE', 'The release has an unexpected version tag.');

  const { assetName } = adapter;
  const asset = assetName ? rel.assets.links.find((l) => l.name.includes(assetName)) : undefined;
  const url = asset?.direct_asset_url ?? asset?.url;
  if (assetName && !url) throw new AppError('NO_ASSET', `The latest ${adapter.name} release has no ${assetName} download.`);

  const label = `${adapter.name} ${rel.tag_name}`;
  const dir = join(gamesDir(), adapter.id, rel.tag_name);
  const cached = join(dir, 'game.html');
  try {
    await stat(cached);
    return register(cached, label, 'download'); // already downloaded
  } catch {
    /* not cached yet */
  }

  if (!url) {
    await compileFromSource(adapter.gitlabProject, rel.tag_name, cached, progress);
    return register(cached, label, 'download');
  }

  const target = new URL(url);
  if (target.protocol !== 'https:' || !ALLOWED_HOSTS.includes(target.hostname)) {
    throw new AppError('BAD_HOST', `Refusing to download from ${target.hostname}.`);
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
