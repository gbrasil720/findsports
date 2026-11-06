import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import Eye from 'reicon-react/icons/Eye'
import { Check, Logo } from '@/components/landing/v3/icons'
import { ThemeSwitch } from '@/components/landing/v3/theme-switch'

/*
 * Casca das telas de entrada no redesign (WEB-501; design no artifact
 * NuZvuastPHQG4DasJdhqzA): o formulário à esquerda e o telão parado à
 * direita, com uma legenda ou um quadro de cartões. Dentro de `.lp3`, então o
 * aviso de cookies e os botões são os da landing. CSS em `entrada-v3.css`.
 */

type Led = 'hero' | 'crowd' | 'scarf'

export type AuthPanel =
  | {
      kind: 'caption'
      led: Led
      badge?: ReactNode
      title: ReactNode
      items?: string[]
    }
  | {
      kind: 'board'
      led: Led
      kicker: string
      title: ReactNode
      cards: [string, string][]
    }

function Panel({ panel }: { panel: AuthPanel }) {
  return (
    <aside className="ent-right" aria-hidden="true">
      {/* biome-ignore lint/performance/noImgElement: pôster estático do telão, de public/landing/v3, com width e height. */}
      <img
        src={`/landing/v3/led-${panel.led}.webp`}
        alt=""
        width="1920"
        height="1280"
      />
      {panel.kind === 'caption' ? (
        <>
          {panel.badge ? <span className="ent-live">{panel.badge}</span> : null}
          <div className="ent-cap">
            <b>{panel.title}</b>
            {panel.items?.length ? (
              <ul>
                {panel.items.map((item) => (
                  <li key={item}>
                    <Check />
                    {item}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </>
      ) : (
        <div className="ent-board">
          <div>
            <p className="ent-bk">{panel.kicker}</p>
            <p className="ent-bt">{panel.title}</p>
          </div>
          <div className="ent-cards">
            {panel.cards.map(([title, text], index) => (
              <div key={title}>
                <i>{String(index + 1).padStart(2, '0')}</i>
                <b>{title}</b>
                <span>{text}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </aside>
  )
}

export function AuthShell({
  panel,
  className,
  children
}: {
  panel: AuthPanel
  /** Classe a mais na raiz: o onboarding do torcedor usa a casca (`ob3`). */
  className?: string
  children: ReactNode
}) {
  return (
    <div className={`onside-app lp3 ent${className ? ` ${className}` : ''}`}>
      <div className="ent-split">
        <main className="ent-left">
          <div className="ent-top">
            <Link className="logo" to="/" aria-label="Onside, página inicial">
              <Logo size={28} />
              <b>
                ONSIDE<i></i>
              </b>
            </Link>
            <ThemeSwitch variant="nav" />
          </div>
          <div className="ent-form">{children}</div>
        </main>
        {/* A chave remonta o telão quando a imagem troca (passos do onboarding),
            para a troca entrar com o fade em vez de pular. */}
        <Panel key={panel.led} panel={panel} />
      </div>
    </div>
  )
}

/**
 * Ver sem conta, agir com conta (decisão de 05/11/2026): quem só quer olhar a
 * grade de hoje não precisa criar conta. Leva à landing, com os jogos de
 * hoje, até o Explorar aberto sem conta existir.
 */
export function VisitorLink() {
  return (
    <div className="ent-visit">
      <div className="ent-or">
        <span>ou</span>
      </div>
      <Link className="btn btn-ghost ent-full" to="/">
        <Eye size={20} color="currentColor" aria-hidden="true" />
        Continuar como visitante
      </Link>
      <p className="ent-hint">
        Veja os jogos e os bares de hoje sem conta. Para marcar que vai, você
        entra depois.
      </p>
    </div>
  )
}
