import type { AnnualDeal, Plan } from '@/lib/plan-catalog'
import { formatReais } from '@/lib/plan-catalog'

/*
 * Mensal ou anual em `/plan` (WEB-442). Toda frase sai da conta de
 * `annualDeal`: "economize" só quando o anual sai mesmo mais barato que o
 * mensal que o bar pagaria. Com o desconto de fundador valendo, o mensal do
 * Starter e do Pro sai mais barato que o anual, e a tela diz isso.
 */

type CycleProps = {
  plan: Plan
  deal: AnnualDeal | null
  annual: boolean
  available: boolean
  onChange: (annual: boolean) => void
}

const wins = (deal: AnnualDeal | null) => Boolean(deal && deal.savingsReais > 0)

/** O que o teste e o cupom fazem em cada ciclo, numa linha. */
export const CYCLE_FACTS =
  'O teste grátis vale nos dois. O desconto de fundador é só do mensal.'

/** A conta do anual no cartão do plano. */
export function AnnualVerdict({ deal }: { deal: AnnualDeal }) {
  if (deal.savingsReais > 0) {
    return (
      <p className="pl-save">
        <b>Economize {formatReais(deal.savingsReais)}</b>
        <span>{formatReais(deal.perMonthReais)}/mês, pago uma vez por ano</span>
      </p>
    )
  }
  return (
    <p className="pl-save off">
      <b>Sem desconto de fundador</b>
      <span>
        No mensal, com o desconto, sai {formatReais(deal.monthlyReais)}/mês:
        menos que os {formatReais(deal.perMonthReais)}/mês do anual.
      </span>
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
    : wins(deal) && deal
      ? `ECONOMIZE ${formatReais(deal.savingsReais)} NO ${plan.name.toUpperCase()}`
      : 'PAGUE 10 MESES, USE 12'
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
