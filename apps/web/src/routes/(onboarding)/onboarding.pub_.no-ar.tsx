import { PLAN_NAMES } from '@findsports_oficial/api/lib/plan-limits'
import {
  DEFAULT_ROUTINE,
  type Routine,
  readRoutine,
  recommendPlan
} from '@findsports_oficial/api/lib/pub-routine'
import type { SubscriptionPlan } from '@findsports_oficial/db'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import Loader from 'reicon-react/icons/Loader'
import { toast } from 'sonner'
import type { AdminEvent } from '@/components/admin/admin-model'
import {
  useMyBar,
  useMyEvents,
  useMySubscription
} from '@/components/admin/admin-queries'
import { PrimeiroJogo } from '@/components/onboarding/primeiro-jogo'
import { PubObShell } from '@/components/onboarding/pub-ob-shell'
import { PubPlanStep } from '@/components/onboarding/pub-plan-step'
import { PubPreview } from '@/components/onboarding/pub-preview'
import { PubRoutineStep } from '@/components/onboarding/pub-routine-step'
import { TorcedorVe } from '@/components/onboarding/torcedor-ve'
import {
  brasiliaDay,
  brasiliaTime,
  dayLabel,
  eventTitle
} from '@/components/painel/noite'
import { NovoJogo } from '@/components/painel/novo-jogo'
import { founderCouponFromQuery } from '@/lib/plan-catalog'
import { getUserFacingMessage } from '@/lib/user-facing-error'
import { useTRPC } from '@/utils/trpc'

/**
 * Depois do "no ar" (WEB-501; protótipo `primeiro`, `torcedorVe`, `planoOb`):
 * o primeiro jogo, como o torcedor vê o bar e o plano do teste. Os dois
 * primeiros dá para pular; o plano não: o painel leva até ele enquanto o bar
 * do cadastro não escolheu (`precisaEscolherPlano`, em `routes/admin.tsx`).
 * O teste já começou quando o bar foi ao ar; escolher o plano é o
 * `pub.changeTrialPlan`, que não mexe no fim dele.
 *
 * Só para bar com o cadastro feito; o guard deixa esta passar entre as
 * `/onboarding/*` (`PUB_LIVE_PATH`).
 */

const PASSOS = ['Primeiro jogo', 'Assim o torcedor vê', 'Plano do teste']
const ORDEM = ['jogo', 'torcedor', 'plano'] as const
type Passo = (typeof ORDEM)[number]

export const Route = createFileRoute('/(onboarding)/onboarding/pub_/no-ar')({
  validateSearch: (search: Record<string, unknown>): { passo?: Passo } =>
    search.passo === 'torcedor' || search.passo === 'plano'
      ? { passo: search.passo }
      : {},
  beforeLoad: ({ context, location }) => {
    const user = context.session?.user
    if (!user) {
      throw redirect({ to: '/login', search: { callbackUrl: location.href } })
    }
    if (user.role !== 'pub' || !user.onboardingCompleted) {
      throw redirect({ to: '/onboarding/pub' })
    }
  },
  head: () => ({
    meta: [
      { title: 'Seu bar está no ar — Onside' },
      {
        name: 'description',
        content: 'Seu bar já aparece para os torcedores da região.'
      },
      { name: 'robots', content: 'noindex' }
    ]
  }),
  component: NoAr
})

/** O jogo que o cadastro mostra: o próximo publicado, senão o último. */
function primeiroJogo(events: AdminEvent[] | undefined, now = Date.now()) {
  const publicados = (events ?? [])
    .filter((event) => event.publishedAt !== null)
    .sort(
      (a, b) => Date.parse(String(a.startsAt)) - Date.parse(String(b.startsAt))
    )
  return (
    publicados.find((event) => Date.parse(String(event.startsAt)) > now) ??
    publicados.at(-1)
  )
}

