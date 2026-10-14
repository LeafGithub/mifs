// Which mods go into a bundle. Pure functions, unit-tested in modlist.test.mjs.
//
// Each ModLoader repo ships its own `modList.json`; a bundle uses the list of the ref it was built from.
// Forks may swap mods (thalia's BeautySelectorAddon replaces ImageLoaderHook; embedding both logs duplicate-registration errors).

// `Dir/File.mod.zip`, relative to the repo's mod/ folder. Strict, since a fork is untrusted input joined onto a local path.
const MOD_ZIP = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._ +()-]+\.mod\.zip$/i;

/**
 * Parses a `modList.json` (JSON array; `//` comment lines and trailing commas allowed) into mod zip paths
 * relative to `mod/`. Skips commented-out entries and anything that is not a `.mod.zip`.
 */
export function parseModList(text) {
  const withoutComments = text
    .split(/\r?\n/)
    .filter((line) => !/^\s*\/\//.test(line))
    .join('\n')
    .replace(/,(\s*[\]}])/g, '$1');
  let list;
  try {
    list = JSON.parse(withoutComments);
  } catch (e) {
    throw new Error(`modList.json could not be parsed: ${e.message}`);
  }
  if (!Array.isArray(list) || list.some((x) => typeof x !== 'string')) throw new Error('modList.json must be an array of strings');
  const paths = list.filter((p) => /\.mod\.zip$/i.test(p)).map((p) => p.replace(/^mod\//, ''));
  const bad = paths.find((p) => !MOD_ZIP.test(p) || p.includes('..'));
  if (bad) throw new Error(`modList.json has an entry that is not a mod zip path: ${JSON.stringify(bad)}`);
  return [...new Set(paths)];
}

/**
 * Final mod list for a build.
 *  - `refList`: the ref's own modList.json (null when missing or unusable)
 *  - `fallback`: default list, used only without a usable `refList`
 *  - `extras`: mods added on top per source kind (`upstream` or `fork`); forks get none by default
 */
export function resolveMods({ refList, fallback, extras = {}, kind }) {
  const base = refList && refList.length > 0 ? refList : fallback;
  const source = base === refList ? 'modList.json' : 'fallback';
  const added = (extras[kind] ?? []).filter((m) => !base.includes(m));
  return { mods: [...base, ...added], source, extras: added };
}
