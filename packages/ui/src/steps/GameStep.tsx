import { CircleCheck, Download, FileUp, LoaderCircle } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Progress } from '../components/ui/progress';
import { formatBytes } from '../lib/utils';
import { useApp } from '../store';

export function GameStep() {
  const adapters = useApp((s) => s.adapters);
  const game = useApp((s) => s.game);
  const busy = useApp((s) => s.gameBusy);
  const progress = useApp((s) => s.gameProgress);
  const pickFile = useApp((s) => s.pickGameFile);
  const fetchGame = useApp((s) => s.fetchGame);

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-muted-foreground">
        Choose the game to install ModLoader into. The original file is never changed; a new <code>.mod.html</code> is written.
      </p>

      {game && (
        <Card className="flex items-center gap-3 border-primary bg-accent p-4">
          <CircleCheck className="size-5 text-success" />
          <div className="min-w-0">
            <p className="truncate font-medium">{game.name}</p>
            <p className="text-xs text-muted-foreground">
              {formatBytes(game.size)} · {game.source === 'download' ? 'downloaded' : 'from your computer'}
            </p>
          </div>
        </Card>
      )}

      <section aria-labelledby="dl" className="flex flex-col gap-2">
        <h3 id="dl" className="text-sm font-medium">
          Download the latest release
        </h3>
        <div className="grid gap-2 sm:grid-cols-2">
          {adapters.map((a) => (
            <Card key={a.id} className="flex flex-col gap-3 p-4">
              <div>
                <p className="font-medium">{a.name}</p>
                <p className="text-xs text-muted-foreground">{a.description}</p>
              </div>
              {busy === a.id ? (
                <div className="flex flex-col gap-1" role="status">
                  <Progress value={progress?.fraction ?? null} />
                  <span className="text-xs text-muted-foreground">{progress?.label ?? 'Starting…'}</span>
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

      <section aria-labelledby="file" className="flex flex-col gap-2">
        <h3 id="file" className="text-sm font-medium">
          Or use a file you already have
        </h3>
        <div>
          <Button variant="outline" disabled={busy !== null} onClick={pickFile}>
            {busy === 'file' ? <LoaderCircle className="animate-spin" /> : <FileUp />} Choose game .html or .zip…
          </Button>
        </div>
      </section>
    </div>
  );
}
