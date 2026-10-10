import { useCallback, useEffect, useState, type ComponentType } from 'react';
import { FrogScene, poseFor } from './components/FrogScene';
import { Gargantua } from './components/Gargantua';

/**
 * A theme is a CSS block (themes/<id>.css, scoped to [data-theme='<id>']) plus what CSS alone cannot do.
 * Layout and decoration are the theme's to change: `Backdrop` is drawn behind the page, `shellClass` is added to the
 * window (e.g. the star field), and CSS variables such as --rail-width reshape the layout.
 * To add a theme: write its CSS file, import it in theme.css, and add an entry here.
 */
/** Where the wizard is, so a backdrop can react to it. */
export interface BackdropState {
  finished: boolean;
  running: boolean;
  failed: boolean;
  step: number;
}

const FROG = 'pointer-events-none absolute right-6 top-6 w-[clamp(8.75rem,18vw,11rem)] overflow-visible';

const CELEBRATE = 'w-44 overflow-visible min-[1200px]:w-56';

export interface Theme {
  id: string;
  name: string;
  /** Classes added to the outermost window element. */
  shellClass?: string;
  /** Art behind the header. Must be decorative (aria-hidden) and ignore pointer events. */
  Backdrop?: ComponentType<BackdropState>;
  /** A larger reward shown under the result card when the run finishes. */
  Celebrate?: ComponentType;
}

export const THEMES: readonly Theme[] = [
  {
    id: 'interstellar',
    name: 'Interstellar',
    shellClass: 'stars',
    Backdrop: ({ finished, running, failed }) => (
      // Sized from the viewport and faded toward the text column so the disc never sits behind the header copy.
      <Gargantua
        state={failed ? 'failed' : running ? 'running' : finished ? 'done' : 'idle'}
        className="pointer-events-none absolute -top-24 -right-[clamp(5rem,9vw,9rem)] w-[clamp(16rem,36vw,40rem)] min-[1000px]:-top-10 [mask-image:linear-gradient(to_left,#000_55%,transparent)]"
      />
    ),
  },
  {
    id: 'lilypad-dusk',
    name: 'Lilypad dusk',
    Backdrop: (state) => (state.finished ? null : <FrogScene className={FROG} world="dusk" pose={poseFor(state)} />),
    Celebrate: () => <FrogScene className={CELEBRATE} world="dusk" pose="done" />,
  },
  {
    id: 'lilypad-meadow',
    name: 'Lilypad meadow',
    Backdrop: (state) => (state.finished ? null : <FrogScene className={FROG} world="meadow" pose={poseFor(state)} />),
    Celebrate: () => <FrogScene className={CELEBRATE} world="meadow" pose="done" />,
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
