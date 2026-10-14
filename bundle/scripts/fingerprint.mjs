// Fingerprint of a bundle's content: loader version and commit, plus every mod's id, version and commit.
// Tells a republished bundle from a rebuild of the same content. File hashes and build times are left out
// because zip timestamps differ on every build.
//
// TypeScript twin: packages/core/src/fingerprint.ts (packages/core/test/fingerprint.test.ts checks they agree).
import { createHash } from 'node:crypto';

export function canonicalContent(manifest) {
  const mods = manifest.mods.map((m) => `${m.id}@${m.version}@${m.commit ?? ''}`).sort();
  return [manifest.loader.version, manifest.loader.commit, ...mods].join('\n');
}

export function bundleFingerprint(manifest) {
  return createHash('sha256').update(canonicalContent(manifest)).digest('hex');
}
