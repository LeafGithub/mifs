import { bundleClashes, satisfies, type BundleManifest } from '@mifs/core';
import { ArrowDown, ArrowUp, CircleAlert, FileSearch, Info, LoaderCircle, Plus, TriangleAlert, X } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Checkbox } from '../components/ui/checkbox';
import { SectionTitle } from '../components/ui/section-title';
import type { LocalMod } from '../platform';
import { cn, formatBytes } from '../lib/utils';
import { useApp, usableLocalMods } from '../store';

/** Above this, the page gets slow to open (base64 makes it about a third bigger again). */
const LARGE_TOTAL = 50 * 1024 * 1024;

interface Issue {
  text: string;
  /** Another of the user's mods that would fix it when turned on. */
  enable?: string;
}

const provides = (m: { name: string; aliases: string[] }, name: string) => m.name === name || m.aliases.includes(name);

/** What may go wrong in game for an enabled mod: dependencies nobody provides, or in the wrong version. */
function dependencyIssues(mod: LocalMod, manifest: BundleManifest, list: LocalMod[], usable: LocalMod[]): Issue[] {
  const issues: Issue[] = [];
  for (const d of mod.dependsOn) {
    if (d.name === 'GameVersion') continue;
    if (d.name === 'ModLoader') {
      if (satisfies(manifest.loader.version, d.range) === false) issues.push({ text: `needs ModLoader ${d.range}; this loader is ${manifest.loader.version}` });
      continue;
    }
    const bundled = manifest.mods.find((m) => provides(m, d.name));
    if (bundled) {
      if (satisfies(bundled.version, d.range) === false) issues.push({ text: `needs ${d.name} ${d.range}; the loader bundle has v${bundled.version}` });
      continue;
    }
    const own = list.find((m) => m.id !== mod.id && provides(m, d.name));
    if (!own) issues.push({ text: `needs ${d.name}, which is not in the loader bundle or your mods` });
    else if (!usable.includes(own)) issues.push(own.status === 'ok' && !own.enabled ? { text: `needs ${d.name}, which is turned off`, enable: own.id } : { text: `needs ${d.name}, which cannot be used right now` });
    else if (satisfies(own.version, d.range) === false) issues.push({ text: `needs ${d.name} ${d.range}; yours is v${own.version}` });
  }
  return issues;
}

