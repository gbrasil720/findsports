import { cn } from '@findsports_oficial/ui/lib/utils'
import Loader from 'reicon-react/icons/Loader'

function Spinner({ className, ...props }: React.ComponentProps<'svg'>) {
  return (
    <Loader
      role="status"
      aria-label="Loading"
      size={16}
      color="currentColor"
      className={cn('size-4 animate-spin', className)}
      {...props}
    />
  )
}

export { Spinner }
