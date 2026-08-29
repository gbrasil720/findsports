import type { ComponentType, ReactNode } from 'react'

type Props = {
  icon: ComponentType<{
    size?: number | string
    color?: string
    'aria-hidden'?: boolean | 'true' | 'false'
  }>
  title: string
  description: string
  action: ReactNode
}

export function AccountActionRow({
  icon: Icon,
  title,
  description,
  action
}: Props) {
  return (
    <div className="flex flex-col gap-4 border-[var(--onside-line)] border-b py-5 last:border-b-0 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <div className="grid size-10 shrink-0 place-items-center border border-[var(--onside-line)] bg-[var(--onside-stone)]">
          <Icon size={17} color="currentColor" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <h3 className="font-bold text-sm">{title}</h3>
          <p className="mt-1 break-words text-[var(--onside-muted)] text-xs leading-relaxed">
            {description}
          </p>
        </div>
      </div>
      <div className="shrink-0 sm:self-center">{action}</div>
    </div>
  )
}
