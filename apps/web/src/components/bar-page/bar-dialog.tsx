import { type ReactNode, useEffect, useRef } from 'react'

/** `<dialog>` nativo: foco preso, Esc e fundo vêm do navegador. */
export function Dialog({
  className,
  label,
  onClose,
  children
}: {
  className: string
  label: string
  onClose: () => void
  children: ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current
    if (dialog && !dialog.open) dialog.showModal()
  }, [])
  return (
    <dialog
      ref={ref}
      className={`bp-layer ${className}`}
      aria-label={label}
      onClose={onClose}
      onClick={(event) => {
        // Só o clique no fundo fecha: o próprio <dialog> recebe o clique no
        // seu padding, então a conta é pela caixa.
        const box = ref.current?.getBoundingClientRect()
        if (
          event.target === ref.current &&
          box &&
          (event.clientX < box.left ||
            event.clientX > box.right ||
            event.clientY < box.top ||
            event.clientY > box.bottom)
        )
          ref.current?.close()
      }}
      onKeyDown={() => {}}
    >
      {children}
    </dialog>
  )
}
