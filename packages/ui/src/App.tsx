import { ArrowLeft, ArrowRight, Check, CircleAlert } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { Button } from './components/ui/button';
import { cn } from './lib/utils';
import type { Platform } from './platform';
import { STEPS, StoreContext, createAppStore, useApp } from './store';
import { BuildStep } from './steps/BuildStep';
import { BundleStep } from './steps/BundleStep';
import { GameStep } from './steps/GameStep';
import { ModsStep } from './steps/ModsStep';

export function App({ platform }: { platform: Platform }) {
  const store = useMemo(() => createAppStore(platform), [platform]);
  return (
    <StoreContext.Provider value={store}>
      <Shell />
    </StoreContext.Provider>
  );
}

const TITLES = [
  ['Choose a loader', 'ModLoader and the mods that come with it.'],
  ['Choose a game', 'The game you want to install ModLoader into.'],
  ['Choose mods', 'Start from the standard set, then adjust.'],
  ['Create your game', 'Review and write the modded game file.'],
] as const;

function Shell() {
  const step = useApp((s) => s.step);
  const go = useApp((s) => s.go);
  const init = useApp((s) => s.init);
  const error = useApp((s) => s.error);
  const bundleId = useApp((s) => s.bundleId);
  const game = useApp((s) => s.game);
  const selected = useApp((s) => s.selected);
  const running = useApp((s) => s.run.status === 'running');
  const busy = useApp((s) => s.gameBusy !== null);

  useEffect(() => void init(), [init]);

  const canNext = [bundleId !== null, game !== null && !busy, selected.length > 0, false][step] ?? false;
  const [title, hint] = TITLES[step]!;

  return (
    <div className="mx-auto flex h-full max-w-5xl gap-8 px-8 py-6">
      <nav aria-label="Steps" className="w-44 shrink-0 pt-1">
        <div className="mb-6">
          <p className="text-base font-semibold tracking-tight">MIFS</p>
          <p className="text-xs leading-4 text-muted-foreground">ModLoader Installer for SugarCube</p>
        </div>
        <ol className="flex flex-col gap-1">
          {STEPS.map((name, i) => {
            const done = i < step;
            const reachable = i <= step || (i === step + 1 && canNext);
            return (
              <li key={name}>
                <button
                  type="button"
                  disabled={!reachable || running}
                  onClick={() => go(i)}
                  aria-current={i === step ? 'step' : undefined}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-sm transition-colors disabled:cursor-default',
                    i === step ? 'bg-accent font-medium' : reachable ? 'text-muted-foreground hover:text-foreground' : 'text-muted-foreground/50',
                  )}
                >
                  <span
                    className={cn(
                      'grid size-6 shrink-0 place-content-center rounded-full border text-xs',
                      i === step && 'border-primary bg-primary text-primary-foreground',
                      done && 'border-success text-success',
                    )}
                  >
                    {done ? <Check className="size-3.5" strokeWidth={3} /> : i + 1}
                  </span>
                  {name}
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="mb-5">
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          <p className="text-sm text-muted-foreground">{hint}</p>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          {error && (
            <p role="alert" className="mb-4 flex items-start gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <CircleAlert className="mt-0.5 size-4 shrink-0" /> {error}
            </p>
          )}
          {step === 0 && <BundleStep />}
          {step === 1 && <GameStep />}
          {step === 2 && <ModsStep />}
          {step === 3 && <BuildStep />}
        </div>

        <footer className="mt-4 flex justify-between border-t pt-4">
          <Button variant="ghost" disabled={step === 0 || running} onClick={() => go(step - 1)}>
            <ArrowLeft /> Back
          </Button>
          {step < STEPS.length - 1 && (
            <Button disabled={!canNext} onClick={() => go(step + 1)}>
              Next <ArrowRight />
            </Button>
          )}
        </footer>
      </main>
    </div>
  );
}