function NoAr() {
  const navigate = useNavigate()
  const { passo = 'jogo' } = Route.useSearch()
  const bar = useMyBar().data
  const events = useMyEvents()
  const subscription = useMySubscription().data
  const headingRef = useRef<HTMLHeadingElement>(null)
  const [vistos, setVistos] = useState<Set<Passo>>(() => new Set())
  const [escrevendo, setEscrevendo] = useState(false)

  // biome-ignore lint/correctness/useExhaustiveDependencies: o foco vai ao título a cada passo.
  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true })
    window.scrollTo(0, 0)
  }, [passo])

  const ir = (proximo: Passo) => {
    setVistos((atual) => new Set(atual).add(passo))
    void navigate({
      to: '.',
      search: proximo === 'jogo' ? {} : { passo: proximo }
    })
  }

  const jogo = primeiroJogo(events.data)
  const elite = subscription?.currentPlan === 'elite'
  const step = ORDEM.indexOf(passo)
  const done = [Boolean(jogo), vistos.has('torcedor'), false]

  const heading = (content: ReactNode) => (
    <h1 ref={headingRef} tabIndex={-1} className="ob-h">
      {content}
    </h1>
  )

  const action =
    passo === 'plano' ? null : (
      <button
        type="button"
        className="btn btn-ghost ob-sm ob-skipto"
        onClick={() => {
          toast.info('Falta só o plano do teste. Depois dele, o painel.')
          ir('plano')
        }}
      >
        Ir para o painel
      </button>
    )

  if (!bar || events.isLoading) {
    return (
      <PubObShell steps={PASSOS} step={step} done={done}>
        <div className="ob-load" role="status" aria-busy="true">
          <Loader size={22} color="currentColor" className="animate-spin" />
          <span className="sr-only">Carregando o seu bar…</span>
        </div>
      </PubObShell>
    )
  }

  const pill = (
    <span className="ob-onair">
      <i aria-hidden="true" />
      NO AR
    </span>
  )

  if (passo === 'torcedor') {
    return (
      <PubObShell
        steps={PASSOS}
        step={step}
        done={done}
        pill={pill}
        action={action}
        wide
      >
        <TorcedorVe
          bar={bar}
          jogo={jogo}
          elite={elite}
          heading={heading}
          nav={
            <div className="ob-nav">
              <div className="ob-nav-row">
                <button
                  type="button"
                  className="btn btn-ghost ob-sm"
                  onClick={() => ir('jogo')}
                >
                  {jogo ? 'Editar o jogo' : 'Pôr o primeiro jogo'}
                </button>
                <button
                  type="button"
                  className="btn btn-acid"
                  onClick={() => ir('plano')}
                >
                  Continuar
                </button>
              </div>
            </div>
          }
        />
      </PubObShell>
    )
  }

  if (passo === 'plano') {
    return (
      <PubObShell steps={PASSOS} step={step} done={done} pill={pill} wide>
        <PlanoDoTeste
          barName={bar.name}
          routine={readRoutine(bar.routine) ?? DEFAULT_ROUTINE}
          trialEnd={subscription?.currentPeriodEnd ?? null}
          heading={heading}
          onEscolhido={() =>
            void navigate({ to: '/admin', search: { passeio: 1 } })
          }
        />
      </PubObShell>
    )
  }

  return (
    <PubObShell
      steps={PASSOS}
      step={step}
      done={done}
      pill={pill}
      action={action}
      aside={
        <PubPreview
          name={bar.name}
          address={bar.address}
          neighborhood={bar.neighborhood}
          city={bar.city}
          amenities={bar.amenities}
          screenCount={bar.screenCount}
          photoUrl={bar.photoUrl}
          game={
            jogo
              ? {
                  when: `${dayLabel(brasiliaDay(String(jogo.startsAt)))} · ${brasiliaTime(jogo.startsAt)}`,
                  title: eventTitle(jogo)
                }
              : null
          }
          note="Publicado, o jogo aparece para quem procura por ele perto do bar, já hoje."
        />
      }
    >
      <PrimeiroJogo
        barName={bar.name}
        heading={heading}
        onPublicado={() => ir('torcedor')}
        nav={
          <div className="ob-nav">
            <div className="ob-nav-row">
              <button
                type="button"
                className="btn btn-ghost ob-sm"
                onClick={() => ir('plano')}
              >
                Fazer depois
              </button>
              {jogo ? (
                <button
                  type="button"
                  className="btn btn-acid"
                  onClick={() => ir('torcedor')}
                >
                  Ver como o torcedor vê
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-acid"
                  onClick={() => setEscrevendo(true)}
                >
                  Escrever o jogo
                </button>
              )}
            </div>
          </div>
        }
      />
      {escrevendo ? (
        // O "Novo jogo" é o do painel: a folha dele mora no `.pn3`.
        <div className="pn3 ob-pn3">
          <NovoJogo
            mode={{ kind: 'new' }}
            elite={elite}
            onClose={() => {
              setEscrevendo(false)
              void events.refetch().then(({ data }) => {
                if (primeiroJogo(data)) ir('torcedor')
              })
            }}
          />
        </div>
      ) : null}
    </PubObShell>
  )
}

