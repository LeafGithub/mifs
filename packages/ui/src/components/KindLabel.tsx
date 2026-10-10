/** A bundle's origin in the active theme's voice: upstream/fork for HUD themes, official/community fork for friendly ones. */
export const KIND_HELP = 'A community fork is a copy of ModLoader maintained by someone other than its original author.';

export function KindLabel({ kind }: { kind: string }) {
  return (
    <>
      <span className="hud-only">{kind}</span>
      <span className="friendly-only">{kind === 'fork' ? 'community fork' : 'official'}</span>
    </>
  );
}
