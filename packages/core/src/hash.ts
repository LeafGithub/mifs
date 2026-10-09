/** SHA-256 as lowercase hex, via WebCrypto (browser, worker, Node 18+). */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes as BufferSource);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** True when `bytes` hash to `expected`. Use before trusting any downloaded bundle file. */
export async function verifySha256(bytes: Uint8Array, expected: string): Promise<boolean> {
  return (await sha256Hex(bytes)) === expected.toLowerCase();
}
