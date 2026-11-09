import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { type ReactNode, useEffect, useRef } from 'react'
import {
  useMyBar,
  useMyEventCreationPolicy,
  useMySubscription
} from '@/components/admin/admin-queries'
import { Arrow, Check, Medal } from '@/components/landing/v3/icons'
import { analytics } from '@/lib/analytics'
import { eventLimitReachedTitle } from '@/lib/event-limit'
import {
  getLapsedPaidPlan,
  getShownPlan,
  isStarterSubscription
} from '@/lib/lapsed-plan'
import {
  CONTRACTED_TRIAL_LABEL,
  getTrialNotice,
  isContractedTrial
} from '@/lib/plan-catalog'
import { getUserFacingMessage, isRetryableError } from '@/lib/user-facing-error'
import { useTRPC } from '@/utils/trpc'

/*
 * Avisos do plano no painel novo (WEB-501, fase 2): os mesmos da Visão geral
 * antiga (`overview-tab.tsx`), com o texto de lá: bar fora do ar, trial, fora
 * das sugestões, limite do Starter e plano parado (WEB-129, WEB-331, WEB-353,
 * WEB-357). Hoje mostra todos; Jogos, só o do limite.
 */

const restantes = (n: number) => `${n} ${n === 1 ? 'restante' : 'restantes'}`

function usePlanStatus() {
  const trpc = useTRPC()
  const { data: bar } = useMyBar()
  const sub = useMySubscription()
  const policy = useMyEventCreationPolicy()
  const quality = useQuery({
    ...trpc.recommendations.getMyBarQualityStatus.queryOptions(),
    meta: { errorToast: false }
  })

  const subscription = sub.data
  const planKnown = sub.isFetched && !sub.isLoading && !sub.isError
  const limited = policy.data?.status === 'limited' ? policy.data : null
  const isStarter = planKnown && isStarterSubscription(subscription)
  const lapsedPlan = planKnown ? getLapsedPaidPlan(subscription) : null
  const remaining = limited?.remaining ?? null
  return {
    sub,
    policy,
    quality,
    subscription,
    planKnown,
    isInactive: bar ? !bar.isActive : false,
    shownPlan: planKnown ? getShownPlan(subscription) : null,
    trialNotice: planKnown ? getTrialNotice(subscription) : null,
    isStarter,
    lapsedPlan,
    limited,
    remaining,
    isNearLimit: isStarter && remaining === 1,
    isAtLimit: limited ? !limited.canCreate : false
  }
}

type Tone = 'info' | 'warn' | 'error'

function Aviso({
  tone,
  title,
  children,
  action
}: {
  tone: Tone
  title?: string
  children?: ReactNode
  action?: ReactNode
}) {
  return (
    <div
      className={`pn-aviso is-${tone}`}
      role={tone === 'error' ? 'alert' : undefined}
    >
      <div className="pn-aviso-t">
        {title ? <b>{title}</b> : null}
        {children ? <p>{children}</p> : null}
      </div>
      {action}
    </div>
  )
}

function Retry({ onRetry }: { onRetry: () => void }) {
  return (
    <button
      type="button"
      className="pn-btn pn-ghost pn-sm"
      onClick={() => onRetry()}
    >
      Tentar novamente
    </button>
  )
}

function ActionLink({
  to,
  children,
  plan
}: {
  to: '/plan' | '/admin/billing'
  children: ReactNode
  plan?: boolean
}) {
  return (
    <Link
      to={to}
      search={plan ? { origin: 'admin' } : undefined}
      className="pn-btn pn-acid pn-sm"
    >
      {children}
      <Arrow size={16} />
    </Link>
  )
}

