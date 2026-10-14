// Dev helper: inject with @mifs/core using a built ModLoader checkout.
// Usage: node scripts/inject-cli.ts <game.html> <modloader-src-dir> <config.json with "mods"> <out.html>
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildModHtml } from '../src/index.ts';

const [gamePath, srcDir, configPath, outPath] = process.argv.slice(2);
if (!gamePath || !srcDir || !configPath || !outPath) throw new Error('usage: inject-cli <game.html> <src-dir> <config.json> <out.html>');
const mods: string[] = JSON.parse(readFileSync(configPath, 'utf8')).mods;
const { html, warnings } = buildModHtml(readFileSync(gamePath, 'utf8'), {
  beforeSC2: readFileSync(join(srcDir, 'dist-BeforeSC2/BeforeSC2.js'), 'utf8'),
  mods: mods.map((m) => new Uint8Array(readFileSync(join(srcDir, 'mod', m)))),
});
writeFileSync(outPath, html);
console.log(`wrote ${outPath} (${(html.length / 1e6).toFixed(1)} MB, ${mods.length} mods)`, warnings.length ? warnings : '');
