/** What the frog is doing. Driven by the wizard: waiting, looking at the options, working, celebrating, or worried. */
export type FrogPose = 'idle' | 'curious' | 'working' | 'done' | 'error';

export function poseFor({ step, running, finished, failed }: { step: number; running: boolean; finished: boolean; failed: boolean }): FrogPose {
  if (finished) return 'done';
  if (failed) return 'error';
  if (running) return 'working';
  return step === 1 ? 'curious' : 'idle';
}

/**
 * Lilypad's mascot: a chubby frog on a pad. Colours come from the theme's CSS variables; motion lives in
 * lilypad.css (.fs-*), keyed on data-pose. Each world gets its own props: a moon for dusk, a sun and grass for meadow.
 */
export function FrogScene({ className, world, pose }: { className?: string; world: 'dusk' | 'meadow'; pose: FrogPose }) {
  const outline = { fill: 'var(--frog)', stroke: 'var(--input)', strokeWidth: 8 };
  const bloom = { fill: 'var(--petal)', stroke: 'var(--input)', strokeWidth: 2.5 };
  const ink = { fill: 'var(--foreground)' };
  const stroke = { fill: 'none', stroke: 'var(--foreground)', strokeWidth: 5, strokeLinecap: 'round' as const };
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
  const parts = (
    <>
      <ellipse cx="128" cy="258" rx="42" ry="16" />
      <ellipse cx="272" cy="258" rx="42" ry="16" />
      <circle cx="142" cy="60" r="42" />
      <circle cx="258" cy="60" r="42" />
      <ellipse cx="200" cy="170" rx="118" ry="96" />
    </>
  );
  const happy = pose === 'done';
  const worried = pose === 'error';
  const lookX = pose === 'working' ? 5 : pose === 'curious' ? -4 : 0;
  return (
    <svg viewBox="-12 -12 424 354" aria-hidden="true" className={className} data-pose={pose}>
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
      <g className="fs-body">
        <g style={outline}>{parts}</g>
        <g style={{ fill: 'var(--frog)' }}>{parts}</g>
        <ellipse cx="200" cy="208" rx="74" ry="52" style={{ fill: 'var(--belly)' }} />
        {happy ? (
          <g style={stroke}>
            <path d="M120 66 q22 -26 44 0" />
            <path d="M236 66 q22 -26 44 0" />
          </g>
        ) : (
          <g className="fs-eyes">
            <circle cx={142 + lookX} cy={worried ? 66 : 62} r={worried ? 16 : 20} style={ink} />
            <circle cx={258 + lookX} cy={worried ? 66 : 62} r={worried ? 16 : 20} style={ink} />
            <circle cx={149 + lookX} cy="54" r="6" fill="#fff" />
            <circle cx={265 + lookX} cy="54" r="6" fill="#fff" />
          </g>
        )}
        {happy ? (
          <>
            <path d="M138 136 Q200 204 262 136 Z" style={{ fill: 'var(--foreground)' }} strokeLinejoin="round" stroke="var(--foreground)" strokeWidth="5" />
            <path d="M170 170 Q200 188 230 170 Q200 158 170 170Z" style={{ fill: 'var(--cheek)' }} />
          </>
        ) : worried ? (
          <path d="M146 158 Q173 138 200 154 Q227 170 254 150" style={stroke} />
        ) : (
          <path d="M138 140 Q200 176 262 140" style={stroke} />
        )}
        <ellipse cx="108" cy="150" rx="17" ry="11" style={{ fill: 'var(--cheek)' }} opacity={happy ? 1 : 0.85} />
        <ellipse cx="292" cy="150" rx="17" ry="11" style={{ fill: 'var(--cheek)' }} opacity={happy ? 1 : 0.85} />
        {worried && <path className="fs-drop" d="M312 40 q10 18 0 26 q-10 -8 0 -26z" style={{ fill: 'var(--tertiary, var(--accent))', stroke: 'var(--input)', strokeWidth: 2.5 }} />}
      </g>
      <g transform="translate(44 236)">{flower}</g>
      <g transform="translate(356 242) scale(.82)">{flower}</g>
      {happy && (
        <g style={bloom} className="fs-petals">
          <ellipse cx="90" cy="20" rx="7" ry="4" className="fs-petal" />
          <ellipse cx="200" cy="0" rx="7" ry="4" className="fs-petal" />
          <ellipse cx="310" cy="14" rx="7" ry="4" className="fs-petal" />
        </g>
      )}
    </svg>
  );
}
