import type { AppUpdate } from '@mifs/ui/platform';
import { app, shell } from 'electron';
import log from 'electron-log/main';
import { autoUpdater } from 'electron-updater';
import { AppError } from '../ipc';

const REPO = 'LeafGithub/mifs';

// The portable build is a self-extracting exe and cannot replace itself; it links to the release page.
const portable = Boolean(process.env.PORTABLE_EXECUTABLE_FILE);

let state: AppUpdate = { state: app.isPackaged ? 'idle' : 'unsupported', current: app.getVersion(), selfUpdate: !portable };
let notify: (u: AppUpdate) => void = () => {};

const set = (patch: Partial<AppUpdate>) => {
  state = { ...state, ...patch };
  notify(state);
  return state;
};

export const getUpdate = (): AppUpdate => state;

export function initUpdater(onChange: (u: AppUpdate) => void) {
  notify = onChange;
  if (!app.isPackaged) return;
  // Set explicitly: the portable build has no app-update.yml.
  autoUpdater.setFeedURL({ provider: 'github', owner: REPO.split('/')[0]!, repo: REPO.split('/')[1]! });
  autoUpdater.logger = log;
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.allowPrerelease = false;
  autoUpdater.on('download-progress', (p) => set({ state: 'downloading', fraction: p.percent / 100 }));
  autoUpdater.on('update-downloaded', () => set({ state: 'ready', fraction: 1 }));
  // Quiet background check, after the window is up.
  setTimeout(() => void checkUpdate(), 8000);
}

export async function checkUpdate(): Promise<AppUpdate> {
  if (state.state === 'unsupported' || state.state === 'checking' || state.state === 'downloading') return state;
  set({ state: 'checking', error: undefined });
  try {
    const r = await autoUpdater.checkForUpdates();
    const latest = r?.updateInfo.version;
    return set(r?.isUpdateAvailable && latest ? { state: 'available', latest } : { state: 'none', latest: undefined });
  } catch (e) {
    // Includes a private repo (404) and being offline; neither needs an alarming message.
    log.warn('[update] check failed', e);
    return set({ state: 'error', error: 'Could not check for updates.' });
  }
}

export async function downloadUpdate(): Promise<AppUpdate> {
  if (portable) throw new AppError('PORTABLE', 'The portable build cannot update itself. Download the new version from the release page.');
  if (state.state !== 'available') return state;
  set({ state: 'downloading', fraction: 0, error: undefined });
  try {
    await autoUpdater.downloadUpdate();
    return state;
  } catch (e) {
    log.warn('[update] download failed', e);
    return set({ state: 'error', error: 'The update could not be downloaded.' });
  }
}

export async function installUpdate(): Promise<void> {
  if (portable) {
    if (state.state === 'available' && state.latest) await shell.openExternal(`https://github.com/${REPO}/releases/tag/v${state.latest}`);
    return;
  }
  if (state.state !== 'ready') throw new AppError('NOT_READY', 'The update has not been downloaded yet.');
  autoUpdater.quitAndInstall();
}
