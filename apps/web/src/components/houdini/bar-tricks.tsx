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
import { HatIcon, Icon } from './icons'

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
      <div
        role="status"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '12px 14px',
          borderRadius: 12,
          background: 'rgb(64 214 150 / 0.10)',
          border: '1px solid rgb(64 214 150 / 0.3)',
          color: 'var(--hd-ok)',
          fontSize: 13,
          fontWeight: 600
        }}
      >
        <Icon name="check" size={16} strokeWidth={2} />
        Busca em {PLAN_NAMES[fixedTo]} agora. Anotado no Grimório.
      </div>
    )
  }
  if (!searchDrift(bar)) return null

  return (
    <div className="hd-alert" role="alert">
      <span className="hd-alert-title">
        <Icon name="warn" size={16} strokeWidth={1.8} />
        Busca desatualizada
      </span>
      <p
        style={{
          margin: 0,
          fontSize: 13,
          lineHeight: 1.5,
          color: 'var(--hd-soft)'
        }}
      >
        {bar.currentPlan
          ? `O plano é ${PLAN_NAMES[bar.currentPlan]}`
          : 'O bar está sem plano (na busca, Starter)'}
        , mas a busca ainda ordena este bar como {PLAN_NAMES[bar.barPlan]}. A
        reconciliação diária só arrumaria em até 24 h.
      </p>
      <button
        type="button"
        className="hd-btn"
        disabled={sync.isPending}
        onClick={() => sync.mutate({ barId: bar.id })}
        style={{
          border: 0,
          background: 'var(--hd-warn)',
          color: 'var(--hd-bg)',
          fontWeight: 700
        }}
      >
        {sync.isPending ? 'Arrumando…' : 'Arrumar agora'}
      </button>
      <span className="hd-small" style={{ fontSize: 11 }}>
        Aplica a mesma regra da reconciliação, só neste bar. Fica no Grimório.
      </span>
    </div>
  )
}

/**
 * Os truques de um bar: estender o teste, entrar na pele do dono, Stripe e
 * tirar do ar ou religar. O painel de Bares empilha; a ficha põe em linha.
 */
export function BarTricks({
  bar,
  inline = false,
  showFicha = false,
  publicHref
}: {
  bar: TrickBar
  inline?: boolean
  showFicha?: boolean
  /** Página do bar no app, para "Ver como torcedor". */
  publicHref?: string
}) {
  const trpc = useTRPC()
  const refresh = useRefresh()
  const [days, setDays] = useState<(typeof TRIAL_DAYS)[number]>(14)
  const [entering, setEntering] = useState(false)

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
  const busy = extend.isPending || setActive.isPending || entering

  // O mesmo caminho de Pessoas: a sessão vira a do dono e a página recarrega.
  async function enterOwner() {
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

  const item = inline ? undefined : { justifyContent: 'flex-start' as const }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: inline ? 'row' : 'column',
        flexWrap: inline ? 'wrap' : undefined,
        alignItems: inline ? 'center' : undefined,
        gap: 8
      }}
    >
      {showFicha ? (
        <Link
          to="/houdini/bares/$barId"
          params={{ barId: bar.id }}
          className="hd-btn"
          style={item}
        >
          <Icon name="doc" size={16} strokeWidth={1.8} />
          Abrir a ficha completa
        </Link>
      ) : null}

      {isSignupTrial(bar) ? (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 8,
            alignItems: 'center'
          }}
        >
          <fieldset className="hd-seg" aria-label="Dias a mais no teste">
            {TRIAL_DAYS.map((n) => (
              <button
                key={n}
                type="button"
                aria-pressed={days === n}
                onClick={() => setDays(n)}
              >
                {n} dias
              </button>
            ))}
          </fieldset>
          <button
            type="button"
            className="hd-btn hd-btn-primary"
            disabled={busy}
            onClick={() => extend.mutate({ barId: bar.id, days })}
            style={{ flexGrow: 1, ...item }}
          >
            <Icon name="hourglass" size={16} strokeWidth={2} />
            {extend.isPending
              ? 'Estendendo…'
              : `Estender o teste em ${days} dias`}
          </button>
        </div>
      ) : null}

      <button
        type="button"
        className={inline ? 'hd-btn hd-btn-primary' : 'hd-btn'}
        disabled={busy}
        onClick={enterOwner}
        style={item}
      >
        <HatIcon size={16} />
        {entering ? 'Entrando…' : 'Entrar na pele do dono'}
      </button>

      {publicHref ? (
        <a
          className="hd-btn"
          href={publicHref}
          target="_blank"
          rel="noreferrer"
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
          <Icon name="external" size={16} strokeWidth={1.8} />
          Abrir no Stripe
        </a>
      ) : null}

      {bar.isActive ? (
        <div style={inline ? { flex: '0 0 auto' } : undefined}>
          <HoldButton
            label="Segure para tirar do ar"
            busyLabel="Tirando do ar…"
            busy={setActive.isPending}
            disabled={busy}
            onConfirm={() => setActive.mutate({ barId: bar.id, active: false })}
          />
        </div>
      ) : (
        <button
          type="button"
          className="hd-btn"
          disabled={busy}
          onClick={() => setActive.mutate({ barId: bar.id, active: true })}
        >
          <Icon name="back" size={16} strokeWidth={1.8} />
          {setActive.isPending ? 'Religando…' : 'Religar'}
        </button>
      )}
    </div>
  )
}
