import { useMutation, useQuery } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { type FormEvent, useEffect, useRef, useState } from 'react'
import {
  INVITE_ACTION,
  InviteStateArrow,
  InviteStateCta,
  InviteStatePage
} from '@/components/onboarding/invite-state-page'
import { OnboardingHeader } from '@/components/onboarding/onboarding-header'
import { OnboardingLayout } from '@/components/onboarding/onboarding-layout'
import { analytics, type WaitlistInviteStatus } from '@/lib/analytics'
import { useTRPC } from '@/utils/trpc'

/** Mesmo mínimo exigido pelo procedimento; abaixo disso o link já não é link. */
const TAMANHO_MINIMO_DO_TOKEN = 32

/**
 * A marca conta o estado (ONS-25).
 *
 * Nenhuma imagem traz objeto estranho ao mundo da Onside — nada de relógio,
 * banco ou placa de saída. O que muda é o que aconteceu com o anel e com o
 * ponto vermelho: o ponto é estar em jogo. Inteiro e aceso, a conta existe;
 * apagado, a pessoa ainda não foi escalada; rolando para longe, ela saiu por
 * conta própria; areia, o prazo escoou; estilhaçado, o link se partiu.
 */
const MARCA = {
  inteira: {
    src: '/onside-icone-preto-activated.png',
    width: 1419,
    height: 1108
  },
  quebrada: {
    src: '/onside-icone-preto-broken.webp',
    width: 1200,
    height: 936
  },
  areia: {
    src: '/onside-icone-preto-tempo-esgotado.png',
    width: 1420,
    height: 1108
  },
  apagada: {
    src: '/onside-icone-preto-banco-reservas.png',
    width: 1420,
    height: 1108
  },
  desencaixada: {
    src: '/onside-icone-preto-fora-lista.png',
    width: 1420,
    height: 1108
  }
} as const

export const Route = createFileRoute('/activate-invite')({
  validateSearch: (search: Record<string, unknown>) => ({
    token: typeof search.token === 'string' ? search.token : ''
  }),
  component: ActivateInvitePage
})

function ActivateInvitePage() {
  const { token } = Route.useSearch()
  const trpc = useTRPC()
  // Token ausente ou truncado pelo cliente de e-mail não chega ao servidor: o
  // input do procedimento exige 32 caracteres. Antes a query só não disparava,
  // e a pessoa ficava olhando um formulário mudo. Agora vale como link
  // inválido, que é o que de fato aconteceu.
  const tokenUtilizavel = token.length >= TAMANHO_MINIMO_DO_TOKEN
  const invite = useQuery({
    ...trpc.waitlist.inviteDetails.queryOptions({ token }),
    enabled: tokenUtilizavel,
    retry: false
  })
  const status = tokenUtilizavel
    ? (invite.data?.status ?? null)
    : ('not_found' as const)

  const registrado = useRef(false)
  useEffect(() => {
    if (registrado.current || !status) return
    registrado.current = true
    if (status !== 'valid') {
      analytics.waitlistInviteUnusable(status)
      return
    }
    if (invite.data?.status === 'valid') {
      analytics.identifyWaitlist(invite.data.id)
      analytics.waitlistInviteOpened()
    }
  }, [status, invite.data])

  // Falha de carga é outra coisa que convite inutilizável: com o estado vindo
  // em `data`, o que sobra em `error` é rede ou servidor, e dizer "seu link
  // expirou" nessa hora seria mentira.
  if (invite.isError) {
    return (
      <InviteStatePage
        kicker="Falha na verificação"
        titleTop="Não deu pra"
        titleBottom="conferir agora"
        lead="A verificação falhou antes de chegar ao seu convite. Nada foi perdido: seu link continua valendo o que valia."
        score="Situação: indefinida"
        visual={MARCA.inteira}
      >
        <InviteStateCta
          label={invite.isFetching ? 'Verificando…' : 'Tentar de novo'}
          disabled={invite.isFetching}
          onClick={() => void invite.refetch()}
        />
        <Link to="/" className={INVITE_ACTION.secondary}>
          Voltar para a home
          <InviteStateArrow size={14} />
        </Link>
      </InviteStatePage>
    )
  }

  // A verificação é o único estado não terminal da página, e dura poucos
  // instantes: um título gigante que aparece para sumir logo depois piscaria
  // na cara de quem só quer o formulário. Por isso ela fica no painel discreto.
  if (!status) {
    return (
      <OnboardingLayout>
        <OnboardingHeader label="Ativação de convite" />
        <main
          className="onside-panel onside-shadow-acid mx-auto w-full max-w-lg p-6 sm:p-8"
          aria-busy
          aria-live="polite"
        >
          <p className="onside-kicker">Convite Onside</p>
          <h1 className="onside-display mt-3 text-4xl">
            Verificando seu convite…
          </h1>
          <p className="mt-3 text-sm text-[var(--onside-muted)]">
            Só um instante.
          </p>
        </main>
      </OnboardingLayout>
    )
  }

  if (status === 'expired') return <ConviteExpirado token={token} />
  if (status !== 'valid') return <ConviteInutilizavel status={status} />

  return (
    <OnboardingLayout>
      <OnboardingHeader label="Ativação de convite" />
      <FormularioDeAtivacao
        token={token}
        email={invite.data?.status === 'valid' ? invite.data.email : ''}
      />
    </OnboardingLayout>
  )
}

