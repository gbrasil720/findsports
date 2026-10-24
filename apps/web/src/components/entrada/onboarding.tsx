import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { Avatar, Badge, Icone } from '@/components/painel'
import { Marca } from './auth'

export const PASSOS = [
  'Boas-vindas',
  'Estabelecimento',
  'Características',
  'Revisão'
] as const

/**
 * `obShell` do design: topo com a marca, os quatro passos e "Sair" (ou
 * "Pular", no passo opcional); embaixo, o formulário à esquerda e, à direita,
 * o painel em pedra com a prévia do que o torcedor vê.
 */
export function ObShell({
  passo,
  acao,
  lado,
  ladoFoto,
  children
}: {
  passo: number
  /** "Sair" ou "Pular", à direita do topo. */
  acao: ReactNode
  lado: ReactNode
  /** O lado direito é a foto (boas-vindas), sem o fundo de pedra. */
  ladoFoto?: boolean
  children: ReactNode
}) {
  return (
    <div className="onside-app painel entrada">
      <div className="entrada-ob">
        <header className="entrada-ob-topo">
          <Link to="/" aria-label="Onside — página inicial">
            <Marca altura={24} />
          </Link>
          <ol className="entrada-ob-passos" aria-label="Passos do cadastro">
            {PASSOS.map((nome, k) => (
              <li
                key={nome}
                data-feito={k <= passo || undefined}
                aria-current={k === passo ? 'step' : undefined}
              >
                <i aria-hidden="true" />
                <span>
                  {k + 1}. {nome}
                </span>
              </li>
            ))}
          </ol>
          {acao}
        </header>
        <div className="entrada-ob-corpo">
          <main className="entrada-ob-form">{children}</main>
          <aside className="entrada-ob-lado" data-foto={ladoFoto || undefined}>
            {lado}
          </aside>
        </div>
      </div>
    </div>
  )
}

/** "Assim o torcedor vê": o card do bar como sai no app (`prevCard`). */
export function Previa({
  nome,
  sub,
  foto,
  chips,
  extra
}: {
  nome: string
  sub: string
  foto?: boolean
  chips?: string[]
  extra?: ReactNode
}) {
  return (
    <div className="entrada-previa">
      <span className="entrada-previa-rotulo">Assim o torcedor vê</span>
      <div className="entrada-previa-card">
        {foto ? <div className="entrada-previa-foto" /> : null}
        <div className="entrada-previa-corpo">
          <div className="entrada-previa-bar">
            <Avatar nome={nome || 'Seu bar'} ativo tamanho={44} />
            <div>
              <b>{nome || 'Seu bar'}</b>
              <span>{sub}</span>
            </div>
          </div>
          {chips?.length ? (
            <div className="entrada-previa-chips">
              {chips.map((chip) => (
                <Badge key={chip} tipo="pub">
                  {chip}
                </Badge>
              ))}
            </div>
          ) : null}
          {extra}
        </div>
      </div>
    </div>
  )
}

/** O mapa da prévia do passo 2: o pino no meio, sem tiles (o bar ainda não tem ponto). */
export function MapaPrevia() {
  return (
    <div className="entrada-previa-mapa" aria-hidden="true">
      <span>
        <Icone nome="beer" tamanho={18} acento="var(--painel-ink)" base={0.3} />
      </span>
    </div>
  )
}
