import type { BundleManifest, DepRange } from '@mifs/core';

/** A ModLoader bundle available on this machine. */
export interface BundleInfo {
  id: string;
  manifest: BundleManifest;
  origin: 'local' | 'catalog';
}

/** A game HTML the user picked or downloaded. The renderer sees only this handle, never the contents. */
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
  /** One short line. */
  description: string;
  /** Short badges such as `Needs Git`. */
  tags?: string[];
}

export interface InjectRequest {
  bundleId: string;
  gameId: string;
  /** Selected mod ids; dependencies are added automatically by the injector. */
  modIds: string[];
  /** The user's own mods to embed after the bundled ones (ids from `localMods`). Ordered by the host. */
  localModIds?: string[];
  outputPath: string;
}

export interface InjectResult {
  outputPath: string;
  size: number;
  /** Bundled mods actually embedded, in load order (selection plus dependencies). */
  modIds: string[];
  /** The user's own mods embedded after them, in load order. */
  localModIds: string[];
  warnings: string[];
  ms: number;
}

export interface ProgressEvent {
  kind: 'download' | 'verify' | 'inject' | 'build';
  label: string;
  /** 0..1, or null when unknown. */
  fraction: number | null;
}

/** One of the user's own mod zips, remembered across restarts. */
export interface LocalMod {
  id: string;
  /** Name of the file on disk. */
  fileName: string;
  /** Full path of the file on disk (shown so a missing file can be found again). */
  path: string;
  /** Where in the file the mod was found, when it was not the file itself. */
  inside?: { kind: 'folder' | 'zip'; name: string };
  /** From boot.json; empty when the file could not be read. */
  name: string;
  version: string;
  aliases: string[];
  dependsOn: DepRange[];
  /** Bytes as embedded. */
  size: number;
  /** Goes into the next game the user creates. */
  enabled: boolean;
  /** `missing`: the file is gone; `invalid`: it no longer holds a usable mod (see `error`). */
  status: 'ok' | 'missing' | 'invalid';
  error?: string;
  /** Embedded anyway, but may fail in game. */
  warnings: string[];
  /** Things MIFS fixed or noticed, e.g. that it repacked the zip. */
  notes: string[];
}

export interface LocalModsChange {
  /** The whole list, in the user's order. */
  mods: LocalMod[];
  /** Files that held no usable mod, and why. */
  rejected: { fileName: string; error: string }[];
  /** What happened that the user should know, e.g. a mod replaced by a newer copy. */
  notices: string[];
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
  /** Free space where builds run (several GB needed). */
  disk: ToolStatus;
  ok: boolean;
}

export interface BuildRequest {
  /** https git URL of a ModLoader repository (GitHub). */
  repo: string;
  /** Tag, branch or commit to build. */
  ref: string;
}

/** State of the app's update check. `unsupported` means this build cannot check (dev run). */
export interface AppUpdate {
  state: 'unsupported' | 'idle' | 'checking' | 'none' | 'available' | 'downloading' | 'ready' | 'error';
  /** Version of the running app. */
  current: string;
  /** Newer version, when one was found. */
  latest?: string;
  /** 0..1 while downloading. */
  fraction?: number;
  /** Setup builds update themselves; portable ones link to the release page. */
  selfUpdate: boolean;
  /** Why the last check or download failed. */
  error?: string;
}

/** What the UI needs from its host. Desktop implements it over IPC. */
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
    /** Opens a save dialog, starting next to the game file when it came from the user's disk. Null when cancelled. */
    pick(suggestedName: string, gameId?: string): Promise<string | null>;
  };
  inject: {
    run(request: InjectRequest): Promise<InjectResult>;
  };
  /** The user's own mod zips. Absent on hosts without local files. */
  localMods?: {
    /** The remembered list, re-checked against the files on first call. */
    list(): Promise<LocalMod[]>;
    /** Opens a file picker (several .zip files). */
    pick(): Promise<LocalModsChange>;
    /** Adds files dropped onto the window (paths from `pathForFile`). */
    addPaths(paths: string[]): Promise<LocalModsChange>;
    /** Lets the user pick the file again for a mod whose file is gone. */
    locate(id: string): Promise<LocalModsChange>;
    setEnabled(id: string, enabled: boolean): Promise<LocalMod[]>;
    move(id: string, toIndex: number): Promise<LocalMod[]>;
    remove(id: string): Promise<LocalMod[]>;
    /** Path on disk of a dropped file; empty when the host cannot tell. */
    pathForFile(file: File): string;
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
  /** Building a bundle from source. Absent on hosts that cannot build. */
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
  /** Updating the app. Absent on hosts that update otherwise. */
  update?: {
    get(): Promise<AppUpdate>;
    check(): Promise<AppUpdate>;
    /** Downloads the newer version (installed build only). */
    download(): Promise<AppUpdate>;
    /** Restarts into the downloaded version (installed build) or opens the release page (portable build). */
    install(): Promise<void>;
    onChange(listener: (u: AppUpdate) => void): () => void;
  };
  /** Subscribes to progress events; returns an unsubscribe function. */
  onProgress(listener: (event: ProgressEvent) => void): () => void;
}

/** Failure with a stable `code` the UI can switch on. */
export class PlatformError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'PlatformError';
    this.code = code;
  }
}
