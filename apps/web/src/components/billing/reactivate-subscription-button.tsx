import { useState } from 'react'
import { openBillingPortal } from '@/lib/billing-client'

/**
 * Desfaz o cancelamento agendado (WEB-335). Quem reativa é o portal do Stripe,
 * o mesmo de "Gerenciar assinatura": o app só leva até lá, e o webhook da
 * reativação limpa o aviso.
 */
export function ReactivateSubscriptionButton({
  className
}: {
  className: string
}) {
  const [opening, setOpening] = useState(false)
  const [failed, setFailed] = useState(false)

  const handleOpenPortal = async () => {
    setOpening(true)
    setFailed(false)
    try {
      // Com URL na resposta o cliente do better-auth já está navegando para
      // o portal; ver `openBillingPortal`.
      if (await openBillingPortal()) return
      setFailed(true)
    } catch {
      setFailed(true)
    } finally {
      setOpening(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={handleOpenPortal}
        disabled={opening}
        className={className}
      >
        {opening ? 'Abrindo portal…' : 'Reativar assinatura'}
      </button>
      {failed ? (
        <span role="alert" className="text-[var(--onside-live-text)]">
          {' '}
          Não foi possível abrir o portal. Tente novamente.
        </span>
      ) : null}
    </>
  )
}
