import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import ArrowRight from 'reicon-react/icons/ArrowRight'
import CircleInfo from 'reicon-react/icons/CircleInfo'
import { isLapsed, LAPSED_COPY } from '@/lib/lapsed-plan'
import { getPlan, PLAN_TIER_ORDER } from '@/lib/plan-catalog'
import type { PlanState } from './admin-model'

/*
 * Plano mínimo de cada recurso pago do painel. Só decide o que desenhar: o
 * servidor confere o plano de novo antes de gravar.
 */
const TIERS: Record<'pro' | 'elite', { kicker: string; locked: string }> = {
  pro: {
    kicker: 'Planos Pro e Elite',
    locked: 'Disponível nos planos Pro e Elite'
  },
  elite: {
    kicker: 'Plano Elite',
    locked: 'Disponível no plano Elite'
  }
}

type Props = {
  id: string
  tier: keyof typeof TIERS
  title: string
  description: string
  plan: PlanState
  /** Texto do leitor de tela enquanto a assinatura carrega. */
  loadingLabel: string
  skeleton: ReactNode
  /** Corpo do aviso de bloqueio: o que o plano libera, ou o que segue guardado. */
  locked: ReactNode
  /**
   * Recebe `eligible` em vez de sumir sem plano: o interruptor de reservas
   * precisa continuar montado para quem perdeu o plano conseguir desligar.
   */
  children: (eligible: boolean) => ReactNode
}

/**
 * Moldura dos recursos pagos do painel (WEB-142): título, carregando,
 * bloqueado por plano e liberado.
 *
 * A falha ao ler a assinatura não vira alerta aqui. A aba mostra esse erro uma
 * vez só, com o "Tentar de novo" que respeita `retryable`; cada card apenas
 * diz que está esperando o plano.
 */
export function PaidFeatureCard({
  id,
  tier,
  title,
  description,
  plan,
  loadingLabel,
  skeleton,
  locked,
  children
}: Props) {
  const copy = TIERS[tier]
  const titleId = `${id}-title`
  const reaches =
    plan.status === 'ready' &&
    PLAN_TIER_ORDER[plan.plan] >= PLAN_TIER_ORDER[tier]
  const eligible = reaches && plan.standing === 'current'
  // Plano que daria acesso, parado por pagamento: o caminho é regularizar a
  // assinatura, não contratar de novo (WEB-141). Pro parado num recurso Elite
  // não alcança o recurso, e continua indo para os planos.
  const notice =
    reaches && isLapsed(plan.standing)
      ? {
          tone: 'onside-callout-warn',
          title: LAPSED_COPY[plan.standing].title(getPlan(plan.plan).name),
          body: (
            <p className="text-sm opacity-90">
              Volta a funcionar assim que a assinatura for regularizada, sem
              precisar preencher nada de novo.
            </p>
          ),
          link: { to: '/admin/billing', label: 'Regularizar assinatura' }
        }
      : {
          tone: 'onside-callout-stone',
          title: copy.locked,
          body: locked,
          link: {
            to: '/plan',
            search: { origin: 'admin' as const },
            label: 'Ver planos'
          }
        }

  return (
    <section
      id={id}
      className="onside-panel scroll-mt-6 p-5 md:p-6"
      aria-labelledby={titleId}
    >
      <p className="onside-kicker mb-2">{copy.kicker}</p>
      <h2 id={titleId} className="onside-display text-2xl">
        {title}
      </h2>
      <p className="mt-1 max-w-2xl text-[var(--onside-muted)] text-sm">
        {description}
      </p>

      <div className="mt-5">
        {plan.status === 'loading' ? (
          <div className="space-y-3" role="status" aria-busy="true">
            <span className="sr-only">{loadingLabel}</span>
            {skeleton}
          </div>
        ) : plan.status === 'error' ? (
          <p className="text-[var(--onside-muted)] text-sm">
            Indisponível até conferirmos o seu plano.
          </p>
        ) : (
          <div className="space-y-4">
            {eligible ? null : (
              <div className={`onside-callout ${notice.tone}`}>
                <CircleInfo
                  size={20}
                  color="currentColor"
                  className="mt-0.5 shrink-0"
                  aria-hidden="true"
                />
                {/* Base mínima: no celular o botão desce para a linha de
                    baixo em vez de espremer o texto numa coluna estreita. */}
                <div className="min-w-0 flex-1 basis-60">
                  <p className="mb-0.5 font-semibold text-sm">{notice.title}</p>
                  {notice.body}
                </div>
                <Link
                  to={notice.link.to}
                  search={notice.link.search}
                  className="onside-btn onside-btn-ink min-h-11 shrink-0 px-4 text-xs"
                >
                  {notice.link.label}
                  <ArrowRight
                    size={13}
                    color="currentColor"
                    aria-hidden="true"
                  />
                </Link>
              </div>
            )}
            {children(eligible)}
          </div>
        )}
      </div>
    </section>
  )
}
