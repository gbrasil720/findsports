import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import ArrowRight from 'reicon-react/icons/ArrowRight'
import { OnsideBrand, OnsideMark } from '@/components/brand/onside-brand'

const YEAR = new Date().getFullYear()

type Props = {
  /** Rótulo curto acima do título, na cor `live`. */
  kicker: string
  /** O título quebra em duas linhas fixas: o ponto vermelho fecha a segunda. */
  titleTop: string
  titleBottom: string
  lead: ReactNode
  /** Linha de placar no rodapé — o dado que resume o estado. */
  score: ReactNode
  /** Dimensões reais do arquivo: reservam o espaço certo e evitam distorção. */
  visual: { src: string; width: number; height: number }
  /** Ações da tela: `InviteStateCta` para agir, `Link` + `INVITE_ACTION` para sair. */
  children: ReactNode
}

/**
 * Convite inutilizável ocupa a página inteira (ONS-25).
 *
 * O que existia antes era uma linha de erro de campo dentro do formulário de
 * ativação — estado terminal renderizado como se fosse corrigível ali mesmo.
 * Aqui não há campo nenhum: o estado é a manchete, e toda tela sai com pelo
 * menos uma saída clicável.
 */
export function InviteStatePage({
  kicker,
  titleTop,
  titleBottom,
  lead,
  score,
  visual,
  children
}: Props) {
  return (
    <div className="onside-page onside-invite-state">
      <a className="onside-invite-skip" href="#invite-state-main">
        Pular para o conteúdo
      </a>

      <div className="onside-invite-frame">
        <header className="onside-invite-header">
          <Link
            to="/"
            className="onside-invite-brand"
            aria-label="Onside — página inicial"
          >
            <OnsideBrand />
          </Link>
          <p className="onside-invite-label">
            <span className="onside-live-dot" aria-hidden="true" />
            Ativação de convite
          </p>
        </header>

        <main
          id="invite-state-main"
          className="onside-invite-main"
          aria-live="polite"
        >
          <div className="onside-invite-copy">
            <p className="onside-invite-kicker">{kicker}</p>
            <h1 className="onside-invite-title">
              {titleTop}
              <br />
              <span className="onside-invite-title-line">
                {titleBottom}
                <span className="onside-invite-dot" aria-hidden="true" />
              </span>
            </h1>
            <p className="onside-invite-lead">{lead}</p>
            <div className="onside-invite-actions">{children}</div>
          </div>

          <div className="onside-invite-visual" aria-hidden="true">
            {/* biome-ignore lint/performance/noImgElement: static public brand asset */}
            <img
              src={visual.src}
              alt=""
              width={visual.width}
              height={visual.height}
              decoding="async"
            />
          </div>
        </main>

        <footer className="onside-invite-footer">
          <p className="onside-invite-score">
            <OnsideMark size={22} />
            <span>{score}</span>
          </p>
          <p className="onside-invite-legal">
            Onside © {YEAR}
            <span aria-hidden="true"> • </span>
            Todos os direitos reservados
          </p>
        </footer>
      </div>
    </div>
  )
}

/** Ação primária que executa algo na própria tela (reenviar, tentar de novo). */
export function InviteStateCta({
  label,
  onClick,
  disabled,
  tone = 'live'
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  tone?: 'live' | 'acid'
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={
        tone === 'acid' ? INVITE_ACTION.primaryAcid : INVITE_ACTION.primary
      }
    >
      {label}
      <InviteStateArrow />
    </button>
  )
}

/**
 * Classes das ações que navegam.
 *
 * Ficam como constante em vez de um wrapper em volta do `Link`: envolver o
 * componente exigiria repassar os genéricos que a árvore de rotas usa para
 * validar `to`, e o atalho para isso seria um `any` que apaga justamente essa
 * checagem. O ponto de uso monta o `Link` de verdade.
 */
export const INVITE_ACTION = {
  primary: 'onside-invite-cta',
  primaryAcid: 'onside-invite-cta onside-invite-cta-acid',
  secondary: 'onside-invite-secondary'
} as const

/** Seta que fecha qualquer ação da tela. */
export function InviteStateArrow({ size = 16 }: { size?: number }) {
  return (
    <span className="onside-invite-cta-icon" aria-hidden="true">
      <ArrowRight size={size} aria-hidden="true" focusable="false" />
    </span>
  )
}
