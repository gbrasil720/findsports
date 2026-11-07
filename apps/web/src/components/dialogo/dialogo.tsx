import {
  type ReactNode,
  type RefObject,
  useEffect,
  useReducer,
  useRef,
  useState
} from 'react'
import { createPortal } from 'react-dom'

type Props = {
  open: boolean
  /** Esc, o fundo e quem chama pedem para fechar; quem decide é o `open`. */
  onClose: () => void
  labelledBy: string
  describedBy?: string
  /** Quem recebe o foco ao abrir (na ação destrutiva, o cancelar). */
  initialFocus?: RefObject<HTMLElement | null>
  /** Quem recebe o foco ao fechar, quando quem abriu já saiu da tela. */
  returnFocus?: RefObject<HTMLElement | null>
  /** Caixa mais larga, para formulário. */
  wide?: boolean
  children: ReactNode
}

/**
 * Diálogo do redesign (`dialogo.css`), o mesmo no painel e no torcedor. É um
 * `<dialog>` nativo aberto por `showModal`: vai para o top layer, então fica
 * por cima até de outra folha `<dialog>` (o jogo aberto no celular) e recebe
 * o toque. Vai num portal no `<body>`: dentro de `.tc` as classes curtas do
 * torcedor (`.grid`, `.btn`…) pegariam no conteúdo. O conteúdo só existe
 * aberto, então cada abertura começa do zero.
 */
export function Dialogo({
  open,
  onClose,
  labelledBy,
  describedBy,
  initialFocus,
  returnFocus,
  wide = false,
  children
}: Props) {
  const ref = useRef<HTMLDialogElement>(null)
  // O navegador pode fechar sozinho (Esc repetido); se quem chama não fechou,
  // a renderização seguinte abre de novo.
  const [, rerender] = useReducer((n: number) => n + 1, 0)
  // O `<body>` só existe no navegador: no servidor não sai nada.
  const [host, setHost] = useState<HTMLElement | null>(null)
  useEffect(() => setHost(document.body), [])

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) {
      dialog.showModal()
      initialFocus?.current?.focus()
    } else if (!open && dialog.open) {
      dialog.close()
      returnFocus?.current?.focus()
    }
  })

  if (!host) return null
  return createPortal(
    // biome-ignore lint/a11y/useKeyWithClickEvents: o Esc já fecha o `<dialog>` nativo; o clique é só o do fundo.
    <dialog
      ref={ref}
      className={wide ? 'dlg3 dlg3-lg' : 'dlg3'}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      // `cancel` e `close` de um `<dialog>` aninhado chegam aqui pela árvore do
      // React: só vale o deste.
      onCancel={(event) => {
        if (event.target !== ref.current) return
        event.preventDefault()
        onClose()
      }}
      onClose={(event) => {
        if (event.target === ref.current && open) {
          onClose()
          rerender()
        }
      }}
      onClick={(event) => {
        if (event.target === ref.current) onClose()
      }}
    >
      {open ? <div className="dlg3-in">{children}</div> : null}
    </dialog>,
    host
  )
}
