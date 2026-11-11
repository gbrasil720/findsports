import { gameTitle } from '@findsports_oficial/db/game-title'
import { useEffect, useRef } from 'react'
import { countLabel } from '@/lib/plural'
import type { AdminEvent } from './admin-model'

type Deletion = AdminEvent['deletion']

const list = new Intl.ListFormat('pt-BR', { type: 'conjunction' })

/**
 * Por que o jogo não pode ser excluído e o que dá para fazer hoje (WEB-252);
 * `null` quando pode. O servidor confere de novo em `pub.deleteEvent`: isto é
 * só o aviso antes do clique.
 */
export function getDeleteBlock(
  deletion: Deletion
): { reason: string; wayOut: string[] } | null {
  if (!deletion) return null
  const { pendingReservations, confirmedReservations, ratings } = deletion
  const reasons: string[] = []
  const wayOut: string[] = []
  if (pendingReservations > 0) {
    reasons.push(
      countLabel(
        pendingReservations,
        'pedido antigo de reserva',
        'pedidos antigos de reserva'
      )
    )
    wayOut.push('Pedido antigo de reserva expira sozinho no fim do jogo.')
  }
  if (confirmedReservations > 0) {
    reasons.push(
      countLabel(
        confirmedReservations,
        'código de quem vai',
        'códigos de quem vai'
      )
    )
    wayOut.push(
      'Quem marcou “Vou assistir aqui” já tem o código: só a pessoa desmarca, até o início do jogo.'
    )
  }
  if (ratings > 0) {
    reasons.push(countLabel(ratings, 'avaliação', 'avaliações'))
    wayOut.push(
      'Avaliações ficam no histórico do seu bar e não podem ser apagadas.'
    )
  }
  if (reasons.length === 0) return null
  return { reason: `Este jogo tem ${list.format(reasons)}.`, wayOut }
}

/**
 * O que a exclusão apaga junto; `null` quando não há nada. Do interesse sai
 * só a menção: o bar nunca vê quantos marcaram (ADR 0003, "Presença").
 */
export function getDeleteConsequences(deletion: Deletion): string | null {
  if (!deletion) return null
  const items: string[] = []
  if (deletion.closedReservations > 0) {
    items.push(
      `${countLabel(
        deletion.closedReservations,
        'código desmarcado',
        'códigos desmarcados'
      )} (de quem desistiu de ir)`
    )
  }
  if (deletion.hasAttendance) {
    items.push('o interesse que os torcedores marcaram neste jogo')
  }
  return items.length > 0 ? `Também apaga ${list.format(items)}.` : null
}

type Props = {
  event: AdminEvent
  isDeleting: boolean
  error?: string
  onConfirm: () => void
  onCancel: () => void
}

/**
 * Excluir jogo pede confirmação e diz o que vai junto. Jogo com código ativo
 * ou avaliação não é excluído: o diálogo explica o motivo em vez de confirmar.
 * Caixa do painel novo (`.pn-confirm`, WEB-501), um `<dialog>` nativo.
 */
export function EventDeleteDialog({
  event,
  isDeleting,
  error,
  onConfirm,
  onCancel
}: Props) {
  const ref = useRef<HTMLDialogElement>(null)
  // Ação destrutiva: o foco começa em quem não apaga nada.
  const cancelRef = useRef<HTMLButtonElement>(null)
  const block = getDeleteBlock(event.deletion)
  const consequences = getDeleteConsequences(event.deletion)
  const title = gameTitle({
    ...event,
    participants: event.participants.map((item) => item.team.name)
  })

  useEffect(() => {
    const dialog = ref.current
    if (dialog && !dialog.open) {
      dialog.showModal()
      cancelRef.current?.focus()
    }
  }, [])

  return (
    <dialog
      ref={ref}
      className="pn-confirm"
      aria-labelledby="pn-confirm-t"
      aria-describedby="pn-confirm-d"
      onClose={onCancel}
    >
      <h2 id="pn-confirm-t" className="pn-disp">
        {block ? 'Este jogo não pode ser excluído' : 'Excluir este jogo?'}
      </h2>
      <p id="pn-confirm-d">
        {block
          ? `${title}. ${block.reason}`
          : `${title} sai da sua grade e do seu perfil. Não dá para desfazer.`}
      </p>
      {block ? (
        <ul>
          {block.wayOut.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : consequences ? (
        <p>{consequences}</p>
      ) : null}
      {!block && error ? (
        <p className="pn-ferr" role="alert">
          {error}
        </p>
      ) : null}
      <div className="pn-confirm-a">
        {block ? null : (
          <button
            type="button"
            onClick={onConfirm}
            disabled={isDeleting}
            className="pn-btn pn-danger pn-sm"
          >
            {isDeleting ? 'Excluindo…' : 'Excluir jogo'}
          </button>
        )}
        <button
          ref={cancelRef}
          type="button"
          onClick={onCancel}
          className="pn-btn pn-ghost pn-sm"
        >
          {block ? 'Entendi' : 'Cancelar'}
        </button>
      </div>
    </dialog>
  )
}
