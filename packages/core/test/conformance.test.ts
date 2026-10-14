// Runs ModLoader's own sc2PatchTool.js and insert2html.js (modloader-lab build) on real game HTML and
// checks that @mifs/core gives an equivalent page. Skipped without the lab.
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { buildModHtml } from '../src/index.ts';

const here = dirname(fileURLToPath(import.meta.url));
const LAB = process.env.MIFS_LAB ?? resolve(here, '../../../../modloader-lab');
const SRC = join(LAB, 'work/modloader-src');
const TOOLS = join(SRC, 'dist-insertTools');
const BEFORE_SC2 = join(SRC, 'dist-BeforeSC2/BeforeSC2.js');
const MODS = ['ModLoaderGui/ModLoaderGui.mod.zip', 'ModSubUiAngularJs/ModSubUiAngularJs.mod.zip', 'SweetAlert2Mod/SweetAlert2Mod.mod.zip'].map((m) =>
  join(SRC, 'mod', m),
);
const GAMES = { 'DoL Plus': join(LAB, 'work/game/game.html'), 'DoL X-Change': join(LAB, 'work/game-xchange/game.html') };

const ready = [TOOLS, BEFORE_SC2, ...MODS].every(existsSync);
const tmp = mkdtempSync(join(tmpdir(), 'mifs-conf-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

function node(...args: string[]) {
  const r = spawnSync('node', args, { encoding: 'utf8', maxBuffer: 1 << 28 });
  if (r.status !== 0) throw new Error(`node ${args.join(' ')} failed:\n${r.stdout}\n${r.stderr}`);
}

describe.skipIf(!ready)('conformance with the real ModLoader tools', () => {
  for (const [name, gamePath] of Object.entries(GAMES)) {
    it.skipIf(!existsSync(gamePath))(
      `${name}: same page as sc2PatchTool + insert2html`,
      () => {
        const dir = mkdtempSync(join(tmp, 'g-'));
        const html = join(dir, 'game.html');
        copyFileSync(gamePath, html);
        const i10n = join(dir, 'i10n.js');
        writeFileSync(i10n, '');
        const list = join(dir, 'modList.json');
        writeFileSync(list, JSON.stringify(MODS));

        node(join(TOOLS, 'sc2PatchTool.js'), html, i10n);
        node(join(TOOLS, 'insert2html.js'), `${html}.sc2patch.html`, list, BEFORE_SC2);
        const expected = readFileSync(`${html}.sc2patch.html.mod.html`, 'utf8');

        const original = readFileSync(gamePath, 'utf8');
        const { html: actual, warnings } = buildModHtml(original, {
          beforeSC2: readFileSync(BEFORE_SC2, 'utf8'),
          mods: MODS.map((m) => new Uint8Array(readFileSync(m))),
          i10n: '',
        });
        expect(warnings).toEqual([]);

        // The real tool re-serializes through cheerio; core edits text in place.
        // Compare after parsing both the same way.
        const cheerio = createRequire(join(SRC, 'package.json'))('cheerio');
        const normalize = (s: string): string => cheerio.load(s).root().html();
        const sameAfterNormalize = normalize(actual) === normalize(expected);
        console.log(`${name}: byte-identical=${actual === expected} normalized-identical=${sameAfterNormalize} sizes core=${actual.length} tool=${expected.length}`);
        expect(sameAfterNormalize).toBe(true);
      },
      600_000,
    );
  }
});
