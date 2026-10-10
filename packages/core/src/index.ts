import { injectMods, type InjectOptions, type InjectResult } from './injectMods.ts';
import { isPatched, patchSc2, type PatchOptions } from './patchSc2.ts';

export { InjectError, type InjectErrorCode } from './errors.ts';
export { bytesToBase64 } from './base64.ts';
export { injectMods, type InjectOptions, type InjectResult } from './injectMods.ts';
export { isPatched, patchSc2, type PatchOptions } from './patchSc2.ts';

export interface BuildOptions extends InjectOptions, PatchOptions {}

/** Full pipeline: patch SugarCube to wait for ModLoader, then embed ModLoader and the mods. */
export function buildModHtml(html: string, options: BuildOptions): InjectResult {
  const patched = isPatched(html) ? html : patchSc2(html, options);
  return injectMods(patched, options);
}

export { ManifestError, parseManifest, type BundleManifest, type DepRange, type FileRef, type ModEntry } from './manifest.ts';
export { sha256Hex, verifySha256 } from './hash.ts';
export { defaultSelection, dependentsOf, resolveDependencies, type Resolution } from './selection.ts';
export { bundleFingerprint, canonicalContent } from './fingerprint.ts';
