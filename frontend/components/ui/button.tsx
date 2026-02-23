import * as React from 'react'
import { cn } from '@/lib/utils'

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'destructive' | 'outline' | 'ghost'
  size?: 'default' | 'sm' | 'icon'
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'default', ...props }, ref) => {
    const base = 'inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-colors focus-visible:outline-none disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-4 [&_svg]:shrink-0'

    const variants: Record<string, string> = {
      default: 'bg-text-bright text-void hover:bg-text-main rounded',
      destructive: 'text-rose hover:bg-rose/10 rounded',
      outline: 'border border-line-subtle text-text-main hover:bg-hover rounded',
      ghost: 'text-text-dim hover:text-text-main hover:bg-hover rounded',
    }

    const sizes: Record<string, string> = {
      default: 'h-9 px-4',
      sm: 'h-8 px-3 text-xs',
      icon: 'h-8 w-8',
    }

    return (
      <button
        className={cn(base, variants[variant], sizes[size], className)}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = 'Button'

export { Button }
