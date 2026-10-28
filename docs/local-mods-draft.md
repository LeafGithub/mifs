# Draft: add your own mod zips

Status: built 2026-10-28 (not committed). Where the build differs from the plan below, see "As built" at the end. Reverses the earlier "sideloading dropped" decision
(PENDING.md, Features 1).

## Goal

Users pick `.mod.zip` files they already downloaded, and MIFS embeds them into the `.mod.html` together with the
bundle's mods. The result is the same as loading them through ModLoader's in-game mod manager, except they are
baked into the file and load every time.

Stays inside the scope rule: MIFS still only writes the HTML. No downloading mods from URLs, no mod browser,
no image or audio packs, no test-running the game, no game-version checks.

## Decisions

1. **Remembered "My mods" list.** Added zips are kept across restarts and re-checked on start.
2. **Same name as a bundled mod: blocked.** The row says "Already in the loader bundle".
3. **Folder-in-zip is fixed in v1.** MIFS repacks it in memory so `boot.json` is at the top.
4. **Two entry points:** an "Add your own mods…" link on the Install card, and the section in Customize.
5. "Make another" keeps your mods (follows from 1).

## User flow

1. Install card: a small **Add your own mods…** link under the mods row. Customize (ModsEditor) gets a second
   section under the bundled list: **Your mods**. Both open the same list.
2. **Add mod zips…** opens a multi-select file dialog (`.zip`). Dropping zips onto the section does the same.
3. Each zip is checked right away. A row shows a checkbox, name, version, file name, size, and a remove button.
   Problems show on the row (red = cannot be used, amber = will be embedded but may fail in game, blue = MIFS
   fixed something, e.g. "Repacked: boot.json was inside a folder").
4. The checkbox decides whether the mod goes into this build; unchecked mods stay in the list for next time.
5. Rows can be moved up or down; that is the load order of your mods (after all bundled mods).
6. Summary row on the Install card: `Standard set: 23 mods + 2 of yours`.
7. Finish screen: `Mods: 25 (2 yours)`, plus any warnings.

One line under the section: *Mods you add run code inside your game. Only add mods from people you trust.*

## The "My mods" list

Saved in the settings file (next to catalog settings), one entry per mod:
`{ path, sha256, size, mtimeMs, enabled, order, info }` where `info` is the parsed boot.json data (name,
version, aliases, dependsOn) and whether it needs repacking.

On app start (in the background, not blocking the window):
- File gone → row stays, greyed out, "File not found: <path>" with **Locate…** (pick the file again) and remove.
  A missing file is never embedded.
- Size or mtime changed → re-hash; if the hash changed, re-check the zip and show "Updated from the file" with
  the new version. A newer version of the same mod is the normal case (user downloaded an update and overwrote
  the old zip), so this is not an error unless the new zip fails the checks.
- Otherwise trust the stored info.

Only paths that came from the dialog, a drop, or Locate ever get into the list, and the inject worker reads only
paths that are in the list.

## Checks on each zip

Done in the main process when the zip is added (and again when it changed); the renderer only gets a handle and
the parsed info.

| Case | Result |
|---|---|
| Not a zip, or unreadable | Error: "This is not a zip file." |
| `boot.json` at the top level | OK, parse it |
| No top-level `boot.json`, exactly one folder holds everything and has `boot.json` (`MyMod/boot.json`) | Fixed: repack without the folder, blue note on the row |
| Several folders each with their own `boot.json` (a pack of mods) | Offer to add each as its own mod, each repacked |
| Zip contains one or more `*.mod.zip` (download wrapper) | Offer to add the inner zip(s) instead |
| No `boot.json` anywhere | Error: "Not a ModLoader mod: no boot.json found." |
| `boot.json` not valid JSON, or no `name` / `version` | Error: "boot.json is broken: …" |
| Files listed in `boot.json` (`scriptFileList`, `styleFileList`, `tweeFileList`, `imgFileList`, …) missing from the zip | Warning, list the first few |
| Same `name` (or alias) as a bundled mod in this bundle | Error: "Already in the loader bundle." |
| Same `name` as another of your mods | Replace the older row, with a notice |
| Too many entries or too large (caps like `extractBundleZip`) | Error |
| Large total (base64 grows the HTML by about 1.33x) | Warning above ~50 MB of added mods |

