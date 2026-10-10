import { useMutation } from '@tanstack/react-query'
import { useTRPC } from '@/utils/trpc'

/**
 * Atalho para cancelar a assinatura (WEB-339). Quem cancela é o portal do
 * Stripe, aberto já no fluxo de cancelamento: o app só leva até lá, e o
 * webhook do agendamento põe o "Reativar assinatura" no lugar (WEB-335).
 *
 * A URL vem de uma rota nossa (`pub.openSubscriptionCancel`), e não da do
 * plugin do better-auth: aquela apaga o registro da assinatura quando o
 * Stripe a recusa.
 */
export function CancelSubscriptionButton({ className }: { className: string }) {
  const trpc = useTRPC()
  const open = useMutation(
    trpc.pub.openSubscriptionCancel.mutationOptions({
      onSuccess: ({ url }) => {
        window.location.href = url
      }
    })
  )
  // Com a URL em mãos o navegador já está saindo: o botão não volta ao normal.
  const opening = open.isPending || open.isSuccess

  return (
    <>
      <button
        type="button"
        onClick={() => open.mutate()}
        disabled={opening}
        className={className}
      >
        {opening ? 'Abrindo portal…' : 'Cancelar assinatura'}
      </button>
      {open.isError ? (
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
