import { parseManifest } from '@mifs/core';
import { PlatformError, type BundleInfo, type GameAdapter, type GameFile, type Platform, type ProgressEvent } from './platform';

const sha = (c: string) => c.repeat(64);
const mod = (id: string, version: string, size: number, deps: string[] = [], extra: Record<string, unknown> = {}) => ({
  id,
  name: id,
  version,
  aliases: [],
  path: `mods/${id}.mod.zip`,
  sha256: sha('a'),
  size,
  dependsOn: [{ name: 'ModLoader', range: '^2.100.0' }, ...deps.map((name) => ({ name, range: '^1.0.0' }))],
  default: true,
  ...extra,
});

/** A believable bundle for UI development and demos (no real files behind it). */
export const MOCK_BUNDLE: BundleInfo = {
  id: 'upstream-2.101.1-17c16d9',
  origin: 'local',
  manifest: parseManifest({
    schema: 1,
    id: 'upstream-2.101.1-17c16d9',
    kind: 'upstream',
    loader: { version: '2.101.1', repo: 'https://github.com/Lyoko-Jeremie/sugarcube-2-ModLoader.git', ref: '2.101.1', commit: '17c16d91b6c10ea14ee19a4ddd49a3f76bd1655f', builtAt: '2026-10-09T09:00:00Z' },
    beforeSC2: { path: 'BeforeSC2.js', sha256: sha('b'), size: 4681053 },
    mods: [
      mod('ModLoaderGui', '1.9.1', 922858, ['ModSubUiAngularJs']),
      mod('ConflictChecker', '1.3.0', 40213),
      mod('ModSubUiAngularJs', '1.2.0', 310442, ['ConflictChecker']),
      mod('ImageLoaderHook', '2.101.0', 304387, [], { name: 'ModLoader DoL ImageLoaderHook', aliases: ['ImageLoaderHook'] }),
      mod('CheckGameVersion', '2.2.1', 18771),
      mod('TweeReplacer', '1.7.0', 91220),
      mod('ReplacePatch', '1.3.0', 70112, [], { name: 'ReplacePatcher' }),
      mod('ModdedClothesAddon', '1.6.3', 244810, ['TweeReplacer', 'ReplacePatcher', 'ImageLoaderHook']),
    ],
    licenses: ['licenses/LICENSE'],
  }),
};

export const MOCK_ADAPTERS: GameAdapter[] = [
  { id: 'dolp', name: 'Degrees of Lewdity Plus', description: 'Latest HTML-only release from GitGud' },
  { id: 'xchange', name: 'DoL X-Change Edition', description: 'Latest HTML release (images and audio are separate)' },
];

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** In-memory Platform: lets the UI run in a plain browser and keeps it testable without Electron. */
export function createMockPlatform(opts: { bundles?: BundleInfo[]; delay?: number } = {}): Platform {
  const delay = opts.delay ?? 400;
  const listeners = new Set<(e: ProgressEvent) => void>();
  const emit = (e: ProgressEvent) => listeners.forEach((l) => l(e));
  const logListeners = new Set<(lines: string[]) => void>();
  const buildLog = (lines: string[]) => logListeners.forEach((l) => l(lines));
  let cancelled = false;
  let bundles = opts.bundles ?? [];
  const game = (name: string, source: GameFile['source']): GameFile => ({ id: `g-${name}`, name, size: 57_188_965, source });

  return {
    bundles: {
      list: async () => bundles,
      importFolder: async () => {
        await wait(delay);
        if (!bundles.some((b) => b.id === MOCK_BUNDLE.id)) bundles = [...bundles, MOCK_BUNDLE];
        return MOCK_BUNDLE;
      },
      remove: async (id) => void (bundles = bundles.filter((b) => b.id !== id)),
    },
    games: {
      adapters: async () => MOCK_ADAPTERS,
      pickFile: async () => game('Degrees of Lewdity.html', 'file'),
      fetchLatest: async (id) => {
        for (let i = 1; i <= 5; i++) {
          emit({ kind: 'download', label: `Downloading… ${i * 20}%`, fraction: i / 5 });
          await wait(delay / 2);
        }
        return game(id === 'xchange' ? 'DoL X-Change 0.22.2' : 'DoL Plus v0.778', 'download');
      },
    },
    output: { pick: async (name) => `C:\\Users\\you\\Games\\${name}` },
    inject: {
      run: async (req) => {
        for (const [label, fraction] of [['Checking files', 0.2], ['Patching the game', 0.5], ['Embedding mods', 0.8], ['Writing the file', 0.95]] as const) {
          emit({ kind: 'inject', label, fraction });
          await wait(delay);
        }
        return { outputPath: req.outputPath, size: 71_649_151, modIds: req.modIds, warnings: [], ms: 4 * delay };
      },
    },
    shell: { showInFolder: async () => {} },
    build: {
      preflight: async () => ({
        git: { found: true, version: '2.55.0', ok: true },
        node: { found: true, version: 'v24.15.0', ok: true },
        corepack: { found: true, version: '0.34.6', ok: true },
        ok: true,
      }),
      listTags: async () => ['2.101.1', '2.100.1', '2.61.0'],
      start: async ({ ref }) => {
        cancelled = false;
        const steps = ['Downloading the source', 'Installing loader dependencies', 'Building the loader (3/5)', 'Building mod TweeReplacer (9/23)', 'Packaging'];
        for (const [i, label] of steps.entries()) {
          if (cancelled) throw new PlatformError('CANCELLED', 'The build was cancelled.');
          emit({ kind: 'build', label, fraction: i / steps.length });
          buildLog([`$ corepack yarn run step-${i + 1}`, `  building ${ref}…`, 'webpack compiled successfully']);
          await wait(delay);
        }
        if (cancelled) throw new PlatformError('CANCELLED', 'The build was cancelled.');
        return { ...MOCK_BUNDLE, id: `built-${ref}` };
      },
      cancel: async () => void (cancelled = true),
      onLog: (l) => {
        logListeners.add(l);
        return () => void logListeners.delete(l);
      },
    },
    onProgress: (l) => {
      listeners.add(l);
      return () => void listeners.delete(l);
    },
  };
}
