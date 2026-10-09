// Drives the real Electron app (built into out/). Native dialogs are stubbed from the main process, which is what a
// user's clicks in them would return; everything else (IPC, services, worker thread) is the production code path.
import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const here = __dirname;
const BUNDLE = process.env.MIFS_BUNDLE ?? resolve(here, '../../../bundle/dist');
const hasBundle = existsSync(join(BUNDLE, 'manifest.json'));

const GAME =
  `<!DOCTYPE html><html><head><title>Tiny Game</title><meta http-equiv="Content-Security-Policy" content="default-src 'self' 'unsafe-eval' 'unsafe-inline'; img-src 'self' data:"/>` +
  `<script id="init" type="text/javascript">1</script></head><body>` +
  `<script id="script-sugarcube" type="text/javascript">window.SugarCube={},jQuery((()=>{ /* story */ }))})(window,window.document,jQuery);</script></body></html>`;

test.skip(!hasBundle, 'needs a built bundle: node bundle/scripts/build-bundle.mjs --src <checkout> --out bundle/dist');

let app: ElectronApplication;
let tmp: string;
let launches = 0;

test.beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), 'mifs-e2e-'));
});
test.afterEach(async () => app?.close());
test.afterAll(() => rmSync(tmp, { recursive: true, force: true }));

async function launch(env: Record<string, string> = {}) {
  // MIFS_EXE runs the same tests against a packaged build (release/win-unpacked/ModLoader Installer.exe)
  const userData = `--user-data-dir=${join(tmp, `userdata-${++launches}`)}`;
  app = process.env.MIFS_EXE
    ? await electron.launch({ executablePath: process.env.MIFS_EXE, args: [userData], env: { ...(process.env as Record<string, string>), ...env } })
    : await electron.launch({ args: ['.', userData], cwd: resolve(here, '..'), env: { ...(process.env as Record<string, string>), ...env } });
  return app.firstWindow();
}

/** Makes the next native dialog calls return the given results, as if the user had picked them. */
async function stubDialogs(opts: { open?: string[]; save?: string }) {
  await app.evaluate(({ dialog }, o) => {
    const queue = [...(o.open ?? [])];
    dialog.showOpenDialog = (async () => ({ canceled: queue.length === 0, filePaths: [queue.shift()].filter(Boolean) })) as never;
    dialog.showSaveDialog = (async () => ({ canceled: !o.save, filePath: o.save })) as never;
  }, opts);
}

