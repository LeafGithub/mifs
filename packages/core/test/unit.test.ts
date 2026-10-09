import { describe, expect, it } from 'vitest';
import { InjectError, buildModHtml, bytesToBase64, injectMods, isPatched, patchSc2 } from '../src/index.ts';

const CSP = `<meta http-equiv="Content-Security-Policy" content="default-src 'self' 'unsafe-eval' 'unsafe-inline'; img-src 'self' data:"/>`;
const SC2 = `window.SugarCube={},jQuery((()=>{ /* story */ }))})(window,window.document,jQuery);`;
const page = (sc2 = SC2) =>
  `<!DOCTYPE html><html><head><title>t</title>${CSP}<script id="init" type="text/javascript">1</script></head>` +
  `<body><script id="script-sugarcube" type="text/javascript">${sc2}</script></body></html>`;

const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return (e as InjectError).code;
  }
  return undefined;
};

describe('patchSc2', () => {
  it('rewrites the start code and defines initI10n', () => {
    const out = patchSc2(page());
    expect(out).toContain('window.SugarCube={},window.mainStart=((()=>{');
    expect(out).toContain('window.modSC2DataManager.startInit()');
    expect(out).not.toContain('jQuery((()=>{');
    expect(out).toContain('window.initI10n = (l10nStrings)=>{');
    // i10n script sits before the sugarcube script, which stays in place
    expect(out.indexOf('i10n-sc2patch')).toBeLessThan(out.indexOf('id="script-sugarcube"'));
    expect(isPatched(out)).toBe(true);
  });

  it('embeds a custom l10n body', () => {
    expect(patchSc2(page(), { i10n: 'window.L = l10nStrings;' })).toContain('window.L = l10nStrings;');
  });

  it('is not confused by $ patterns in the l10n body', () => {
    expect(patchSc2(page(), { i10n: "x = '$&$1';" })).toContain("x = '$&$1';");
  });

  it('reports a typed error for each unrecognized input', () => {
    expect(code(() => patchSc2('<html></html>'))).toBe('NO_SC2_SCRIPT');
    expect(code(() => patchSc2(page() + page()))).toBe('NO_SC2_SCRIPT');
    expect(code(() => patchSc2(page('window.SugarCube={},jQuery((()=>{ x')))).toBe('ANCHOR_TAIL_MISSING');
    expect(code(() => patchSc2(page('start(); }))})(window,window.document,jQuery);')))).toBe('ANCHOR_HEAD_MISSING');
    expect(code(() => patchSc2(patchSc2(page())))).toBe('ALREADY_PATCHED');
  });
});

describe('injectMods', () => {
  const mods = [new Uint8Array([1, 2, 3]), new Uint8Array([250, 251, 252, 253])];

  it('inserts payload before the first <script> and relaxes the CSP', () => {
    const { html, warnings } = injectMods(page(), { beforeSC2: 'BEFORE();', mods });
    expect(warnings).toEqual([]);
    expect(html).toContain(`'unsafe-inline' *;`);
    const zipAt = html.indexOf('window.modDataValueZipList');
    expect(zipAt).toBeGreaterThan(html.indexOf('Content-Security-Policy'));
    expect(zipAt).toBeLessThan(html.indexOf('id="init"'));
    expect(html).toContain(`window.modDataValueZipList = ["AQID","+vv8/Q=="];`);
    expect(html.indexOf('BEFORE();')).toBeGreaterThan(zipAt);
    expect(html.indexOf('BEFORE();')).toBeLessThan(html.indexOf('id="init"'));
  });

  it('warns but continues when there is no CSP tag', () => {
    const { html, warnings } = injectMods(page().replace(CSP, ''), { beforeSC2: 'B();', mods });
    expect(warnings).toHaveLength(1);
    expect(html).toContain('window.modDataValueZipList');
  });

  it('keeps BeforeSC2 byte-exact, including $ patterns', () => {
    const js = 'var s = "$&$`$\'$1";';
    expect(injectMods(page(), { beforeSC2: js, mods }).html).toContain(`<script type="text/javascript">${js}</script>`);
  });

  it('rejects HTML that already has a payload and HTML without scripts', () => {
    const once = injectMods(page(), { beforeSC2: 'B();', mods }).html;
    expect(code(() => injectMods(once, { beforeSC2: 'B();', mods }))).toBe('ALREADY_INJECTED');
    expect(code(() => injectMods('<html></html>', { beforeSC2: '', mods }))).toBe('NO_SCRIPT_TAG');
  });
});

describe('bytesToBase64', () => {
  it('matches Buffer for large, non-aligned input', () => {
    const bytes = new Uint8Array(100_003).map((_, i) => (i * 31 + 7) & 255);
    expect(bytesToBase64(bytes)).toBe(Buffer.from(bytes).toString('base64'));
    expect(bytesToBase64(new Uint8Array())).toBe('');
  });
});

describe('buildModHtml', () => {
  it('patches and injects, and skips the patch for already-patched HTML', () => {
    const opts = { beforeSC2: 'B();', mods: [new Uint8Array([9])] };
    const built = buildModHtml(page(), opts).html;
    expect(isPatched(built)).toBe(true);
    expect(built).toContain('window.modDataValueZipList');
    const onlyPatched = patchSc2(page());
    expect(buildModHtml(onlyPatched, opts).html).toContain('window.modDataValueZipList');
  });
});
