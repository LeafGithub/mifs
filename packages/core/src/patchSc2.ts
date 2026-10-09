import { InjectError } from './errors.ts';

const SC2_ID = 'id="script-sugarcube"';

const START_HEAD_OLD = 'window.SugarCube={},jQuery((()=>{';
const START_HEAD_NEW = 'window.SugarCube={},window.mainStart=((()=>{';

const START_TAIL_OLD = '}))})(window,window.document,jQuery);';
// SugarCube starts only after ModLoader finished loading (or immediately when no ModLoader is present).
const START_TAIL_NEW = `}))
// inject ModLoader on there
if (typeof window.modSC2DataManager !== 'undefined') {
window.modSC2DataManager.startInit().then(() => window.jsPreloader.startLoad()).then(() => {window.mainStart();window.initI10n(l10nStrings);}).catch(err => {console.error(err);});}else {window.mainStart();window.initI10n(l10nStrings);
}
    })(window,window.document,jQuery);`;

export interface PatchOptions {
  /**
   * Body of `window.initI10n = (l10nStrings) => { ... }`. The patched start code calls `initI10n`, so it must exist;
   * games without their own localization hook (DoL Plus, DoL X-Change) use the empty default.
   */
  i10n?: string;
}

export function isPatched(html: string): boolean {
  return html.includes('window.mainStart=((()=>{');
}

/**
 * Makes SugarCube 2 wait for `window.modSC2DataManager.startInit()` before starting the story.
 * String-based equivalent of ModLoader's `sc2PatchTool.js` (which goes through cheerio) that works in any JS runtime.
 */
export function patchSc2(html: string, options: PatchOptions = {}): string {
  const first = html.indexOf(SC2_ID);
  if (first === -1 || html.indexOf(SC2_ID, first + 1) !== -1) {
    throw new InjectError('NO_SC2_SCRIPT', 'Expected exactly one <script id="script-sugarcube"> (not a SugarCube 2 game HTML?)');
  }
  const tagStart = html.lastIndexOf('<script', first);
  const bodyStart = html.indexOf('>', first) + 1;
  const bodyEnd = html.indexOf('</script>', bodyStart);
  if (tagStart === -1 || bodyStart === 0 || bodyEnd === -1) {
    throw new InjectError('NO_SC2_SCRIPT', 'Malformed SugarCube <script> element');
  }

  if (isPatched(html)) throw new InjectError('ALREADY_PATCHED', 'This HTML is already patched for ModLoader');

  const body = html.slice(bodyStart, bodyEnd);
  if (!body.includes(START_HEAD_OLD)) {
    throw new InjectError('ANCHOR_HEAD_MISSING', `SugarCube start code not recognized (missing "${START_HEAD_OLD}")`);
  }
  if (!body.includes(START_TAIL_OLD)) {
    throw new InjectError('ANCHOR_TAIL_MISSING', `SugarCube start code not recognized (missing "${START_TAIL_OLD}")`);
  }
  // function replacers: replacement text contains `$`-free code today, but keep it safe from `$&`-style patterns
  const newBody = body.replaceAll(START_HEAD_OLD, () => START_HEAD_NEW).replaceAll(START_TAIL_OLD, () => START_TAIL_NEW);

  const i10nTag = `\n<script id="i10n-sc2patch" type="text/javascript">\n    window.initI10n = (l10nStrings)=>{\n        ${options.i10n ?? ''}\n    };\n</script>\n        `;
  return html.slice(0, tagStart) + i10nTag + html.slice(tagStart, bodyStart) + newBody + html.slice(bodyEnd);
}
