import type { PublicGame } from '@findsports_oficial/api/lib/public-bar-page'
import { useNavigate, useRouter } from '@tanstack/react-router'
import { useState } from 'react'

import { useTurnstile } from '@/components/turnstile'
import { authClient } from '@/lib/auth-client'
import { PENDING_VERIFICATION_KEY } from '@/lib/pending-verification'
import {
  createTwoFactorChallenge,
  TWO_FACTOR_CHALLENGE_KEY
} from '@/lib/two-factor-challenge'
import { getUserFacingMessage } from '@/lib/user-facing-error'
import { withCallbackUrl } from '@/utils/callback-url'
import { Dialog } from './bar-dialog'
import { Icon, type IconName } from './bar-icons'
import type { LiveBar } from './bar-page'
import { clock, dayLabel, gameState } from './bar-page-model'

export type LoginKind = 'vou' | 'salvar' | 'amigos' | 'entrar'

const TITLE: Record<LoginKind, string> = {
  vou: 'Entre para marcar presença',
  salvar: 'Entre para salvar o bar',
  amigos: 'Entre para ver seus amigos',
  entrar: 'Entre na Onside'
}
const GO: Record<LoginKind, string> = {
  vou: 'Entrar e marcar presença',
  salvar: 'Entrar e salvar',
  amigos: 'Entrar',
  entrar: 'Entrar'
}

function why(kind: LoginKind, bar: LiveBar): [IconName, string, string][] {
  const code: [IconName, string, string] = bar.issuesCode
    ? [
        'ticket',
        'Código do balcão',
        `No ${bar.name}, ele libera a oferta da casa.`
      ]
    : ['ticket', 'Vou assistir aqui', 'O bar fica sabendo que você vai.']
  if (kind === 'vou')
    return [
      code,
      [
        'people',
        'Quem vai com você',
        'Amigos veem que você vai, só se você deixar.'
      ],
      ['star', 'Sua opinião vale', 'Depois do jogo, você conta se voltaria.']
    ]
  if (kind === 'salvar')
    return [
      [
        'heart',
        'Seus bares num lugar só',
        'A semana de jogos dos bares salvos.'
      ],
      ['calendar', 'Meus jogos', 'Os próximos e os que você já viu.'],
      ['star', 'Sua opinião vale', 'Depois do jogo, você conta se voltaria.']
    ]
  if (kind === 'amigos')
    return [
      ['people', 'Amigos que vão', 'Só quem é seu amigo e deixa aparecer.'],
      code,
      ['heart', 'Seus bares', 'A semana de jogos dos bares salvos.']
    ]
  return [
    [
      'ticket',
      'Vou assistir aqui',
      'Marque presença e pegue o código do balcão.'
    ],
    ['heart', 'Bares salvos', 'A semana de jogos dos seus bares.'],
    ['calendar', 'Meus jogos', 'Os próximos e os que você já viu.']
  ]
}

/**
 * A folha de login da página do bar: entra sem sair dela e conclui o que a
 * pessoa pediu. O pedido viaja como `?acao=` (e `?jogo=`) na própria URL da
 * página, que é também o destino do cadastro, da confirmação de e-mail e do
 * 2FA: quem volta por qualquer um deles encontra a ação feita (`BarPage`).
 */
export function LoginSheet({
  open,
  bar,
  path,
  now,
  onClose
}: {
  open: { kind: LoginKind; game: PublicGame | null } | null
  bar: LiveBar
  path: string
  now: Date
  onClose: () => void
}) {
  if (!open) return null
  return (
    <Sheet
      key={`${open.kind}-${open.game?.id ?? ''}`}
      kind={open.kind}
      game={open.game}
      bar={bar}
      path={path}
      now={now}
      onClose={onClose}
    />
  )
}

