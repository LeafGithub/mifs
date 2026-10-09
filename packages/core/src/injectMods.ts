import { bytesToBase64 } from './base64.ts';
import { InjectError } from './errors.ts';

const CSP_FIND = `content="default-src 'self' 'unsafe-eval' 'unsafe-inline'`;
const CSP_REPLACE = `content="default-src 'self' 'unsafe-eval' 'unsafe-inline' *`;

export interface InjectOptions {
  /** Contents of ModLoader's `dist-BeforeSC2/BeforeSC2.js`. */
  beforeSC2: string;
  /** Raw bytes of each `.mod.zip` to embed, in load order. */
  mods: Uint8Array[];
}

export interface InjectResult {
  html: string;
  warnings: string[];
}

/**
 * Embeds the ModLoader payload and mod zips before the first <script> of the game HTML (and relaxes its CSP so
 * mods can load remote resources). String-based equivalent of ModLoader's `insert2html.js`.
 */
export function injectMods(html: string, options: InjectOptions): InjectResult {
  if (html.includes('window.modDataValueZipList')) {
    throw new InjectError('ALREADY_INJECTED', 'This HTML already contains a ModLoader payload');
  }
  const firstScript = html.indexOf('<script');
  if (firstScript === -1) throw new InjectError('NO_SCRIPT_TAG', 'No <script> tag found in the game HTML');

  const warnings: string[] = [];
  let withCsp = html;
  const cspAt = html.indexOf(CSP_FIND);
  if (cspAt === -1) warnings.push('CSP meta tag not found; left unchanged');
  // CSP is in <head>, before the first <script>, so the insertion index is still valid after replacing in place.
  else withCsp = html.slice(0, cspAt) + CSP_REPLACE + html.slice(cspAt + CSP_FIND.length);
  const shift = withCsp.length - html.length;

  const zips = JSON.stringify(options.mods.map(bytesToBase64));
  const insert =
    `\n<script type="text/javascript">window.modDataValueZipList = ${zips};</script>` +
    `\n<script type="text/javascript">${options.beforeSC2}</script>\n`;

  const at = firstScript + (cspAt !== -1 && cspAt < firstScript ? shift : 0);
  return { html: withCsp.slice(0, at) + insert + withCsp.slice(at), warnings };
}
