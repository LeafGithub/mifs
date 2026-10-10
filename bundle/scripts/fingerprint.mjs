// A fingerprint of what a bundle contains, used to tell a republished bundle (different content, same id) from a rebuild
// of the same content (a local build versus the CI one). It covers the loader version and commit and every mod's id,
// version and commit. It deliberately ignores file hashes and build times: zips embed timestamps, so every build differs.
//
// The TypeScript twin is packages/core/src/fingerprint.ts; packages/core/test/fingerprint.test.ts checks they agree.
import { createHash } from 'node:crypto';

export function canonicalContent(manifest) {
  const mods = manifest.mods.map((m) => `${m.id}@${m.version}@${m.commit ?? ''}`).sort();
  return [manifest.loader.version, manifest.loader.commit, ...mods].join('\n');
}

export function bundleFingerprint(manifest) {
  return createHash('sha256').update(canonicalContent(manifest)).digest('hex');
}
