# MIFS: ModLoader Installer for SugarCube

Installs [ModLoader](https://github.com/Lyoko-Jeremie/sugarcube-2-ModLoader) and its standard mods into a SugarCube 2 game page
(Degrees of Lewdity Plus, DoL X-Change, ...). The original game file is not modified; a new `.mod.html` is written.

| Package | Contents |
|---|---|
| `packages/core` | Patch and inject logic, manifest parsing, dependency resolution. No runtime dependencies on Node or the browser. |
| `packages/ui` | React + Tailwind UI, the `Platform` interface it talks to, and a mock platform |
| `packages/desktop` | Electron app: main process services, sandboxed preload, installer packaging |
| `bundle/` | Scripts that build a loader bundle (`BeforeSC2.js`, mods, licenses, `manifest.json`) |

## Commands (repo root)

```bash
npm install
npm run dev          # Electron app with hot reload
npm run dev:ui       # UI in a browser against the mock platform (http://localhost:5199)
npm run typecheck
npm test             # core unit tests; conformance tests need ../modloader-lab built
npm run e2e          # drives the built Electron app; needs a bundle in bundle/dist
npm run dist -w @mifs/desktop   # installer + portable exe -> packages/desktop/release/
```

Build a test bundle with
`node bundle/scripts/build-bundle.mjs --src ../modloader-lab/work/modloader-src --out bundle/dist`.
Run e2e against a packaged build with `MIFS_EXE="packages/desktop/release/win-unpacked/MIFS.exe"`.

## Bundles and the catalog (CI)

- **Build ModLoader bundle** (`.github/workflows/build-bundle.yml`, manual): builds any ModLoader repo and ref, publishes it as a release
  (`loader-<id>`) and updates the `catalog` release. Forks are published as pre-releases.
- **Check upstream for new releases** (`.github/workflows/check-upstream.yml`, Mondays 06:17 UTC or manual): builds official `x.y.z` tags
  newer than the newest published upstream bundle (at most 2 per run). Forks and older tags are never built automatically.
  Dry run: `gh workflow run check-upstream.yml -f dry_run=true`.
- **Notify on CI failure** (`.github/workflows/notify-failure.yml`): opens a `ci-failure` issue when either workflow fails, comments on
  repeats, and closes it when the same job succeeds.
- **Mod list:** each ref is built with its own `modList.json`, since forks can drop or replace mods (the thalia fork has no ImageLoaderHook).
  `bundle/mods.json` is the fallback for refs without one, plus extras per source kind (upstream: ModuleCssReplacer).
- Script tests: `node --test bundle/scripts/check-upstream.test.mjs bundle/scripts/ci-failure-issue.test.mjs bundle/scripts/modlist.test.mjs`.

## Packaging

- Output: `MIFS-Setup-<version>.exe` (NSIS, per user, no admin) and `MIFS-<version>-portable.exe`.
- Builds are unsigned, so Windows SmartScreen warns on first run.
- electron-vite bundles everything, so no `node_modules` ship. Electron is pinned to an exact version (electron-builder requires it).
- `packages/desktop/build/icon.png` is a placeholder.
- User data (bundles, downloaded games, logs) is in `%APPDATA%\MIFS`.

## Support

MIFS is free. If it is useful to you, you can support it on Ko-fi:

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/V7V21QT2FO)