The name-clash check depends on the bundle, so it runs again when the user switches bundles; a clash then only
disables that row for the current bundle.

Nothing is extracted to disk. A zip that needs no fix is embedded byte for byte. A repacked zip is rebuilt in
memory at inject time from the original file (fflate `zipSync`, entries in their original order, folder prefix
stripped), so the list never stores a second copy. Inspection reads only `boot.json` and the entry list, with
the same entry-count, size and safe-path rules as `extractBundleZip` (repacking makes paths matter).

## Dependencies

`boot.json` `dependenceInfo` (`{ modName, version }`) and `alias` are read the same way `build-bundle.mjs` does.

- Needs a bundled mod that is not selected: add it automatically, with the usual notice ("Added X because Y needs it").
- Needs another of your mods that is unchecked or missing: warning on the row, with a one-click "Turn on X" when it is
  in the list.
- Needs another of your mods that is on: fine; load order is adjusted so the dependency loads first.
- Needs `ModLoader`: compare against the bundle's `loader.version`; warn on mismatch (needs a small semver range
  check, core has no dependencies today).
- Needs `GameVersion`: ignored (game-version checks were dropped).
- Needs something nobody provides: warning on the row, not a block. ModLoader reports it in game.

Load order: bundled mods in manifest order, then your enabled mods in list order, moved only as much as needed so
each loads after its dependencies.

## Code changes

**core** (runtime-neutral, no zip library)
- `parseBootJson(json): LocalModInfo`: name, version, aliases, dependsOn, listed files; throws a typed error.
- `resolveDependencies` takes extra providers (your mods) so their names satisfy dependencies and bundled
  dependencies get pulled in.
- Small semver range check for the `ModLoader` dependency.
- `injectMods` unchanged (already takes `Uint8Array[]` in order).

**desktop main**
- `services/localMods.ts`: dialog, Locate, `inspectModZip(bytes)` and `repackModZip(bytes, prefix)` with fflate
  (next to `extractBundleZip`), the remembered list, start-up re-check.
- `services/settings.ts`: stores the list.
- Drop support: preload exposes `webUtils.getPathForFile` for dropped files (renderer stays sandboxed).
- Inject: `InjectRequest.localModIds`; the worker reads those files, checks the sha256 still matches (changed
  since the last check → "MyMod.zip changed, check it again" and the row re-checks), repacks where needed, and
  appends them after the bundled zips.

**ui**
- `platform.ts`: `LocalMod` type and `localMods?: { list(); pick(); addPaths(paths); locate(id); setEnabled(id, on);
  move(id, toIndex); remove(id); onChange(listener) }`.
- `store.ts`: local mods state from the platform; enabled ones go into the inject request.
- `ModsEditor.tsx`: "Your mods" section; `BuildStep.tsx`: Install-card link, summary label, finish stat.
- `mock.ts`: fake implementation for UI tests.

## Tests

- core: `parseBootJson` (missing fields, bad deps, aliases), resolution with local providers and auto-added
  bundled deps, semver range check.
- desktop unit: `inspectModZip` on fixture zips (good, folder-in-zip, pack of several mods, wrapper with inner
  `.mod.zip`, no boot.json, broken boot.json, missing listed files, too many entries, unsafe paths);
  `repackModZip` output has `boot.json` at the top and the same file contents; list re-check (missing, changed,
  unchanged).
- e2e: add a fixture zip, see the row, restart, row is still there, install, check the output's
  `modDataValueZipList` has bundle + 1 entries; a folder-in-zip fixture shows the repacked note.

## As built

- The list lives in its own file, `userData/local-mods.json`, not in `settings.json`.
- Packs of folders and wrapper zips are added right away, one row per mod found, each with a note; there is no
  separate "offer" step. Rows can be removed.
- `addonPlugin` entries in boot.json count as dependencies too (a mod that hooks into an addon needs that mod loaded).
- Dependency checks also compare versions against the bundled mod or your own mod that provides the name.
- A mod needed by another of your enabled mods cannot be turned off (same rule as bundled mods).
- Code: `core/src/localMod.ts`, `core/src/semver.ts`, `desktop/src/main/services/localMods.ts` and
  `local-mods-utils.ts`, `ui/src/steps/LocalMods.tsx`.
