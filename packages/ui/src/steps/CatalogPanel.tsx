import { CircleAlert, Cloud, Download, Info, KeyRound, LoaderCircle, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Progress } from '../components/ui/progress';
import { formatBytes } from '../lib/utils';
import { useApp } from '../store';

/** "Download a ready-made bundle" section of the loader step. Rendered only when the host has a catalog. */
export function CatalogPanel() {
  const c = useApp((s) => s.catalog);
  const load = useApp((s) => s.loadCatalog);
  const install = useApp((s) => s.installFromCatalog);
  const toggleSettings = useApp((s) => s.toggleCatalogSettings);

  const available = c.list?.entries.filter((e) => !e.installed) ?? [];
  // The newest official (non-pre-release) bundle is the one to recommend.
  const recommended = available.find((e) => e.kind === 'upstream' && !e.prerelease)?.id;

  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-medium">
          <Cloud className="size-4 text-muted-foreground" /> Download a ready-made bundle
          {c.list && <span className="text-xs font-normal text-muted-foreground">from {c.list.source}</span>}
        </h3>
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" onClick={toggleSettings} aria-expanded={c.settingsOpen}>
            <KeyRound /> Settings
          </Button>
          <Button variant="ghost" size="sm" onClick={load} disabled={c.loading || c.installing !== null} aria-label="Refresh the list">
            <RefreshCw className={c.loading ? 'animate-spin' : undefined} />
          </Button>
        </div>
      </div>

      {c.settingsOpen && <CatalogSettingsForm />}

      {c.error && (
        <p role="status" className="flex items-start gap-2 rounded-md bg-warning/10 px-3 py-2 text-sm text-warning">
          <Info className="mt-0.5 size-4 shrink-0" /> {c.error}
        </p>
      )}
      {c.actionError && (
        <p role="alert" className="flex items-start gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <CircleAlert className="mt-0.5 size-4 shrink-0" /> {c.actionError}
        </p>
      )}

      {c.loading && !c.list && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
          <LoaderCircle className="size-4 animate-spin" /> Looking for bundles…
        </p>
      )}

      {c.list && available.length === 0 && !c.error && (
        <p className="text-sm text-muted-foreground">{c.list.entries.length === 0 ? 'No bundles have been published yet.' : 'You have every published bundle.'}</p>
      )}

      <ul className="flex flex-col gap-2" aria-label="Available bundles">
        {available.map((e) => (
          <li key={e.id} className="flex flex-wrap items-center gap-3 rounded-md border px-3 py-2">
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
                ModLoader {e.version}
                {e.kind === 'fork' ? <Badge variant="warning">fork</Badge> : <Badge variant="primary">upstream</Badge>}
                {e.id === recommended && <Badge variant="success">recommended</Badge>}
              </span>
              <span className="text-xs text-muted-foreground">
                {e.modCount} mods · {formatBytes(e.bundleSize)} download · built {new Date(e.builtAt).toLocaleDateString()}
              </span>
            </div>
            {c.installing === e.id ? (
              <div className="flex w-48 flex-col gap-1" role="status">
                <Progress value={c.progress?.fraction ?? null} />
                <span className="truncate text-xs text-muted-foreground">{c.progress?.label ?? 'Starting…'}</span>
              </div>
            ) : (
              <Button variant={e.id === recommended ? 'default' : 'secondary'} size="sm" disabled={c.installing !== null} onClick={() => install(e.id)}>
                <Download /> Download
              </Button>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}

function CatalogSettingsForm() {
  const settings = useApp((s) => s.catalog.settings);
  const save = useApp((s) => s.saveCatalogSettings);
  const [repo, setRepo] = useState(settings?.repo ?? '');
  const [token, setToken] = useState('');

  return (
    <form
      className="flex flex-col gap-3 rounded-md bg-muted/40 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        void save({ repo, ...(token ? { token } : {}) }).then(() => setToken(''));
      }}
    >
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        Bundle repository
        <input value={repo} onChange={(e) => setRepo(e.target.value)} placeholder="owner/repo" className="h-8 rounded-md border bg-background px-2 text-sm text-foreground" />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        Access token {settings?.hasToken && <span className="text-success">(saved)</span>}
        <input
          type="password"
          autoComplete="off"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder={settings?.hasToken ? 'Leave empty to keep the saved token' : 'Only needed while the repository is private'}
          className="h-8 rounded-md border bg-background px-2 text-sm text-foreground"
        />
        <span>A read-only token for that repository. It is stored encrypted on this computer and never shown again.</span>
      </label>
      <div className="flex gap-2">
        <Button type="submit" size="sm">
          Save
        </Button>
        {settings?.hasToken && (
          <Button type="button" variant="ghost" size="sm" onClick={() => void save({ token: null })}>
            Remove saved token
          </Button>
        )}
      </div>
    </form>
  );
}
