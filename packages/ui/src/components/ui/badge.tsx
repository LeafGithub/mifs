import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';
import { cn } from '../../lib/utils';

const badgeVariants = cva('inline-flex items-center rounded-sm border px-1.5 py-0.5 font-mono text-xs uppercase leading-tight tracking-[0.16em]', {
  variants: {
    variant: {
      default: 'border-input text-muted-foreground',
      outline: 'border-border text-muted-foreground',
      upstream: 'border-success text-success',
      warning: 'border-warning text-warning',
      selected: 'border-primary bg-primary font-medium text-primary-foreground',
    },
  },
  defaultVariants: { variant: 'default' },
});

export const Badge = ({ className, variant, ...p }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) => (
  <span className={cn(badgeVariants({ variant }), className)} {...p} />
);
