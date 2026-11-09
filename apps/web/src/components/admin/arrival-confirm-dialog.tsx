import { useId, useRef } from 'react'
import { Dialogo } from '@/components/dialogo/dialogo'
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
  const id = useId()
  const confirmRef = useRef<HTMLButtonElement>(null)

  return (
    <Dialogo
      open={open}
      onClose={onCancel}
      labelledBy={`${id}-t`}
      describedBy={`${id}-d`}
      initialFocus={confirmRef}
    >
      <h2 id={`${id}-t`} className="dlg3-t">
        {undo ? 'Desfazer a chegada?' : 'Validar o código?'}
      </h2>
      <p id={`${id}-d`} className="dlg3-p">
        {undo
          ? `${reservation.guestName} volta para a lista de quem ainda não chegou. O código pode ser validado de novo.`
          : `Código de ${reservation.guestName}. A oferta da casa fica liberada.`}
      </p>
      <div className="dlg3-a">
        <button
          ref={confirmRef}
          type="button"
          onClick={onConfirm}
          className={`pn-btn pn-sm ${undo ? 'pn-ink' : 'pn-acid'}`}
        >
          {undo ? 'Sim, desfazer' : 'Sim, validar'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="pn-btn pn-sm pn-ghost"
        >
          Cancelar
        </button>
      </div>
    </Dialogo>
  )
}
