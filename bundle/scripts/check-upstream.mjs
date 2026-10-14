// Starts the "Build ModLoader bundle" workflow for official releases that have no bundle yet.
//
// Usage: node bundle/scripts/check-upstream.mjs [--dry-run] [--max 2] [--upstream <git url>]
// Needs git and an authenticated `gh`. Run from a clone of the bundle repo.
import { spawnSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

export const UPSTREAM = 'https://github.com/Lyoko-Jeremie/sugarcube-2-ModLoader.git';

const triple = (v) => {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(v);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
};
export const compareVersions = (a, b) => {
  const x = triple(a);
  const y = triple(b);
  return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
};

/** `git ls-remote --tags --refs` output -> x.y.z tag names (`v1.0.6`-style and tool tags are ignored). */
export function parseUpstreamTags(lsRemote) {
  return lsRemote
    .split(/\r?\n/)
    .map((l) => /\trefs\/tags\/(.+)$/.exec(l)?.[1]?.trim())
    .filter((t) => t && triple(t));
}

/** Release tag names -> versions of published upstream bundles (`loader-upstream-<version>-<sha7>`). */
export function publishedUpstreamVersions(releaseTags) {
  return releaseTags.map((t) => /^loader-upstream-(\d+\.\d+\.\d+)-[0-9a-f]{7}$/.exec(t)?.[1]).filter(Boolean);
}

/**
 * Upstream tags that need a bundle: newer than the newest published one, oldest first, at most `max`.
 * With none published, only the newest tag.
 */
export function pickTags({ upstreamTags, publishedVersions, max = 2 }) {
  const tags = [...new Set(upstreamTags)].sort(compareVersions);
  if (tags.length === 0) return [];
  const newest = publishedVersions.length ? publishedVersions.reduce((a, b) => (compareVersions(a, b) >= 0 ? a : b)) : null;
  const fresh = newest ? tags.filter((t) => compareVersions(t, newest) > 0) : tags.slice(-1);
  return fresh.slice(-max);
}

function run(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed (${r.status}): ${r.stderr || r.stdout}`);
  return r.stdout;
}

function main() {
  const { values } = parseArgs({ options: { 'dry-run': { type: 'boolean', default: false }, max: { type: 'string', default: '2' }, upstream: { type: 'string', default: UPSTREAM } } });
  const upstreamTags = parseUpstreamTags(run('git', ['ls-remote', '--tags', '--refs', values.upstream]));
  const releases = JSON.parse(run('gh', ['release', 'list', '--limit', '200', '--json', 'tagName']));
  const publishedVersions = publishedUpstreamVersions(releases.map((r) => r.tagName));
  const picks = pickTags({ upstreamTags, publishedVersions, max: Number(values.max) });

  const lines = [
    `Upstream release tags: ${upstreamTags.sort(compareVersions).slice(-5).join(', ') || 'none'} (newest 5)`,
    `Published upstream bundles: ${publishedVersions.sort(compareVersions).join(', ') || 'none'}`,
    picks.length ? `Needs a bundle: ${picks.join(', ')}${values['dry-run'] ? ' (dry run, not started)' : ''}` : 'Nothing to build: every official release has a bundle.',
  ];
  if (!values['dry-run']) {
    for (const tag of picks) {
      run('gh', ['workflow', 'run', 'build-bundle.yml', '-f', `repo=${values.upstream}`, '-f', `ref=${tag}`]);
      lines.push(`Started build-bundle.yml for ${tag}`);
    }
  }
  console.log(lines.join('\n'));
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Upstream check\n\n${lines.map((l) => `- ${l}`).join('\n')}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
