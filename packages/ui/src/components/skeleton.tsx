import { cn } from '@findsports_oficial/ui/lib/utils'

function Skeleton({ className, ...props }: React.ComponentProps<'span'>) {
  return (
    <span
      data-slot="skeleton"
      className={cn('block animate-pulse rounded-none bg-muted', className)}
      aria-hidden="true"
      {...props}
    />
  )
}

export { Skeleton }
