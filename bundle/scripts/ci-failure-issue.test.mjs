// Run with: node --test bundle/scripts/ci-failure-issue.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LABEL, apply, issueTitle, plan } from './ci-failure-issue.mjs';

const RUN = 'https://github.com/o/r/actions/runs/1';

test('one issue title per run title, whitespace-normalized and length-capped', () => {
  assert.equal(issueTitle('Build bundle  2.101.2\nfrom x'), 'CI failure: Build bundle 2.101.2 from x');
  assert.equal(issueTitle('x'.repeat(500)).length, 200);
});

test('first failure opens an issue', () => {
  const p = plan({ event: 'failure', runTitle: 'Weekly upstream check', runUrl: RUN, openIssues: [] });
  assert.equal(p.type, 'create');
  assert.equal(p.title, 'CI failure: Weekly upstream check');
  assert.match(p.body, /actions\/runs\/1/);
});

test('a repeat failure comments on the existing issue instead of opening another', () => {
  const p = plan({ event: 'failure', runTitle: 'Weekly upstream check', runUrl: RUN, openIssues: [{ number: 7, title: 'CI failure: Weekly upstream check' }] });
  assert.deepEqual(p, { type: 'comment', number: 7, body: `Failed again: ${RUN}` });
});

test('a failure of a different job does not touch an unrelated issue', () => {
  const p = plan({ event: 'failure', runTitle: 'Build bundle 2.102.0 from x', runUrl: RUN, openIssues: [{ number: 7, title: 'CI failure: Weekly upstream check' }] });
  assert.equal(p.type, 'create');
});

test('success closes the matching issue and ignores everything else', () => {
  const open = [{ number: 7, title: 'CI failure: Weekly upstream check' }];
  assert.equal(plan({ event: 'success', runTitle: 'Weekly upstream check', runUrl: RUN, openIssues: open }).type, 'close');
  assert.equal(plan({ event: 'success', runTitle: 'Build bundle 2.102.0 from x', runUrl: RUN, openIssues: open }).type, 'none');
  assert.equal(plan({ event: 'success', runTitle: 'Weekly upstream check', runUrl: RUN, openIssues: [] }).type, 'none');
});

test('unknown events are rejected', () => {
  assert.throws(() => plan({ event: 'cancelled', runTitle: 't', runUrl: RUN, openIssues: [] }), /unknown event/);
});

test('apply issues the right gh commands (label first when creating)', () => {
  const calls = [];
  const gh = (args) => (calls.push(args), 'https://github.com/o/r/issues/9');
  apply({ type: 'create', title: 'T', body: 'B' }, gh);
  assert.equal(calls[0][0], 'label');
  assert.deepEqual(calls[1], ['issue', 'create', '--title', 'T', '--body', 'B', '--label', LABEL]);
  calls.length = 0;
  apply({ type: 'comment', number: 7, body: 'again' }, gh);
  apply({ type: 'close', number: 7, body: 'fixed' }, gh);
  apply({ type: 'none' }, gh);
  assert.deepEqual(calls, [['issue', 'comment', '7', '--body', 'again'], ['issue', 'close', '7', '--comment', 'fixed']]);
});
