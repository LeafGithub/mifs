import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';
import { cn } from '../../lib/utils';

const badgeVariants = cva('inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium', {
  variants: {
    variant: {
      default: 'border-transparent bg-muted text-muted-foreground',
      primary: 'border-transparent bg-primary/15 text-primary',
      warning: 'border-transparent bg-warning/15 text-warning',
      success: 'border-transparent bg-success/15 text-success',
      outline: 'text-muted-foreground',
    },
  },
  defaultVariants: { variant: 'default' },
});

export const Badge = ({ className, variant, ...p }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) => (
  <span className={cn(badgeVariants({ variant }), className)} {...p} />
);
