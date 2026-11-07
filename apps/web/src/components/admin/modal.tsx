import { type ReactNode, useId } from 'react'
import Close from 'reicon-react/icons/Xmark'
import { Dialogo } from '@/components/dialogo/dialogo'

type Props = {
  title: string
  children: ReactNode
  open: boolean
  onClose: () => void
}

export function Modal({ title, children, open, onClose }: Props) {
  const id = useId()
  return (
    <Dialogo open={open} onClose={onClose} labelledBy={id} wide>
      <div className="dlg3-h">
        <h2 id={id} className="dlg3-t">
          {title}
        </h2>
        <button
          type="button"
          className="pn-btn pn-ghost pn-ic"
          aria-label="Fechar"
          onClick={onClose}
        >
          <Close size={18} color="currentColor" aria-hidden="true" />
        </button>
      </div>
      {children}
    </Dialogo>
  )
}
