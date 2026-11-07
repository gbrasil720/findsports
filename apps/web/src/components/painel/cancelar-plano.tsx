import {
  CANCEL_REASONS,
  type CancelReasonId
} from '@findsports_oficial/db/cancel-reasons'
import { useMutation } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { Close } from '@/components/landing/v3/icons'
import { useTRPC } from '@/utils/trpc'

/*
 * "Cancelar assinatura" (WEB-339, WEB-445; 3q): antes do portal, "Por que
 * está cancelando?". Quem cancela é o portal do Stripe, aberto já no fluxo de
 * cancelamento: a URL vem de `pub.openSubscriptionCancel`, e não da rota do
 * plugin, que apaga o registro quando o Stripe recusa. O motivo é opcional,
 * gravado ao abrir o portal (é intenção), e só chega ao Stripe quando o
 * webhook vê o cancelamento feito.
 */

export function CancelarPlano({
  planName,
  until,
  className
}: {
  planName: string
  /** Fim do período pago: até lá o plano segue. */
  until: Date | null
  className: string
}) {
  const [aberto, setAberto] = useState(false)
  return (
    <>
      <button
        type="button"
        className={className}
        onClick={() => setAberto(true)}
      >
        Cancelar assinatura
      </button>
      {aberto ? (
        <Dialogo
          planName={planName}
          until={until}
          onClose={() => setAberto(false)}
        />
      ) : null}
    </>
  )
}

function Dialogo({
  planName,
  until,
  onClose
}: {
  planName: string
  until: Date | null
  onClose: () => void
}) {
  const trpc = useTRPC()
  const ref = useRef<HTMLDialogElement>(null)
  const manter = useRef<HTMLButtonElement>(null)
  const [reason, setReason] = useState<CancelReasonId | null>(null)
  const cancel = useMutation(
    trpc.pub.openSubscriptionCancel.mutationOptions({
      onSuccess: ({ url }) => {
        window.location.href = url
      }
    })
  )
  // Com a URL em mãos o navegador já está saindo: o botão não volta ao normal.
  const opening = cancel.isPending || cancel.isSuccess

  useEffect(() => {
    const dialog = ref.current
    if (dialog && !dialog.open) {
      dialog.showModal()
      // Abre no caminho seguro: manter o plano.
      manter.current?.focus()
    }
  }, [])

  const fim = until
    ? until.toLocaleDateString('pt-BR', {
        day: 'numeric',
        month: 'long',
        timeZone: 'America/Sao_Paulo'
      })
    : null

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: o Esc já fecha o `<dialog>` nativo; o clique é só o do fundo.
    <dialog
      ref={ref}
      className="pn-val pn-cancel"
      aria-labelledby="pn-cancel-t"
      onClose={onClose}
      onClick={(event) => {
        if (event.target === ref.current && !opening) onClose()
      }}
    >
      <div className="pn-val-in">
        <div className="pn-val-top">
          <div>
            <h2 className="pn-disp" id="pn-cancel-t">
              Cancelar o {planName}?
            </h2>
            <p>
              {fim
                ? `O plano fica ativo até ${fim}. Depois disso, o bar sai das buscas e do mapa.`
                : 'Depois do cancelamento, o bar sai das buscas e do mapa.'}
            </p>
          </div>
          <button
            type="button"
            className="pn-btn pn-ghost pn-ic"
            aria-label="Fechar"
            disabled={opening}
            onClick={onClose}
          >
            <Close size={18} />
          </button>
        </div>

        <fieldset className="pn-fl pn-cancel-why">
          <legend className="pn-fl-l">Por que está cancelando?</legend>
          <div className="pn-tchips">
            {CANCEL_REASONS.map((motivo) => (
              <button
                key={motivo.id}
                type="button"
                className="pn-tchip"
                aria-pressed={reason === motivo.id}
                disabled={opening}
                onClick={() =>
                  setReason(reason === motivo.id ? null : motivo.id)
                }
              >
                {motivo.label}
              </button>
            ))}
          </div>
          <span className="pn-hint">
            Opcional. O cancelamento é feito no portal do Stripe, no passo
            seguinte.
          </span>
        </fieldset>

        {cancel.isError ? (
          <p className="pn-ferr" role="alert">
            Não foi possível abrir o cancelamento. Tente de novo em instantes ou
            use “Gerenciar assinatura”.
          </p>
        ) : null}

        <div className="pn-acts pn-cancel-acts">
          <button
            type="button"
            className="pn-btn pn-ghost pn-danger"
            disabled={opening}
            onClick={() => cancel.mutate(reason ? { reason } : undefined)}
          >
            {opening
              ? 'Abrindo portal…'
              : cancel.isError
                ? 'Tentar de novo'
                : 'Cancelar mesmo assim'}
          </button>
          <button
            ref={manter}
            type="button"
            className="pn-btn pn-acid"
            disabled={opening}
            onClick={onClose}
          >
            Manter o {planName}
          </button>
        </div>
      </div>
    </dialog>
  )
}
