import { app, BrowserWindow, dialog, shell } from 'electron';
import log from 'electron-log/main';
import { join } from 'node:path';
import { z } from 'zod';
import { handle } from './ipc';
import { importBundleFolder, listBundles, removeBundle } from './services/bundles';
import { cancelBuild, listTags, preflight, startBuild, sweepStaleBuilds } from './services/build';
import { installFromCatalog, listCatalog } from './services/catalog';
import { getCatalogSettings, saveCatalogSettings } from './services/settings';
import { fetchLatestGame, gameOriginDir, listAdapters, pickGameFile } from './services/games';
import { allowedOutputs, runInject } from './services/inject';

// Keep user data in a stable folder that does not depend on the product name (tests pass --user-data-dir instead).
if (!app.commandLine.hasSwitch('user-data-dir')) app.setPath('userData', join(app.getPath('appData'), 'MIFS'));

log.initialize();
const isDev = !app.isPackaged;
let win: BrowserWindow | null = null;

const progress = (e: unknown) => win?.webContents.send('progress', e);

function createWindow() {
  win = new BrowserWindow({
    width: 1040,
    height: 760,
    minWidth: 820,
    minHeight: 600,
    title: 'ModLoader Installer for SugarCube',
    backgroundColor: '#0b0b10',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  });
  win.once('ready-to-show', () => win?.show());

  // The app never opens windows or navigates away; links go to the system browser only if they are plain https.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (url !== win?.webContents.getURL()) e.preventDefault();
  });

  if (isDev && process.env.ELECTRON_RENDERER_URL) void win.loadURL(process.env.ELECTRON_RENDERER_URL);
  else void win.loadFile(join(__dirname, '../renderer/index.html'));
}

function registerHandlers() {
  handle('bundles:list', null, () => listBundles());
  handle('bundles:importFolder', null, () => importBundleFolder(win, progress));
  handle('bundles:remove', z.object({ id: z.string() }), ({ id }) => removeBundle(id));

  handle('games:adapters', null, () => listAdapters());
  handle('games:pickFile', null, () => pickGameFile(win));
  handle('games:fetchLatest', z.object({ adapterId: z.string() }), ({ adapterId }) => fetchLatestGame(adapterId, progress));

  handle('output:pick', z.object({ suggestedName: z.string().max(200), gameId: z.string().optional() }), async ({ suggestedName, gameId }) => {
    const dir = (gameId && gameOriginDir(gameId)) || app.getPath('documents');
    const res = await dialog.showSaveDialog(win ?? undefined!, {
      title: 'Save the modded game',
      defaultPath: join(dir, suggestedName.replace(/[\\/:*?"<>|]+/g, ' ')),
      filters: [{ name: 'Game page', extensions: ['html'] }],
    });
    if (res.canceled || !res.filePath) return null;
    allowedOutputs.add(res.filePath);
    return res.filePath;
  });

  handle(
    'inject:run',
    z.object({ bundleId: z.string(), gameId: z.string(), modIds: z.array(z.string()).max(500), outputPath: z.string() }),
    (req) => runInject(req, progress),
  );

  handle('catalog:list', null, () => listCatalog());
  handle('catalog:install', z.object({ id: z.string().max(100) }), ({ id }) => installFromCatalog(id, progress));
  handle('catalog:getSettings', null, () => getCatalogSettings());
  handle('catalog:saveSettings', z.object({ repo: z.string().max(200).optional(), token: z.string().max(500).nullable().optional() }), (patch) => saveCatalogSettings(patch));

  handle('build:preflight', null, () => preflight());
  handle('build:listTags', z.object({ repo: z.string().max(300) }), ({ repo }) => listTags(repo));
  handle('build:start', z.object({ repo: z.string().max(300), ref: z.string().max(100) }), (req) =>
    startBuild(req, { progress, log: (lines) => win?.webContents.send('build:log', lines) }),
  );
  handle('build:cancel', null, () => cancelBuild());

  handle('shell:showInFolder', z.object({ path: z.string() }), ({ path }) => shell.showItemInFolder(path));
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win?.isMinimized()) win.restore();
    win?.focus();
  });
  void app.whenReady().then(() => {
    registerHandlers();
    createWindow();
    void sweepStaleBuilds(); // leftovers from a run that was killed mid-build
    app.on('activate', () => BrowserWindow.getAllWindows().length === 0 && createWindow());
  });
  app.on('window-all-closed', () => app.quit());
}
