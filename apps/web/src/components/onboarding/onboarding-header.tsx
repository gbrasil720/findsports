import { Link } from '@tanstack/react-router'
import { OnsideBrand } from '@/components/brand/onside-brand'

type Props = {
  label: string
  mb?: string
}

export function OnboardingHeader({ label, mb = 'mb-8' }: Props) {
  return (
    <div
      className={`flex items-center justify-between gap-4 border-[var(--onside-line)] border-b pb-5 ${mb}`}
    >
      <Link to="/" className="inline-flex" aria-label="Onside — página inicial">
        <OnsideBrand />
      </Link>
      <div className="flex items-center gap-2 font-[family-name:var(--onside-mono)] text-[10px] font-bold text-[var(--onside-muted)] uppercase tracking-[0.16em]">
        <span className="onside-live-dot" aria-hidden="true" />
        {label}
      </div>
    </div>
  )
}
