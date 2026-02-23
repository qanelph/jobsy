import * as React from 'react'
import { cn } from '@/lib/utils'

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          'w-full min-h-[80px] bg-panel border border-line-faint rounded px-3 py-2 text-sm text-text-main',
          'placeholder:text-text-dim',
          'focus:outline-none focus:border-line-subtle',
          'disabled:opacity-40 disabled:cursor-not-allowed',
          'resize-y',
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Textarea.displayName = 'Textarea'

export { Textarea }
