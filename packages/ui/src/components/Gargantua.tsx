import { useId, type CSSProperties } from 'react';

const disk = (opacity?: number): CSSProperties => ({ stopColor: 'var(--disk)', ...(opacity === undefined ? {} : { stopOpacity: opacity }) });
const stroke = (color: string): CSSProperties => ({ stroke: color });
const core = stroke('var(--disk-core)');
/** A bright dash that orbits its shape (pathLength is normalised to 100); `t` is seconds per lap. */
const orbit = (t: number): CSSProperties => ({ '--t': `${t}s` }) as CSSProperties;

export type GargantuaState = 'idle' | 'running' | 'done' | 'failed';

/**
 * Decorative black hole with a lensed accretion disk, coloured by the theme's --disk variables.
 * `state`: the disk spins up while the file is written, flares and settles on success, cools to rust on failure
 * (keyframes in themes/interstellar.css).
 */
export function Gargantua({ className, state = 'idle' }: { className?: string; state?: GargantuaState }) {
  const id = useId();
  const grad = `${id}-d`;
  const blur = `${id}-b`;
  const ring = stroke('var(--disk)');
  const lens = stroke(`url(#${grad})`);
  const cooled = state === 'failed' ? ({ '--disk': 'var(--destructive)', '--disk-core': 'var(--warning)' } as CSSProperties) : undefined;
  return (
    <svg viewBox="0 0 640 400" aria-hidden className={className} data-state={state} style={{ overflow: 'visible', ...cooled }}>
      <defs>
        <linearGradient id={grad} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" style={disk(0)} />
          <stop offset=".22" style={disk(0.85)} />
          <stop offset=".5" style={{ stopColor: 'var(--disk-core)' }} />
          <stop offset=".78" style={disk(0.85)} />
          <stop offset="1" style={disk(0)} />
        </linearGradient>
        <filter id={blur} x="-20%" y="-60%" width="140%" height="220%">
          <feGaussianBlur stdDeviation="7" />
        </filter>
      </defs>
      <g className="garg-disk">
        <g filter={`url(#${blur})`} opacity=".75" fill="none" className="garg-halo">
          <ellipse cx="320" cy="200" rx="300" ry="20" style={lens} strokeWidth="12" />
          <circle cx="320" cy="200" r="100" style={ring} strokeWidth="9" />
          <ellipse cx="320" cy="200" rx="300" ry="20" pathLength="100" className="garg-spot" style={{ ...core, ...orbit(11) }} strokeWidth="14" strokeDasharray="7 93" strokeLinecap="round" />
        </g>
        <g fill="none">
          <ellipse cx="320" cy="200" rx="300" ry="20" style={lens} strokeWidth="3" />
          <ellipse cx="320" cy="200" rx="240" ry="12" style={lens} strokeWidth="1.5" opacity=".6" />
          <ellipse cx="320" cy="200" rx="112" ry="110" style={ring} strokeWidth="1.5" opacity=".45" />
          <ellipse cx="320" cy="200" rx="300" ry="20" pathLength="100" className="garg-spot" style={{ ...core, ...orbit(11) }} strokeWidth="4" strokeDasharray="5 95" strokeLinecap="round" />
          <ellipse cx="320" cy="200" rx="240" ry="12" pathLength="100" className="garg-spot" style={{ ...core, ...orbit(7) }} strokeWidth="2.5" strokeDasharray="4 96" strokeLinecap="round" />
          <ellipse cx="320" cy="200" rx="112" ry="110" pathLength="100" className="garg-spot" style={{ ...core, ...orbit(5) }} strokeWidth="2.5" strokeDasharray="7 93" strokeLinecap="round" />
        </g>
      </g>
      <circle cx="320" cy="200" r="98" style={{ fill: 'var(--hole)', stroke: 'var(--hole-rim)' }} strokeWidth="2.5" />
      <g className="garg-disk" fill="none">
        <path d="M20 200A300 20 0 0 0 620 200" style={lens} strokeWidth="3.5" />
        <path d="M80 200A240 12 0 0 0 560 200" style={lens} strokeWidth="1.5" opacity=".6" />
        <path d="M20 200A300 20 0 0 0 620 200" pathLength="100" className="garg-spot" style={{ ...core, ...orbit(11) }} strokeWidth="4.5" strokeDasharray="5 95" strokeLinecap="round" />
        <path d="M80 200A240 12 0 0 0 560 200" pathLength="100" className="garg-spot" style={{ ...core, ...orbit(7) }} strokeWidth="2.5" strokeDasharray="4 96" strokeLinecap="round" />
      </g>
      <circle cx="320" cy="200" r="100" fill="none" className="garg-shock" style={core} strokeWidth="3" />
    </svg>
  );
}
