import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverTitle,
  PopoverTrigger
} from '@findsports_oficial/ui/components/popover'
import { getMetric, type MetricId } from './metric-glossary'

/**
 * O "i" ao lado de um rótulo de métrica (`hint` do design do painel), que
 * abre a explicação do glossário.
 *
 * Abre em clique/toque, não em hover: no celular hover não existe. O alvo de
 * toque de 44px vem do `::after` esticado, que não ocupa espaço no layout.
 */
export function MetricHint({ metric }: { metric: MetricId }) {
  const { label, definition } = getMetric(metric)

  return (
    <Popover>
      <PopoverTrigger
        aria-label={`O que significa "${label}"`}
        className="desemp-hint"
      >
        i
      </PopoverTrigger>
      <PopoverContent className="desemp-hint-pop origin-(--transform-origin) ease-(--onside-ease-out) data-open:zoom-in-95 data-closed:zoom-out-95">
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
