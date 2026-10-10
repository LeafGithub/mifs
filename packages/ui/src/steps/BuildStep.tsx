import { defaultSelection } from '@mifs/core';
import { Check, CircleAlert, Copy, FolderSearch, RotateCcw, FolderOpen, SlidersHorizontal, TriangleAlert } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { KindLabel } from '../components/KindLabel';
import { Progress } from '../components/ui/progress';
import { cn, formatBytes } from '../lib/utils';
import { useApp } from '../store';
import { ModsEditor } from './ModsEditor';

export function BuildStep() {
  const bundle = useApp((s) => s.bundles.find((b) => b.id === s.bundleId));
  const game = useApp((s) => s.game);
  const selected = useApp((s) => s.selected);
  const outputPath = useApp((s) => s.outputPath);
  const run = useApp((s) => s.run);
  const pickOutput = useApp((s) => s.pickOutput);
  const reset = useApp((s) => s.reset);
  const showInFolder = useApp((s) => s.showInFolder);

  const [customizing, setCustomizing] = useState(false);
  const standard = bundle ? defaultSelection(bundle.manifest) : [];
  const isStandard = selected.length === standard.length && standard.every((id) => selected.includes(id));
  const modsLabel = bundle ? (isStandard ? `Standard set: ${selected.length} mods` : `Custom: ${selected.length} of ${bundle.manifest.mods.length} mods`) : '—';

  const ready = bundle && game && outputPath && selected.length > 0;

  if (run.status === 'done' && run.result) {
    return (
      <Card className="bracket flex max-w-[40rem] flex-col gap-5 p-6 [--bracket:var(--success)]" style={{ borderColor: 'var(--success)' }}>
        <p className="font-display text-lg uppercase tracking-[0.12em] text-success">Your game is ready</p>
        <div className="flex flex-col gap-2">
          <p className="break-all border bg-black/35 px-3.5 py-3 font-mono text-[12.5px] leading-normal">{run.result.outputPath}</p>
          <CopyPath path={run.result.outputPath} />
        </div>
        <dl className="flex gap-11">
          <Stat label="Size" value={formatBytes(run.result.size)} />
          <Stat label="Mods" value={String(run.result.modIds.length)} />
          <Stat label="Time" value={`${(run.result.ms / 1000).toFixed(1)} s`} />
        </dl>
        <p className="text-sm text-muted-foreground">Open the file in your browser to play. If your game uses separate image folders, keep them next to it.</p>
        {run.result.warnings.map((w) => (
          <p key={w} className="flex items-start gap-2 text-[13px] text-warning">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" /> {w}
          </p>
        ))}
        <div className="flex gap-2.5">
          <Button className="border-success bg-success text-background hover:bg-success/85" onClick={() => showInFolder(run.result!.outputPath)}>
            <FolderOpen /> Show in folder
          </Button>
          <Button variant="outline" onClick={reset}>
            <RotateCcw /> Make another
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {customizing && run.status !== 'running' ? (
        <Card className="flex items-center gap-3 py-2 pl-5 pr-3 text-sm">
          <p className="min-w-0 flex-1 truncate">
            {game?.name ?? '—'} · {modsLabel}
          </p>
          <Button variant="ghost" size="sm" onClick={() => setCustomizing(false)} aria-expanded>
            <SlidersHorizontal /> Done
          </Button>
        </Card>
      ) : (
      <Card aria-busy={run.status === 'running'}>
        <dl className="divide-y text-sm">
          <Row
            label="Loader"
            value={
              bundle ? (
                <>
                  ModLoader {bundle.manifest.loader.version} (<KindLabel kind={bundle.manifest.kind} />)
                </>
              ) : (
                '—'
              )
            }
          />
          <Row label="Game" value={game?.name ?? '—'} />
          {run.status !== 'running' && (
            <Row
              label="Mods"
              value={modsLabel}
              action={
                <Button variant="ghost" size="sm" onClick={() => setCustomizing((v) => !v)} aria-expanded={customizing}>
                  <SlidersHorizontal /> {customizing ? 'Done' : 'Customize…'}
                </Button>
              }
            />
          )}
          <Row label="Save as" value={outputPath ?? 'not chosen yet'} mono />
        </dl>
      </Card>
      )}

      {customizing && run.status !== 'running' && <ModsEditor />}

      {run.status !== 'running' && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5">
          <Button variant={outputPath ? 'outline' : 'default'} onClick={pickOutput}>
            <FolderSearch /> {outputPath ? 'Change location…' : 'Choose where to save…'}
          </Button>
          <p className={cn("flex items-center gap-2.5 font-mono text-xs uppercase tracking-[0.14em] text-success before:size-1.5 before:rounded-full before:bg-success before:shadow-[0_0_8px_var(--success)] before:content-['']", !(run.status === 'idle' && ready) && 'invisible')}>
            Ready to create
          </p>
        </div>
      )}
      {run.status === 'running' && <Transit fraction={run.progress?.fraction ?? null} label={run.progress?.label ?? 'Working…'} />}

      {run.status === 'error' && (
        <p role="alert" className="flex items-start gap-2 rounded-sm border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <CircleAlert className="mt-0.5 size-4 shrink-0" /> {run.error}
        </p>
      )}
    </div>
  );
}

