import { FolderOpen, Package, Trash2, TriangleAlert } from 'lucide-react';
import { Badge } from '../components/ui/badge';
import { KindLabel, KIND_HELP } from '../components/KindLabel';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { formatBytes, formatDate, cn } from '../lib/utils';
import { useApp } from '../store';
import { BuildPanel } from './BuildPanel';
import { CatalogPanel } from './CatalogPanel';

/** A small planet with a ring: solid when chosen, dashed ring for unofficial builds. */
function Vessel({ active, fork }: { active: boolean; fork: boolean }) {
  const color = active ? 'var(--primary)' : fork ? 'var(--warning)' : 'var(--muted-foreground)';
  return (
    <>
      <svg width="44" height="44" viewBox="0 0 44 44" fill="none" stroke={color} strokeWidth="1.5" aria-hidden className="hud-only shrink-0">
        <circle cx="22" cy="22" r="8" fill={active ? color : 'none'} />
        <ellipse cx="22" cy="22" rx="20" ry="6" strokeDasharray={fork ? '3 3' : undefined} />
      </svg>
      {/* Friendly themes: a lily pad with its notch; dashed for unofficial builds, a blossom when chosen. */}
      <svg width="44" height="44" viewBox="0 0 44 44" fill="none" stroke={color} strokeWidth="2" aria-hidden className="friendly-only shrink-0">
        <path d="M22 23 L36 17 A16 16 0 1 1 22 6 Z" fill={active ? 'var(--pad)' : 'none'} strokeLinejoin="round" strokeDasharray={fork ? '4 3' : undefined} />
        {active && <circle cx="22" cy="23" r="3.5" fill="var(--petal)" stroke="var(--input)" strokeWidth="1.5" />}
      </svg>
    </>
  );
}

export function BundleStep() {
  const bundles = useApp((s) => s.bundles);
  const loaded = useApp((s) => s.bundlesLoaded);
  const bundleId = useApp((s) => s.bundleId);
  const select = useApp((s) => s.selectBundle);
  const importBundle = useApp((s) => s.importBundle);
  const remove = useApp((s) => s.removeBundle);
  const canBuild = useApp((s) => s.canBuild);
  const canCatalog = useApp((s) => s.canCatalog);
  const catalogEntries = useApp((s) => s.catalog.list?.entries);
  const installing = useApp((s) => s.catalog.installing);
  const update = useApp((s) => s.installFromCatalog);

  // The newest official bundle is the one to suggest: most people should not have to weigh versions or forks.
  const recommendedId = bundles
    .filter((b) => b.manifest.kind !== 'fork')
    .sort((a, b) => b.manifest.loader.builtAt.localeCompare(a.manifest.loader.builtAt))[0]?.id;

  return (
    <div className="flex flex-col gap-3">
      {loaded && bundles.length === 0 && (
        <Card className="flex flex-col items-center gap-3 border-dashed p-10 text-center">
          <Package className="size-8 text-muted-foreground" />
          <div>
            <p className="font-medium">No loader bundles yet</p>
            <p className="text-sm text-muted-foreground">Import a bundle folder (it contains a manifest.json).</p>
          </div>
        </Card>
      )}

      <ul className="flex flex-col gap-2" aria-label="Loader bundles">
        {bundles.map((b) => {
          const active = b.id === bundleId;
          const fork = b.manifest.kind === 'fork';
          const hasUpdate = catalogEntries?.some((e) => e.id === b.id && e.updateAvailable) ?? false;
          const size = b.manifest.mods.reduce((n, m) => n + m.size, b.manifest.beforeSC2.size);
          return (
            <li key={b.id}>
              <Card className={cn('flex items-center gap-4 py-3.5 pl-5 pr-3 transition-colors', active ? 'bracket border-primary bg-accent/80' : 'hover:border-input')}>
                <Vessel active={active} fork={fork} />
                <button
                  type="button"
                  onClick={() => select(b.id)}
                  aria-pressed={active}
                  className="flex min-w-0 flex-1 flex-col items-start gap-1.5 text-left"
                >
                  <span className="flex flex-wrap items-center gap-2.5">
                    <span className="text-base font-medium">ModLoader {b.manifest.loader.version}</span>
                    <Badge variant={fork ? 'warning' : 'upstream'} title={fork ? KIND_HELP : undefined}>
                      <KindLabel kind={fork ? 'fork' : 'upstream'} />
                    </Badge>
                    {b.id === recommendedId && <Badge variant="outline">best choice</Badge>}
                    {active && <Badge variant="selected">selected</Badge>}
                    {hasUpdate && <Badge variant="warning">update available</Badge>}
                  </span>
                  <span className="font-mono text-xs tracking-[0.04em] text-muted-foreground" title={`Commit ${b.manifest.loader.commit.slice(0, 7)}`}>
                    {b.manifest.mods.length} mods · {formatBytes(size)} · built {formatDate(b.manifest.loader.builtAt)}
                  </span>
                  {fork && (
                    <span className="flex items-center gap-1.5 text-[13px] text-warning">
                      <TriangleAlert className="size-3.5" /> Unofficial build from {b.manifest.loader.repo.replace(/^https:\/\/github\.com\//, '').replace(/\.git$/, '')}
                    </span>
                  )}
                </button>
                {hasUpdate && (
                  <Button variant="outline" size="sm" disabled={installing !== null} onClick={() => update(b.id)} aria-label={`Update ${b.id}`}>
                    {installing === b.id ? 'Updating…' : 'Update'}
                  </Button>
                )}
                <Button variant="ghost" size="sm" className="size-11 px-0 hover:text-destructive" aria-label={`Remove ${b.id}`} onClick={() => remove(b.id)}>
                  <Trash2 />
                </Button>
              </Card>
            </li>
          );
        })}
      </ul>

      {canCatalog && <CatalogPanel />}

      <div>
        <Button variant="outline" onClick={importBundle}>
          <FolderOpen /> Import bundle folder…
        </Button>
      </div>

      {canBuild && <BuildPanel />}
    </div>
  );
}
