import { CircleAlert, CircleCheck, FolderSearch, Hammer, RotateCcw, Save } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Progress } from '../components/ui/progress';
import { formatBytes } from '../lib/utils';
import { useApp } from '../store';

export function BuildStep() {
  const bundle = useApp((s) => s.bundles.find((b) => b.id === s.bundleId));
  const game = useApp((s) => s.game);
  const selected = useApp((s) => s.selected);
  const outputPath = useApp((s) => s.outputPath);
  const run = useApp((s) => s.run);
  const pickOutput = useApp((s) => s.pickOutput);
  const start = useApp((s) => s.start);
  const reset = useApp((s) => s.reset);
  const showInFolder = useApp((s) => s.showInFolder);

  const ready = bundle && game && outputPath && selected.length > 0;

  return (
    <div className="flex flex-col gap-5">
      <Card className="divide-y text-sm">
        <Row label="Loader" value={bundle ? `ModLoader ${bundle.manifest.loader.version} (${bundle.manifest.kind})` : '—'} />
        <Row label="Game" value={game?.name ?? '—'} />
        <Row label="Mods" value={`${selected.length} selected`} />
        <Row label="Save as" value={outputPath ?? 'not chosen yet'} mono />
      </Card>

      {run.status !== 'done' && (
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={run.status === 'running'} onClick={pickOutput}>
            <FolderSearch /> {outputPath ? 'Change location…' : 'Choose where to save…'}
          </Button>
          <Button disabled={!ready || run.status === 'running'} onClick={start}>
            <Hammer /> {run.status === 'error' ? 'Try again' : 'Create modded game'}
          </Button>
        </div>
      )}

      {run.status === 'running' && (
        <div className="flex flex-col gap-1" role="status" aria-live="polite">
          <Progress value={run.progress?.fraction ?? null} />
          <span className="text-xs text-muted-foreground">{run.progress?.label ?? 'Working…'}</span>
        </div>
      )}

      {run.status === 'error' && (
        <p role="alert" className="flex items-start gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <CircleAlert className="mt-0.5 size-4 shrink-0" /> {run.error}
        </p>
      )}

      {run.status === 'done' && run.result && (
        <Card className="flex flex-col gap-3 border-success/40 p-5">
          <p className="flex items-center gap-2 font-medium text-success">
            <CircleCheck className="size-5" /> Done
          </p>
          <p className="text-sm text-muted-foreground">
            Wrote {formatBytes(run.result.size)} with {run.result.modIds.length} mods in {(run.result.ms / 1000).toFixed(1)} s. Open the file in your browser to
            play; if your game uses separate image folders, keep them next to it.
          </p>
          <p className="break-all font-mono text-xs">{run.result.outputPath}</p>
          {run.result.warnings.map((w) => (
            <p key={w} className="text-xs text-warning">
              {w}
            </p>
          ))}
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => showInFolder(run.result!.outputPath)}>
              <Save /> Show in folder
            </Button>
            <Button variant="ghost" onClick={reset}>
              <RotateCcw /> Make another
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex gap-4 px-4 py-2.5">
      <span className="w-20 shrink-0 text-muted-foreground">{label}</span>
      <span className={mono ? 'min-w-0 break-all font-mono text-xs leading-5' : 'min-w-0 break-words'}>{value}</span>
    </div>
  );
}