/** The crossing: a big readout, a mission clock, and the ship's progress along its line. */
function Transit({ fraction, label }: { fraction: number | null; label: string }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const t0 = Date.now();
    const id = setInterval(() => setElapsed(Date.now() - t0), 100);
    return () => clearInterval(id);
  }, []);
  const mm = String(Math.floor(elapsed / 60000)).padStart(2, '0');
  const ss = ((elapsed % 60000) / 1000).toFixed(1).padStart(4, '0');
  return (
    <div className="mt-4 flex flex-col">
      <div className="flex items-baseline justify-between">
        <span className="font-display text-7xl leading-none tracking-wide" aria-hidden>
          {fraction === null ? '—' : Math.round(fraction * 100)}
          {fraction !== null && <small className="ml-1.5 text-3xl text-primary">%</small>}
        </span>
        <span className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground" aria-hidden>
          <span className="hud-only">T+ {mm}:{ss}</span>
          <span className="friendly-only">Elapsed {Math.floor(elapsed / 60000)}:{String(Math.floor((elapsed % 60000) / 1000)).padStart(2, '0')}</span>
        </span>
      </div>
      <Progress value={fraction} className="mt-6" aria-label="Creating your game" />
      <div className="mt-4 flex justify-between font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
        <span>Original game</span>
        <span>Modded copy</span>
      </div>
      {/* Only the step label is announced; the percentage and clock tick too often to read aloud. */}
      <p className="mt-5" role="status" aria-live="polite">
        {label}
        {fraction !== null && <span className="sr-only"> {Math.round(fraction * 100)}%</span>}
      </p>
    </div>
  );
}

function CopyPath({ path }: { path: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="ghost"
      size="sm"
      className="self-start"
      onClick={() => {
        void navigator.clipboard?.writeText(path).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }, () => undefined);
      }}
    >
      {copied ? <Check /> : <Copy />} {copied ? 'Copied' : 'Copy path'}
    </Button>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <dt className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">{label}</dt>
      <dd className="font-display text-2xl leading-none tracking-wide">{value}</dd>
    </div>
  );
}

function Row({ label, value, mono, action }: { label: string; value: React.ReactNode; mono?: boolean; action?: React.ReactNode }) {
  return (
    <div className="flex min-h-[3.25rem] items-center gap-4 px-5 py-2">
      <dt className="w-24 shrink-0 font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">{label}</dt>
      <dd className={mono ? 'min-w-0 flex-1 break-all font-mono text-[12.5px] leading-5' : 'min-w-0 flex-1 break-words'}>{value}</dd>
      {action}
    </div>
  );
}
