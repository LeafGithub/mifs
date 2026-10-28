import { bundleClashes, defaultSelection, dependentsOf, resolveDependencies, type BundleManifest } from '@mifs/core';
import { createContext, useContext } from 'react';
import { createStore, useStore, type StoreApi } from 'zustand';
import type { BundleInfo, CatalogList, CatalogSettings, GameAdapter, GameFile, InjectResult, LocalMod, LocalModsChange, Platform, Preflight, ProgressEvent } from './platform';
import { UPSTREAM_REPO } from './lib/sources';

export const STEPS = ['Loader', 'Game', 'Create'] as const;

export interface RunState {
  status: 'idle' | 'running' | 'done' | 'error';
  progress: ProgressEvent | null;
  result: InjectResult | null;
  error: string | null;
}

export interface BuildState {
  open: boolean;
  preflight: Preflight | null;
  tags: string[];
  tagsError: string | null;
  mode: 'release' | 'master' | 'custom';
  tag: string;
  repo: string;
  ref: string;
  /** The user confirmed that building runs code from an unofficial repository. */
  trusted: boolean;
  status: 'idle' | 'running' | 'done' | 'error';
  progress: ProgressEvent | null;
  logs: string[];
  error: string | null;
}

const idleBuild: BuildState = {
  open: false,
  preflight: null,
  tags: [],
  tagsError: null,
  mode: 'release',
  tag: '',
  repo: '',
  ref: '',
  trusted: false,
  status: 'idle',
  progress: null,
  logs: [],
  error: null,
};

export interface CatalogState {
  list: CatalogList | null;
  loading: boolean;
  /** Why the list could not load (quiet notice; expected while the repo is private). */
  error: string | null;
  /** A download or settings change that failed (shown as an alert). */
  actionError: string | null;
  /** Id of the bundle being downloaded. */
  installing: string | null;
  progress: ProgressEvent | null;
  settings: CatalogSettings | null;
  settingsOpen: boolean;
}

export interface LocalModsState {
  list: LocalMod[];
  /** An add, locate or other change is in flight. */
  busy: boolean;
  /** Files from the last add that held no usable mod. */
  rejected: LocalModsChange['rejected'];
  /** What the last change did that the user should know. */
  notices: string[];
  error: string | null;
}

const idleLocal: LocalModsState = { list: [], busy: false, rejected: [], notices: [], error: null };

/** The user's mods that go into the next game: on, readable, and not clashing with the bundle. */
export function usableLocalMods(list: LocalMod[], manifest: BundleManifest | null): LocalMod[] {
  return list.filter((m) => m.enabled && m.status === 'ok' && !(manifest && bundleClashes(manifest, m).length));
}

const idleCatalog: CatalogState = { list: null, loading: false, error: null, actionError: null, installing: null, progress: null, settings: null, settingsOpen: false };

export interface AppState {
  /** The host can download published bundles. */
  canCatalog: boolean;
  catalog: CatalogState;
  /** The host can build loader bundles from source. */
  canBuild: boolean;
  build: BuildState;
  step: number;
  bundles: BundleInfo[];
  bundlesLoaded: boolean;
  bundleId: string | null;
  adapters: GameAdapter[];
  game: GameFile | null;
  /** Which game action is in flight: an adapter id, or `file`. */
  gameBusy: string | null;
  gameProgress: ProgressEvent | null;
  selected: string[];
  notice: string | null;
  /** The host remembers the user's own mod zips. */
  canLocalMods: boolean;
  localMods: LocalModsState;
  outputPath: string | null;
  run: RunState;
  /** Last action failure, shown inline until the next action. */
  error: string | null;