/** The user's own mod zips: added once, remembered, embedded after the bundled mods. */
export function LocalMods() {
  const bundle = useApp((s) => s.bundles.find((b) => b.id === s.bundleId));
  const local = useApp((s) => s.localMods);
  const add = useApp((s) => s.addLocalMods);
  const drop = useApp((s) => s.dropLocalMods);
  const locate = useApp((s) => s.locateLocalMod);
  const toggle = useApp((s) => s.toggleLocalMod);
  const move = useApp((s) => s.moveLocalMod);
  const remove = useApp((s) => s.removeLocalMod);
  const dismiss = useApp((s) => s.dismissLocalMessages);
  const [dragging, setDragging] = useState(false);

  if (!bundle) return null;
  const manifest = bundle.manifest;
  const { list } = local;
  const usable = usableLocalMods(list, manifest);
  const total = usable.reduce((n, m) => n + m.size, 0);

  return (
    <section
      aria-labelledby="your-mods"
      className={cn('flex flex-col gap-3 rounded-sm outline-offset-4', dragging && 'outline-2 outline-dashed outline-primary')}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes('Files')) return;
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node | null) && setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        void drop([...e.dataTransfer.files]);
      }}
    >
      <SectionTitle id="your-mods">Your mods</SectionTitle>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="min-w-0 flex-1 basis-64 text-sm text-muted-foreground">
          {list.length === 0 ? 'Add .mod.zip files you downloaded, or drop them here. They are remembered for next time.' : `${usable.length} of ${list.length} on · ${formatBytes(total)}. They load after the bundled mods, top to bottom.`}
        </p>
        <Button variant="outline" size="sm" onClick={() => void add()} disabled={local.busy}>
          {local.busy ? <LoaderCircle className="animate-spin" /> : <Plus />} Add mod zips…
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">Mods you add run code inside your game. Only add mods from people you trust.</p>

      {(local.error || local.rejected.length > 0 || local.notices.length > 0) && (
        <div className="flex flex-col gap-1.5">
          {local.error && <Message tone="error">{local.error}</Message>}
          {local.rejected.map((r) => (
            <Message key={`${r.fileName}:${r.error}`} tone="error">
              {r.fileName}: {r.error}
            </Message>
          ))}
          {local.notices.map((n) => (
            <Message key={n} tone="note">
              {n}
            </Message>
          ))}
          <Button variant="ghost" size="sm" className="self-start" onClick={dismiss}>
            Dismiss
          </Button>
        </div>
      )}
      {total > LARGE_TOTAL && <Message tone="warning">Your mods add {formatBytes(total)}; the game page will be slow to open.</Message>}

      {list.length > 0 && (
        <Card className="divide-y">
          <ul aria-label="Your mods">
            {list.map((m, i) => {
              const clash = bundleClashes(manifest, m).map((id) => manifest.mods.find((x) => x.id === id)?.name ?? id);
              const on = usable.includes(m);
              const issues = on ? dependencyIssues(m, manifest, list, usable) : [];
              const requiredBy = on ? usable.filter((o) => o.id !== m.id && o.dependsOn.some((d) => provides(m, d.name))).map((o) => o.name) : [];
              const label = m.name || m.fileName;
              return (
                <li key={m.id} className={cn('flex items-start gap-3 px-4 py-2.5', m.status !== 'ok' && 'opacity-80')}>
                  <Checkbox
                    id={`local-${m.id}`}
                    className="mt-0.5"
                    aria-label={`Use ${label}`}
                    checked={on}
                    disabled={local.busy || m.status !== 'ok' || clash.length > 0 || requiredBy.length > 0}
                    onCheckedChange={(v) => void toggle(m.id, v === true)}
                  />
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <label htmlFor={`local-${m.id}`} className="flex flex-wrap items-center gap-2 text-sm font-medium">
                      {label}
                      {m.version && <span className="text-xs font-normal text-muted-foreground">v{m.version}</span>}
                    </label>
                    <span className="break-all text-xs text-muted-foreground">
                      {m.fileName}
                      {m.inside && ` › ${m.inside.name}`}
                    </span>
                    {m.error && <Line tone="error">{m.error}</Line>}
                    {clash.length > 0 && <Line tone="error">Already in the loader bundle ({clash.join(', ')}). The bundled copy is used; remove this one.</Line>}
                    {requiredBy.length > 0 && <Line tone="warning">required by {requiredBy.join(', ')}</Line>}
                    {m.warnings.map((w) => (
                      <Line key={w} tone="warning">
                        {w}
                      </Line>
                    ))}
                    {issues.map((iss) => (
                      <Line key={iss.text} tone="warning">
                        {iss.text}
                        {iss.enable && (
                          <button type="button" className="ml-2 underline underline-offset-2 hover:text-foreground" onClick={() => void toggle(iss.enable!, true)}>
                            Turn it on
                          </button>
                        )}
                      </Line>
                    ))}
                    {m.notes.map((n) => (
                      <Line key={n} tone="note">
                        {n}
                      </Line>
                    ))}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {m.status === 'ok' && <span className="mr-2 text-xs text-muted-foreground">{formatBytes(m.size)}</span>}
                    {m.status === 'missing' && (
                      <Button variant="outline" size="sm" className="h-8 px-3" onClick={() => void locate(m.id)} disabled={local.busy}>
                        <FileSearch /> Locate…
                      </Button>
                    )}
                    <IconButton label={`Move ${label} up`} disabled={local.busy || i === 0} onClick={() => void move(m.id, i - 1)}>
                      <ArrowUp />
                    </IconButton>
                    <IconButton label={`Move ${label} down`} disabled={local.busy || i === list.length - 1} onClick={() => void move(m.id, i + 1)}>
                      <ArrowDown />
                    </IconButton>
                    <IconButton label={`Remove ${label}`} disabled={local.busy} onClick={() => void remove(m.id)}>
                      <X />
                    </IconButton>
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </section>
  );
}

type Tone = 'error' | 'warning' | 'note';
const TONE = { error: 'text-destructive', warning: 'text-warning', note: 'text-primary' } as const;
const ICON = { error: CircleAlert, warning: TriangleAlert, note: Info } as const;

/** Per-row detail. Notes stay muted so they never read like the errors next to them. */
function Line({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  const Icon = ICON[tone];
  return (
    <span className={cn('flex items-start gap-1.5 text-xs', tone === 'note' ? 'text-muted-foreground' : TONE[tone])}>
      <Icon className="mt-px size-3 shrink-0" aria-hidden /> <span className="min-w-0 break-words">{children}</span>
    </span>
  );
}

function Message({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  const Icon = ICON[tone];
  return (
    <p role={tone === 'error' ? 'alert' : 'status'} className={cn('flex items-start gap-2 rounded-md px-3 py-2 text-sm', TONE[tone], tone === 'error' ? 'bg-destructive/10' : tone === 'warning' ? 'bg-warning/10' : 'bg-primary/10')}>
      <Icon className="mt-0.5 size-4 shrink-0" /> <span className="min-w-0 break-words">{children}</span>
    </p>
  );
}

function IconButton({ label, children, ...props }: { label: string; children: React.ReactNode; disabled?: boolean; onClick: () => void }) {
  return (
    <Button variant="ghost" size="sm" className="size-8 px-0" aria-label={label} title={label} {...props}>
      {children}
    </Button>
  );
}
