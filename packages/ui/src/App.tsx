import { ArrowLeft, ArrowRight, Check, CircleAlert, Hammer } from 'lucide-react';
import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { KindLabel } from './components/KindLabel';
import { SupportLink } from './components/SupportLink';
import { ThemeSelect } from './components/ThemeSelect';
import { UpdateNotice } from './components/UpdateNotice';
import { Button } from './components/ui/button';
import { useTheme, type Theme } from './themes';
import { cn, formatBytes, stripGameExt } from './lib/utils';
import type { Platform } from './platform';
import { STEPS, StoreContext, createAppStore, useApp } from './store';
import { BuildStep } from './steps/BuildStep';
import { BundleStep } from './steps/BundleStep';
import { GameStep } from './steps/GameStep';

export function App({ platform }: { platform: Platform }) {
  const store = useMemo(() => createAppStore(platform), [platform]);
  return (
    <StoreContext.Provider value={store}>
      <Shell platform={platform} />
    </StoreContext.Provider>
  );
}

const TITLES = [
  ['Choose a loader', 'A loader bundle is ModLoader plus its standard mods, built and checksummed. Pick the one to install into your game.'],
  ['Choose a game', 'Choose the game to install ModLoader into. The original file is never changed; a new .mod.html is written.'],
  ['Create your game', 'Review, then write the modded game file.'],
] as const;

/** Plainer wording for the friendly themes (shown instead of the first hint; see .hud-only / .friendly-only in theme.css). */
const FRIENDLY_HINTS = [
  'Pick which ModLoader to install. Each one comes with its recommended mods already chosen.',
  'Pick the game to add ModLoader to. Your original file is never changed; a new copy ending in .mod.html is saved.',
  'Check the details, then save your modded game. Mods are small add-ons; the standard set is already picked for you.',
] as const;

const CAPTIONS = ['Pick a bundle', 'Target HTML file', 'Write modded file'] as const;

function Shell({ platform }: { platform: Platform }) {
  const step = useApp((s) => s.step);
  const go = useApp((s) => s.go);
  const init = useApp((s) => s.init);
  const error = useApp((s) => s.error);
  const bundleId = useApp((s) => s.bundleId);
  const game = useApp((s) => s.game);
  const runStatus = useApp((s) => s.run.status);
  const running = runStatus === 'running';
  const busy = useApp((s) => s.gameBusy !== null);
  const failed = useApp((s) => s.run.status === 'error');
  const outputPath = useApp((s) => s.outputPath);
  const selectedCount = useApp((s) => s.selected.length);
  const start = useApp((s) => s.start);
  const ready = bundleId !== null && game !== null && outputPath !== null && selectedCount > 0;

  const [theme, setTheme] = useTheme();

  useEffect(() => void init(), [init]);

  // Each step starts at the top; a scroll position left over from Customize must not clip the next screen.
  const pane = useRef<HTMLDivElement>(null);
  useEffect(() => {
    pane.current?.scrollTo({ top: 0 });
  }, [step, runStatus]);

  const canNext = [bundleId !== null, game !== null && !busy, false][step] ?? false;
  const finished = step === 2 && runStatus === 'done';
  const [title, hint] = finished ? (['Done', 'The modded copy is saved. Your original file is untouched.'] as const) : running ? (['Create your game', 'Writing the modded game file. Keep this window open until it finishes.'] as const) : TITLES[step]!;
  const suffix = finished ? ' · Complete' : running ? ' · In progress' : '';
  const friendlyHint = finished || running ? hint : FRIENDLY_HINTS[step]!;

  return (
    <div className={cn('relative grid h-full grid-cols-[var(--rail-width)_1fr] grid-rows-[minmax(0,1fr)] overflow-hidden bg-background', theme.shellClass)}>
      <Rail step={step} canNext={canNext} running={running} allDone={finished} go={go} theme={theme} setTheme={setTheme} platform={platform} />

      <main className="relative flex min-h-0 min-w-0 flex-col px-12 pb-7 pt-9">
        {theme.Backdrop && <theme.Backdrop finished={finished} running={running} failed={failed} step={step} />}

        <header className="relative">
          <p className={cn('font-mono text-xs uppercase tracking-[0.24em]', finished ? 'text-success' : 'text-primary')}><span className="hud-only">
              Stage 0{step + 1} / 0{STEPS.length}
              {suffix}
            </span>
            <span className="friendly-only">
              Step {step + 1} of {STEPS.length}
              {suffix}
            </span>
          </p>
          <h1 className="mb-2.5 mt-3 font-display text-[clamp(1.5rem,3.4vw,2rem)] uppercase leading-tight tracking-[0.12em]">{title}</h1>
          <p className="max-w-[28rem] text-muted-foreground max-[1000px]:max-w-[21rem]">
            <span className="hud-only">{hint}</span>
            <span className="friendly-only">{friendlyHint}</span>
          </p>
        </header>

        <div ref={pane} className="relative mt-7 min-h-0 flex-1 overflow-y-auto pr-1">
          {error && (
            <p role="alert" className="mb-4 flex items-start gap-2 rounded-sm border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <CircleAlert className="mt-0.5 size-4 shrink-0" /> {error}
            </p>
          )}
          {step === 0 && <BundleStep />}
          {step === 1 && <GameStep />}
          {step === 2 && <BuildStep />}
          {finished && theme.Celebrate && (
            <div className="pointer-events-none -mb-3 -mt-5 flex max-w-[40rem] justify-end pr-6">
              <theme.Celebrate />
            </div>
          )}
        </div>

        <footer className="relative mt-4 flex justify-between border-t pt-5">
          <Button variant="ghost" disabled={step === 0 || running || finished} onClick={() => go(step - 1)}>
            <ArrowLeft /> Back
          </Button>
          {step < STEPS.length - 1 && (
            <Button disabled={!canNext} onClick={() => go(step + 1)}>
              Next <ArrowRight />
            </Button>
          )}
          {step === STEPS.length - 1 && !running && !finished && (
            <div className="flex items-center gap-4">
              {!ready && <span className="max-w-[12rem] text-right text-sm leading-snug text-muted-foreground">{!outputPath ? 'Choose where to save first' : 'Pick a loader and a game first'}</span>}
              <Button disabled={!ready} onClick={start}>
                <Hammer /> {failed ? 'Try again' : 'Create modded game'}
              </Button>
            </div>
          )}
        </footer>
      </main>
    </div>
  );
}

