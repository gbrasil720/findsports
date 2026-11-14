import type { AnnualDeal, Plan } from '@/lib/plan-catalog'
import { formatReais } from '@/lib/plan-catalog'

/*
 * Mensal ou anual em `/plan` (WEB-442). Toda frase sai da conta de
 * `annualDeal`: o anual é 10 meses do mensal que o bar pagaria, com o
 * desconto de fundador quando ele vale.
 */

type CycleProps = {
  plan: Plan
  deal: AnnualDeal | null
  annual: boolean
  available: boolean
  onChange: (annual: boolean) => void
}

/** O que o teste e o cupom fazem em cada ciclo, numa linha. */
export const CYCLE_FACTS =
  'O teste grátis e o desconto de fundador valem nos dois.'

/** A conta do anual no cartão do plano. */
export function AnnualVerdict({ deal }: { deal: AnnualDeal }) {
  return (
    <p className="pl-save">
      <b>Economize {formatReais(deal.savingsReais)}</b>
      <span>{formatReais(deal.perMonthReais)}/mês, pago uma vez por ano</span>
    </p>
  )
}

/** O seletor, com a economia do plano do bar no "Anual". */
export function CycleToggle({
  plan,
  deal,
  annual,
  available,
  onChange
}: CycleProps) {
  const chip = !available
    ? 'EM BREVE'
    : deal
      ? `ECONOMIZE ${formatReais(deal.savingsReais)} NO ${plan.name.toUpperCase()}`
      : '2 MESES GRÁTIS'
  return (
    <div className="pl-cyc-wrap">
      <fieldset className="pl-cyc">
        <legend className="sr-only">Cobrança</legend>
        <button
          type="button"
          aria-pressed={!annual}
          onClick={() => onChange(false)}
        >
          Mensal
        </button>
        <button
          type="button"
          className="yr"
          aria-pressed={annual}
          disabled={!available}
          onClick={() => onChange(true)}
        >
          Anual
          <em>{chip}</em>
        </button>
      </fieldset>
      {available ? <p className="pl-cyc-note">{CYCLE_FACTS}</p> : null}
    </div>
  )
}
