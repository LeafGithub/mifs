import { useEffect, useState } from 'react';
import type { AppUpdate, Platform } from '../platform';

/** App version plus the self-update flow, at the foot of the rail. Renders nothing on hosts without updates. */
export function UpdateNotice({ platform }: { platform: Platform }) {
  const api = platform.update;
  const [u, setU] = useState<AppUpdate | null>(null);

  useEffect(() => {
    if (!api) return;
    let live = true;
    void api.get().then((v) => live && setU((cur) => cur ?? v), () => {});
    const off = api.onChange((v) => live && setU(v));
    return () => {
      live = false;
      off();
    };
  }, [api]);

  if (!api || !u) return null;
  const act = (fn: () => Promise<unknown>) => void fn().catch(() => {});
  const link = 'underline underline-offset-2 hover:text-foreground disabled:no-underline';

  let line: React.ReactNode = null;
  if (u.state === 'checking') line = 'Checking for updates…';
  else if (u.state === 'none') line = 'Up to date';
  else if (u.state === 'error') line = u.error ?? 'Could not check for updates.';
  else if (u.state === 'available')
    line = (
      <>
        Version {u.latest} is available.{' '}
        <button type="button" className={link} onClick={() => act(() => (u.selfUpdate ? api.download() : api.install()))}>
          {u.selfUpdate ? 'Download' : 'Open release page'}
        </button>
      </>
    );
  else if (u.state === 'downloading') line = `Downloading ${u.latest ?? 'update'}… ${Math.round((u.fraction ?? 0) * 100)}%`;
  else if (u.state === 'ready')
    line = (
      <>
        Version {u.latest} is ready.{' '}
        <button type="button" className={link} onClick={() => act(() => api.install())}>
          Restart to update
        </button>
      </>
    );

  return (
    <div className="mb-4 font-mono text-xs leading-snug tracking-[0.06em] text-muted-foreground" role="status">
      <p>
        Version {u.current}
        {u.state !== 'unsupported' && (u.state === 'idle' || u.state === 'none' || u.state === 'error') && (
          <>
            {' · '}
            <button type="button" className={link} onClick={() => act(() => api.check())}>
              Check for updates
            </button>
          </>
        )}
      </p>
      {line && <p className="mt-1">{line}</p>}
    </div>
  );
}
