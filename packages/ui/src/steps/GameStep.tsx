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
        <div className="grid gap-2.5 sm:grid-cols-2">
          {adapters.map((a) => (
            <Card key={a.id} className={cn('flex min-h-36 flex-col justify-between gap-4 p-5', busy === a.id && 'border-primary bg-accent/80')}>
              <div>
                <p className="text-base font-medium">{a.name}</p>
                <p className="text-[13px] text-muted-foreground">{a.description}</p>
              </div>
              {busy === a.id ? (
                <div className="flex flex-col gap-2" role="status">
                  <Progress value={progress?.fraction ?? null} />
                  <span className="font-mono text-xs text-muted-foreground">{progress?.label ?? 'Starting…'}</span>
                </div>
              ) : (
                <Button variant="secondary" size="sm" disabled={busy !== null} onClick={() => fetchGame(a.id)} className="self-start">
                  <Download /> Download
                </Button>
              )}
            </Card>
          ))}
        </div>
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
