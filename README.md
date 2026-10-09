# MIFS: ModLoader Installer for SugarCube

Installs [ModLoader](https://github.com/Lyoko-Jeremie/sugarcube-2-ModLoader) and its standard mods into a SugarCube 2 game page
(Degrees of Lewdity Plus, DoL X-Change, ...). The original game file is never modified; a new `.mod.html` is written.

| Package | What it is |
|---|---|
| `packages/core` | Runtime-neutral patch + inject logic, bundle manifest parsing, dependency resolution (shared with a future web app) |
| `packages/ui` | React + Tailwind + shadcn-style UI and the `Platform` interface the UI talks to; ships a mock platform |
| `packages/desktop` | Electron app: main process services, sandboxed preload, installer packaging |
| `bundle/` | Scripts + draft CI workflow that build a loader bundle (`BeforeSC2.js` + mods + licenses + `manifest.json`) |

## Commands (repo root)

```bash
npm install
npm run dev          # Electron app with hot reload
npm run dev:ui       # UI only, in a browser, against the mock platform (http://localhost:5199)
npm run typecheck
npm test             # core unit tests + conformance against the real ModLoader tools (needs ../modloader-lab built)
npm run e2e          # drives the built Electron app (needs a bundle in bundle/dist)
npm run dist -w @mifs/desktop   # Windows installer + portable exe -> packages/desktop/release/
```

Test fixtures: build a bundle with
`node bundle/scripts/build-bundle.mjs --src ../modloader-lab/work/modloader-src --out bundle/dist`.
Run the e2e suite against a packaged build with `MIFS_EXE="packages/desktop/release/win-unpacked/MIFS.exe"`.

## Packaging notes

- Output: `MIFS-Setup-<version>.exe` (NSIS, per-user, no admin) and `MIFS-<version>-portable.exe`.
- Builds are **unsigned**, so Windows SmartScreen will warn on first run until a code-signing certificate is configured.
- Everything is bundled by electron-vite, so the packaged app ships no `node_modules`. Electron is pinned to an exact version
  because electron-builder requires it.
- The icon in `packages/desktop/build/icon.png` is a placeholder.
- User data (installed bundles, downloaded games, logs) lives in `%APPDATA%\MIFS`.
