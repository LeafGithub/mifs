import { Check } from 'lucide-react';
import { Checkbox as Primitive } from 'radix-ui';
import * as React from 'react';
import { cn } from '../../lib/utils';

export const Checkbox = React.forwardRef<React.ComponentRef<typeof Primitive.Root>, React.ComponentPropsWithoutRef<typeof Primitive.Root>>(
  ({ className, ...props }, ref) => (
    <Primitive.Root
      ref={ref}
      className={cn(
        'peer grid size-4 shrink-0 place-content-center rounded-sm border border-input bg-background transition-colors data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    >
      <Primitive.Indicator>
        <Check className="size-3" strokeWidth={3} />
      </Primitive.Indicator>
    </Primitive.Root>
  ),
);
Checkbox.displayName = 'Checkbox';