function Sheet({
  kind,
  game,
  bar,
  path,
  now,
  onClose
}: {
  kind: LoginKind
  game: PublicGame | null
  bar: LiveBar
  path: string
  now: Date
  onClose: () => void
}) {
  const navigate = useNavigate()
  const router = useRouter()
  const captcha = useTurnstile()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const search: Record<string, string> = {}
  if (game) search.jogo = game.id
  if (kind === 'vou') search.acao = 'vou'
  if (kind === 'salvar') search.acao = 'salvar'
  const back = `${path}${Object.keys(search).length ? `?${new URLSearchParams(search)}` : ''}`
  const showGame = Boolean(game) && (kind === 'vou' || kind === 'amigos')

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!email.trim() || !password) {
      setError('Informe e-mail e senha.')
      return
    }
    setBusy(true)
    setError(null)
    const { data, error: failure } = await authClient.signIn.email({
      email: email.trim(),
      password,
      fetchOptions: captcha.fetchOptions
    })
    captcha.reset()
    if (failure?.code === 'EMAIL_NOT_VERIFIED') {
      sessionStorage.setItem(
        PENDING_VERIFICATION_KEY,
        JSON.stringify({ email: email.trim() })
      )
      await navigate({ to: withCallbackUrl('/verify-email', back) })
      return
    }
    if (failure) {
      setBusy(false)
      setError(
        getUserFacingMessage(
          failure,
          'Não foi possível entrar. Tente novamente.',
          'credentials'
        )
      )
      return
    }
    if (data && 'twoFactorRedirect' in data && data.twoFactorRedirect) {
      sessionStorage.setItem(
        TWO_FACTOR_CHALLENGE_KEY,
        JSON.stringify(createTwoFactorChallenge(back))
      )
      await navigate({ to: '/two-factor' })
      return
    }
    onClose()
    // A sessão nova passa pela raiz (`beforeLoad`), e a página conclui a
    // ação pedida pelo `?acao=`.
    await navigate({ to: back, replace: true, resetScroll: false })
    await router.invalidate()
  }

  return (
    <Dialog className="sheet" label={TITLE[kind]} onClose={onClose}>
      <button
        className="btn b-ghost ic x"
        type="button"
        aria-label="Fechar"
        onClick={onClose}
      >
        <Icon name="close" size={18} />
      </button>
      <h2>{TITLE[kind]}</h2>
      <div className="ctx">
        {bar.photoUrl ? (
          <img className="ph" src={bar.photoUrl} alt="" />
        ) : (
          <span className="ph" />
        )}
        <span>
          <b>{showGame && game ? game.title : bar.name}</b>
          <span>
            {showGame && game ? (
              <>
                {bar.name} ·{' '}
                {gameState(game, now) === 'live' ? (
                  <span className="lvt">● ao vivo</span>
                ) : (
                  `${dayLabel(game.startsAt, now)} ${clock(game.startsAt)}`
                )}
              </>
            ) : (
              `${bar.neighborhood}, ${bar.city}`
            )}
          </span>
        </span>
      </div>
      <ul className="why">
        {why(kind, bar).map(([icon, title, text]) => (
          <li key={title}>
            <i>
              <Icon name={icon} />
            </i>
            <span>
              <b>{title}</b>
              <span>{text}</span>
            </span>
          </li>
        ))}
      </ul>
      <form method="post" className="form" onSubmit={submit} noValidate>
        <label htmlFor="bp-email">
          E-mail
          <input
            id="bp-email"
            type="email"
            autoComplete="email"
            inputMode="email"
            placeholder="voce@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoFocus
          />
        </label>
        <label htmlFor="bp-password">
          Senha
          <input
            id="bp-password"
            type="password"
            autoComplete="current-password"
            placeholder="Sua senha"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error ? (
          <p className="err" role="alert">
            {error}
          </p>
        ) : null}
        <button className="btn b-acid" type="submit" disabled={busy}>
          {busy ? 'Entrando…' : GO[kind]}
        </button>
        {captcha.widget}
      </form>
      <p className="alt">
        Primeira vez?{' '}
        <a href={withCallbackUrl('/signup', back)}>Criar conta grátis</a>
      </p>
      <p className="alt" style={{ marginTop: 8 }}>
        Depois de entrar, você volta para esta página com tudo feito.
      </p>
    </Dialog>
  )
}
