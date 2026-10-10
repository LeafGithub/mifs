import { CircleAlert, CircleCheck, CircleX, ChevronDown, Hammer, RefreshCw, Square, TriangleAlert } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { fieldClass } from '../components/ui/field';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Progress } from '../components/ui/progress';
import { cn } from '../lib/utils';
import type { ToolStatus } from '../platform';
import { useApp } from '../store';

/** "Build from source" section of the loader step. Rendered only when the host can run builds. */
export function BuildPanel() {
  const b = useApp((s) => s.build);
  const toggle = useApp((s) => s.toggleBuild);
  const recheck = useApp((s) => s.recheckBuild);
  const set = useApp((s) => s.setBuild);
  const start = useApp((s) => s.startBuild);
  const cancel = useApp((s) => s.cancelBuild);

  const running = b.status === 'running';
  const custom = b.mode === 'custom';
  const ready =
    b.preflight?.ok === true &&
    !running &&
    (b.mode === 'release' ? b.tag !== '' : b.mode === 'master' ? true : b.repo.trim() !== '' && b.ref.trim() !== '' && b.trusted);

  return (
    <Card className="overflow-hidden">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={b.open}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-muted/50"
      >
        <span className="flex items-center gap-2 text-sm font-medium">
          <Hammer className="size-4 text-muted-foreground" /> Build from source
        </span>
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          For other versions or your own fork <ChevronDown className={cn('size-4 transition-transform', b.open && 'rotate-180')} />
        </span>
      </button>

      {b.open && (
        <div className="flex flex-col gap-5 border-t p-4">
          <section aria-labelledby="req" className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <h2 id="req" className="text-sm font-medium">
                Needs on this computer
              </h2>
              <Button variant="ghost" size="sm" onClick={recheck} disabled={running}>
                <RefreshCw /> Check again
              </Button>
            </div>
            {b.preflight ? (
              <ul className="flex flex-col gap-1.5 text-sm">
                <Tool name="Git" t={b.preflight.git} />
                <Tool name="Node.js 18+" t={b.preflight.node} />
                <Tool name="Corepack" t={b.preflight.corepack} />
                <Tool name="Free disk space" t={b.preflight.disk} />
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">Checking…</p>
            )}
          </section>

          <fieldset className="flex flex-col gap-3" disabled={running}>
            <legend className="mb-1 text-sm font-medium">What to build</legend>

            <Choice checked={b.mode === 'release'} onChange={() => set({ mode: 'release' })} label="An official release">
              <select
                aria-label="Release"
                value={b.tag}
                onChange={(e) => set({ tag: e.target.value })}
                disabled={b.mode !== 'release' || b.tags.length === 0}
                className={fieldClass}
              >
                {b.tags.length === 0 && <option value="">{b.tagsError ? 'unavailable' : 'loading…'}</option>}
                {b.tags.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </Choice>
            {b.tagsError && b.mode === 'release' && <p className="pl-6 text-xs text-warning">{b.tagsError}</p>}

            <Choice checked={b.mode === 'master'} onChange={() => set({ mode: 'master' })} label="The newest official code (master)">
              <span className="text-xs text-muted-foreground">may be unreleased or unstable</span>
            </Choice>

            <Choice checked={custom} onChange={() => set({ mode: 'custom' })} label="Another repository (a fork)" />
            {custom && (
              <div className="ml-6 flex flex-col gap-3">
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                  GitHub address
                  <input
                    value={b.repo}
                    onChange={(e) => set({ repo: e.target.value })}
                    placeholder="https://github.com/owner/sugarcube-2-ModLoader"
                    className={fieldClass}
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                  Branch, tag or commit
                  <input
                    value={b.ref}
                    onChange={(e) => set({ ref: e.target.value })}
                    placeholder="master"
                    className={fieldClass}
                  />
                </label>
                <label className="flex items-start gap-2 rounded-md bg-warning/10 p-3 text-xs text-warning">
                  <input type="checkbox" checked={b.trusted} onChange={(e) => set({ trusted: e.target.checked })} className="mt-0.5" />
                  <span>
                    <TriangleAlert className="mr-1 inline size-3.5" />
                    Building runs code from this repository and its dependencies on your computer. I trust this repository.
                  </span>
                </label>
              </div>
            )}
          </fieldset>

          <div className="flex flex-wrap items-center gap-3">
            {running ? (
              <Button variant="outline" onClick={cancel}>
                <Square /> Cancel build
              </Button>
            ) : (
              <Button variant="outline" onClick={start} disabled={!ready}>
                <Hammer /> {b.status === 'error' ? 'Try again' : 'Build'}
              </Button>
            )}
            {!running && <span className="text-xs text-muted-foreground">Takes around 10 minutes and downloads the project's dependencies.</span>}
          </div>

          {running && (
            <div className="flex flex-col gap-1" role="status" aria-live="polite">
              <Progress value={b.progress?.fraction ?? null} />
              <span className="text-xs text-muted-foreground">{b.progress?.label ?? 'Starting…'}</span>
            </div>
          )}

          {b.status === 'error' && (
            <p role="alert" className="flex items-start gap-2 whitespace-pre-wrap rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <CircleAlert className="mt-0.5 size-4 shrink-0" /> {b.error}
            </p>
          )}
          {b.status === 'done' && (
            <p role="status" className="flex items-center gap-2 rounded-md bg-success/10 px-3 py-2 text-sm text-success">
              <CircleCheck className="size-4 shrink-0" /> Built and installed. It is selected above.
            </p>
          )}

          {b.logs.length > 0 && <LogView lines={b.logs} />}
        </div>
      )}
    </Card>
  );
}

function Tool({ name, t }: { name: string; t: ToolStatus }) {
  return (
    <li className="flex flex-wrap items-center gap-2">
      {t.ok ? <CircleCheck className="size-4 text-success" /> : <CircleX className="size-4 text-destructive" />}
      <span>{name}</span>
      {t.version && <span className="text-xs text-muted-foreground">{t.version}</span>}
      {!t.ok && t.hint && <span className="text-xs text-warning">{t.hint}</span>}
    </li>
  );
}

function Choice({ checked, onChange, label, children }: { checked: boolean; onChange: () => void; label: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <label className="flex items-center gap-2 text-sm">
        <input type="radio" name="build-mode" checked={checked} onChange={onChange} />
        {label}
      </label>
      {children}
    </div>
  );
}

function LogView({ lines }: { lines: string[] }) {
  const ref = useRef<HTMLPreElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines]);
  return (
    <details>
      <summary className="cursor-pointer text-xs text-muted-foreground">Build output ({lines.length} lines)</summary>
      <pre ref={ref} tabIndex={0} className="mt-2 max-h-48 overflow-auto rounded-md bg-background p-3 font-mono text-xs leading-4 text-muted-foreground">
        {lines.join('\n')}
      </pre>
    </details>
  );
}
