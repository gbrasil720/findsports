import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle
} from '@findsports_oficial/ui/components/dialog'
import { Link } from '@tanstack/react-router'
import { type RefObject, useRef } from 'react'
import { formatCode } from '@/domain/my-games'

type Props = {
  code: string
  /** A oferta copiada na emissão do código. */
  offer?: string | null
  onClose: () => void
  /** Quem abriu o diálogo: o foco volta para lá ao fechar. */
  returnFocus?: RefObject<HTMLElement | null>
}

/**
 * O código do balcão logo depois do "Vou assistir aqui" num bar Elite. Na
 * linha embaixo do botão ele passava despercebido; aqui ele vem grande, com o
 * que fazer com ele e onde achá-lo depois (Meus jogos, `/dashboard/games`).
 */
export function AttendanceCodeDialog({
  code,
  offer = null,
  onClose,
  returnFocus
}: Props) {
  const closeRef = useRef<HTMLButtonElement>(null)

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      <DialogContent
        initialFocus={closeRef}
        finalFocus={returnFocus}
        className="onside-dialog flex max-h-[calc(100dvh-2rem)] max-w-[calc(100vw-2rem)] flex-col overflow-y-auto p-6 sm:max-w-md"
      >
        <p className="onside-kicker onside-kicker-live">Presença marcada</p>
        <DialogTitle className="onside-display text-2xl">
          Seu código para o balcão
        </DialogTitle>

        <div className="mt-4 border-[1.5px] border-[var(--onside-ink)] px-4 py-5 text-center">
          <p
            aria-hidden="true"
            className="font-[family-name:var(--onside-mono)] font-bold text-4xl tracking-[0.2em] sm:text-5xl"
          >
            {formatCode(code)}
          </p>
          {/* Lido letra a letra: "A7K·29" de uma vez sai como palavra. */}
          <p className="sr-only">Código: {code.split('').join(' ')}</p>
        </div>

        <DialogDescription className="mt-4 text-[var(--onside-ink)] text-sm">
          Mostre este código no balcão do bar no dia do jogo para ganhar a
          oferta da casa. Ele vale uma vez só.
        </DialogDescription>
        {offer ? (
          <p className="mt-2 text-sm [overflow-wrap:anywhere]">
            <span className="font-semibold">Oferta da casa:</span> {offer}
          </p>
        ) : null}
        <p className="mt-3 text-[var(--onside-muted)] text-sm">
          Não precisa anotar: ele fica guardado em <strong>Meus jogos</strong>,
          no menu da sua conta, e também aqui na página do bar.
        </p>

        <div className="mt-6 flex flex-wrap gap-2">
          <Link to="/dashboard/games" className="onside-btn onside-btn-ink">
            Ver em Meus jogos
          </Link>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="onside-btn onside-btn-outline"
          >
            Fechar
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
