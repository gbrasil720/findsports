import { useState } from 'react'
import { openSubscriptionCancel } from '@/lib/billing-client'

/**
 * Atalho para cancelar a assinatura (WEB-339). Quem cancela é o portal do
 * Stripe, aberto já no fluxo de cancelamento: o app só leva até lá, e o
 * webhook do agendamento põe o "Reativar assinatura" no lugar (WEB-335).
 */
export function CancelSubscriptionButton({ className }: { className: string }) {
  const [opening, setOpening] = useState(false)
  const [failed, setFailed] = useState(false)

  const handleOpenPortal = async () => {
    setOpening(true)
    setFailed(false)
    try {
      // Com URL na resposta o cliente do better-auth já está navegando para
      // o portal; ver `openBillingPortal`.
      if (await openSubscriptionCancel()) return
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
        {opening ? 'Abrindo portal…' : 'Cancelar assinatura'}
      </button>
      {failed ? (
        <span
          role="alert"
          className="w-full text-sm text-[var(--onside-live-text)]"
        >
          Não foi possível abrir o cancelamento. Use “Gerenciar assinatura”.
        </span>
      ) : null}
    </>
  )
}
