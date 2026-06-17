/** biome-ignore-all lint/a11y/useValidAriaRole: <explanation> */
import {
  AlertCircleIcon,
  ArrowRight01Icon,
  InformationCircleIcon,
  LoaderPinwheelIcon
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { BarPreview } from '@/components/admin/bar-preview'
import { EventsManager } from '@/components/admin/events-manager'
import { PubHeroSection } from '@/components/admin/pub-hero-section'
import { AppShell } from '@/components/app/app-shell'
import { analytics } from '@/lib/analytics'
import { useTRPC } from '@/utils/trpc'

export const Route = createFileRoute('/admin')({
  head: () => ({
    meta: [
      { title: 'Painel do Bar — FindSports' },
      {
        name: 'description',
        content:
          'Gerencie a programação de jogos do seu bar e atraia torcedores perto de você.'
      },
      { name: 'robots', content: 'noindex' }
    ]
  }),
  component: PubDashboard
})

const LIVE_WINDOW_MS = 3 * 60 * 60 * 1000
const STARTER_LIMIT = 5

function isLive(startsAt: string | Date): boolean {
  const start = new Date(startsAt).getTime()
  const now = Date.now()
  return now >= start && now <= start + LIVE_WINDOW_MS
}

function countEventsInPeriod(
  events: { createdAt: string | Date }[],
  currentPeriodEnd: string | Date | null
): number {
  const periodStart = currentPeriodEnd
    ? new Date(new Date(currentPeriodEnd).getTime() - 30 * 24 * 60 * 60 * 1000)
    : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  return events.filter((e) => new Date(e.createdAt) >= periodStart).length
}

function PubDashboard() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const [, setTick] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 60_000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    analytics.adminViewed()
  }, [])

  const { data: bar, isLoading: loadingBar } = useQuery(
    trpc.pub.getMe.queryOptions()
  )
  const { data: events = [] } = useQuery(trpc.pub.getMyEvents.queryOptions())
  const { data: subscription } = useQuery(
    trpc.pub.getMySubscription.queryOptions()
  )

  const updateMeMutation = useMutation(
    trpc.pub.updateMe.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: trpc.pub.getMe.queryKey() })
      }
    })
  )

  if (loadingBar) {
    return (
      <AppShell role="pub">
        <div className="flex items-center justify-center py-24 text-zinc-400">
          <HugeiconsIcon
            icon={LoaderPinwheelIcon}
            size={24}
            color="currentColor"
            strokeWidth={1.5}
            className="animate-spin mr-2"
          />
        </div>
      </AppShell>
    )
  }

  const liveEvent = events.find((e) => isLive(e.startsAt))
  const totalCount = events.length
  const isInactive = bar && !bar.isActive
  const plan = subscription?.plan ?? 'starter'
  const isStarter = plan === 'starter'

  const eventsUsed = isStarter
    ? countEventsInPeriod(
        events.map((e) => ({ createdAt: e.createdAt })),
        subscription?.currentPeriodEnd ?? null
      )
    : 0
  const eventsRemaining = Math.max(0, STARTER_LIMIT - eventsUsed)
  const isNearLimit = isStarter && eventsRemaining <= 1
  const isAtLimit = isStarter && eventsRemaining === 0

  return (
    <AppShell role="pub" userMeta={bar?.name}>
      {/* Aviso de bar inativo */}
      {isInactive && (
        <div
          className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 mb-4"
          ref={(el) => {
            if (el) analytics.barInactiveWarningShown()
          }}
        >
          <HugeiconsIcon
            icon={AlertCircleIcon}
            size={20}
            color="currentColor"
            strokeWidth={1.5}
            className="text-amber-600 shrink-0 mt-0.5"
          />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-amber-900 mb-0.5">
              Seu bar não está visível na plataforma
            </p>
            <p className="text-sm text-amber-700">
              Nenhum plano ou período de teste ativo. Ative um plano para
              aparecer nas buscas e no mapa.
            </p>
          </div>
          <Link
            to="/plan"
            className="shrink-0 inline-flex items-center gap-1.5 rounded-full bg-amber-600 px-4 py-2 text-xs font-bold text-white hover:bg-amber-700 active:scale-95 transition-all shadow-sm shadow-amber-200"
          >
            Ver planos
            <HugeiconsIcon
              icon={ArrowRight01Icon}
              size={13}
              color="currentColor"
              strokeWidth={2}
            />
          </Link>
        </div>
      )}

      {/* Aviso de limite Starter */}
      {isStarter && !isInactive && (
        <div
          ref={(el) => {
            if (el && isAtLimit) analytics.eventLimitReached()
          }}
          className={`flex items-start gap-3 rounded-2xl border px-5 py-4 mb-4 ${
            isAtLimit
              ? 'border-red-200 bg-red-50'
              : isNearLimit
                ? 'border-amber-200 bg-amber-50'
                : 'border-blue-100 bg-blue-50'
          }`}
        >
          <HugeiconsIcon
            icon={
              isAtLimit || isNearLimit ? AlertCircleIcon : InformationCircleIcon
            }
            size={20}
            color="currentColor"
            strokeWidth={1.5}
            className={`shrink-0 mt-0.5 ${isAtLimit ? 'text-red-500' : isNearLimit ? 'text-amber-600' : 'text-blue-500'}`}
          />
          <div className="flex-1 min-w-0">
            <p
              className={`text-sm font-semibold mb-0.5 ${isAtLimit ? 'text-red-900' : isNearLimit ? 'text-amber-900' : 'text-blue-900'}`}
            >
              {isAtLimit
                ? 'Limite de jogos atingido este mês'
                : isNearLimit
                  ? 'Último jogo disponível no plano Starter'
                  : `Plano Starter — ${eventsRemaining} de ${STARTER_LIMIT} jogos restantes`}
            </p>
            <p
              className={`text-sm ${isAtLimit ? 'text-red-700' : isNearLimit ? 'text-amber-700' : 'text-blue-700'}`}
            >
              {isAtLimit
                ? 'Faça upgrade para o plano Pro e cadastre jogos ilimitados.'
                : isNearLimit
                  ? 'Considere fazer upgrade para o Pro antes de atingir o limite.'
                  : `Você usou ${eventsUsed} jogo${eventsUsed !== 1 ? 's' : ''} neste período de cobrança.`}
            </p>
          </div>
          {(isAtLimit || isNearLimit) && (
            <Link
              to="/plan"
              className={`shrink-0 inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-bold text-white active:scale-95 transition-all ${
                isAtLimit
                  ? 'bg-red-500 hover:bg-red-600 shadow-sm shadow-red-200'
                  : 'bg-amber-600 hover:bg-amber-700 shadow-sm shadow-amber-200'
              }`}
            >
              Fazer upgrade
              <HugeiconsIcon
                icon={ArrowRight01Icon}
                size={13}
                color="currentColor"
                strokeWidth={2}
              />
            </Link>
          )}
        </div>
      )}

      <PubHeroSection
        bar={bar ?? { name: 'Meu bar' }}
        liveEvent={liveEvent}
        totalCount={totalCount}
        isSaving={updateMeMutation.isPending}
        onSave={async (data) =>
          updateMeMutation.mutate({
            name: data.name || undefined,
            address: data.address || undefined,
            neighborhood: data.neighborhood || undefined,
            city: data.city || undefined,
            phone: data.phone || undefined,
            description: data.description || undefined
          })
        }
        onPhotoUpdate={() => {
          queryClient.invalidateQueries({ queryKey: trpc.pub.getMe.queryKey() })
        }}
      />

      {/* Preview de como o bar aparece na plataforma */}
      {bar && (
        <BarPreview
          bar={{
            id: bar.id,
            name: bar.name,
            neighborhood: bar.neighborhood,
            city: bar.city,
            latitude: bar.latitude,
            longitude: bar.longitude,
            photo_url: bar.photoUrl
          }}
        />
      )}

      <EventsManager />
    </AppShell>
  )
}
