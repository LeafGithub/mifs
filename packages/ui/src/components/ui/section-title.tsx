import * as React from 'react';

/** Small mono caption with a hairline running to the edge. */
export const SectionTitle = ({ id, children }: { id?: string; children: React.ReactNode }) => (
  <h2 id={id} className="flex items-center gap-3.5 font-mono text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground after:h-px after:flex-1 after:bg-border">
    {children}
  </h2>
);
