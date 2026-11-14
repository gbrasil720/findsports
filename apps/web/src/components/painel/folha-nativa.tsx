import { type ReactNode, useEffect, useRef } from 'react'

/**
 * Folha do painel num `<dialog>` nativo aberto por `showModal` (camada de
 * cima, foco preso, Esc do navegador). É a peça de folha como `Dialogo` é a
 * de caixa: toda folha nativa do painel passa por aqui.
 *
 * O React repassa `close` e `cancel` de um `<dialog>` de dentro (a
 * confirmação do "Desfazer", mesmo num portal no `<body>`) para os
 * `<dialog>` acima dele na árvore. Por isso só fecha a folha o fechamento
 * dela mesma (`event.target`), senão confirmar a caixa fecharia a folha junto
 * (WEB-515).
 */
export function FolhaNativa({
  open = true,
  onClose,
  onOpen,
  closeOnBackdrop = true,
  className,
  children,
  ...aria
}: {
  /** Sem `open`, a folha abre ao montar e fecha ao sair da tela. */
  open?: boolean
  /** Esc, o fundo e o fechamento pelo navegador pedem para fechar. */
  onClose: () => void
  /** Logo depois do `showModal`, para levar o foco a outro lugar. */
  onOpen?: (dialog: HTMLDialogElement) => void
  /** Falso enquanto a folha não pode fechar pelo fundo (ação em curso). */
  closeOnBackdrop?: boolean
  className: string
  'aria-label'?: string
  'aria-labelledby'?: string
  children: ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)
  // `onOpen` costuma ser uma função nova a cada renderização: não reabre.
  const onOpenRef = useRef(onOpen)
  onOpenRef.current = onOpen

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) {
      dialog.showModal()
      onOpenRef.current?.(dialog)
    }
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: o Esc já fecha o `<dialog>` nativo; o clique é só o do fundo.
    <dialog
      ref={ref}
      className={className}
      {...aria}
      onClose={(event) => {
        if (event.target === ref.current) onClose()
      }}
      onClick={(event) => {
        if (event.target === ref.current && closeOnBackdrop) onClose()
      }}
    >
      {children}
    </dialog>
  )
}
