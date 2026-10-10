import type { BundleManifest } from '@mifs/core';

/** A ModLoader bundle available on this machine. */
export interface BundleInfo {
  id: string;
  manifest: BundleManifest;
  origin: 'local' | 'catalog';
}

/** A game HTML the user picked or downloaded. The renderer only ever sees this handle, never the file contents. */
export interface GameFile {
  id: string;
  /** Display name, e.g. `Degrees of Lewdity.html` or `DoL Plus v0.778`. */
  name: string;
  size: number;
  source: 'file' | 'download';
}

export interface GameAdapter {
  id: string;
  name: string;
  description: string;
}

export interface InjectRequest {
  bundleId: string;
  gameId: string;
  /** Selected mod ids; dependencies are added automatically by the injector. */
  modIds: string[];
  outputPath: string;
}

export interface InjectResult {
  outputPath: string;
  size: number;
  /** Mods actually embedded, in load order (selection plus dependencies). */
  modIds: string[];
  warnings: string[];
  ms: number;
}

export interface ProgressEvent {
  kind: 'download' | 'verify' | 'inject' | 'build';
  label: string;
  /** 0..1, or null when unknown. */
  fraction: number | null;
}

/** A published loader bundle that can be downloaded. */
export interface CatalogEntry {
  id: string;
  kind: 'upstream' | 'fork';
  version: string;
  ref: string;
  commit: string;
  builtAt: string;
  modCount: number;
  bundleSize: number;
  /** Pre-releases are forks or unreleased builds. */
  prerelease: boolean;
  /** Already installed on this machine. */
  installed: boolean;
  /** Installed, but the catalog has a newer build under the same id (a republished bundle). */
  updateAvailable: boolean;
}

export interface CatalogList {
  /** Where the list came from, e.g. `owner/repo`. */
  source: string;
  entries: CatalogEntry[];
}

export interface CatalogSettings {
  /** `owner/repo` that publishes bundles. */
  repo: string;
  /** An access token is stored (it is never sent back to the UI). */
  hasToken: boolean;
}

export interface ToolStatus {
  found: boolean;
  /** Version string as reported by the tool, when found. */
  version?: string;
  /** Found and new enough. */
  ok: boolean;
  /** What to do when not ok. */
  hint?: string;
}

/** Tools that building from source needs on the user's machine. */
export interface Preflight {
  git: ToolStatus;
  node: ToolStatus;
  corepack: ToolStatus;
  /** Free space where builds are made (a build needs several GB while it runs). */
  disk: ToolStatus;
  ok: boolean;
}

export interface BuildRequest {
  /** https git URL of a ModLoader repository (GitHub). */
  repo: string;
  /** Tag, branch or commit to build. */
  ref: string;
}

/** Everything the UI needs from its host. Desktop implements it over IPC, the web app in the browser. */
export interface Platform {
  bundles: {
    list(): Promise<BundleInfo[]>;
    /** Opens a folder picker; the folder must contain a bundle's manifest.json. Null when cancelled. */
    importFolder(): Promise<BundleInfo | null>;
    remove(id: string): Promise<void>;
  };
  games: {
    adapters(): Promise<GameAdapter[]>;
    /** Opens a file picker for a game .html or .zip. Null when cancelled. */
    pickFile(): Promise<GameFile | null>;
    /** Downloads the latest release of a known game. */
    fetchLatest(adapterId: string): Promise<GameFile>;
  };
  output: {
    /** Opens a save dialog. Null when cancelled. */
    pick(suggestedName: string): Promise<string | null>;
  };
  inject: {
    run(request: InjectRequest): Promise<InjectResult>;
  };
  shell: {
    showInFolder(path: string): Promise<void>;
  };
  /** Downloading published loader bundles. Absent on hosts without a catalog. */
  catalog?: {
    list(): Promise<CatalogList>;
    /** Downloads, verifies and installs a bundle. Progress arrives through onProgress. */
    install(id: string): Promise<BundleInfo>;
    getSettings(): Promise<CatalogSettings>;
    /** `token: null` removes the stored token; leaving it out keeps it. */
    saveSettings(patch: { repo?: string; token?: string | null }): Promise<CatalogSettings>;
  };
  /** Building a loader bundle from source. Absent on hosts that cannot run builds (the web app). */
  build?: {
    preflight(): Promise<Preflight>;
    /** Release-style tags (x.y.z) of the repository, newest first. */
    listTags(repo: string): Promise<string[]>;
    /** Builds, then installs the resulting bundle. Resolves with it; progress arrives through onProgress and onLog. */
    start(request: BuildRequest): Promise<BundleInfo>;
    cancel(): Promise<void>;
    /** Subscribes to raw build output lines. */
    onLog(listener: (lines: string[]) => void): () => void;
  };
  /** Subscribes to progress events; returns an unsubscribe function. */
  onProgress(listener: (event: ProgressEvent) => void): () => void;
}

/** Failure with a stable `code` the UI can switch on (host errors are mapped to this). */
export class PlatformError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'PlatformError';
    this.code = code;
  }
}