test('imports a bundle, installs ModLoader into a game, and writes a working page', async () => {
  const gamePath = join(tmp, 'Tiny Game.html');
  writeFileSync(gamePath, GAME);
  const out = join(tmp, 'Tiny Game.mod.html');

  const page = await launch();
  await expect(page.getByRole('heading', { name: 'Choose a loader' })).toBeVisible();
  await expect(page.getByText('No loader bundles yet')).toBeVisible();

  // 1. import the bundle (verifies every checksum, then copies it into the app's data folder)
  await stubDialogs({ open: [BUNDLE, gamePath], save: out });
  await page.getByRole('button', { name: 'Import bundle folder…' }).click();
  await expect(page.getByText(/ModLoader 2\.\d+\.\d+/)).toBeVisible();
  await expect(page.getByText('selected', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Next' }).click();

  // 2. pick a game file
  await page.getByRole('button', { name: /Choose game/ }).click();
  await expect(page.getByText('Tiny Game.html')).toBeVisible();
  await page.getByRole('button', { name: 'Next' }).click();

  // 3. mods: dependencies are protected
  await expect(page.getByRole('heading', { name: 'Choose mods' })).toBeVisible();
  await expect(page.locator('#mod-ConflictChecker')).toBeDisabled(); // ModSubUiAngularJs needs it
  await page.getByRole('button', { name: 'Next' }).click();

  // 4. install
  await page.getByRole('button', { name: /Choose where to save/ }).click();
  await expect(page.getByText(out, { exact: false }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Create modded game' }).click();
  await expect(page.getByText('Done', { exact: true })).toBeVisible({ timeout: 60_000 });

  const html = readFileSync(out, 'utf8');
  expect(html).toContain('window.mainStart=((()=>{'); // SugarCube patched to wait for ModLoader
  expect(html).toContain("'unsafe-inline' *;"); // CSP relaxed
  const zips = JSON.parse(/window\.modDataValueZipList = (\[.*?\]);/s.exec(html)![1]!) as string[];
  expect(zips.length).toBeGreaterThan(20);
  expect(statSync(out).size).toBeGreaterThan(5_000_000);
  expect(existsSync(`${out}.part`)).toBe(false);
  expect(readFileSync(gamePath, 'utf8')).toBe(GAME); // the original is untouched
});

test('refuses to write anywhere the user did not choose', async () => {
  const page = await launch();
  const result = await page.evaluate(() => window.api.inject.run({ bundleId: 'x', gameId: 'y', modIds: ['a'], outputPath: 'C:\\Windows\\evil.html' }).then(() => 'ran', (e: Error) => e.message));
  expect(result).toMatch(/Choose where to save/);
});

test('rejects a folder that is not a bundle', async () => {
  const page = await launch();
  await stubDialogs({ open: [tmp] });
  await page.getByRole('button', { name: 'Import bundle folder…' }).click();
  await expect(page.getByRole('alert')).toContainText('manifest.json');
});

// Build from source, with the build script replaced by e2e/fake-build.mjs (the real one needs ~10 minutes and network).
// Preflight is real: it needs git, node and corepack on this machine. Not run against a packaged exe (the seam is dev-only).
const fake = { MIFS_BUILD_SCRIPT: resolve(here, 'fake-build.mjs'), MIFS_FAKE_BUNDLE: BUNDLE };

async function openBuildPanel(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: /Build from source/ }).click();
  await expect(page.getByText('Needs on this computer')).toBeVisible();
  await page.getByLabel('The newest official code (master)').check();
}

test.describe('build from source', () => {
  test.skip(!!process.env.MIFS_EXE, 'test seam is only active in unpackaged builds');

  test('builds a bundle, streams progress and output, then installs and selects it', async () => {
    const page = await launch(fake);
    await openBuildPanel(page);
    await expect(page.getByText('Git', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Build', exact: true }).click();
    await expect(page.getByText('Built and installed')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText('selected', { exact: true })).toBeVisible();
    await expect(page.getByText(/ModLoader 2\.\d+\.\d+/)).toBeVisible();
    await page.getByText(/Build output/).click();
    await expect(page.getByText('fake build of https://github.com/Lyoko-Jeremie/sugarcube-2-ModLoader.git @ master')).toBeVisible();
    await expect(page.getByText('warning: this line goes to stderr')).toBeVisible();
  });

  test('shows what went wrong when the build fails', async () => {
    const page = await launch({ ...fake, MIFS_FAKE_FAIL: '1' });
    await openBuildPanel(page);
    await page.getByRole('button', { name: 'Build', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('webpack exploded');
    await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
  });

  test('can be cancelled', async () => {
    const page = await launch({ ...fake, MIFS_FAKE_HANG: '1' });
    await openBuildPanel(page);
    await page.getByRole('button', { name: 'Build', exact: true }).click();
    await expect(page.getByText('Building mod X (3/23)')).toBeVisible();
    await page.getByRole('button', { name: 'Cancel build' }).click();
    await expect(page.getByRole('alert')).toContainText('cancelled');
  });

  test('requires explicit trust before building a custom repository, and rejects bad addresses', async () => {
    const page = await launch(fake);
    await page.getByRole('button', { name: /Build from source/ }).click();
    await page.getByLabel('Another repository (a fork)').check();
    await page.getByLabel('GitHub address').fill('https://evil.example/x/y');
    await page.getByLabel('Branch, tag or commit').fill('main');
    await expect(page.getByRole('button', { name: 'Build', exact: true })).toBeDisabled();
    await page.getByLabel(/I trust this repository/).check();
    await page.getByRole('button', { name: 'Build', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('GitHub repository address');
  });
});

// Catalog: a fake private GitHub (the catalog and its assets 404 without the right token), serving a real built bundle.
const TOKEN = 'test-token-123';

function startFakeGitHub(opts: { badHash?: boolean } = {}): Promise<{ server: Server; base: string; requests: string[] }> {
  const manifest = JSON.parse(readFileSync(join(BUNDLE, 'manifest.json'), 'utf8'));
  const zip = readFileSync(join(BUNDLE, readdirSync(BUNDLE).find((f) => /^modloader-bundle-.*\.zip$/.test(f))!));
  const sha = opts.badHash ? '0'.repeat(64) : createHash('sha256').update(zip).digest('hex');
  const catalog = {
    schema: 1,
    generatedAt: new Date().toISOString(),
    bundles: [
      {
        id: manifest.id, kind: manifest.kind, version: manifest.loader.version, ref: manifest.loader.ref, commit: manifest.loader.commit,
        builtAt: manifest.loader.builtAt, modCount: manifest.mods.length, manifestAssetId: 1, bundleAssetId: 2, bundleSha256: sha,
        manifestUrl: 'https://example.invalid/m', bundleUrl: 'https://example.invalid/b', bundleSize: zip.length, prerelease: false,
      },
    ],
  };
  const requests: string[] = [];
  const server = createServer((req, res) => {
    requests.push(`${req.method} ${req.url} auth=${req.headers.authorization ? 'yes' : 'no'}`);
    const send = (code: number, body: string | Buffer, type = 'application/json') => (res.writeHead(code, { 'content-type': type, 'content-length': Buffer.byteLength(body) }), res.end(body));
    if (req.headers.authorization !== `Bearer ${TOKEN}`) return send(404, '{"message":"Not Found"}'); // what GitHub says about private repos
    if (req.url === '/repos/o/r/releases/tags/catalog') return send(200, JSON.stringify({ assets: [{ id: 99, name: 'catalog.json' }] }));
    if (req.url === '/repos/o/r/releases/assets/99') return send(200, JSON.stringify(catalog));
    if (req.url === '/repos/o/r/releases/assets/2') return send(200, zip, 'application/octet-stream');
    return send(404, '{}');
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, base: `http://127.0.0.1:${(server.address() as { port: number }).port}`, requests })));
}

test.describe('bundle catalog', () => {
  test.skip(!!process.env.MIFS_EXE, 'test seam is only active in unpackaged builds');
  let gh: Awaited<ReturnType<typeof startFakeGitHub>>;
  test.afterEach(() => gh?.server.close());

  async function configure(page: import('@playwright/test').Page, token?: string) {
    const field = page.getByLabel('Bundle repository');
    if (!(await field.isVisible())) await page.getByRole('button', { name: 'Settings' }).click(); // it is a toggle
    await field.fill('o/r');
    if (token) await page.getByLabel(/Access token/).fill(token);
    await page.getByRole('button', { name: 'Save', exact: true }).click();
  }

  test('a private catalog explains the missing token; with it, a bundle downloads, verifies and installs', async () => {
    gh = await startFakeGitHub();
    const page = await launch({ MIFS_API_BASE: gh.base });

    await configure(page); // no token yet
    await expect(page.getByText(/private/)).toBeVisible(); // a calm notice, not an alert
    await expect(page.getByText(/add an access token/)).toBeVisible();

    await configure(page, TOKEN);
    await expect(page.getByRole('list', { name: 'Available bundles' })).toContainText(/ModLoader 2\.\d+\.\d+/);
    await expect(page.getByText('recommended')).toBeVisible();

    await page.getByRole('button', { name: 'Download' }).click();
    await expect(page.getByText('selected', { exact: true })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText('You have every published bundle.')).toBeVisible();

    // the token reached GitHub as a Bearer header, was never exposed to the page, and is not stored in plain text
    expect(gh.requests.some((r) => r.includes('assets/2') && r.endsWith('auth=yes'))).toBe(true);
    expect(await page.evaluate(() => window.api.catalog!.getSettings())).toEqual({ repo: 'o/r', hasToken: true });
    const dataDir = join(tmp, `userdata-${launches}`);
    expect(readFileSync(join(dataDir, 'settings.json'), 'utf8')).not.toContain(TOKEN);
    expect(readdirSync(join(dataDir, 'bundles')).length).toBe(1);
    expect(readdirSync(join(dataDir, 'builds')).length).toBe(0); // scratch space cleaned up
  });

  test('refuses a bundle whose checksum does not match the catalog', async () => {
    gh = await startFakeGitHub({ badHash: true });
    const page = await launch({ MIFS_API_BASE: gh.base });
    await configure(page, TOKEN);
    await page.getByRole('button', { name: 'Download' }).click();
    await expect(page.getByRole('alert')).toContainText('checksum');
    await expect(page.getByRole('alert')).toHaveCount(1);
    expect(readdirSync(join(tmp, `userdata-${launches}`, 'bundles')).length).toBe(0);
  });
});
