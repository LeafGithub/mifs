import { Progress as Primitive } from 'radix-ui';
import { cn } from '../../lib/utils';

/** `value` 0..1, or null for indeterminate. A thin track with a glowing head. */
export function Progress({ value, className, ...rest }: { value: number | null; className?: string; 'aria-label'?: string }) {
  const pct = value === null ? null : Math.round(value * 100);
  return (
    <Primitive.Root {...rest} value={pct} className={cn('relative my-1 h-0.5 w-full bg-input', className)}>
      <Primitive.Indicator
        className={cn('h-full bg-primary shadow-[0_0_12px_var(--primary)] transition-all', value === null && 'w-1/3 animate-pulse')}
        style={value === null ? undefined : { width: `${pct}%` }}
      />
      {pct !== null && (
        <span
          aria-hidden
          className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--glow-core)] shadow-[0_0_14px_3px_var(--primary)] transition-all"
          style={{ left: `${pct}%` }}
        />
      )}
    </Primitive.Root>
  );
}
