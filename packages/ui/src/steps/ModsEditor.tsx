import { dependentsOf } from '@mifs/core';
import { Info } from 'lucide-react';
import { useMemo } from 'react';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Checkbox } from '../components/ui/checkbox';
import { formatBytes } from '../lib/utils';
import { useApp, usableLocalMods } from '../store';
import { LocalMods } from './LocalMods';

/** The fine-pick list of bundled mods. Shown inside the Install step after "Customize". */
export function ModsEditor() {
  const bundle = useApp((s) => s.bundles.find((b) => b.id === s.bundleId));
  const selected = useApp((s) => s.selected);
  const notice = useApp((s) => s.notice);
  const toggle = useApp((s) => s.toggleMod);
  const reset = useApp((s) => s.resetMods);
  const localList = useApp((s) => s.localMods.list);
  const canLocal = useApp((s) => s.canLocalMods);
  const chosen = useMemo(() => new Set(selected), [selected]);

  if (!bundle) return null;
  const manifest = bundle.manifest;
  const local = usableLocalMods(localList, manifest);
  const total = manifest.mods.filter((m) => chosen.has(m.id)).reduce((n, m) => n + m.size, 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 bg-background pb-2">
        <p className="text-sm text-muted-foreground">
          {chosen.size} of {manifest.mods.length} selected · {formatBytes(total)}. Mods that others need stay on.
        </p>
        <Button variant="ghost" size="sm" onClick={reset}>
          Restore defaults
        </Button>
      </div>

      {notice && (
        <p role="status" className="flex items-center gap-2 rounded-md bg-primary/10 px-3 py-2 text-sm text-primary">
          <Info className="size-4 shrink-0" /> {notice}
        </p>
      )}

      <Card className="divide-y">
        <ul aria-label="Mods">
          {manifest.mods.map((m) => {
            const blockedBy = chosen.has(m.id) ? dependentsOf(manifest, m.id, selected, local) : [];
            const blockedNames = blockedBy.map((id) => manifest.mods.find((x) => x.id === id)?.name ?? local.find((x) => x.id === id)?.name ?? id);
            const needs = m.dependsOn.filter((d) => d.name !== 'ModLoader' && d.name !== 'GameVersion');
            const game = m.dependsOn.find((d) => d.name === 'GameVersion');
            return (
              <li key={m.id} className="flex items-start gap-3 px-4 py-2.5">
                <Checkbox
                  id={`mod-${m.id}`}
                  className="mt-0.5"
                  checked={chosen.has(m.id)}
                  disabled={blockedBy.length > 0}
                  onCheckedChange={(v) => toggle(m.id, v === true)}
                />
                <label htmlFor={`mod-${m.id}`} className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
                    {m.name}
                    <span className="text-xs font-normal text-muted-foreground">v{m.version}</span>
                    {game && <Badge variant="outline">game {game.range}</Badge>}
                  </span>
                  {needs.length > 0 && <span className="text-xs text-muted-foreground">needs {needs.map((d) => d.name).join(', ')}</span>}
                  {blockedBy.length > 0 && <span className="text-xs text-warning">required by {blockedNames.join(', ')}</span>}
                </label>
                <span className="shrink-0 text-xs text-muted-foreground">{formatBytes(m.size)}</span>
              </li>
            );
          })}
        </ul>
      </Card>

      {canLocal && <LocalMods />}
    </div>
  );
}
