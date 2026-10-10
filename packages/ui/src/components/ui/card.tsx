import * as React from 'react';
import { cn } from '../../lib/utils';

export const Card = ({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('relative rounded-sm border bg-card/90 text-card-foreground', className)} {...p} />
);