/**
 * O único estado com conserto self-service: o servidor já sabia reemitir
 * convite vencido, só que apenas por ação de admin. `resendInvite` abre esse
 * caminho para a própria pessoa, e a confirmação acontece na mesma tela — sem
 * navegar para lugar nenhum.
 */
function ConviteExpirado({ token }: { token: string }) {
  const trpc = useTRPC()
  const resend = useMutation(trpc.waitlist.resendInvite.mutationOptions())

  if (resend.isSuccess) {
    return (
      <InviteStatePage
        kicker="Convite reenviado"
        titleTop="Convite novo"
        titleBottom="a caminho"
        lead="Enviamos para o mesmo e-mail do convite anterior. O novo link vale mais 7 dias."
        score={
          <>
            Novo prazo: <strong>7 dias</strong>
          </>
        }
        visual={MARCA.inteira}
      >
        {resend.data.previewUrl ? (
          <a href={resend.data.previewUrl} className={INVITE_ACTION.primary}>
            Abrir convite (ambiente local)
            <InviteStateArrow />
          </a>
        ) : null}
        <Link to="/" className={INVITE_ACTION.secondary}>
          Voltar para a home
          <InviteStateArrow size={14} />
        </Link>
      </InviteStatePage>
    )
  }

  return (
    <InviteStatePage
      kicker="Convite expirado"
      titleTop="Seu convite"
      titleBottom="venceu o tempo"
      lead="O link de ativação vale 7 dias. Podemos mandar um novo agora, para o mesmo e-mail — sua vaga continua de pé."
      score={
        <>
          Tempo de convite: <strong>7 dias</strong>
        </>
      }
      visual={MARCA.areia}
    >
      {resend.error ? (
        <p role="alert" className="onside-invite-error">
          {resend.error.message}
        </p>
      ) : null}
      <InviteStateCta
        label={resend.isPending ? 'Enviando…' : 'Reenviar convite'}
        disabled={resend.isPending}
        onClick={() => resend.mutate({ token })}
      />
      <Link to="/" className={INVITE_ACTION.secondary}>
        Voltar para a home
        <InviteStateArrow size={14} />
      </Link>
    </InviteStatePage>
  )
}

/**
 * Os quatro estados sem ação no servidor. Cada um tem título, explicação e
 * saída próprios — o oposto da frase única "Convite inválido ou expirado."
 * que servia para todos.
 */