function PlanoDoTeste({
  barName,
  routine: salva,
  trialEnd,
  heading,
  onEscolhido
}: {
  barName: string
  routine: Routine
  trialEnd: string | Date | null
  heading: (content: ReactNode) => ReactNode
  onEscolhido: () => void
}) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  // Mudar as respostas aqui só muda a recomendação desta tela: a escolha é
  // o que vale, e é ela que vai ao servidor.
  const [routine, setRoutine] = useState(salva)
  const [editando, setEditando] = useState(false)
  const [escolhido, setEscolhido] = useState<SubscriptionPlan | null>(null)
  const recomendacao = recommendPlan(routine)
  const plan = escolhido ?? recomendacao.plan
  const coupon = useQuery({
    ...trpc.pub.getFounderCouponAvailable.queryOptions(),
    meta: { errorToast: false }
  })
  const founderCoupon = founderCouponFromQuery(coupon) ?? true
  const fim = trialEnd
    ? new Date(trialEnd).toLocaleDateString('pt-BR', {
        day: 'numeric',
        month: 'long'
      })
    : null
  const escolher = useMutation(
    trpc.pub.changeTrialPlan.mutationOptions({
      meta: { errorToast: false },
      onSuccess: async () => {
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: trpc.pub.getMe.queryKey()
          }),
          queryClient.invalidateQueries({
            queryKey: trpc.pub.getMySubscription.queryKey()
          }),
          queryClient.invalidateQueries({
            queryKey: trpc.pub.getMyEventCreationPolicy.queryKey()
          })
        ])
        toast.success(
          `Teste do ${PLAN_NAMES[plan]} ligado${fim ? ` até ${fim}` : ''}. Bem-vindo ao painel.`
        )
        onEscolhido()
      }
    })
  )

  if (editando) {
    return (
      <>
        {heading(
          <>
            Como é a sua <span className="hl">rotina de jogo?</span>
          </>
        )}
        <p className="ob-sub">
          Mude o que quiser: a recomendação acompanha. Nada disso aparece no
          perfil.
        </p>
        <PubRoutineStep routine={routine} onChange={setRoutine} />
        <div className="ob-nav">
          <div className="ob-nav-row">
            <span />
            <button
              type="button"
              className="btn btn-acid"
              onClick={() => {
                setEscolhido(null)
                setEditando(false)
              }}
            >
              Ver a recomendação
            </button>
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <PubPlanStep
        barName={barName}
        recommended={recomendacao.plan}
        reasons={recomendacao.reasons}
        selected={plan}
        onSelect={setEscolhido}
        spend={routine.spend}
        founderCoupon={founderCoupon}
        onEditRoutine={() => setEditando(true)}
        trialEnd={fim}
        heading={heading}
      />
      {escolher.error ? (
        <p className="ob-error" role="alert">
          {getUserFacingMessage(
            escolher.error,
            'Não deu para ligar o teste agora. Tente de novo.'
          )}
        </p>
      ) : null}
      <div className="ob-nav">
        <div className="ob-nav-row">
          <span />
          <button
            type="button"
            className="btn btn-acid"
            disabled={escolher.isPending}
            onClick={() => escolher.mutate({ plan })}
          >
            {escolher.isPending ? (
              <Loader
                size={18}
                color="currentColor"
                className="animate-spin"
                aria-hidden="true"
              />
            ) : null}
            Testar o {PLAN_NAMES[plan]} grátis
          </button>
        </div>
      </div>
    </>
  )
}
