# MIFS: ModLoader Installer for SugarCube

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/V7V21QT2FO)

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

## Bundles and the catalog (CI)

- **Build ModLoader bundle** (`.github/workflows/build-bundle.yml`, manual): builds any ModLoader repo/ref and publishes it as a release
  (`loader-<id>`) plus an updated `catalog` release. Forks are published as pre-releases.
- **Check upstream for new releases** (`.github/workflows/check-upstream.yml`, Mondays 06:17 UTC or manual): starts the build for official
  `x.y.z` tags newer than the newest published upstream bundle (at most 2 per run). Forks and older tags are never built automatically.
  Try it without building anything: `gh workflow run check-upstream.yml -f dry_run=true`.
- **Notify on CI failure** (`.github/workflows/notify-failure.yml`): when either workflow fails it opens a `ci-failure` issue (GitHub e-mails
  you about issues), comments on repeats, and closes the issue when the same job succeeds again.
- **Which mods a bundle contains:** each ref is built with its own `modList.json` (forks may drop or replace mods; e.g. the thalia fork has no
  ImageLoaderHook). `bundle/mods.json` holds a fallback list for refs without one, plus extras added per kind of source (upstream: ModuleCssReplacer).
- Script tests: `node --test bundle/scripts/check-upstream.test.mjs bundle/scripts/ci-failure-issue.test.mjs bundle/scripts/modlist.test.mjs`.

## Packaging notes

- Output: `MIFS-Setup-<version>.exe` (NSIS, per-user, no admin) and `MIFS-<version>-portable.exe`.
- Builds are **unsigned**, so Windows SmartScreen will warn on first run until a code-signing certificate is configured.
- Everything is bundled by electron-vite, so the packaged app ships no `node_modules`. Electron is pinned to an exact version
  because electron-builder requires it.
- The icon in `packages/desktop/build/icon.png` is a placeholder.
- User data (installed bundles, downloaded games, logs) lives in `%APPDATA%\MIFS`.

## Support

MIFS is free. If it is useful to you, you can support it on Ko-fi:

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/V7V21QT2FO)