  init(): Promise<void>;
  loadCatalog(): Promise<void>;
  installFromCatalog(id: string): Promise<void>;
  toggleCatalogSettings(): void;
  saveCatalogSettings(patch: { repo?: string; token?: string | null }): Promise<void>;
  toggleBuild(): Promise<void>;
  recheckBuild(): Promise<void>;
  setBuild(patch: Partial<BuildState>): void;
  startBuild(): Promise<void>;
  cancelBuild(): Promise<void>;
  go(step: number): void;
  importBundle(): Promise<void>;
  removeBundle(id: string): Promise<void>;
  selectBundle(id: string): void;
  pickGameFile(): Promise<void>;
  fetchGame(adapterId: string): Promise<void>;
  toggleMod(id: string, on: boolean): void;
  resetMods(): void;
  addLocalMods(): Promise<void>;
  dropLocalMods(files: File[]): Promise<void>;
  locateLocalMod(id: string): Promise<void>;
  toggleLocalMod(id: string, on: boolean): Promise<void>;
  moveLocalMod(id: string, toIndex: number): Promise<void>;
  removeLocalMod(id: string): Promise<void>;
  dismissLocalMessages(): void;
  pickOutput(): Promise<void>;
  start(): Promise<void>;
  showInFolder(path: string): Promise<void>;
  reset(): void;
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
const idleRun: RunState = { status: 'idle', progress: null, result: null, error: null };

export function suggestedOutputName(game: GameFile | null): string {
  const base = (game?.name ?? 'game').replace(/\.html?$/i, '').replace(/[\\/:*?"<>|]+/g, ' ').trim();
  return `${base || 'game'}.mod.html`;
}

export function createAppStore(platform: Platform): StoreApi<AppState> {
  const store = createStore<AppState>((set, get) => {
    const currentManifest = () => get().bundles.find((b) => b.id === get().bundleId)?.manifest ?? null;
    const usable = () => usableLocalMods(get().localMods.list, currentManifest());

    /** Adds the bundled mods the user's enabled mods need; returns their names for a notice. */
    const pullLocalDeps = (base: string[] = get().selected) => {
      const manifest = currentManifest();
      if (!manifest) return [];
      const r = resolveDependencies(manifest, base, usable());
      const before = new Set(base);
      set({ selected: r.ids });
      return r.ids.filter((id) => !before.has(id)).map((id) => manifest.mods.find((m) => m.id === id)?.name ?? id);
    };

    const applyLocal = (change: LocalModsChange | LocalMod[]) => {
      const mods = Array.isArray(change) ? change : change.mods;
      set((s) => ({
        localMods: {
          ...s.localMods,
          list: mods,
          busy: false,
          error: null,
          ...(Array.isArray(change) ? {} : { rejected: change.rejected, notices: change.notices }),
        },
      }));
      const added = pullLocalDeps();
      if (added.length) set((s) => ({ localMods: { ...s.localMods, notices: [...s.localMods.notices, `Also turned on bundled mods your mods need: ${added.join(', ')}`] } }));
    };

    const localAction = async (fn: () => Promise<LocalModsChange | LocalMod[]>) => {
      set((s) => ({ localMods: { ...s.localMods, busy: true, error: null, rejected: [], notices: [] } }));
      try {
        applyLocal(await fn());
      } catch (e) {
        set((s) => ({ localMods: { ...s.localMods, busy: false, error: message(e) } }));
      }
    };

    // Only the newest catalog load may update state; an older, slower one
    // (e.g. started before a token was saved) must not overwrite it.
    let catalogSeq = 0;

    platform.build?.onLog((lines) => set((s) => ({ build: { ...s.build, logs: [...s.build.logs, ...lines].slice(-400) } })));

    platform.onProgress((p) => {
      if (p.kind === 'download' && get().catalog.installing) set((s) => ({ catalog: { ...s.catalog, progress: p } }));
      else if (p.kind === 'build') set((s) => (s.build.status === 'running' ? { build: { ...s.build, progress: p } } : s));
      else if (get().run.status === 'running') set((s) => ({ run: { ...s.run, progress: p } }));
      else if (get().gameBusy) set({ gameProgress: p });
    });

    return {
      canBuild: platform.build !== undefined,
      canCatalog: platform.catalog !== undefined,
      catalog: idleCatalog,
      build: idleBuild,
      step: 0,
      bundles: [],
      bundlesLoaded: false,
      bundleId: null,
      adapters: [],
      game: null,
      gameBusy: null,
      gameProgress: null,
      selected: [],
      notice: null,
      canLocalMods: platform.localMods !== undefined,
      localMods: idleLocal,
      outputPath: null,
      run: idleRun,
      error: null,

      async init() {
        try {
          const [bundles, adapters] = await Promise.all([platform.bundles.list(), platform.games.adapters()]);
          set({ bundles, adapters, bundlesLoaded: true });
          if (bundles.length === 1) get().selectBundle(bundles[0]!.id);
          void get().loadCatalog();
          if (platform.localMods) {
            platform.localMods.list().then(
              (list) => applyLocal(list),
              (e: unknown) => set((s) => ({ localMods: { ...s.localMods, error: message(e) } })),
            );
          }
        } catch (e) {
          set({ bundlesLoaded: true, error: message(e) });
        }
      },

      async loadCatalog() {
        const api = platform.catalog;
        if (!api) return;
        const seq = ++catalogSeq;
        set((s) => ({ catalog: { ...s.catalog, loading: true, error: null } }));
        const [list, settings] = await Promise.allSettled([api.list(), api.getSettings()]);
        if (seq !== catalogSeq) return;
        set((s) => ({
          catalog: {
            ...s.catalog,
            loading: false,
            list: list.status === 'fulfilled' ? list.value : null,
            error: list.status === 'rejected' ? message(list.reason) : null,
            settings: settings.status === 'fulfilled' ? settings.value : s.catalog.settings,
          },
        }));
      },

      async installFromCatalog(id) {
        const api = platform.catalog;
        if (!api || get().catalog.installing) return;
        set((s) => ({ catalog: { ...s.catalog, installing: id, progress: null, actionError: null } }));
        try {
          const info = await api.install(id);
          set((s) => ({
            bundles: [...s.bundles.filter((b) => b.id !== info.id), info],
            catalog: { ...s.catalog, installing: null, progress: null, list: s.catalog.list && { ...s.catalog.list, entries: s.catalog.list.entries.map((e) => (e.id === info.id ? { ...e, installed: true, updateAvailable: false } : e)) } },
          }));
          get().selectBundle(info.id);
        } catch (e) {
          set((s) => ({ catalog: { ...s.catalog, installing: null, progress: null, actionError: message(e) } }));
        }
      },

      toggleCatalogSettings: () => set((s) => ({ catalog: { ...s.catalog, settingsOpen: !s.catalog.settingsOpen } })),

      async saveCatalogSettings(patch) {
        const api = platform.catalog;
        if (!api) return;
        try {
          const settings = await api.saveSettings(patch);
          set((s) => ({ catalog: { ...s.catalog, settings, actionError: null } }));
          await get().loadCatalog();
        } catch (e) {
          set((s) => ({ catalog: { ...s.catalog, actionError: message(e) } }));
        }
      },

      async toggleBuild() {
        const opening = !get().build.open;
        set((s) => ({ build: { ...s.build, open: opening } }));
        if (opening && !get().build.preflight) await get().recheckBuild();
      },

      async recheckBuild() {
        const api = platform.build;
        if (!api) return;
        set((s) => ({ build: { ...s.build, tagsError: null } }));
        const [pre, tags] = await Promise.allSettled([api.preflight(), api.listTags(UPSTREAM_REPO)]);
        set((s) => ({
          build: {
            ...s.build,
            preflight: pre.status === 'fulfilled' ? pre.value : s.build.preflight,
            tags: tags.status === 'fulfilled' ? tags.value : s.build.tags,
            tag: tags.status === 'fulfilled' ? (tags.value.includes(s.build.tag) ? s.build.tag : (tags.value[0] ?? '')) : s.build.tag,
            tagsError: tags.status === 'rejected' ? message(tags.reason) : null,
          },
        }));
      },

      setBuild: (patch) => set((s) => ({ build: { ...s.build, ...patch } })),

      async startBuild() {
        const api = platform.build;
        const b = get().build;
        if (!api || b.status === 'running') return;
        const request = b.mode === 'custom' ? { repo: b.repo, ref: b.ref } : { repo: UPSTREAM_REPO, ref: b.mode === 'master' ? 'master' : b.tag };
        set((s) => ({ build: { ...s.build, status: 'running', progress: null, logs: [], error: null } }));
        try {
          const info = await api.start(request);
          set((s) => ({ bundles: [...s.bundles.filter((x) => x.id !== info.id), info], build: { ...s.build, status: 'done', progress: null } }));
          get().selectBundle(info.id);
        } catch (e) {
          set((s) => ({ build: { ...s.build, status: 'error', progress: null, error: message(e) } }));
        }
      },

      async cancelBuild() {
        try {
          await platform.build?.cancel();
        } catch (e) {
          set({ error: message(e) });
        }
      },

      go: (step) => set({ step, error: null }),

      async importBundle() {
        set({ error: null });
        try {
          const info = await platform.bundles.importFolder();
          if (!info) return;
          set((s) => ({ bundles: [...s.bundles.filter((b) => b.id !== info.id), info] }));
          get().selectBundle(info.id);
        } catch (e) {
          set({ error: message(e) });
        }
      },

      async removeBundle(id) {
        try {
          await platform.bundles.remove(id);
          set((s) => ({ bundles: s.bundles.filter((b) => b.id !== id), ...(s.bundleId === id ? { bundleId: null, selected: [] } : {}) }));
        } catch (e) {
          set({ error: message(e) });
        }
      },

      selectBundle(id) {
        const b = get().bundles.find((x) => x.id === id);
        if (!b) return;
        set({ bundleId: id, selected: defaultSelection(b.manifest), notice: null, error: null });
        pullLocalDeps();
      },

      async pickGameFile() {
        set({ gameBusy: 'file', error: null });
        try {
          const game = await platform.games.pickFile();
          if (game) set({ game, outputPath: null });
        } catch (e) {
          set({ error: message(e) });
        } finally {
          set({ gameBusy: null, gameProgress: null });
        }
      },

      async fetchGame(adapterId) {
        set({ gameBusy: adapterId, gameProgress: null, error: null });
        try {
          set({ game: await platform.games.fetchLatest(adapterId), outputPath: null });
        } catch (e) {
          set({ error: message(e) });
        } finally {
          set({ gameBusy: null, gameProgress: null });
        }
      },

      toggleMod(id, on) {
        const manifest = currentManifest();
        if (!manifest) return;
        const { selected } = get();
        if (on) {
          const r = resolveDependencies(manifest, [...selected, id]);
          const names = r.added.filter((a) => a !== id).map((a) => manifest.mods.find((m) => m.id === a)?.name ?? a);
          set({ selected: r.ids, notice: names.length ? `Also added what ${manifest.mods.find((m) => m.id === id)?.name} needs: ${names.join(', ')}` : null });
        } else {
          if (dependentsOf(manifest, id, selected, usable()).length) return; // the UI disables this; guard anyway
          set({ selected: selected.filter((s) => s !== id), notice: null });
        }
      },

      resetMods() {
        const manifest = currentManifest();
        if (manifest) {
          set({ selected: defaultSelection(manifest), notice: null });
          pullLocalDeps();
        }
      },

      addLocalMods: () => localAction(() => platform.localMods!.pick()),

      async dropLocalMods(files) {
        const api = platform.localMods;
        if (!api) return;
        const paths = files.map((f) => api.pathForFile(f)).filter(Boolean);
        if (paths.length === 0) return;
        await localAction(() => api.addPaths(paths));
      },

      locateLocalMod: (id) => localAction(() => platform.localMods!.locate(id)),
      toggleLocalMod: (id, on) => localAction(() => platform.localMods!.setEnabled(id, on)),
      moveLocalMod: (id, toIndex) => localAction(() => platform.localMods!.move(id, toIndex)),
      removeLocalMod: (id) => localAction(() => platform.localMods!.remove(id)),
      dismissLocalMessages: () => set((s) => ({ localMods: { ...s.localMods, rejected: [], notices: [], error: null } })),

      async pickOutput() {
        try {
          const path = await platform.output.pick(suggestedOutputName(get().game), get().game?.id);
          if (path) set({ outputPath: path });
        } catch (e) {
          set({ error: message(e) });
        }
      },

      async start() {
        const { bundleId, game, selected, outputPath } = get();
        if (!bundleId || !game || !outputPath) return;
        set({ run: { status: 'running', progress: null, result: null, error: null }, error: null });
        try {
          const localModIds = usable().map((m) => m.id);
          const result = await platform.inject.run({ bundleId, gameId: game.id, modIds: selected, ...(localModIds.length ? { localModIds } : {}), outputPath });
          set({ run: { status: 'done', progress: null, result, error: null } });
        } catch (e) {
          set({ run: { status: 'error', progress: null, result: null, error: message(e) } });
          // a changed or missing file is re-checked by the host; show what is on disk now
          if (platform.localMods) platform.localMods.list().then((list) => applyLocal(list), () => undefined);
        }
      },

      async showInFolder(path) {
        try {
          await platform.shell.showInFolder(path);
        } catch (e) {
          set({ error: message(e) });
        }
      },

      reset: () => set({ run: idleRun, outputPath: null, step: 1, error: null }),
    };
  });
  return store;
}

export const StoreContext = createContext<StoreApi<AppState> | null>(null);

export function useApp<T>(selector: (s: AppState) => T): T {
  const store = useContext(StoreContext);
  if (!store) throw new Error('useApp must be used inside <App>');
  return useStore(store, selector);
}
