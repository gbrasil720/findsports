import type { SubscriptionStanding } from '@findsports_oficial/api/lib/current-plan'
import { PLAN_NAMES } from '@findsports_oficial/api/lib/plan-limits'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { toast } from 'sonner'
import { authClient } from '@/lib/auth-client'
import { appHref } from '@/lib/houdini-host'
import { LAPSED_COPY } from '@/lib/lapsed-plan'
import { getUserFacingMessage } from '@/lib/user-facing-error'
import { useTRPC } from '@/utils/trpc'
import { formatDateTime } from './format'
import { HoldButton } from './hold-button'
import { Icon } from './icons'

type Plan = keyof typeof PLAN_NAMES

export const STANDING_LABELS: Record<SubscriptionStanding, string> = {
  current: 'em dia',
  past_due: LAPSED_COPY.past_due.label,
  trial_ended: LAPSED_COPY.trial_ended.label,
  ended: 'encerrada'
}

/** O que os truques precisam saber do bar, venha da lista ou da ficha. */
export type TrickBar = {
  id: string
  name: string
  ownerId: string
  isActive: boolean
  barPlan: Plan
  expectedSearchPlan: Plan
  currentPlan: Plan | null
  subscription: {
    status: string
    externalSubscriptionId: string | null
  } | null
  stripeUrl: string | null
}

/**
 * A busca ordena por `bar.plan`, que pode atrasar até um dia (WEB-129). A
 * comparação é com a mesma função do banco que a reconciliação aplica: trial
 * vencido conta como Starter, não como "sem plano".
 */
export function searchDrift(bar: TrickBar) {
  return bar.barPlan !== bar.expectedSearchPlan
}

/** Teste do cadastro: o único que o Houdini estende (WEB-357/358). */
function isSignupTrial(bar: TrickBar) {
  return (
    bar.subscription?.status === 'trialing' &&
    !bar.subscription.externalSubscriptionId
  )
}

const TRIAL_DAYS = [7, 14, 30] as const

function useRefresh() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: trpc.adminBars.pathKey() }),
      queryClient.invalidateQueries({ queryKey: trpc.grimorio.pathKey() })
    ])
}

/** "Busca desatualizada" com o "Arrumar agora"; depois, a confirmação verde. */
export function SearchDriftAlert({ bar }: { bar: TrickBar }) {
  const trpc = useTRPC()
  const refresh = useRefresh()
  const [fixedTo, setFixedTo] = useState<Plan | null>(null)
  const sync = useMutation(
    trpc.adminBars.syncSearchPlan.mutationOptions({
      onSuccess: async (result) => {
        setFixedTo(result.after)
        await refresh()
      },
      onError: (error) =>
        toast.error(
          getUserFacingMessage(error, 'Não foi possível arrumar a busca.')
        )
    })
  )

  // Só enquanto vale: estender o teste depois muda a busca de novo.
  if (fixedTo === bar.barPlan && !searchDrift(bar)) {
    return (
      <div role="status" className="hd-done">
        <Icon name="check" size={16} />
        Busca em {PLAN_NAMES[fixedTo]} agora. Anotado no Grimório.
      </div>
    )
  }
  if (!searchDrift(bar)) return null

  return (
    <div className="hd-alert" role="alert">
      <span className="hd-alert-title">
        <Icon name="warn" size={18} />
        Busca desatualizada
      </span>
      <p>
        {bar.currentPlan ? (
          <>
            O plano é <b>{PLAN_NAMES[bar.currentPlan]}</b>
          </>
        ) : (
          'O bar está sem plano (na busca, Starter)'
        )}
        , mas a busca ainda ordena este bar como{' '}
        <b>{PLAN_NAMES[bar.barPlan]}</b>. A reconciliação diária só arrumaria em
        até 24 h.
      </p>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 12
        }}
      >
        <button
          type="button"
          className="hd-btn hd-btn-primary"
          disabled={sync.isPending}
          onClick={() => sync.mutate({ barId: bar.id })}
        >
          {sync.isPending ? 'Arrumando…' : 'Arrumar agora'}
        </button>
        <span className="hd-small">
          Aplica a mesma regra da reconciliação, só neste bar. Fica no Grimório.
        </span>
      </div>
    </div>
  )
}

/** Entrar na pele do dono: a sessão vira a dele e a página recarrega. */
function useEnterOwner(bar: TrickBar) {
  const [entering, setEntering] = useState(false)
  async function enter() {
    setEntering(true)
    const res = await authClient.admin.impersonateUser({ userId: bar.ownerId })
    if (res.error || !res.data) {
      setEntering(false)
      toast.error(
        getUserFacingMessage(res.error, 'Não foi possível entrar na pele.')
      )
      return
    }
    window.location.href = appHref('/admin', new URL(window.location.href))
  }
  return { entering, enter }
}

/**
 * Os atalhos de um bar: entrar na pele do dono, vê-lo como torcedor, o
 * Stripe e (na lista) a ficha. Na ficha vão no cabeçalho.
 */
