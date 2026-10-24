import type { SubscriptionPlan } from '@findsports_oficial/db'
import {
  Dialog,
  DialogContent,
  DialogTitle
} from '@findsports_oficial/ui/components/dialog'
import { PortalProvider } from '@findsports_oficial/ui/components/portal'
import { Link } from '@tanstack/react-router'
import {
  type CSSProperties,
  type ReactNode,
  type RefObject,
  useRef
} from 'react'
import { BotaoIcone, Icone } from '@/components/painel'

/*
 * Os estilos estão em `planos.css`, ligado no `head` de cada rota que usa estas
 * peças (`/plan`, `/plan/confirmed`, `/admin/billing`): importado aqui, ele só
 * chegava depois da hidratação, e no celular a tabela sem estilo alargava a
 * página antes de ganhar a rolagem própria.
 */

/** Cor da estrela de cada plano na medalha (`medal` do design). */
const ESTRELA: Record<SubscriptionPlan, string> = {
  starter: '#b88a5a',
  pro: 'var(--painel-acid)',
  elite: 'var(--painel-live-fill)'
}

export function Medalha({
  plano,
  tamanho = 44
}: {
  plano: SubscriptionPlan
  tamanho?: number
}) {
  return (
    <span
      className="pl-medalha"
      data-plano={plano}
      style={{ '--pl-medalha': `${tamanho}px` } as CSSProperties}
    >
      <Icone
        nome="medal"
        tamanho={Math.round(tamanho * 0.62)}
        acento={ESTRELA[plano]}
        base={0.35}
      />
    </span>
  )
}

/**
 * `/plan` e `/plan/confirmed` ficam fora do shell do painel, com o cabeçalho
 * do design (marca à esquerda, `aside` à direita), mas com os mesmos tokens e
 * o mesmo tema claro/escuro. A raiz é o contêiner dos portais, para os
 * diálogos herdarem os tokens.
 */
export function PlanosFrame({
  aside,
  children
}: {
  aside?: ReactNode
  children: ReactNode
}) {
  const portal = useRef<HTMLDivElement>(null)
  return (
    <PortalProvider container={portal}>
      <div ref={portal} className="onside-app painel pl-frame">
        <a className="onside-skip-link" href="#main-content">
          Ir para o conteúdo
        </a>
        <header className="pl-topo">
          <Link
            to="/admin"
            className="painel-logo"
            aria-label="Onside — painel"
          >
            <img
              src="/onside-wordmark-paper.png"
              alt=""
              width={79}
              height={24}
            />
          </Link>
          {aside}
        </header>
        <main id="main-content" className="flex-1">
          {children}
        </main>
      </div>
    </PortalProvider>
  )
}

/**
 * Diálogo do painel (3j, 3q): título em Anton à esquerda, fechar redondo à
 * direita. `inicio` é o foco inicial (o botão que não muda nada).
 */
export function PainelModal({
  titulo,
  tamanhoTitulo = 34,
  subtitulo,
  icone,
  largura,
  inicio,
  onClose,
  children
}: {
  titulo: ReactNode
  /** Tamanho do título em px (34 na confirmação, 44 no cancelamento). */
  tamanhoTitulo?: number
  /** Linha abaixo do título ("Bar do Zé · mensal"). */
  subtitulo?: ReactNode
  /** O que vai à esquerda do título (a medalha do plano). */
  icone?: ReactNode
  largura?: number
  inicio?: RefObject<HTMLElement | null>
  onClose: () => void
  children: ReactNode
}) {
  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      <DialogContent
        initialFocus={inicio}
        className="pl-modal"
        style={
          largura
            ? ({ '--pl-modal-w': `${largura}px` } as CSSProperties)
            : undefined
        }
      >
        <div
          className={`flex gap-3.5 ${icone ? 'items-center' : 'items-start'}`}
        >
          {icone}
          <div className="min-w-0 flex-1">
            <DialogTitle
              className="painel-disp"
              style={
                { '--painel-disp-size': `${tamanhoTitulo}px` } as CSSProperties
              }
            >
              {titulo}
            </DialogTitle>
            {subtitulo ? (
              <p className="mt-0.5 text-[13.5px] text-[var(--painel-muted)]">
                {subtitulo}
              </p>
            ) : null}
          </div>
          <BotaoIcone icone="x" rotulo="Fechar" onClick={onClose} />
        </div>
        {children}
      </DialogContent>
    </Dialog>
  )
}
