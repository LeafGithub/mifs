// Keeps one GitHub issue per failing CI job: opens it on failure, comments on repeats, closes it on success.
//
// Usage: node bundle/scripts/ci-failure-issue.mjs --event failure|success --title "<run title>" --run-url <url>
// Needs an authenticated `gh` with issues:write.
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

export const LABEL = 'ci-failure';

/** One issue per distinct run title, e.g. "CI failure: Build bundle 2.101.2 from https://github.com/..." */
export const issueTitle = (runTitle) => `CI failure: ${runTitle}`.replace(/\s+/g, ' ').trim().slice(0, 200);

/** Decides the action. `openIssues` is [{ number, title }] of open ci-failure issues. */
export function plan({ event, runTitle, runUrl, openIssues }) {
  const title = issueTitle(runTitle);
  const existing = openIssues.find((i) => i.title === title);
  if (event === 'failure') {
    return existing
      ? { type: 'comment', number: existing.number, body: `Failed again: ${runUrl}` }
      : { type: 'create', title, body: `The workflow run "${runTitle}" failed.\n\nRun: ${runUrl}\n\nThis issue closes itself when the same job succeeds again.` };
  }
  if (event === 'success') {
    return existing ? { type: 'close', number: existing.number, body: `Fixed: the same job succeeded in ${runUrl}` } : { type: 'none' };
  }
  throw new Error(`unknown event: ${event}`);
}

/** Runs a plan through `gh` (injectable for tests). */
export function apply(p, gh) {
  switch (p.type) {
    case 'create':
      gh(['label', 'create', LABEL, '--color', 'B60205', '--description', 'A scheduled or manual CI job failed', '--force']);
      return gh(['issue', 'create', '--title', p.title, '--body', p.body, '--label', LABEL]);
    case 'comment':
      return gh(['issue', 'comment', String(p.number), '--body', p.body]);
    case 'close':
      return gh(['issue', 'close', String(p.number), '--comment', p.body]);
    default:
      return '';
  }
}

function realGh(args) {
  const r = spawnSync('gh', args, { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`gh ${args.join(' ')} failed (${r.status}): ${r.stderr || r.stdout}`);
  return r.stdout.trim();
}

function main() {
  const { values } = parseArgs({ options: { event: { type: 'string' }, title: { type: 'string' }, 'run-url': { type: 'string' } } });
  if (!values.event || !values.title || !values['run-url']) throw new Error('usage: --event failure|success --title <run title> --run-url <url>');
  const openIssues = JSON.parse(realGh(['issue', 'list', '--label', LABEL, '--state', 'open', '--limit', '100', '--json', 'number,title']));
  const p = plan({ event: values.event, runTitle: values.title, runUrl: values['run-url'], openIssues });
  const out = apply(p, realGh);
  console.log(`${p.type}${p.number ? ` #${p.number}` : ''}${out ? `: ${out}` : ''}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