function ConviteInutilizavel({
  status
}: {
  status: Exclude<WaitlistInviteStatus, 'expired'>
}) {
  if (status === 'activated') {
    return (
      <InviteStatePage
        kicker="Conta ativa"
        titleTop="Você já está"
        titleBottom="em campo"
        lead="Este convite já foi usado para criar sua conta. Entre com seu e-mail e a senha que você definiu."
        score="Situação: em campo"
        visual={MARCA.inteira}
      >
        <Link to="/login" className={INVITE_ACTION.primary}>
          Entrar na minha conta
          <InviteStateArrow />
        </Link>
        <Link to="/" className={INVITE_ACTION.secondary}>
          Voltar para a home
          <InviteStateArrow size={14} />
        </Link>
      </InviteStatePage>
    )
  }

  if (status === 'not_approved') {
    return (
      <InviteStatePage
        kicker="Na fila"
        titleTop="Ainda no banco"
        titleBottom="de reservas"
        lead="Sua inscrição está de pé, mas o acesso ainda não foi liberado. Avisaremos neste mesmo e-mail quando chegar sua vez."
        score="Situação: aguardando escalação"
        visual={MARCA.apagada}
      >
        <Link to="/" className={INVITE_ACTION.primaryAcid}>
          Voltar para a home
          <InviteStateArrow />
        </Link>
        {/* `/access-pending` exige sessão: para quem ainda não tem conta ele
            devolve o login. Fica como caminho secundário, nunca como a única
            saída da tela. */}
        <Link to="/access-pending" className={INVITE_ACTION.secondary}>
          Já tenho conta: ver meu acesso
          <InviteStateArrow size={14} />
        </Link>
      </InviteStatePage>
    )
  }

  if (status === 'cancelled') {
    return (
      <InviteStatePage
        kicker="Inscrição cancelada"
        titleTop="Você pediu"
        titleBottom="pra sair"
        lead="Este convite foi cancelado quando você saiu da waitlist. Mudou de ideia? Entrar de novo leva menos de um minuto."
        score="Situação: fora da lista"
        visual={MARCA.desencaixada}
      >
        <Link to="/" hash="lista" className={INVITE_ACTION.primaryAcid}>
          Entrar na lista de novo
          <InviteStateArrow />
        </Link>
      </InviteStatePage>
    )
  }

  return (
    <InviteStatePage
      kicker="Link inválido"
      titleTop="Esse link não"
      titleBottom="chegou inteiro"
      lead="Clientes de e-mail costumam quebrar links longos em duas linhas. Clique direto no botão do e-mail, ou cole o endereço inteiro na barra do navegador."
      score="Placar final: link quebrado"
      visual={MARCA.quebrada}
    >
      <Link to="/" className={INVITE_ACTION.primary}>
        Voltar para a home
        <InviteStateArrow />
      </Link>
    </InviteStatePage>
  )
}

function FormularioDeAtivacao({
  token,
  email
}: {
  token: string
  email: string
}) {
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const password = String(data.get('password') ?? '')
    if (password !== String(data.get('passwordConfirmation') ?? '')) {
      setError('As senhas precisam ser iguais.')
      return
    }
    setPending(true)
    setError('')
    const response = await fetch('/api/waitlist/activate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token, name: data.get('name'), password })
    })
    const body = (await response.json().catch(() => ({}))) as {
      message?: string
      existingAccount?: boolean
      user?: { role?: 'fan' | 'pub' }
    }
    if (!response.ok) {
      setError(body.message ?? 'Não foi possível ativar a conta.')
      setPending(false)
      return
    }
    analytics.waitlistActivated()
    await navigate({
      to: body.existingAccount
        ? '/login'
        : body.user?.role === 'pub'
          ? '/onboarding/pub'
          : '/onboarding/fan'
    })
  }

  return (
    <main
      className="onside-panel onside-shadow-acid mx-auto w-full max-w-lg p-6 sm:p-8"
      aria-busy={pending}
    >
      <p className="onside-kicker">Convite Onside</p>
      <h1 className="onside-display mt-3 text-4xl">Ative sua conta</h1>
      <p className="mt-3 text-sm text-[var(--onside-muted)]">
        Seu e-mail já está ligado ao convite. Defina seu nome e sua senha para
        entrar.
      </p>
      <form onSubmit={submit} className="mt-6 grid gap-4">
        <div>
          <label htmlFor="invite-email" className="onside-label">
            E-mail do convite
          </label>
          <input
            id="invite-email"
            name="email"
            type="email"
            autoComplete="email"
            spellCheck={false}
            value={email}
            disabled
            className="onside-input bg-[var(--onside-stone)]"
          />
        </div>
        <div>
          <label htmlFor="invite-name" className="onside-label">
            Nome completo
          </label>
          <input
            id="invite-name"
            name="name"
            autoComplete="name"
            required
            minLength={2}
            maxLength={100}
            className="onside-input"
          />
        </div>
        <div>
          <label htmlFor="invite-password" className="onside-label">
            Senha
          </label>
          <input
            id="invite-password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            maxLength={128}
            className="onside-input"
          />
        </div>
        <div>
          <label
            htmlFor="invite-password-confirmation"
            className="onside-label"
          >
            Confirmar senha
          </label>
          <input
            id="invite-password-confirmation"
            name="passwordConfirmation"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            maxLength={128}
            className="onside-input"
          />
        </div>
        {error ? (
          <p role="alert" className="onside-field-error">
            {error}
          </p>
        ) : null}
        <button
          disabled={pending}
          className="onside-btn onside-btn-acid onside-btn-full"
          type="submit"
        >
          {pending ? 'Ativando…' : 'Criar senha e entrar'}
        </button>
      </form>
    </main>
  )
}
