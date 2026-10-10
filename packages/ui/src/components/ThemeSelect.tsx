import { THEMES, type Theme } from '../themes';
import { fieldClass } from './ui/field';

/** Rail-footer picker for the bundled themes. */
export function ThemeSelect({ theme, onChange }: { theme: Theme; onChange: (id: string) => void }) {
  return (
    <div className="mt-4 flex items-center justify-between gap-3 border-t pt-4">
      <label htmlFor="theme" className="font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">
        Theme
      </label>
      <select
        id="theme"
        value={theme.id}
        onChange={(e) => onChange(e.target.value)}
        className={`min-w-0 flex-1 ${fieldClass}`}
      >
        {THEMES.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
    </div>
  );
}
