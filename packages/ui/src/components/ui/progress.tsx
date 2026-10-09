import { Progress as Primitive } from 'radix-ui';
import { cn } from '../../lib/utils';

/** `value` 0..1, or null for an indeterminate bar. */
export function Progress({ value, className }: { value: number | null; className?: string }) {
  return (
    <Primitive.Root
      value={value === null ? null : Math.round(value * 100)}
      className={cn('relative h-2 w-full overflow-hidden rounded-full bg-muted', className)}
    >
      <Primitive.Indicator
        className={cn('h-full rounded-full bg-primary transition-all', value === null && 'w-1/3 animate-pulse')}
        style={value === null ? undefined : { width: `${Math.round(value * 100)}%` }}
      />
    </Primitive.Root>
  );
}
