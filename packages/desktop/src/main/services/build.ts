import type { BuildRequest, BundleInfo, Preflight, ProgressEvent, ToolStatus } from '@mifs/ui/platform';
import { app } from 'electron';
import log from 'electron-log/main';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { statfsSync } from 'node:fs';
import { readdir, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { AppError } from '../ipc';
import { buildsDir, logsDir } from '../paths';
import { importBundleFrom } from './bundles';
import { BUILD_NEEDS_BYTES, diskStatus, failureMessage, lineSplitter, nodeMajor, normalizeRef, normalizeRepo, parseMark, parseTags } from './build-utils';

const MIN_NODE_MAJOR = 18;
const isWin = process.platform === 'win32';

/** Runs a tool with fixed arguments and returns its trimmed stdout, or null when it is missing or fails. */
function probe(cmd: string, args: string[], timeout = 15_000): string | null {
  // `corepack` is a .cmd shim on Windows and needs a shell; the arguments here are constants, never user input.
  const r = spawnSync(cmd, args, { encoding: 'utf8', timeout, shell: isWin && cmd === 'corepack', windowsHide: true });
  return r.status === 0 ? r.stdout.trim() : null;
}

function tool(version: string | null, ok: (v: string) => boolean, hint: string): ToolStatus {
  if (version === null) return { found: false, ok: false, hint };
  return ok(version) ? { found: true, version, ok: true } : { found: true, version, ok: false, hint };
}

/** Free bytes on the drive that holds the app's build folder, or null when the OS cannot tell. */
function freeBytes(): number | null {
  try {
    const s = statfsSync(buildsDir());
    return s.bavail * s.bsize;
  } catch {
    return null;
  }
}

// Test seam, honored only by unpackaged builds: lets the e2e suite simulate a nearly full disk.
const needBytes = () => (!app.isPackaged && Number(process.env.MIFS_MIN_FREE_BYTES)) || BUILD_NEEDS_BYTES;

export function preflight(): Preflight {
  const git = tool(probe('git', ['--version'])?.replace(/^git version\s*/, '') ?? null, () => true, 'Install Git from https://git-scm.com/downloads');
  const node = tool(probe('node', ['--version']), (v) => (nodeMajor(v) ?? 0) >= MIN_NODE_MAJOR, `Install Node.js ${MIN_NODE_MAJOR} or newer from https://nodejs.org`);
  const corepack = tool(probe('corepack', ['--version']), () => true, 'Corepack comes with Node.js; reinstall Node.js, or run "npm i -g corepack"');
  const disk = diskStatus(freeBytes(), needBytes());
  return { git, node, corepack, disk, ok: git.ok && node.ok && corepack.ok && disk.ok };
}

export async function listTags(repo: string): Promise<string[]> {
  const url = normalizeRepo(repo);
  return new Promise((res, rej) => {
    const p = spawn('git', ['ls-remote', '--tags', '--refs', url], { windowsHide: true });
    let out = '';
    p.stdout.on('data', (d: Buffer) => (out += d));
    const timer = setTimeout(() => p.kill(), 30_000);
    p.on('error', () => rej(new AppError('NO_GIT', 'Git is not installed or not on the PATH.')));
    p.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) res(parseTags(out));
      else rej(new AppError('NETWORK', 'Could not list versions of that repository. Check the address and your connection.'));
    });
  });
}

function scriptPath(): string {
  // Test seam, honored only by unpackaged builds: lets the e2e suite run a fast fake build.
  if (!app.isPackaged && process.env.MIFS_BUILD_SCRIPT) return process.env.MIFS_BUILD_SCRIPT;
  return app.isPackaged ? join(process.resourcesPath, 'bundle/scripts/build-bundle.mjs') : resolve(app.getAppPath(), '../../bundle/scripts/build-bundle.mjs');
}

interface Running {
  child: ChildProcess;
  cancelled: boolean;
}
let running: Running | null = null;

/** Kills the build and everything it spawned (yarn, webpack, ...). */
function killTree(child: ChildProcess): void {
  if (!child.pid) return;
  if (isWin) spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true });
  else child.kill('SIGTERM');
}

