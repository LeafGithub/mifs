import { lazy, Suspense } from 'react';
import { Gargantua, type GargantuaState } from './Gargantua';
import { Boundary, hasWebGL } from './lazy3d';

// three.js loads as a separate chunk after first paint; the SVG black hole stands in until then and if WebGL fails.
const BlackHole3D = lazy(() => import('./BlackHole3D'));

/** Interstellar's backdrop: a ray-traced black hole when WebGL works, the flat SVG one otherwise. */
export function BlackHole({ className, state = 'idle' }: { className?: string; state?: GargantuaState }) {
  const svg = <Gargantua className={className} state={state} />;
  if (!hasWebGL()) return svg;
  return (
    <Boundary fallback={svg}>
      <Suspense fallback={svg}>
        <BlackHole3D className={className} state={state} />
      </Suspense>
    </Boundary>
  );
}
