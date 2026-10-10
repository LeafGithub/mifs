import { PlatformError, type Platform, type ProgressEvent } from '@mifs/ui/platform';
import { contextBridge, ipcRenderer } from 'electron';

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
  onProgress(listener) {
    const handler = (_: unknown, e: ProgressEvent) => listener(e);
    ipcRenderer.on('progress', handler);
    return () => void ipcRenderer.removeListener('progress', handler);
  },
};

contextBridge.exposeInMainWorld('api', api);
