// Which mods go into a bundle. Pure functions, unit-tested in modlist.test.mjs.
//
// Each ModLoader repository ships its own default list (`modList.json` at its root). A bundle must use the list of the
// ref it was built from: forks may drop or replace mods (the thalia fork's BeautySelectorAddon replaces ImageLoaderHook,
// and embedding both makes ModLoader log duplicate-registration errors).

// `Dir/File.mod.zip`, relative to the repository's mod/ folder. Strict, because the path comes from the repository
// being built (a fork is untrusted input) and is joined onto a local path.
const MOD_ZIP = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._ +()-]+\.mod\.zip$/i;

/**
 * Parses a ModLoader `modList.json` (a JSON array with `//` comment lines and trailing commas allowed) into mod zip
 * paths relative to `mod/`. Commented-out entries are skipped, and so is anything that is not a `.mod.zip`.
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
 *  - `refList`: the ref's own modList.json (null when it has none or it is unusable)
 *  - `fallback`: our default list, used only when there is no usable `refList`
 *  - `extras`: mods we add on top, per kind of source (`upstream` or `fork`); forks get none by default
 */
export function resolveMods({ refList, fallback, extras = {}, kind }) {
  const base = refList && refList.length > 0 ? refList : fallback;
  const source = base === refList ? 'modList.json' : 'fallback';
  const added = (extras[kind] ?? []).filter((m) => !base.includes(m));
  return { mods: [...base, ...added], source, extras: added };
}
