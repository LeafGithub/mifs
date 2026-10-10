// Build catalog.json: the list of published bundles, so clients can offer versions without scanning releases.
// Usage: node scripts/make-catalog.mjs <owner/repo> > catalog.json      (needs `gh` authenticated; runs in CI)
//
// Each bundle release has the tag "loader-<bundle id>" and a small manifest.json asset that is read for the entry.
import { spawnSync } from 'node:child_process';
import { bundleFingerprint } from './fingerprint.mjs';

const repo = process.argv[2];
if (!repo) throw new Error('usage: make-catalog <owner/repo>');

const gh = (...a) => {
  const r = spawnSync('gh', a, { encoding: 'utf8', maxBuffer: 1 << 28 });
  if (r.status !== 0) throw new Error(`gh ${a.join(' ')}: ${r.stderr}`);
  return r.stdout;
};

const releases = JSON.parse(gh('api', `repos/${repo}/releases?per_page=100`, '--paginate', '--slurp')).flat();
const entries = [];
for (const rel of releases) {
  if (!rel.tag_name.startsWith('loader-') || rel.draft) continue;
  const manifestAsset = rel.assets.find((a) => a.name === 'manifest.json');
  const zipAsset = rel.assets.find((a) => /^modloader-bundle-.*\.zip$/.test(a.name));
  if (!manifestAsset || !zipAsset) continue;
  const m = JSON.parse(gh('release', 'download', rel.tag_name, '-R', repo, '-p', 'manifest.json', '-O', '-'));
  entries.push({
    id: m.id,
    kind: m.kind,
    version: m.loader.version,
    ref: m.loader.ref,
    commit: m.loader.commit,
    builtAt: m.loader.builtAt,
    modCount: m.mods.length,
    // what the bundle contains; lets clients tell a republished bundle from a rebuild of the same content
    fingerprint: bundleFingerprint(m),
    // Public repos can use the browser URLs; private ones need the API asset ids (plus a token).
    manifestAssetId: manifestAsset.id,
    bundleAssetId: zipAsset.id,
    bundleSha256: typeof zipAsset.digest === 'string' && zipAsset.digest.startsWith('sha256:') ? zipAsset.digest.slice(7) : undefined,
    manifestUrl: manifestAsset.browser_download_url,
    bundleUrl: zipAsset.browser_download_url,
    bundleSize: zipAsset.size,
    prerelease: rel.prerelease,
  });
}
entries.sort((a, b) => b.builtAt.localeCompare(a.builtAt));
process.stdout.write(JSON.stringify({ schema: 1, generatedAt: new Date().toISOString(), bundles: entries }, null, 2) + '\n');
