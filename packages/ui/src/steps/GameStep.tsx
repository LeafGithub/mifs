import { CircleCheck, Download, FileUp, LoaderCircle } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Progress } from '../components/ui/progress';
import { SectionTitle } from '../components/ui/section-title';
import { cn, formatBytes } from '../lib/utils';
import { useApp } from '../store';

export function GameStep() {
  const adapters = useApp((s) => s.adapters);
  const game = useApp((s) => s.game);
  const busy = useApp((s) => s.gameBusy);
  const progress = useApp((s) => s.gameProgress);
  const pickFile = useApp((s) => s.pickGameFile);
  const fetchGame = useApp((s) => s.fetchGame);

  return (
    <div className="flex flex-col gap-6">
      {game && (
        <Card className="bracket flex items-center gap-3 border-primary bg-accent/80 p-4">
          <CircleCheck className="size-5 text-success" />
          <div className="min-w-0">
            <p className="truncate font-medium">{game.name}</p>
            <p className="font-mono text-xs tracking-[0.04em] text-muted-foreground">
              {formatBytes(game.size)} · {game.source === 'download' ? 'downloaded' : 'from your computer'}
            </p>
          </div>
        </Card>
      )}

      <section aria-labelledby="dl" className="flex flex-col gap-3">
        <SectionTitle id="dl">Download the latest release</SectionTitle>
        <ul className="flex flex-col gap-2">
          {adapters.map((a) => (
            <li key={a.id}>
              <Card className={cn('flex flex-col gap-2 px-4 py-3', busy === a.id && 'border-primary bg-accent/80')}>
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="font-medium">{a.name}</span>
                      {a.tags?.map((t) => (
                        <span key={t} className="rounded-full border border-border px-2 py-px font-mono text-[11px] tracking-[0.04em] text-muted-foreground">
                          {t}
                        </span>
                      ))}
                    </p>
                    <p className="truncate text-[13px] text-muted-foreground" title={a.description}>
                      {a.description}
                    </p>
                  </div>
                  <Button variant="secondary" size="sm" disabled={busy !== null} onClick={() => fetchGame(a.id)} className="shrink-0">
                    {busy === a.id ? <LoaderCircle className="animate-spin" /> : <Download />} Download
                  </Button>
                </div>
                {busy === a.id && (
                  <div className="flex flex-col gap-1.5" role="status">
                    <Progress value={progress?.fraction ?? null} />
                    <span className="font-mono text-xs text-muted-foreground">{progress?.label ?? 'Starting…'}</span>
                  </div>
                )}
              </Card>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="file" className="flex flex-col gap-3">
        <SectionTitle id="file">Or use a file you already have</SectionTitle>
        <div>
          <Button variant="outline" disabled={busy !== null} onClick={pickFile}>
            {busy === 'file' ? <LoaderCircle className="animate-spin" /> : <FileUp />} Choose game .html or .zip…
          </Button>
        </div>
      </section>
    </div>
  );
}
