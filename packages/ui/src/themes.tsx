import { useCallback, useEffect, useState, type ComponentType } from 'react';
import { Frog } from './components/Frog';
import { poseFor } from './components/FrogScene';
import { BlackHole } from './components/BlackHole';

/**
 * A theme is a CSS block (themes/<id>.css, scoped to [data-theme='<id>']) plus what CSS cannot do.
 * `Backdrop` is drawn behind the page, `shellClass` is added to the window (e.g. the star field), and CSS
 * variables such as --rail-width reshape the layout.
 * To add a theme: write its CSS file, import it in theme.css, add an entry here.
 */
/** Where the wizard is, so a backdrop can react to it. */
export interface BackdropState {
  finished: boolean;
  running: boolean;
  failed: boolean;
  step: number;
}

// `frog-backdrop` lets lilypad.css reserve header space for the frog, so it never overlaps the content below.
const FROG = 'frog-backdrop absolute z-10 right-6 top-2 w-[clamp(11rem,20vw,19rem)] overflow-visible';

const CELEBRATE = 'w-60 overflow-visible min-[1200px]:w-80';

export interface Theme {
  id: string;
  name: string;
  /** Classes added to the outermost window element. */
  shellClass?: string;
  /** Art behind the header. Must be decorative (aria-hidden) and ignore pointer events. */
  Backdrop?: ComponentType<BackdropState>;
  /** Larger reward under the result card when the run finishes. */
  Celebrate?: ComponentType;
}

export const THEMES: readonly Theme[] = [
  // The first entry is the default theme.
  {
    id: 'lilypad-dusk',
    name: 'Lilypad dusk',
    Backdrop: (state) => (state.finished ? null : <Frog className={FROG} world="dusk" pose={poseFor(state)} />),
    Celebrate: () => <Frog className={CELEBRATE} world="dusk" pose="done" />,
  },
  {
    id: 'lilypad-meadow',
    name: 'Lilypad meadow',
    Backdrop: (state) => (state.finished ? null : <Frog className={FROG} world="meadow" pose={poseFor(state)} />),
    Celebrate: () => <Frog className={CELEBRATE} world="meadow" pose="done" />,
  },
  {
    id: 'interstellar',
    name: 'Interstellar',
    shellClass: 'stars',
    Backdrop: ({ finished, running, failed }) => (
      // Sized from the viewport and faded toward the text so the disc stays off the header copy.
      <BlackHole
        state={failed ? 'failed' : running ? 'running' : finished ? 'done' : 'idle'}
        className="pointer-events-none absolute -top-16 right-2 w-[clamp(18rem,40vw,44rem)] min-[1000px]:-top-14 [mask-image:radial-gradient(ellipse_closest-side,#000_78%,transparent)]"
      />
    ),
  },
];

const DEFAULT_ID = THEMES[0]!.id;
const KEY = 'mifs.theme';

export const findTheme = (id: string): Theme => THEMES.find((t) => t.id === id) ?? THEMES[0]!;

function load(): string {
  try {
    return findTheme(localStorage.getItem(KEY) ?? DEFAULT_ID).id;
  } catch {
    return DEFAULT_ID; // storage blocked: run with the default
  }
}

/** Current theme id, applied to <html data-theme> and remembered between launches. */
export function useTheme(): [Theme, (id: string) => void] {
  const [id, setId] = useState(load);
  useEffect(() => {
    document.documentElement.dataset.theme = id;
  }, [id]);
  const set = useCallback((next: string) => {
    const valid = findTheme(next).id;
    setId(valid);
    try {
      localStorage.setItem(KEY, valid);
    } catch {
      /* not remembered */
    }
  }, []);
  return [findTheme(id), set];
}
