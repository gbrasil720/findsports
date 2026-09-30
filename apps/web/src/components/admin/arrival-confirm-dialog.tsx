import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle
} from '@findsports_oficial/ui/components/dialog'
import { useRef } from 'react'
import {
  getCounterLabel,
  type ValidatedReservation
} from '@/domain/reservation-validation'

type Props = {
  open: boolean
  reservation: ValidatedReservation
  onConfirm: () => void
  onCancel: () => void
}

/**
 * Cada chegada custa um brinde ao bar: o `+1` pede confirmação antes de
 * gravar, e o desfazer fica para o engano que passou mesmo assim.
 */
export function ArrivalConfirmDialog({
  open,
  reservation,
  onConfirm,
  onCancel
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
          Registrar chegada?
        </DialogTitle>
        <DialogDescription className="mt-2 text-[var(--onside-ink)] text-sm">
          Reserva de {reservation.guestName}. Com esta chegada ficam{' '}
          {getCounterLabel(reservation.usedCount + 1, reservation.maxUses)}.
        </DialogDescription>
        <div className="mt-6 flex flex-wrap gap-2">
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            className="onside-btn onside-btn-acid min-h-12 px-5 text-sm"
          >
            Confirmar chegada
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="onside-btn onside-btn-outline min-h-12 px-4 text-xs"
          >
            Cancelar
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
