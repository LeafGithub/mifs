// Stand-in for bundle/scripts/build-bundle.mjs in e2e tests: same arguments and output conventions, no network or compiler.
// MIFS_FAKE_BUNDLE = folder to "build"; MIFS_FAKE_HANG=1 = never finish (to test cancel); MIFS_FAKE_FAIL=1 = exit with an error.
import { cpSync, mkdirSync } from 'node:fs';
import { parseArgs } from 'node:util';

const { values } = parseArgs({ options: { repo: { type: 'string' }, ref: { type: 'string' }, out: { type: 'string' }, work: { type: 'string' } } });
const mark = (label, fraction) => console.log('##mifs ' + JSON.stringify({ label, fraction }));

console.log(`fake build of ${values.repo} @ ${values.ref}`);
mark('Downloading the source', 0.05);
console.error('warning: this line goes to stderr');
mark('Building mod X (3/23)', 0.5);
if (process.env.MIFS_FAKE_FAIL) {
  console.error('error: webpack exploded');
  process.exit(3);
}
if (process.env.MIFS_FAKE_HANG) setInterval(() => {}, 1000);
else {
  mkdirSync(values.out, { recursive: true });
  cpSync(process.env.MIFS_FAKE_BUNDLE, values.out, { recursive: true });
  mark('Packaging', 0.98);
}