export function BarLinks({
  bar,
  showFicha = false,
  publicHref,
  stacked = false
}: {
  bar: TrickBar
  showFicha?: boolean
  /** Página do bar no app, para "Ver como torcedor". */
  publicHref?: string
  stacked?: boolean
}) {
  const { entering, enter } = useEnterOwner(bar)
  const item = stacked ? { justifyContent: 'flex-start' as const } : undefined
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: stacked ? 'column' : 'row',
        flexWrap: 'wrap',
        gap: stacked ? 8 : 10
      }}
    >
      <button
        type="button"
        className="hd-btn hd-btn-ink"
        disabled={entering}
        onClick={enter}
        style={item}
      >
        <Icon name="mask" size={18} />
        {entering ? 'Entrando…' : 'Entrar na pele do dono'}
      </button>
      {showFicha ? (
        <Link
          to="/houdini/bares/$barId"
          params={{ barId: bar.id }}
          className="hd-btn"
          style={item}
        >
          <Icon name="doc" size={18} />
          Abrir a ficha completa
        </Link>
      ) : null}
      {publicHref ? (
        <a
          className="hd-btn"
          href={publicHref}
          target="_blank"
          rel="noreferrer"
          style={item}
        >
          Ver como torcedor
        </a>
      ) : null}
      {bar.stripeUrl ? (
        <a
          className="hd-btn"
          href={bar.stripeUrl}
          target="_blank"
          rel="noreferrer"
          style={item}
        >
          <Icon name="external" size={18} />
          Abrir no Stripe
        </a>
      ) : null}
    </div>
  )
}

/**
 * Os truques de um bar: estender o teste do cadastro e tirar do ar (segurando)
 * ou religar. Tudo vai para o Grimório.
 */
export function BarTricks({ bar }: { bar: TrickBar }) {
  const trpc = useTRPC()
  const refresh = useRefresh()
  const [days, setDays] = useState<(typeof TRIAL_DAYS)[number]>(14)

  const extend = useMutation(
    trpc.adminBars.extendTrial.mutationOptions({
      onSuccess: async (result) => {
        toast.success(
          `Teste até ${result.currentPeriodEnd ? formatDateTime(result.currentPeriodEnd) : '—'}.${result.isActive && !bar.isActive ? ' O bar voltou ao ar.' : ''}`
        )
        await refresh()
      },
      onError: (error) =>
        toast.error(
          getUserFacingMessage(error, 'Não foi possível estender o teste.')
        )
    })
  )
  const setActive = useMutation(
    trpc.adminBars.setActive.mutationOptions({
      onSuccess: async (result) => {
        toast.success(
          result.isActive
            ? `${bar.name} voltou ao ar.`
            : `${bar.name} saiu do ar.`
        )
        await refresh()
      },
      onError: (error) =>
        toast.error(
          getUserFacingMessage(error, 'Não foi possível mudar o bar.')
        )
    })
  )
  const busy = extend.isPending || setActive.isPending
  const trial = isSignupTrial(bar)

  return (
    <>
      <div className="hd-label">
        <span>Estender o teste</span>
        <fieldset
          className="hd-seg"
          aria-label="Dias a mais no teste"
          disabled={!trial}
        >
          {TRIAL_DAYS.map((n) => (
            <button
              key={n}
              type="button"
              aria-pressed={trial && days === n}
              onClick={() => setDays(n)}
            >
              {n} dias
            </button>
          ))}
        </fieldset>
        {trial ? (
          <button
            type="button"
            className="hd-btn hd-btn-primary"
            disabled={busy}
            onClick={() => extend.mutate({ barId: bar.id, days })}
            style={{ alignSelf: 'flex-start' }}
          >
            <Icon name="hourglass" size={18} />
            {extend.isPending
              ? 'Estendendo…'
              : `Estender o teste em ${days} dias`}
          </button>
        ) : (
          <small className="hd-small" style={{ fontWeight: 400 }}>
            {bar.subscription?.externalSubscriptionId
              ? 'Não se aplica: este bar já assina pelo Stripe.'
              : 'Não se aplica: este bar não está no teste do cadastro.'}
          </small>
        )}
      </div>
      <hr className="hd-rule" />
      {bar.isActive ? (
        <>
          <div className="hd-label">
            <span>Tirar do ar</span>
            <small className="hd-small" style={{ fontWeight: 400 }}>
              Some da busca e do mapa na hora. Os jogos ficam guardados e voltam
              com o bar.
            </small>
          </div>
          <HoldButton
            label="Segure para tirar do ar"
            busyLabel="Tirando do ar…"
            busy={setActive.isPending}
            disabled={busy}
            onConfirm={() => setActive.mutate({ barId: bar.id, active: false })}
          />
        </>
      ) : (
        <>
          <div className="hd-label">
            <span>Fora do ar</span>
          </div>
          <button
            type="button"
            className="hd-btn"
            disabled={busy}
            onClick={() => setActive.mutate({ barId: bar.id, active: true })}
          >
            <Icon name="back" size={18} />
            {setActive.isPending ? 'Religando…' : 'Religar'}
          </button>
        </>
      )}
    </>
  )
}
