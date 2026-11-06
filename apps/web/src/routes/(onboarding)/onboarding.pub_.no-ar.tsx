import { createFileRoute, Link, redirect } from '@tanstack/react-router'
import { useEffect, useRef } from 'react'
import { useMyBar, useMySubscription } from '@/components/admin/admin-queries'
import { PubObShell } from '@/components/onboarding/pub-ob-shell'
import { PLAN_ART } from '@/components/onboarding/pub-plan-step'
import { getPlan, getPlanPageMode, getTrialProgress } from '@/lib/plan-catalog'

/**
 * "Está no ar" (WEB-501; design "Plano e aviso do teste", seção 1, opção A):
 * a tela depois do comprovante do cadastro. O teste já começou e o
 * comprovante já disse plano, data e "sem cartão"; o que falta é o primeiro
 * jogo, porque bar sem jogo na grade não aparece na busca do dia. Substitui o
 * aviso que abria por cima de `/plan`.
 *
 * Só para bar com o cadastro feito; o guard deixa esta passar entre as
 * `/onboarding/*` (`PUB_LIVE_PATH`).
 */
export const Route = createFileRoute('/(onboarding)/onboarding/pub_/no-ar')({
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

function Tick({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M5 12.5l4.5 4.5L19 7.5"
        fill="none"
        stroke="currentColor"
        strokeWidth={size > 20 ? 2.6 : 2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

const NEXT_STEPS = [
  {
    title: 'Cadastre o primeiro jogo',
    text: 'Escolha no catálogo, marque telão e som.',
    go: 'Cadastrar',
    to: '/admin',
    hash: 'admin-grade'
  },
  {
    title: 'Mande a foto de capa',
    text: 'Bar com foto recebe mais cliques.',
    go: 'Mandar',
    to: '/admin',
    hash: 'admin-espaco'
  },
  {
    title: 'Compare os planos',
    text: 'Troque quantas vezes quiser durante o teste.',
    go: 'Ver planos',
    to: '/plan',
    hash: undefined
  }
] as const

function NoAr() {
  const bar = useMyBar().data
  const subscription = useMySubscription().data
  const headingRef = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true })
  }, [])

  const plan = subscription ? getPlan(subscription.plan) : null
  const trialEnd =
    getPlanPageMode(subscription) === 'trial'
      ? subscription?.currentPeriodEnd
      : null
  const daysLeft = trialEnd ? getTrialProgress(trialEnd).daysLeft : 0

  return (
    <PubObShell bleed>
      <div className="noar">
        <div className="noar-l">
          <span className="noar-big" aria-hidden="true">
            <Tick size={34} />
          </span>
          <div>
            <p className="ob-k">Teste grátis começou</p>
            <h1 ref={headingRef} tabIndex={-1} className="ob-h">
              {bar?.name ?? 'Seu bar'} <span className="hl">está no ar</span>
            </h1>
            <p className="ob-sub">
              Os torcedores da região já acham seu bar. Falta o principal: bar
              sem jogo na grade não aparece na busca do dia.
            </p>
          </div>
          <ol className="noar-next">
            {NEXT_STEPS.map((step, i) => (
              <li key={step.title}>
                <Link
                  to={step.to}
                  hash={step.hash}
                  className={`noar-nx${i === 0 ? ' first' : ''}`}
                >
                  <i aria-hidden="true">{i + 1}</i>
                  <span>
                    <b>{step.title}</b>
                    <small>{step.text}</small>
                  </span>
                  <span className="go" aria-hidden="true">
                    {step.go} →
                  </span>
                </Link>
              </li>
            ))}
          </ol>
          <div className="noar-acts">
            <Link to="/admin" hash="admin-grade" className="btn btn-acid">
              Cadastrar o primeiro jogo
            </Link>
            <Link to="/admin" className="btn btn-ghost">
              Ir para o painel
            </Link>
          </div>
        </div>

        <section className="noar-r" aria-label="Seu teste grátis">
          {plan ? (
            <>
              <p className="tv-k">
                {trialEnd
                  ? `Seu teste do ${plan.name}`
                  : `Seu plano ${plan.name}`}
              </p>
              {/* biome-ignore lint/performance/noImgElement: ilustração estática do plano, de public/, com width e height. */}
              <img src={PLAN_ART[plan.id]} alt="" width="84" height="84" />
            </>
          ) : null}
          {trialEnd ? (
            <>
              <p className="tv-n">
                {daysLeft}
                <small>{daysLeft === 1 ? 'dia' : 'dias'}</small>
              </p>
              <p className="tv-l">
                Grátis até{' '}
                {new Date(trialEnd).toLocaleDateString('pt-BR', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric'
                })}
                . Sem cartão e sem cobrança.
              </p>
              <ul className="tv-chk">
                <li>
                  <Tick />
                  Troque de plano quantas vezes quiser
                </li>
                <li>
                  <Tick />
                  Contratar só é preciso para seguir depois
                </li>
                <li>
                  <Tick />
                  Sem contratar, o bar sai do ar no fim do teste
                </li>
              </ul>
            </>
          ) : null}
        </section>
      </div>
    </PubObShell>
  )
}
