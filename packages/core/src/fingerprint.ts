import { sha256Hex } from './hash.ts';
import type { BundleManifest } from './manifest.ts';

/** Text the fingerprint covers. Must match `canonicalContent` in bundle/scripts/fingerprint.mjs. */
export function canonicalContent(manifest: BundleManifest): string {
  const mods = manifest.mods.map((m) => `${m.id}@${m.version}@${m.commit ?? ''}`).sort();
  return [manifest.loader.version, manifest.loader.commit, ...mods].join('\n');
}

/**
 * Fingerprint of a bundle's content: loader version and commit plus every mod's id, version and commit.
 * File hashes and build times are left out because zips embed timestamps.
 */
export async function bundleFingerprint(manifest: BundleManifest): Promise<string> {
  return sha256Hex(new TextEncoder().encode(canonicalContent(manifest)));
}