export function Avisos({ only }: { only?: 'limit' }) {
  const s = usePlanStatus()
  const limitTracked = useRef(false)

  useEffect(() => {
    if (s.isAtLimit && !limitTracked.current) {
      analytics.eventLimitReached()
      limitTracked.current = true
    }
  }, [s.isAtLimit])

  const showLimit =
    (s.isStarter || s.lapsedPlan) && !s.isInactive && s.remaining !== null
  const limit = showLimit ? (
    <Aviso
      key="limit"
      tone={s.isAtLimit || s.isNearLimit || s.lapsedPlan ? 'warn' : 'info'}
      title={
        s.isAtLimit
          ? eventLimitReachedTitle(s.limited?.periodEnd ?? null)
          : s.lapsedPlan
            ? `${s.lapsedPlan.label} — ${s.remaining} de ${s.limited?.limit ?? 0} jogos restantes`
            : s.isNearLimit
              ? 'Último jogo disponível no plano Starter'
              : `Plano Starter — ${s.remaining} de ${s.limited?.limit ?? 0} jogos restantes`
      }
      action={
        s.lapsedPlan ? (
          <ActionLink to="/admin/billing">Regularizar assinatura</ActionLink>
        ) : s.isAtLimit || s.isNearLimit ? (
          <ActionLink to="/plan" plan>
            Fazer upgrade
          </ActionLink>
        ) : null
      }
    >
      {s.lapsedPlan
        ? `${s.lapsedPlan.cause} Os jogos ilimitados voltam assim que a assinatura for regularizada.`
        : s.isAtLimit
          ? 'Faça upgrade para o plano Pro e cadastre jogos ilimitados.'
          : s.isNearLimit
            ? 'Considere fazer upgrade para o Pro antes de atingir o limite.'
            : `Você usou ${s.limited?.used ?? 0} jogo${s.limited?.used !== 1 ? 's' : ''} neste período de cobrança.`}
    </Aviso>
  ) : null

  if (only === 'limit') {
    return limit ? <div className="pn-avisos">{limit}</div> : null
  }

  const quality = s.quality.data
  const items = [
    s.sub.isError ? (
      <Aviso
        key="sub"
        tone="error"
        title={getUserFacingMessage(
          s.sub.error,
          'Não foi possível carregar a assinatura.'
        )}
        action={
          isRetryableError(s.sub.error) ? (
            <Retry onRetry={() => void s.sub.refetch()} />
          ) : null
        }
      />
    ) : null,
    s.policy.isError ? (
      <Aviso
        key="policy"
        tone="error"
        title={getUserFacingMessage(
          s.policy.error,
          'Não foi possível verificar a disponibilidade de eventos.'
        )}
        action={
          isRetryableError(s.policy.error) ? (
            <Retry onRetry={() => void s.policy.refetch()} />
          ) : null
        }
      />
    ) : null,
    s.isInactive ? (
      <Aviso
        key="inactive"
        tone="warn"
        title="Seu bar não está visível na plataforma"
        action={
          <ActionLink to="/plan" plan>
            Ver planos
          </ActionLink>
        }
      >
        Nenhum plano ou período de teste ativo. Ative um plano para aparecer nas
        buscas e no mapa.
      </Aviso>
    ) : null,
    s.trialNotice ? (
      <Aviso
        key="trial"
        tone="info"
        title={
          isContractedTrial(s.subscription)
            ? `${CONTRACTED_TRIAL_LABEL} · ${s.trialNotice}`
            : s.trialNotice
        }
      />
    ) : null,
    s.quality.isError ? (
      <Aviso
        key="quality-error"
        tone="error"
        title="Não foi possível verificar as sugestões personalizadas."
        action={
          isRetryableError(s.quality.error) ? (
            <Retry onRetry={() => void s.quality.refetch()} />
          ) : null
        }
      />
    ) : quality?.commerciallyEligible && quality.protectedByQuality ? (
      <Aviso
        key="quality"
        tone="warn"
        title="Seu bar está temporariamente fora das sugestões personalizadas"
      >
        Nos últimos {quality.windowDays} dias,{' '}
        {quality.recentPositivePercentage}% de {quality.recentRatingCount}{' '}
        avaliações responderam “voltaria”. A elegibilidade retorna
        automaticamente ao atingir {quality.minimumPositivePercentage}% ou
        quando a amostra recente mudar. Seu perfil e sua presença na busca
        continuam ativos.
      </Aviso>
    ) : null,
    limit
  ].filter(Boolean)

  return items.length ? <div className="pn-avisos">{items}</div> : null
}

/**
 * O cartão do plano em Hoje: o nome, o pé da assinatura e quantos jogos
 * restam, com o texto do cartão de plano antigo (WEB-344).
 */
export function PlanoCard() {
  const s = usePlanStatus()
  const quality = s.quality.data
  const standing = s.subscription?.standing
  return (
    <section className="pn-card pn-plano" aria-labelledby="pn-plano-t">
      <div className="pn-chd">
        <h3 id="pn-plano-t">Seu plano</h3>
        <span className="pn-plano-md">
          <Medal size={22} />
        </span>
      </div>
      <p className="pn-plano-n pn-disp">
        {s.shownPlan?.name ?? (s.sub.isLoading ? '…' : '—')}
      </p>
      <p className="pn-plano-l">
        {s.shownPlan && !s.subscription ? (
          <Link to="/plan" search={{ origin: 'admin' }} className="pn-lnk">
            {s.shownPlan.label}
          </Link>
        ) : (
          [
            s.shownPlan && standing !== 'current' ? s.shownPlan.label : null,
            (s.isStarter || s.lapsedPlan) && s.remaining !== null
              ? restantes(s.remaining)
              : null
          ]
            .filter(Boolean)
            .join(' · ') || 'Plano atual'
        )}
      </p>
      {quality?.commerciallyEligible && !quality.protectedByQuality ? (
        <p className="pn-plano-ok">
          <Check size={16} />
          Elegível para sugestões personalizadas. O nível do seu plano não
          interfere na afinidade ou na posição.
        </p>
      ) : null}
      <Link to="/admin/billing" className="pn-go">
        Plano e cobrança <Arrow size={16} />
      </Link>
    </section>
  )
}

export { usePlanStatus }
