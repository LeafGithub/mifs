import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';
import { cn } from '../../lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2.5 whitespace-nowrap rounded-sm border font-display text-xs font-normal uppercase tracking-[0.14em] transition-colors disabled:pointer-events-none disabled:opacity-35 [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'border-primary bg-primary text-primary-foreground hover:bg-primary/85',
        secondary: 'border-input bg-transparent text-foreground hover:border-foreground',
        outline: 'border-input bg-transparent text-foreground hover:border-foreground',
        ghost: 'border-transparent text-muted-foreground hover:text-foreground',
      },
      size: { default: 'h-11 px-5', sm: 'h-10 px-4', lg: 'h-12 px-7' },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, ...props }, ref) => (
  <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
));
Button.displayName = 'Button';
