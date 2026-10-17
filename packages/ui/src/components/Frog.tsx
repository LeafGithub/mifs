import { lazy, Suspense } from 'react';
import { FrogScene, type FrogPose } from './FrogScene';
import { Boundary, hasWebGL } from './lazy3d';

// three.js is a separate chunk, loaded after first paint; the SVG frog stands in until it arrives.
const FrogScene3D = lazy(() => import('./FrogScene3D'));

/** The lilypad mascot: 3D when WebGL works, the SVG frog otherwise. */
export function Frog({ className, world, pose }: { className?: string; world: 'dusk' | 'meadow'; pose: FrogPose }) {
  const svg = <FrogScene className={className} world={world} pose={pose} />;
  if (!hasWebGL()) return svg;
  return (
    <Boundary fallback={svg}>
      <Suspense fallback={svg}>
        <FrogScene3D className={className} world={world} pose={pose} />
      </Suspense>
    </Boundary>
  );
}
