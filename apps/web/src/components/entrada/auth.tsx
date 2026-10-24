import type { AnyFieldApi } from '@tanstack/form-core'
import { Link } from '@tanstack/react-router'
import { type InputHTMLAttributes, type ReactNode, useState } from 'react'
import { changeAuthField } from '@/components/auth-field-change'
import { Campo, Icone, type IconeNome } from '@/components/painel'
import painelCss from '@/components/painel/painel.css?url'
import { pageHead } from '@/lib/page-head'
import entradaCss from './entrada.css?url'

/** Estilos das telas de entrada: os do painel e os daqui. */
export const ENTRADA_LINKS = [
  { rel: 'stylesheet', href: painelCss },
  { rel: 'stylesheet', href: entradaCss }
]

/** `pageHead` com os estilos das telas de entrada. */
export function entradaHead(page: Parameters<typeof pageHead>[0]) {
  const head = pageHead(page)
  return { ...head, links: [...head.links, ...ENTRADA_LINKS] }
}

/** O wordmark da Onside (tinta; vira papel no escuro ou sobre a foto). */
export function Marca({
  altura = 26,
  sobreFoto
}: {
  altura?: number
  sobreFoto?: boolean
}) {
  return (
    <img
      src="/onside-wordmark-paper.png"
      alt=""
      width={Math.round(altura * 3.3)}
      height={altura}
      className="entrada-marca"
      data-sobre-foto={sobreFoto || undefined}
      style={{ height: altura }}
    />
  )
}

/** Título em Anton; cada linha de `linhas` quebra, a de `tint` em destaque. */
export function Disp({
  linhas,
  tamanho,
  nivel = 1,
  className
}: {
  linhas: { texto: ReactNode; tint?: boolean }[]
  tamanho: number
  nivel?: 1 | 2 | 0
  className?: string
}) {
  const conteudo = linhas.map((linha, i) => (
    // biome-ignore lint/suspicious/noArrayIndexKey: linhas fixas do título
    <span key={i} className={linha.tint ? 'entrada-tint' : undefined}>
      {linha.texto}
    </span>
  ))
  const props = {
    className: `entrada-disp${className ? ` ${className}` : ''}`,
    style: { '--entrada-disp': `${tamanho}px` } as React.CSSProperties
  }
  if (nivel === 1) return <h1 {...props}>{conteudo}</h1>
  if (nivel === 2) return <h2 {...props}>{conteudo}</h2>
  return <p {...props}>{conteudo}</p>
}

/**
 * `authSplit` do design: a foto do bar com a marca e "PARA BARES" à esquerda,
 * o formulário de 420 px à direita. No celular sobra o formulário.
 */
export function AuthSplit({
  foto,
  children
}: {
  foto: ReactNode
  children: ReactNode
}) {
  return (
    <div className="onside-app painel entrada">
      <div className="entrada-split">
        <aside className="entrada-foto">
          <div className="entrada-foto-topo">
            <Link to="/" aria-label="Onside — página inicial">
              <Marca altura={28} sobreFoto />
            </Link>
            <span className="entrada-para-bares">PARA BARES</span>
          </div>
          <div className="entrada-foto-texto">{foto}</div>
        </aside>
        <main className="entrada-form-lado">
          <div className="entrada-form-topo">
            <Link to="/" aria-label="Onside — página inicial">
              <Marca altura={24} />
            </Link>
            <span className="entrada-para-bares">PARA BARES</span>
          </div>
          <div className="entrada-form">{children}</div>
        </main>
      </div>
    </div>
  )
}

/** Os quatro itens do lado da foto no cadastro. */
export function ItensFoto({
  itens
}: {
  itens: readonly (readonly [IconeNome, string])[]
}) {
  return (
    <div className="entrada-foto-itens">
      {itens.map(([icone, texto]) => (
        <div key={texto}>
          <Icone
            nome={icone}
            tamanho={24}
            base={0.35}
            acento="var(--painel-acid)"
          />
          {texto}
        </div>
      ))}
    </div>
  )
}

type CampoFormProps = {
  field: AnyFieldApi
  rotulo: string
  aside?: ReactNode
  fim?: ReactNode
} & Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'value' | 'onChange' | 'onBlur' | 'name'
>

/** `Campo` do painel ligado a um campo do TanStack Form, com o erro embaixo. */
export function CampoForm({
  field,
  rotulo,
  aside,
  fim,
  id,
  ...input
}: CampoFormProps) {
  const erro = field.state.meta.errors[0] as string | undefined
  return (
    <Campo
      id={id ?? field.name}
      name={field.name}
      rotulo={rotulo}
      aside={aside}
      fim={fim}
      value={field.state.value}
      onBlur={field.handleBlur}
      onChange={(e) => changeAuthField(field, e.target.value)}
      aria-invalid={erro ? true : undefined}
      className={erro ? 'entrada-campo-erro' : undefined}
      dica={
        erro ? (
          <span className="entrada-erro" role="alert">
            {erro}
          </span>
        ) : undefined
      }
      {...input}
    />
  )
}

/** Campo de senha com "Mostrar" à direita, como no design. */
export function CampoSenha(
  props: Omit<CampoFormProps, 'type' | 'fim'> & { children?: ReactNode }
) {
  const [mostrar, setMostrar] = useState(false)
  return (
    <CampoForm
      {...props}
      type={mostrar ? 'text' : 'password'}
      fim={
        <button
          type="button"
          className="entrada-campo-fim"
          aria-label={mostrar ? 'Ocultar senha' : 'Mostrar senha'}
          onClick={() => setMostrar((v) => !v)}
        >
          {mostrar ? 'Ocultar' : 'Mostrar'}
        </button>
      }
    />
  )
}

/** "É torcedor? A Onside para torcedores agora é só no app." */
export function CardTorcedor() {
  return (
    <Link to="/torcedor" className="entrada-torcedor">
      <img src="/onside-app-icon.png" alt="" width={40} height={40} />
      <div>
        <b>É torcedor?</b>A Onside para torcedores agora é só no app.
      </div>
      <span aria-hidden="true">Baixar →</span>
    </Link>
  )
}

const FORCA = ['Fraca', 'Fraca', 'Média', 'Boa', 'Forte'] as const

/**
 * Força da senha para os quatro traços do cadastro: um ponto por regra
 * (8+ caracteres, letra e número, maiúscula ou símbolo, 12+ caracteres).
 * Só um retrato para quem digita; quem decide é o mínimo do servidor.
 */
export function forcaSenha(senha: string) {
  if (!senha) return { tracos: 0, rotulo: '' }
  const tracos = [
    senha.length >= 8,
    /[a-z]/i.test(senha) && /\d/.test(senha),
    /[A-Z]/.test(senha) || /[^a-z0-9]/i.test(senha),
    senha.length >= 12
  ].filter(Boolean).length
  return { tracos, rotulo: FORCA[tracos] }
}

export function ForcaSenha({ senha }: { senha: string }) {
  const { tracos, rotulo } = forcaSenha(senha)
  return (
    <div className="entrada-forca" aria-live="polite">
      {[0, 1, 2, 3].map((i) => (
        <i key={i} data-on={i < tracos || undefined} />
      ))}
      <span>{rotulo ? `${rotulo}` : ''}</span>
    </div>
  )
}
