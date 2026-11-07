import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle
} from '@findsports_oficial/ui/components/dialog'
import { useRef } from 'react'
import type { ValidatedReservation } from '@/domain/reservation-validation'

type Props = {
  open: boolean
  reservation: Pick<ValidatedReservation, 'guestName'>
  onConfirm: () => void
  onCancel: () => void
  /** O mesmo diálogo desfaz a chegada no Quem vai do painel. */
  undo?: boolean
}

/**
 * Cada validação custa um brinde ao bar: o botão pede confirmação antes de
 * gravar, e o desfazer fica para o engano que passou mesmo assim.
 */
export function ArrivalConfirmDialog({
  open,
  reservation,
  onConfirm,
  onCancel,
  undo = false
}: Props) {
  const confirmRef = useRef<HTMLButtonElement>(null)

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel()
      }}
    >
      <DialogContent
        initialFocus={confirmRef}
        className="onside-dialog max-w-[calc(100vw-2rem)] p-6 sm:max-w-sm"
      >
        <DialogTitle className="onside-display text-2xl">
          {undo ? 'Desfazer a chegada?' : 'Validar o código?'}
        </DialogTitle>
        <DialogDescription className="mt-2 text-[var(--onside-ink)] text-sm">
          {undo
            ? `${reservation.guestName} volta para a lista de quem ainda não chegou. O código pode ser validado de novo.`
            : `Código de ${reservation.guestName}. A oferta da casa fica liberada.`}
        </DialogDescription>
        <div className="mt-6 flex flex-wrap gap-2">
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            className="onside-btn onside-btn-acid"
          >
            {undo ? 'Sim, desfazer' : 'Sim, validar'}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="onside-btn onside-btn-outline"
          >
            Cancelar
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
