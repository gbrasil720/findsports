import type { AnnualDeal } from '@/lib/plan-catalog'
import { formatReais } from '@/lib/plan-catalog'

/*
 * Mensal ou anual em `/plan` (WEB-442). Toda frase sai da conta de
 * `annualDeal`: o anual é 10 meses do mensal que o bar pagaria, com o
 * desconto de fundador quando ele vale.
 */

type CycleProps = {
  deal: AnnualDeal | null
  annual: boolean
  available: boolean
  onChange: (annual: boolean) => void
}

/** O que o teste e o cupom fazem em cada ciclo, numa linha. */
export const cycleFacts = (founder: boolean) =>
  founder
    ? 'O teste grátis e o desconto de fundador valem nos dois.'
    : 'O teste grátis vale nos dois.'

/** A conta do anual no cartão do plano. */
export function AnnualVerdict({ deal }: { deal: AnnualDeal }) {
  return (
    <p className="pl-save">
      <b>Economize {formatReais(deal.savingsReais)}</b>
      <span>{formatReais(deal.perMonthReais)}/mês, pago uma vez por ano</span>
    </p>
  )
}

/**
 * O cabeçalho da tabela de planos (posição escolhida pelo dono, 14/11/2026):
 * o título à esquerda e o seletor à direita, com a economia do plano do bar
 * no "Anual".
 */
export function CycleHeader({ deal, annual, available, onChange }: CycleProps) {
  return (
    <div className="pl-head">
      <div>
        <p className="ob-k">Os planos</p>
        <h2>Pague por mês ou por ano</h2>
        {available ? (
          <p className="pl-head-note">{cycleFacts(Boolean(deal?.founder))}</p>
        ) : null}
      </div>
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
          <em>
            {!available
              ? 'EM BREVE'
              : deal
                ? `−${formatReais(deal.savingsReais)}`
                : '2 MESES GRÁTIS'}
          </em>
        </button>
      </fieldset>
    </div>
  )
}
