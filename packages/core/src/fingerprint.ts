import { sha256Hex } from './hash.ts';
import type { BundleManifest } from './manifest.ts';

/** What the fingerprint covers, as text. Must match `canonicalContent` in bundle/scripts/fingerprint.mjs exactly. */
export function canonicalContent(manifest: BundleManifest): string {
  const mods = manifest.mods.map((m) => `${m.id}@${m.version}@${m.commit ?? ''}`).sort();
  return [manifest.loader.version, manifest.loader.commit, ...mods].join('\n');
}

/**
 * Identifies the content of a bundle: loader version and commit plus every mod's id, version and commit. File hashes and
 * build times are left out on purpose, because zips embed timestamps and every build of the same sources differs.
 * Two bundles with the same fingerprint behave the same; a republished bundle with another mod set gets a new one.
 */
export async function bundleFingerprint(manifest: BundleManifest): Promise<string> {
  return sha256Hex(new TextEncoder().encode(canonicalContent(manifest)));
}
