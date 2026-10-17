import { useId } from 'react';

/** What the frog is doing, driven by the wizard. */
export type FrogPose = 'idle' | 'curious' | 'working' | 'done' | 'error';

export function poseFor({ step, running, finished, failed }: { step: number; running: boolean; finished: boolean; failed: boolean }): FrogPose {
  if (finished) return 'done';
  if (failed) return 'error';
  if (running) return 'working';
  return step === 1 ? 'curious' : 'idle';
}

/**
 * Lilypad's mascot: a chubby, soft-shaded frog on a pad. Colours come from the theme's CSS variables, motion from
 * lilypad.css (.fs-*) keyed on data-pose. Dusk has a moon; meadow has a sun and grass.
 */
export function FrogScene({ className, world, pose }: { className?: string; world: 'dusk' | 'meadow'; pose: FrogPose }) {
  const id = useId().replace(/:/g, '');
  const bloom = { fill: 'var(--petal)', stroke: 'var(--input)', strokeWidth: 2.5 };
  const ink = { fill: 'var(--foreground)' };
  const stroke = { fill: 'none', stroke: 'var(--foreground)', strokeWidth: 5, strokeLinecap: 'round' as const };
  const shade = (pct: number, mix = 'black') => `color-mix(in srgb, var(--frog) ${pct}%, ${mix})`;
  const flower = (
    <>
      <g style={bloom}>
        <circle cx="0" cy="-32" r="17" />
        <circle cx="30" cy="-10" r="17" />
        <circle cx="18" cy="24" r="17" />
        <circle cx="-18" cy="24" r="17" />
        <circle cx="-30" cy="-10" r="17" />
      </g>
      <circle r="13" style={{ fill: 'var(--muted)', stroke: 'var(--input)', strokeWidth: 2.5 }} />
    </>
  );
  const happy = pose === 'done';
  const worried = pose === 'error';
  const lookX = pose === 'working' ? 5 : pose === 'curious' ? -4 : 0;
  const eyeY = worried ? 134 : 128;
  const confetti = ['#f6a5be', '#7cc4ff', '#ffd36e', '#b69cff', '#8fe0a8', '#ff9d7a'];
  return (
    <svg viewBox="-12 -12 424 354" aria-hidden="true" className={className} data-pose={pose}>
      <defs>
        <radialGradient id={`${id}-body`} cx="38%" cy="28%" r="85%">
          <stop offset="0" style={{ stopColor: shade(72, 'white') }} />
          <stop offset="0.45" style={{ stopColor: 'var(--frog)' }} />
          <stop offset="1" style={{ stopColor: shade(80) }} />
        </radialGradient>
        <radialGradient id={`${id}-belly`} cx="45%" cy="30%" r="80%">
          <stop offset="0" style={{ stopColor: 'color-mix(in srgb, var(--belly) 70%, white)' }} />
          <stop offset="1" style={{ stopColor: 'color-mix(in srgb, var(--belly) 82%, black)' }} />
        </radialGradient>
      </defs>
      {world === 'dusk' ? (
        <g>
          <path d="M350 18 a26 26 0 1 0 22 40 a21 21 0 0 1 -22 -40z" style={{ fill: 'var(--glow)', stroke: 'var(--input)', strokeWidth: 2.5 }} />
          <g style={{ fill: 'var(--input)' }} className="fs-twinkle">
            <circle cx="30" cy="40" r="3" />
            <circle cx="62" cy="14" r="2.2" />
            <circle cx="320" cy="96" r="2.4" />
          </g>
        </g>
      ) : (
        <g>
          <circle cx="352" cy="44" r="26" style={{ fill: 'var(--glow)', stroke: 'var(--input)', strokeWidth: 2.5 }} />
          <g style={{ fill: 'none', stroke: 'var(--input)', strokeWidth: 3, strokeLinecap: 'round' }} className="fs-rays">
            <path d="M352 6v10M352 72v10M314 44h10M380 44h10M325 17l7 7M372 64l7 7M379 17l-7 7M332 64l-7 7" />
          </g>
          <g style={{ fill: 'var(--pad)', stroke: 'var(--input)', strokeWidth: 2.5, strokeLinejoin: 'round' }}>
            <path d="M8 300 q4 -34 12 -40 q2 22 8 40z" />
            <path d="M388 300 q-4 -34 -12 -40 q-2 22 -8 40z" />
          </g>
        </g>
      )}
      <ellipse cx="200" cy="268" rx="170" ry="24" style={{ fill: 'var(--pad)', stroke: 'var(--input)', strokeWidth: 3 }} />
      <ellipse cx="214" cy="270" rx="96" ry="13" style={{ fill: 'var(--foreground)' }} opacity="0.16" />
      <g className="fs-body">
        <ellipse cx="150" cy="260" rx="27" ry="14" style={{ fill: shade(82) }} />
        <ellipse cx="250" cy="260" rx="27" ry="14" style={{ fill: shade(82) }} />
        <g transform={happy ? 'rotate(-38 104 176)' : undefined}>
          <ellipse cx="100" cy="196" rx="17" ry="34" style={{ fill: shade(86) }} />
        </g>
        <g transform={happy ? 'rotate(38 296 176)' : undefined}>
          <ellipse cx="300" cy="196" rx="17" ry="34" style={{ fill: shade(86) }} />
        </g>
        <path d="M200 66 C262 66 304 108 304 168 C304 228 272 266 200 266 C128 266 96 228 96 168 C96 108 138 66 200 66Z" fill={`url(#${id}-body)`} />
        <ellipse cx="200" cy="206" rx="62" ry="52" fill={`url(#${id}-belly)`} />
        <ellipse cx="158" cy="92" rx="30" ry="14" style={{ fill: 'white' }} opacity="0.28" transform="rotate(-18 158 92)" />
        {happy ? (
          <g style={stroke}>
            <path d="M139 132 q19 -22 38 0" />
            <path d="M223 132 q19 -22 38 0" />
          </g>
        ) : (
          <g className="fs-eyes">
            <circle cx={158 + lookX} cy={eyeY} r={worried ? 10 : 12} style={ink} />
            <circle cx={242 + lookX} cy={eyeY} r={worried ? 10 : 12} style={ink} />
            <circle cx={162 + lookX} cy={eyeY - 5} r="3.5" fill="#fff" />
            <circle cx={246 + lookX} cy={eyeY - 5} r="3.5" fill="#fff" />
          </g>
        )}
        {happy ? (
          <>
            <path d="M178 152 Q200 186 222 152 Z" style={{ fill: 'var(--foreground)' }} strokeLinejoin="round" stroke="var(--foreground)" strokeWidth="4" />
            <path d="M188 168 Q200 177 212 168 Q200 160 188 168Z" style={{ fill: 'var(--cheek)' }} />
          </>
        ) : worried ? (
          <path d="M184 160 Q192 150 200 157 Q208 164 216 154" style={{ ...stroke, strokeWidth: 3.5 }} />
        ) : (
          <path d="M190 156 h8 m4 0 h8" style={{ ...stroke, strokeWidth: 3.5 }} />
        )}
        <ellipse cx="126" cy="156" rx="14" ry="9" style={{ fill: 'var(--cheek)' }} opacity={happy ? 0.9 : 0.55} />
        <ellipse cx="274" cy="156" rx="14" ry="9" style={{ fill: 'var(--cheek)' }} opacity={happy ? 0.9 : 0.55} />
        {worried && <path className="fs-drop" d="M290 96 q10 18 0 26 q-10 -8 0 -26z" style={{ fill: 'var(--tertiary, var(--accent))', stroke: 'var(--input)', strokeWidth: 2.5 }} />}
      </g>
      <g transform="translate(44 236)">{flower}</g>
      <g transform="translate(356 242) scale(.82)">{flower}</g>
      {happy && (
        <g className="fs-petals">
          {confetti.flatMap((c, i) => [0, 1].map((k) => (
            <rect
              key={`${i}-${k}`}
              className="fs-petal"
              x={40 + i * 60 + k * 28}
              y={-6 + ((i * 37 + k * 53) % 40)}
              width="9"
              height="6"
              rx="1.5"
              style={{ fill: c, animationDelay: `${((i * 5 + k * 3) % 9) * 0.25}s` }}
            />
          )))}
        </g>
      )}
    </svg>
  );
}