export async function cancelBuild(): Promise<void> {
  if (!running) return;
  running.cancelled = true;
  killTree(running.child);
}

export async function startBuild(
  req: BuildRequest,
  hooks: { progress: (e: ProgressEvent) => void; log: (lines: string[]) => void },
): Promise<BundleInfo> {
  if (running) throw new AppError('BUSY', 'A build is already running.');
  let repo: string;
  let ref: string;
  try {
    repo = normalizeRepo(req.repo);
    ref = normalizeRef(req.ref);
  } catch (e) {
    throw new AppError('BAD_SOURCE', e instanceof Error ? e.message : 'Invalid source');
  }
  const pre = preflight();
  if (!pre.ok) {
    const missing = Object.entries({ Git: pre.git, 'Node.js': pre.node, Corepack: pre.corepack, 'Free disk space': pre.disk }).filter(([, t]) => !t.ok);
    throw new AppError('PREREQ', `Missing tools: ${missing.map(([n, t]) => `${n} (${t.hint})`).join('; ')}`);
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const work = join(buildsDir(), stamp);
  const logFile = join(logsDir(), `build-${stamp}.log`);
  const logStream = createWriteStream(logFile);

  // Batch log lines so a chatty build does not flood IPC.
  let batch: string[] = [];
  const flush = () => {
    if (batch.length) hooks.log(batch.splice(0));
  };
  const timer = setInterval(flush, 150);
  const tail: string[] = [];
  const onLine = (line: string) => {
    const mark = parseMark(line);
    if (mark) return hooks.progress({ kind: 'build', label: mark.label, fraction: mark.fraction });
    logStream.write(line + '\n');
    batch.push(line);
    tail.push(line);
    if (tail.length > 60) tail.shift();
  };

  hooks.progress({ kind: 'build', label: 'Starting…', fraction: 0 });
  // The system Node.js runs the script: it needs corepack, which Electron's embedded Node does not provide.
  const child = spawn('node', [scriptPath(), '--repo', repo, '--ref', ref, '--out', join(work, 'dist'), '--work', join(work, 'work')], {
    cwd: app.getPath('temp'),
    env: { ...process.env, COREPACK_ENABLE_DOWNLOAD_PROMPT: '0', CI: '1' },
    windowsHide: true,
  });
  running = { child, cancelled: false };
  const out = lineSplitter(onLine);
  const err = lineSplitter(onLine);
  child.stdout?.on('data', (d: Buffer) => out.push(d.toString('utf8')));
  child.stderr?.on('data', (d: Buffer) => err.push(d.toString('utf8')));

  try {
    const code = await new Promise<number | null>((res, rej) => {
      child.on('error', (e) => rej(new AppError('NO_NODE', `Could not start Node.js: ${e.message}`)));
      child.on('close', (c) => res(c));
    });
    out.end();
    err.end();
    flush();
    if (running?.cancelled) throw new AppError('CANCELLED', 'The build was cancelled.');
    if (code !== 0) {
      throw new AppError('BUILD_FAILED', failureMessage(code, tail, logFile));
    }
    hooks.progress({ kind: 'build', label: 'Checking and installing the bundle…', fraction: 0.99 });
    return await importBundleFrom(join(work, 'dist'), hooks.progress);
  } finally {
    clearInterval(timer);
    running = null;
    logStream.end();
    // The clone with its node_modules is large; the finished bundle was already copied out.
    await rm(work, { recursive: true, force: true, maxRetries: 3 }).catch((e) => log.warn('could not clean build folder', e));
  }
}

/**
 * Removes build folders left behind by a run that was killed mid-build (the normal path cleans up after itself).
 * Safe at startup: the app is single-instance and builds only exist while one is running.
 */
export async function sweepStaleBuilds(): Promise<number> {
  const dir = buildsDir();
  let removed = 0;
  for (const name of await readdir(dir).catch(() => [])) {
    await rm(join(dir, name), { recursive: true, force: true, maxRetries: 3 })
      .then(() => removed++)
      .catch((e) => log.warn(`could not remove stale build folder ${name}`, e));
  }
  if (removed) log.info(`removed ${removed} stale build folder(s)`);
  return removed;
}
