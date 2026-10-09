import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle
} from '@findsports_oficial/ui/components/dialog'
import { useRef } from 'react'
import { getGameTitle } from '@/domain/reservation-validation'
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
        'pedido de reserva pendente',
        'pedidos de reserva pendentes'
      )
    )
    wayOut.push('Recuse os pedidos pendentes na aba Reservas.')
  }
  if (confirmedReservations > 0) {
    reasons.push(
      countLabel(
        confirmedReservations,
        'reserva confirmada',
        'reservas confirmadas'
      )
    )
    wayOut.push(
      'Reserva confirmada não pode ser desfeita pelo bar: só o torcedor cancela, até o início do jogo.'
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
        'reserva encerrada',
        'reservas encerradas'
      )} (recusadas, canceladas ou sem resposta)`
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
 * Excluir jogo pede confirmação e diz o que vai junto. Jogo com reserva ativa
 * ou avaliação não é excluído: o diálogo explica o motivo em vez de confirmar.
 */
export function EventDeleteDialog({
  event,
  isDeleting,
  error,
  onConfirm,
  onCancel
}: Props) {
  // Ação destrutiva: o foco começa em quem não apaga nada.
  const cancelRef = useRef<HTMLButtonElement>(null)
  const block = getDeleteBlock(event.deletion)
  const consequences = getDeleteConsequences(event.deletion)
  const title = getGameTitle({
    ...event,
    participants: event.participants.map((item) => item.team.name)
  })

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) onCancel()
      }}
    >
      <DialogContent
        initialFocus={cancelRef}
        className="onside-dialog max-w-[calc(100vw-2rem)] p-6 sm:max-w-sm"
      >
        <DialogTitle className="onside-display text-2xl">
          {block ? 'Este jogo não pode ser excluído' : 'Excluir este jogo?'}
        </DialogTitle>
        <DialogDescription className="mt-2 text-[var(--onside-ink)] text-sm">
          {block
            ? `${title}. ${block.reason}`
            : `${title} sai da sua grade e do seu perfil. Não dá para desfazer.`}
        </DialogDescription>
        {block ? (
          <ul className="mt-3 space-y-1 text-[var(--onside-ink)] text-sm">
            {block.wayOut.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        ) : (
          consequences && (
            <p className="mt-3 text-[var(--onside-ink)] text-sm">
              {consequences}
            </p>
          )
        )}
        {!block && error ? (
          <p className="onside-field-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="mt-6 flex flex-wrap gap-2">
          {block ? null : (
            <button
              type="button"
              onClick={onConfirm}
              disabled={isDeleting}
              className="onside-btn onside-btn-danger min-h-12 px-5 text-sm disabled:opacity-50"
            >
              {isDeleting ? 'Excluindo…' : 'Excluir jogo'}
            </button>
          )}
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className="onside-btn onside-btn-outline min-h-12 px-4 text-xs"
          >
            {block ? 'Entendi' : 'Cancelar'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