function Rail({
  step,
  canNext,
  running,
  allDone,
  go,
  theme,
  setTheme,
  platform,
}: {
  platform: Platform;
  step: number;
  canNext: boolean;
  running: boolean;
  allDone: boolean;
  go: (i: number) => void;
  theme: Theme;
  setTheme: (id: string) => void;
}) {
  return (
    <nav aria-label="Steps" className="relative flex flex-col border-r px-7 pb-7 pt-9">
      <div>
        <p className="font-display text-[1.75rem] tracking-[0.3em]">MIFS</p>
        <p className="mt-2 font-mono text-xs uppercase leading-relaxed tracking-[0.14em] text-muted-foreground">
          ModLoader Installer
          <br />
          for SugarCube
        </p>
      </div>

      <ol className="mt-14">
        {STEPS.map((name, i) => {
          const done = i < step || (allDone && i === step);
          const current = i === step && !allDone;
          const reachable = i <= step || (i === step + 1 && canNext);
          return (
            <li
              key={name}
              className={cn(
                'relative pb-9 last:pb-0',
                i < STEPS.length - 1 && "after:absolute after:bottom-0.5 after:left-[7px] after:top-[22px] after:w-px after:bg-input after:content-['']",
                done && i < STEPS.length - 1 && 'after:bg-success',
              )}
            >
              <button
                type="button"
                disabled={!reachable || running}
                onClick={() => go(i)}
                aria-current={current ? 'step' : undefined}
                className={cn(
                  'grid w-full grid-cols-[1rem_1fr] gap-[18px] text-left disabled:cursor-default',
                  current ? 'text-primary' : done ? 'text-foreground' : 'text-muted-foreground/70',
                  !current && !done && reachable && 'text-muted-foreground hover:text-foreground',
                )}
              >
                <span
                  className={cn(
                    'relative z-10 mt-[3px] grid size-3.5 place-content-center rounded-full border border-input bg-background',
                    current && 'border-primary bg-primary shadow-[0_0_0_4px_var(--background),0_0_0_5px_var(--primary)]',
                    done && 'border-success text-success',
                  )}
                >
                  {done && <Check className="size-2" strokeWidth={4} />}
                </span>
                <span>
                  <span className="block font-display text-xs uppercase tracking-[0.2em]">{name}</span>
                  <span className="mt-1.5 block font-mono text-xs tracking-[0.06em] text-muted-foreground">{CAPTIONS[i]}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      <Ledger />
      <div className="mt-4" />
      <UpdateNotice platform={platform} />
      <ThemeSelect theme={theme} onChange={setTheme} />
      <SupportLink className="mt-4 w-full" />
    </nav>
  );
}

/** What has been chosen so far, always in view. */
function Ledger() {
  const bundle = useApp((s) => s.bundles.find((b) => b.id === s.bundleId));
  const game = useApp((s) => s.game);
  const selected = useApp((s) => s.selected);
  const rows: [string, ReactNode, string?][] = [
    [
      'Loader',
      bundle ? (
        <>
          {bundle.manifest.loader.version} · <KindLabel kind={bundle.manifest.kind} />
        </>
      ) : (
        '—'
      ),
    ],
    ['Game', game ? stripGameExt(game.name) : '—', game ? formatBytes(game.size) : undefined],
    ['Mods', bundle ? `${selected.length} selected` : '—'],
  ];
  return (
    <dl className="mt-auto border-t pt-4 font-mono text-xs tracking-[0.06em]">
      {rows.map(([k, v, sub]) => (
        <div key={k} className="flex justify-between gap-3 py-1.5">
          <dt className="shrink-0 text-xs uppercase tracking-[0.14em] text-muted-foreground">{k}</dt>
          <dd className="min-w-0 text-right">
            <span className="block truncate" title={typeof v === 'string' ? v : undefined}>
              {v}
            </span>
            {sub && <span className="block text-muted-foreground">{sub}</span>}
          </dd>
        </div>
      ))}
    </dl>
  );
}
