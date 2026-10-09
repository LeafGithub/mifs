import * as React from 'react';
import { cn } from '../../lib/utils';

export const Card = ({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('rounded-lg border bg-card text-card-foreground', className)} {...p} />
);
