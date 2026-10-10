import { useQuery } from '@tanstack/react-query'
import { useTRPC } from '@/utils/trpc'

const reais = (value: number) =>
  value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

/**
 * Crédito do cliente e valor da próxima fatura, lidos do Stripe (WEB-350).
 * Consulta própria, fora de `getMySubscription`: enquanto carrega, ou se o
 * Stripe falhar, não desenha nada e o card do plano aparece como sempre.
 */
export function BillingBalance() {
  const trpc = useTRPC()
  const { data } = useQuery({
    ...trpc.pub.getMyBillingBalance.queryOptions(),
    meta: { errorToast: false },
    retry: false
  })
  if (!data) return null
  const { creditReais, nextChargeReais } = data
  if (creditReais === null && nextChargeReais === null) return null

  return (
    <div className="onside-callout onside-callout-stone mb-4 flex-col gap-1 text-sm">
      {nextChargeReais !== null ? (
        <p>
          Valor da próxima cobrança:{' '}
          <span className="font-bold">{reais(nextChargeReais)}</span>
        </p>
      ) : null}
      {creditReais !== null ? (
        <p>
          Você tem <span className="font-bold">{reais(creditReais)}</span> de
          crédito; as próximas cobranças serão descontadas dele.
        </p>
      ) : null}
    </div>
  )
}
