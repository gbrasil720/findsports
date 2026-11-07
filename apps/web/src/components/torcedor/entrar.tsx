import { Link, useLocation, useNavigate } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { useTurnstile } from '@/components/turnstile'
import { authClient } from '@/lib/auth-client'
import { PENDING_VERIFICATION_KEY } from '@/lib/pending-verification'
import {
  createTwoFactorChallenge,
  TWO_FACTOR_CHALLENGE_KEY
} from '@/lib/two-factor-challenge'
import { getUserFacingMessage } from '@/lib/user-facing-error'
import { withCallbackUrl } from '@/utils/callback-url'
import { type Acao, comAcao } from './acao'
import { Ic, type IconName } from './icones'

/*
 * A folha de entrar do protótipo (`.sheet`): pede login no lugar da ação que
 * grava e guarda o contexto (o bar, o jogo). Entrando por aqui, a ação sai
 * logo depois, sem trocar de página; cadastro, 2FA e onboarding levam a ação
 * na URL (`acao.ts`).
 */

export type TipoPedido = 'vou' | 'fav' | 'lembrar' | 'entrar'

export type Pedido = {
  tipo: TipoPedido
  acao?: Acao
  contexto?: {
    foto?: string | null
    hora?: string
    titulo: string
    sub: string
  }
}

const TITULO: Record<TipoPedido, string> = {
  vou: 'Entre para marcar presença',
  fav: 'Entre para salvar este bar',
  lembrar: 'Entre para receber o lembrete',
  entrar: 'Entre na Onside'
}
const BOTAO: Record<TipoPedido, string> = {
  vou: 'Entrar e marcar presença',
  fav: 'Entrar e salvar',
  lembrar: 'Entrar e me lembrar',
  entrar: 'Entrar'
}
const ICONES: IconName[] = ['ticket', 'people', 'star']
const PORQUE: Record<TipoPedido, [string, string][]> = {
  vou: [
    ['Código do balcão', 'Nos bares Elite, libera a oferta da casa.'],
    [
      'Seus amigos veem que você vai',
      'Só quem é seu amigo, e só se você deixar.'
    ],
    ['Sua avaliação vale', 'Depois do jogo, você diz se voltaria.']
  ],
  fav: [
    ['Seus bares num lugar só', 'Veja a semana de jogos dos bares salvos.'],
    ['Aviso quando passar seu time', 'Num bar que você salvou, perto de você.'],
    ['Funciona no web e no app', 'A mesma conta nos dois.']
  ],
  lembrar: [
    ['Aviso 3 h antes', 'Com os bares que vão passar o jogo.'],
    ['Sem perder o horário', 'Você escolhe o bar na hora.'],
    ['Funciona no web e no app', 'A mesma conta nos dois.']
  ],
  entrar: [
    ['Vou assistir aqui', 'Marque presença e pegue o código do balcão.'],
    ['Bares salvos', 'A semana de jogos dos seus bares.'],
    ['Meus jogos', 'Os próximos e os que você já viu.']
  ]
}

type Props = {
  pedido: Pedido | null
  onFechar: () => void
  /** Entrou como torcedor pronto: a casca conclui a ação. */
  onEntrou: (acao: Acao | undefined) => Promise<void>
}

