import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverTitle,
  PopoverTrigger
} from '@findsports_oficial/ui/components/popover'
import CircleInfo from 'reicon-react/icons/CircleInfo'
import { getMetric, type MetricId } from './metric-glossary'

/**
 * Ícone ⓘ ao lado de um rótulo de métrica.
 *
 * Abre em clique/toque (não em hover): o painel é usado majoritariamente no
 * celular, onde hover não existe.
 *
 * O gatilho é inline de propósito. `.onside-label` é `display: block` com
 * especificidade maior que a dos utilitários do Tailwind, então um `flex` no
 * elemento do rótulo seria descartado sem aviso. O alvo de toque de 44px vem
 * do `::after` esticado, que não ocupa espaço no layout.
 */
export function MetricHint({
  metric,
  className
}: {
  metric: MetricId
  className?: string
}) {
  const { label, definition } = getMetric(metric)

  return (
    <Popover>
      <PopoverTrigger
        aria-label={`O que significa "${label}"`}
        className={
          'relative ml-1.5 inline-flex size-6 shrink-0 cursor-pointer items-center justify-center align-middle text-[var(--onside-ink)] opacity-50 transition-opacity after:absolute after:-inset-2.5 after:content-[""] hover:opacity-100' +
          (className ? ` ${className}` : '')
        }
      >
        <CircleInfo size={14} color="currentColor" aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent className="onside-hint w-72 p-4">
        <PopoverTitle className="mb-2 font-[family-name:var(--onside-mono)] font-semibold text-[11px] uppercase leading-tight tracking-[0.12em]">
          {label}
        </PopoverTitle>
        <PopoverDescription className="text-sm leading-relaxed opacity-80">
          {definition}
        </PopoverDescription>
      </PopoverContent>
    </Popover>
  )
}
