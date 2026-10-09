import { FolderOpen, Package, Trash2, TriangleAlert } from 'lucide-react';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { formatBytes, cn } from '../lib/utils';
import { useApp } from '../store';
import { BuildPanel } from './BuildPanel';
import { CatalogPanel } from './CatalogPanel';

export function BundleStep() {
  const bundles = useApp((s) => s.bundles);
  const loaded = useApp((s) => s.bundlesLoaded);
  const bundleId = useApp((s) => s.bundleId);
  const select = useApp((s) => s.selectBundle);
  const importBundle = useApp((s) => s.importBundle);
  const remove = useApp((s) => s.removeBundle);
  const canBuild = useApp((s) => s.canBuild);
  const canCatalog = useApp((s) => s.canCatalog);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        A loader bundle is ModLoader plus its standard mods, built and checksummed. Pick the one to install into your game.
      </p>

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
          const size = b.manifest.mods.reduce((n, m) => n + m.size, b.manifest.beforeSC2.size);
          return (
            <li key={b.id}>
              <Card
                className={cn('flex items-center gap-3 p-4 transition-colors', active ? 'border-primary bg-accent' : 'hover:bg-muted/50')}
              >
                <button
                  type="button"
                  onClick={() => select(b.id)}
                  aria-pressed={active}
                  className="flex min-w-0 flex-1 flex-col items-start gap-1 text-left"
                >
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">ModLoader {b.manifest.loader.version}</span>
                    {b.manifest.kind === 'fork' ? <Badge variant="warning">fork</Badge> : <Badge variant="primary">upstream</Badge>}
                    {active && <Badge variant="success">selected</Badge>}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {b.manifest.mods.length} mods · {formatBytes(size)} · commit {b.manifest.loader.commit.slice(0, 7)} · built{' '}
                    {new Date(b.manifest.loader.builtAt).toLocaleDateString()}
                  </span>
                  {b.manifest.kind === 'fork' && (
                    <span className="flex items-center gap-1 text-xs text-warning">
                      <TriangleAlert className="size-3" /> Unofficial build from {b.manifest.loader.repo.replace(/^https:\/\/github\.com\//, '').replace(/\.git$/, '')}
                    </span>
                  )}
                </button>
                <Button variant="ghost" size="sm" aria-label={`Remove ${b.id}`} onClick={() => remove(b.id)}>
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
