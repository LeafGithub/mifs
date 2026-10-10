// Build a ModLoader "bundle": BeforeSC2.js + every mod zip + licenses + manifest.json, ready to publish.
//
// Usage: node scripts/build-bundle.mjs --repo <git url> --ref <tag|branch|commit> [--out dist] [--work work] [--src <existing built checkout>]
//   --src    skip clone + build and package an already built checkout (e.g. modloader-lab/work/modloader-src)
//
// Needs: git, Node 18+, corepack (yarn is pinned per project through "packageManager").
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { parseModList, resolveMods } from './modlist.mjs';

// Fail with one readable line instead of a stack trace; the desktop app shows the last lines of output to the user.
process.on('uncaughtException', (e) => {
  console.error('error: ' + (e instanceof Error ? e.message : String(e)));
  process.exit(1);
});

const HERE = dirname(fileURLToPath(import.meta.url));
const { values: args } = parseArgs({
  options: { repo: { type: 'string' }, ref: { type: 'string' }, out: { type: 'string', default: 'dist' }, work: { type: 'string', default: 'work' }, src: { type: 'string' } },
});
const UPSTREAM = 'https://github.com/Lyoko-Jeremie/sugarcube-2-ModLoader.git';
const repo = args.repo ?? UPSTREAM;
const OUT = resolve(args.out);
// mods.json: a fallback list plus extras per kind of source. Each ref is built with its own modList.json (see modlist.mjs).
const cfg = JSON.parse(readFileSync(join(HERE, '../mods.json'), 'utf8'));
const kindOf = (url) => (/github\.com[/:]([^/]+)\//.exec(url)?.[1]?.toLowerCase() === 'lyoko-jeremie' ? 'upstream' : 'fork');

const env = { ...process.env, COREPACK_ENABLE_DOWNLOAD_PROMPT: '0' };
function run(cmd, a, cwd, { capture = false } = {}) {
  console.log(`\n$ ${cmd} ${a.join(' ')}   (${cwd})`);
  const win = process.platform === 'win32' && cmd === 'corepack';
  const r = spawnSync(cmd, win ? a.map((x) => (/\s/.test(x) ? `"${x}"` : x)) : a, { cwd, env, shell: win, encoding: 'utf8', stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit' });
  if (r.status !== 0) throw new Error(`failed (${r.status}): ${cmd} ${a.join(' ')} in ${cwd}`);
  return capture ? r.stdout.trim() : '';
}
const yarn = (a, cwd) => run('corepack', ['yarn', ...a], cwd);
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
// Machine-readable progress for the desktop app (one JSON object per line, prefixed so it cannot be confused with tool output).
const mark = (label, fraction) => console.log('##mifs ' + JSON.stringify({ label, fraction }));
const git = (a, cwd = SRC) => run('git', a, cwd, { capture: true });

let SRC;
let mods = [];
let modListInfo = { source: 'fallback', extras: [] };
/** Decides which mods to build and embed, from the checkout's own modList.json. */
function chooseMods(sourceUrl) {
  const listPath = join(SRC, 'modList.json');
  let refList = null;
  if (existsSync(listPath)) {
    try {
      refList = parseModList(readFileSync(listPath, 'utf8'));
    } catch (e) {
      console.warn(`warning: ${e.message}; using the fallback list`);
    }
  }
  const r = resolveMods({ refList, fallback: cfg.fallback, extras: cfg.extras, kind: kindOf(sourceUrl) });
  console.log(`Mod list: ${r.source}${r.extras.length ? ` plus ${r.extras.length} extra` : ''}, ${r.mods.length} mods`);
  mods = r.mods;
  modListInfo = { source: r.source, extras: r.extras };
}

// ---- 1. source checkout + build ------------------------------------------------------------------------------
if (args.src) {
  SRC = resolve(args.src);
  chooseMods(git(['remote', 'get-url', 'origin']) || UPSTREAM);
} else {
  if (!args.ref) throw new Error('--ref is required unless --src is given');
  SRC = join(resolve(args.work), 'src');
  rmSync(SRC, { recursive: true, force: true });
  mkdirSync(dirname(SRC), { recursive: true });
  mark('Downloading the source', 0.02);
  run('git', ['clone', '--depth', '1', '--branch', args.ref, '--recurse-submodules', '--shallow-submodules', repo, SRC], dirname(SRC));
  chooseMods(repo);
  mark('Installing loader dependencies', 0.05);
  yarn(['install'], SRC);
  const loaderSteps = ['ts:BeforeSC2', 'webpack:BeforeSC2', 'webpack:BeforeSC2-comp', 'ts:ForSC2', 'webpack:insertTools'];
  for (const [i, s] of loaderSteps.entries()) {
    mark('Building the loader (' + (i + 1) + '/' + loaderSteps.length + ')', 0.1 + (0.1 * i) / loaderSteps.length);
    yarn(['run', s], SRC);
  }

  // ModLoaderGui compiles against ModSubUiAngularJs's build output, so that one goes first (as in upstream CI).
  const dirs = [...new Set(mods.map((m) => m.split('/')[0]))].sort((a, b) => Number(b === 'ModSubUiAngularJs') - Number(a === 'ModSubUiAngularJs'));
  for (const [i, d] of dirs.entries()) {
    mark('Building mod ' + d + ' (' + (i + 1) + '/' + dirs.length + ')', 0.2 + (0.75 * i) / dirs.length);
    const cwd = join(SRC, 'mod', d);
    const pkg = join(cwd, 'package.json');
    if (!existsSync(join(cwd, 'boot.json'))) throw new Error(`mod ${d}: not checked out (submodule missing?)`);
    const scripts = existsSync(pkg) ? JSON.parse(readFileSync(pkg, 'utf8')).scripts ?? {} : {};
    if (existsSync(pkg)) yarn(['install'], cwd);
    for (const s of ['ts:type', 'build:ts', 'build:webpack', 'build-core:webpack']) if (scripts[s]) yarn(['run', s], cwd);
    for (const boot of ['boot.json', 'boot-core.json']) {
      if (existsSync(join(cwd, boot))) run('node', [join(SRC, 'dist-insertTools/packModZip.js'), boot], cwd);
    }
  }
}

mark('Collecting files', 0.96);
// ---- 2. collect -----------------------------------------------------------------------------------------------
const commit = git(['rev-parse', 'HEAD']);
const remoteUrl = args.repo ?? (git(['remote', 'get-url', 'origin']) || UPSTREAM);
const ref = args.ref ?? git(['describe', '--tags', '--always']);
const utils = readFileSync(join(SRC, 'src/BeforeSC2/Utils.ts'), 'utf8');
const version = /get version\(\)[^{]*\{\s*return\s+'(\d+\.\d+\.\d+)'/.exec(utils)?.[1];
if (!version) throw new Error('could not read the loader version from src/BeforeSC2/Utils.ts');

const owner = /github\.com[/:]([^/]+)\//.exec(remoteUrl)?.[1]?.toLowerCase() ?? 'unknown';
const kind = kindOf(remoteUrl);
const id = `${kind === 'upstream' ? 'upstream' : owner}-${version}-${commit.slice(0, 7)}`;

rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(OUT, 'mods'), { recursive: true });
mkdirSync(join(OUT, 'licenses/mods'), { recursive: true });

const fileRef = (path, buf) => ({ path, sha256: sha256(buf), size: buf.length });

const beforeBuf = readFileSync(join(SRC, 'dist-BeforeSC2/BeforeSC2.js'));
writeFileSync(join(OUT, 'BeforeSC2.js'), beforeBuf);

const modEntries = mods.map((rel) => {
  const dir = rel.split('/')[0];
  const zipPath = join(SRC, 'mod', rel);
  if (!existsSync(zipPath)) throw new Error(`missing mod zip: ${rel}`);
  const buf = readFileSync(zipPath);
  const boot = JSON.parse(readFileSync(join(SRC, 'mod', dir, 'boot.json'), 'utf8'));
  const file = `mods/${basename(rel)}`;
  writeFileSync(join(OUT, file), buf);
  const lic = ['LICENSE', 'LICENSE.md', 'LICENSE.txt'].map((n) => join(SRC, 'mod', dir, n)).find(existsSync);
  if (lic) cpSync(lic, join(OUT, `licenses/mods/${dir}.LICENSE`));
  let modCommit;
  try { modCommit = git(['rev-parse', 'HEAD'], join(SRC, 'mod', dir)); } catch { /* not a git checkout */ }
  return {
    id: dir,
    name: boot.name,
    version: boot.version,
    aliases: Array.isArray(boot.alias) ? boot.alias.filter((a) => typeof a === 'string') : [],
    ...fileRef(file, buf),
    commit: modCommit && modCommit !== commit ? modCommit : undefined,
    dependsOn: (boot.dependenceInfo ?? []).map((d) => ({ name: d.modName, range: d.version })),
    default: true,
  };
});

const licenses = [];
for (const n of ['LICENSE', 'LICENSE2.txt']) {
  if (existsSync(join(SRC, n))) { cpSync(join(SRC, n), join(OUT, 'licenses', n)); licenses.push(`licenses/${n}`); }
}
for (const m of modEntries) if (existsSync(join(OUT, `licenses/mods/${m.id}.LICENSE`))) licenses.push(`licenses/mods/${m.id}.LICENSE`);

const manifest = {
  schema: 1,
  id,
  kind,
  loader: { version, repo: remoteUrl, ref, commit, builtAt: new Date().toISOString() },
  beforeSC2: fileRef('BeforeSC2.js', beforeBuf),
  mods: modEntries,
  licenses,
  builder: { modList: modListInfo, node: process.version, runUrl: process.env.GITHUB_SERVER_URL && process.env.GITHUB_RUN_ID ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}` : undefined },
};
writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

// ---- 3. zip everything (manifest.json is also published next to the zip so clients can read it cheaply) ----------
mark('Packaging', 0.98);
const JSZip = createRequire(join(SRC, 'package.json'))('jszip');
const zip = new JSZip();
for (const f of ['manifest.json', 'BeforeSC2.js', ...modEntries.map((m) => m.path), ...licenses]) zip.file(f, readFileSync(join(OUT, f)));
const zipName = `modloader-bundle-${id}.zip`;
writeFileSync(join(OUT, zipName), await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 9 } }));

console.log(`\nbundle ${id}: loader ${version} (${commit.slice(0, 7)}), ${modEntries.length} mods -> ${join(OUT, zipName)}`);
if (process.env.GITHUB_OUTPUT) writeFileSync(process.env.GITHUB_OUTPUT, `id=${id}\nkind=${kind}\nversion=${version}\nzip=${zipName}\n`, { flag: 'a' });
