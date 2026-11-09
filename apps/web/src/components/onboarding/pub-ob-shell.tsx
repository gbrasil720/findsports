import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { Check, Logo } from '@/components/landing/v3/icons'
import { ThemeSwitch } from '@/components/landing/v3/theme-switch'

/*
 * Casca do cadastro do bar no redesign (WEB-501; `cadastro()` do protótipo do
 * painel): logo, os passos e a troca de tema no topo; o passo à esquerda e,
 * quando há, a prévia "Assim o torcedor vê" à direita. Sem `steps`, só o topo
 * e o miolo (o comprovante). CSS em `onboarding-v3.css`.
 */
export function PubObShell({
  steps,
  step = 0,
  done,
  action,
  aside,
  wide,
  bleed,
  pill,
  tv,
  children
}: {
  steps?: readonly string[]
  step?: number
  /**
   * Quais passos foram feitos, quando pular é permitido (depois do "no ar"):
   * o passo pulado não ganha o visto. Sem isto, todo passo antes do atual é
   * feito.
   */
  done?: readonly boolean[]
  /** No topo, depois da troca de tema: "Ir para o painel". */
  action?: ReactNode
  aside?: ReactNode
  /** Página inteira, sem a coluna da direita (o passo "Plano"). */
  wide?: boolean
  /** Miolo de ponta a ponta, sem largura máxima nem margem (a tela "no ar"). */
  bleed?: boolean
  /** No topo, antes da troca de tema: o nome do bar em `/plan`. */
  pill?: ReactNode
  /** A coluna da direita vira o telão, sem o fundo claro (boas-vindas). */
  tv?: boolean
  children: ReactNode
}) {
  return (
    <div className="onside-app lp3 ent ob3 obb">
      <a className="onside-skip-link" href="#onboarding-main">
        Ir para o conteúdo
      </a>
      <header className="ob-head">
        <Link className="logo" to="/" aria-label="Onside, página inicial">
          <Logo size={26} />
          <b>
            ONSIDE<i></i>
          </b>
        </Link>
        {steps ? (
          <>
            <p className="sr-only" aria-live="polite">
              Passo {step + 1} de {steps.length} · {steps[step]}
            </p>
            <ol className="ob-steps" aria-hidden="true">
              {steps.map((name, i) => {
                const ok = i !== step && (done ? done[i] : i < step)
                return (
                  <li
                    key={name}
                    className={ok ? 'ok' : i === step ? 'on' : undefined}
                  >
                    <span>{ok ? <Check size={14} /> : i + 1}</span>
                    {name}
                    {i === step ? (
                      <em className="of">
                        {i + 1} de {steps.length}
                      </em>
                    ) : null}
                  </li>
                )
              })}
            </ol>
          </>
        ) : (
          <span className="sp" />
        )}
        {pill ? <span className="ob-pill">{pill}</span> : null}
        <ThemeSwitch variant="nav" />
        {action}
      </header>
      <div className={`ob-grid${aside ? '' : ' one'}`}>
        <main
          id="onboarding-main"
          className={`ob-main${wide ? ' wide' : ''}${bleed ? ' bleed' : ''}`}
        >
          {children}
        </main>
        {aside ? (
          <aside
            className={`ob-prev${tv ? ' tv' : ''}`}
            aria-label="Assim o torcedor vê"
          >
            <div className="ob-prev-in">{aside}</div>
          </aside>
        ) : null}
      </div>
    </div>
  )
}
