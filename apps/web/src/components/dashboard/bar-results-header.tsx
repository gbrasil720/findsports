import { FireIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'

type Props = {
  count: number
}

export function BarResultsHeader({ count }: Props) {
  return (
    <div className="flex items-center justify-between mb-4">
      <h2 className="font-heading text-xl font-bold flex items-center gap-2">
        <HugeiconsIcon
          icon={FireIcon}
          size={20}
          color="currentColor"
          strokeWidth={1.5}
          className="text-brand-orange"
        />
        {count} resultado{count !== 1 ? 's' : ''}
      </h2>
    </div>
  )
}
