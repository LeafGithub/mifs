import { defaultSelection, dependentsOf, resolveDependencies } from '@mifs/core';
import { createContext, useContext } from 'react';
import { createStore, useStore, type StoreApi } from 'zustand';
import type { BundleInfo, GameAdapter, GameFile, InjectResult, Platform, Preflight, ProgressEvent } from './platform';
import { UPSTREAM_REPO } from './lib/sources';

export const STEPS = ['Loader', 'Game', 'Mods', 'Install'] as const;

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
  /** The user confirmed that building runs code from a repository that is not the official one. */
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

export interface AppState {
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
  outputPath: string | null;
  run: RunState;
  /** Last action failure, shown inline until the next action. */
  error: string | null;

  init(): Promise<void>;
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

    platform.build?.onLog((lines) => set((s) => ({ build: { ...s.build, logs: [...s.build.logs, ...lines].slice(-400) } })));

    platform.onProgress((p) => {
      if (p.kind === 'build') set((s) => (s.build.status === 'running' ? { build: { ...s.build, progress: p } } : s));
      else if (get().run.status === 'running') set((s) => ({ run: { ...s.run, progress: p } }));
      else if (get().gameBusy) set({ gameProgress: p });
    });

    return {
      canBuild: platform.build !== undefined,
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
      outputPath: null,
      run: idleRun,
      error: null,

      async init() {
        try {
          const [bundles, adapters] = await Promise.all([platform.bundles.list(), platform.games.adapters()]);
          set({ bundles, adapters, bundlesLoaded: true });
          if (bundles.length === 1) get().selectBundle(bundles[0]!.id);
        } catch (e) {
          set({ bundlesLoaded: true, error: message(e) });
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
          if (dependentsOf(manifest, id, selected).length) return; // the UI disables this; guard anyway
          set({ selected: selected.filter((s) => s !== id), notice: null });
        }
      },

      resetMods() {
        const manifest = currentManifest();
        if (manifest) set({ selected: defaultSelection(manifest), notice: null });
      },

      async pickOutput() {
        try {
          const path = await platform.output.pick(suggestedOutputName(get().game));
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
          const result = await platform.inject.run({ bundleId, gameId: game.id, modIds: selected, outputPath });
          set({ run: { status: 'done', progress: null, result, error: null } });
        } catch (e) {
          set({ run: { status: 'error', progress: null, result: null, error: message(e) } });
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