export function FolhaEntrar({ pedido, onFechar, onEntrou }: Props) {
  const aberta = pedido !== null
  const navigate = useNavigate()
  const { href } = useLocation()
  const captcha = useTurnstile()
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const emailRef = useRef<HTMLInputElement>(null)
  const [ultimo, setUltimo] = useState<Pedido | null>(null)
  if (pedido && pedido !== ultimo) setUltimo(pedido)
  // Fechando, a folha desliza com o conteúdo de antes.
  const mostrado = pedido ?? ultimo
  const tipo = mostrado?.tipo ?? 'entrar'
  const destino = comAcao(href, mostrado?.acao)

  useEffect(() => {
    if (!aberta) return
    const voltar = document.activeElement as HTMLElement | null
    const foco = setTimeout(() => emailRef.current?.focus(), 300)
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && onFechar()
    document.addEventListener('keydown', tecla)
    return () => {
      clearTimeout(foco)
      document.removeEventListener('keydown', tecla)
      voltar?.focus()
    }
  }, [aberta, onFechar])

  const entrar = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim() || !senha) {
      setErro('Informe e-mail e senha.')
      return
    }
    setErro(null)
    setEnviando(true)
    const { data, error } = await authClient.signIn.email({
      email: email.trim(),
      password: senha,
      fetchOptions: captcha.fetchOptions
    })
    captcha.reset()
    if (error?.code === 'EMAIL_NOT_VERIFIED') {
      setEnviando(false)
      sessionStorage.setItem(
        PENDING_VERIFICATION_KEY,
        JSON.stringify({ email: email.trim() })
      )
      await navigate({ to: withCallbackUrl('/verify-email', destino) })
      return
    }
    if (error) {
      setEnviando(false)
      setErro(
        getUserFacingMessage(
          error,
          'Não foi possível entrar. Tente novamente.',
          'credentials'
        )
      )
      return
    }
    if (data && 'twoFactorRedirect' in data && data.twoFactorRedirect) {
      sessionStorage.setItem(
        TWO_FACTOR_CHALLENGE_KEY,
        JSON.stringify(createTwoFactorChallenge(destino))
      )
      await navigate({ to: '/two-factor' })
      return
    }
    const user = data && 'user' in data ? data.user : null
    const papel = (user as { role?: string } | null)?.role
    const pronto = (user as { onboardingCompleted?: boolean } | null)
      ?.onboardingCompleted
    setSenha('')
    setEnviando(false)
    onFechar()
    // Bar e admin seguem para a casa deles; torcedor sem onboarding passa por
    // ele e volta com a ação.
    if (papel === 'fan' && pronto === false) {
      await navigate({ to: withCallbackUrl('/onboarding/fan', destino) })
      return
    }
    await onEntrou(papel === 'fan' ? mostrado?.acao : undefined)
  }

  return (
    <>
      <div className="scrim" aria-hidden="true" onClick={onFechar} />
      <aside
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sh-t"
        aria-hidden={!aberta}
        inert={!aberta}
      >
        <button
          className="btn b-ghost ic x"
          type="button"
          aria-label="Fechar"
          onClick={onFechar}
        >
          <Ic n="close" s={18} />
        </button>
        <h2 id="sh-t">{TITULO[tipo]}</h2>
        {mostrado?.contexto ? (
          <div className="ctx">
            {mostrado.contexto.hora ? (
              <span className="ctx-h">{mostrado.contexto.hora}</span>
            ) : mostrado.contexto.foto ? (
              <img src={mostrado.contexto.foto} alt="" />
            ) : (
              <span className="ctx-h">
                <Ic n="beer" s={26} />
              </span>
            )}
            <span>
              <b>{mostrado.contexto.titulo}</b>
              <span>{mostrado.contexto.sub}</span>
            </span>
          </div>
        ) : null}
        <ul className="why">
          {PORQUE[tipo].map(([titulo, texto], i) => (
            <li key={titulo}>
              <i>
                <Ic n={ICONES[i] ?? 'star'} s={20} />
              </i>
              <span>
                <b>{titulo}</b>
                <span>{texto}</span>
              </span>
            </li>
          ))}
        </ul>
        <form className="form" noValidate onSubmit={entrar}>
          <label htmlFor="sh-e">
            E-mail
            <input
              ref={emailRef}
              id="sh-e"
              type="email"
              autoComplete="email"
              inputMode="email"
              required
              placeholder="voce@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label htmlFor="sh-p">
            Senha
            <input
              id="sh-p"
              type="password"
              autoComplete="current-password"
              required
              placeholder="Sua senha"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
            />
          </label>
          {erro ? (
            <p className="sh-err" role="alert">
              {erro}
            </p>
          ) : null}
          <button className="btn b-acid" type="submit" disabled={enviando}>
            {enviando ? 'Entrando…' : BOTAO[tipo]}
          </button>
          {captcha.widget}
        </form>
        <p className="alt">
          Primeira vez?{' '}
          <Link to="/signup" search={{ callbackUrl: destino }}>
            Criar conta grátis
          </Link>
          {' · '}
          <Link to="/forgot-password">Esqueci a senha</Link>
        </p>
        <p className="alt" style={{ marginTop: 6 }}>
          Ver bares e jogos continua aberto, sem conta.
        </p>
      </aside>
    </>
  )
}
