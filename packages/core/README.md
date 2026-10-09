# @mifs/core

Runtime-neutral (browser, worker, Node) implementation of ModLoader's two injection tools, on strings and bytes:

- `patchSc2(html, { i10n? })` = `sc2PatchTool.js`: SugarCube waits for `modSC2DataManager.startInit()` before starting.
- `injectMods(html, { beforeSC2, mods })` = `insert2html.js`: embeds `BeforeSC2.js` + mod zips, relaxes the CSP.
- `buildModHtml(html, opts)`: both steps (skips the patch if already patched).
- Failures throw `InjectError` with a stable `code` (`NO_SC2_SCRIPT`, `ANCHOR_HEAD_MISSING`, `ANCHOR_TAIL_MISSING`, `ALREADY_PATCHED`, `ALREADY_INJECTED`, `NO_SCRIPT_TAG`).

```bash
npm test                      # unit tests + conformance against the real tools (needs ../modloader-lab built; skipped otherwise)
node scripts/inject-cli.ts <game.html> <modloader-src> <config.json> <out.html>
```

Conformance: output is compared with the real tools' output after both go through the same HTML parser (cheerio/parse5);
it is not byte-identical because the real tool re-serializes the whole page.
