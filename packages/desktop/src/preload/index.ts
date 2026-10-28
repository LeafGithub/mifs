import { PlatformError, type AppUpdate, type Platform, type ProgressEvent } from '@mifs/ui/platform';
import { contextBridge, ipcRenderer, webUtils } from 'electron';

type Result<T> = { ok: true; value: T } | { ok: false; error: { code: string; message: string } };

async function call<T>(channel: string, arg?: unknown): Promise<T> {
  const r = (await ipcRenderer.invoke(channel, arg)) as Result<T>;
  if (!r.ok) throw new PlatformError(r.error.code, r.error.message);
  return r.value;
}

const api: Platform = {
  bundles: {
    list: () => call('bundles:list'),
    importFolder: () => call('bundles:importFolder'),
    remove: (id) => call('bundles:remove', { id }),
  },
  games: {
    adapters: () => call('games:adapters'),
    pickFile: () => call('games:pickFile'),
    fetchLatest: (adapterId) => call('games:fetchLatest', { adapterId }),
  },
  output: { pick: (suggestedName, gameId) => call('output:pick', { suggestedName, gameId }) },
  inject: { run: (request) => call('inject:run', request) },
  localMods: {
    list: () => call('localMods:list'),
    pick: () => call('localMods:pick'),
    addPaths: (paths) => call('localMods:addPaths', { paths }),
    locate: (id) => call('localMods:locate', { id }),
    setEnabled: (id, enabled) => call('localMods:setEnabled', { id, enabled }),
    move: (id, toIndex) => call('localMods:move', { id, toIndex }),
    remove: (id) => call('localMods:remove', { id }),
    pathForFile: (file) => webUtils.getPathForFile(file),
  },
  shell: { showInFolder: (path) => call('shell:showInFolder', { path }) },
  catalog: {
    list: () => call('catalog:list'),
    install: (id) => call('catalog:install', { id }),
    getSettings: () => call('catalog:getSettings'),
    saveSettings: (patch) => call('catalog:saveSettings', patch),
  },
  build: {
    preflight: () => call('build:preflight'),
    listTags: (repo) => call('build:listTags', { repo }),
    start: (request) => call('build:start', request),
    cancel: () => call('build:cancel'),
    onLog(listener) {
      const handler = (_: unknown, lines: string[]) => listener(lines);
      ipcRenderer.on('build:log', handler);
      return () => void ipcRenderer.removeListener('build:log', handler);
    },
  },
  update: {
    get: () => call('update:get'),
    check: () => call('update:check'),
    download: () => call('update:download'),
    install: () => call('update:install'),
    onChange(listener) {
      const handler = (_: unknown, u: AppUpdate) => listener(u);
      ipcRenderer.on('update', handler);
      return () => void ipcRenderer.removeListener('update', handler);
    },
  },
  onProgress(listener) {
    const handler = (_: unknown, e: ProgressEvent) => listener(e);
    ipcRenderer.on('progress', handler);
    return () => void ipcRenderer.removeListener('progress', handler);
  },
};

contextBridge.exposeInMainWorld('api', api);
