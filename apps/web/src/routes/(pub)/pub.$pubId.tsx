import {
  ArrowLeftBigIcon,
  LoaderPinwheelIcon
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { AppShell } from '@/components/app/app-shell'
import { BarHeroSection } from '@/components/pub/bar-hero-section'
import { BarInfoSidebar } from '@/components/pub/bar-info-sidebar'
import { EventsList } from '@/components/pub/events-list'
import { authClient } from '@/lib/auth-client'
import { useTRPC } from '@/utils/trpc'

export const Route = createFileRoute('/(pub)/pub/$pubId')({
  head: () => ({
    meta: [
      { title: 'Bar parceiro — FindSports' },
      {
        name: 'description',
        content:
          'Veja a programação de jogos, horários e como chegar neste bar parceiro do FindSports.'
      }
    ]
  }),
  component: BarPage
})

const LIVE_WINDOW_MS = 3 * 60 * 60 * 1000

function isLive(startsAt: string | Date): boolean {
  const start = new Date(startsAt).getTime()
  const now = Date.now()
  return now >= start && now <= start + LIVE_WINDOW_MS
}

type FavCache = { isFavorited: boolean }

function BarPage() {
  const { pubId } = Route.useParams()
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const { data: sessionData } = authClient.useSession()
  const isFan = sessionData?.user?.role === 'fan'

  const [, setTick] = useState(0)
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 60_000)
    return () => clearInterval(interval)
  }, [])

  const {
    data: bar,
    isLoading,
    isError
  } = useQuery(trpc.pubs.getById.queryOptions({ id: pubId }))

  const isFavQueryKey = trpc.pubs.isFavorited.queryKey({ barId: pubId })
  const favListQueryKey = trpc.pubs.getFavorites.queryKey()

  const { data: favData } = useQuery({
    ...trpc.pubs.isFavorited.queryOptions({ barId: pubId }),
    enabled: isFan
  })
  const isFavorited = favData?.isFavorited ?? false

  const optimistic = async (next: boolean) => {
    await queryClient.cancelQueries({ queryKey: isFavQueryKey })
    const prev = queryClient.getQueryData<FavCache>(isFavQueryKey)
    queryClient.setQueryData<FavCache>(isFavQueryKey, { isFavorited: next })
    return { prev }
  }

  const rollback = (
    _err: unknown,
    _vars: unknown,
    ctx: { prev?: FavCache } | undefined
  ) => {
    if (ctx?.prev !== undefined)
      queryClient.setQueryData<FavCache>(isFavQueryKey, ctx.prev)
  }

  const settle = () => {
    queryClient.invalidateQueries({ queryKey: isFavQueryKey })
    queryClient.invalidateQueries({ queryKey: favListQueryKey })
  }

  const favoriteMutation = useMutation({
    mutationFn: trpc.pubs.favorite.mutationOptions().mutationFn,
    onMutate: () => optimistic(true),
    onError: rollback,
    onSettled: settle
  })

  const unfavoriteMutation = useMutation({
    mutationFn: trpc.pubs.unfavorite.mutationOptions().mutationFn,
    onMutate: () => optimistic(false),
    onError: rollback,
    onSettled: settle
  })

  if (isLoading) {
    return (
      <AppShell role="fan" userMeta={''}>
        <div className="flex items-center justify-center py-24 text-zinc-400">
          <HugeiconsIcon
            icon={LoaderPinwheelIcon}
            size={24}
            color="currentColor"
            strokeWidth={1.5}
            className="animate-spin mr-2"
          />
          <span className="text-sm">Carregando...</span>
        </div>
      </AppShell>
    )
  }

  if (isError || !bar) {
    return (
      <AppShell role="fan" userMeta={''}>
        <div className="py-24 text-center">
          <p className="font-semibold text-zinc-600 mb-3">
            Bar não encontrado ou removido.
          </p>
          <Link
            to="/dashboard"
            className="text-sm font-bold text-brand-orange hover:underline"
          >
            Voltar para o início
          </Link>
        </div>
      </AppShell>
    )
  }

  const liveEvent = bar.events.find((e) => isLive(e.startsAt))
  const upcomingEvents = bar.events.filter((e) => !isLive(e.startsAt))

  const handleDirections = () => {
    const lat = parseFloat(bar.latitude)
    const lng = parseFloat(bar.longitude)
    const label = encodeURIComponent(bar.name)
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
    const url = isIOS
      ? `maps://maps.apple.com/?daddr=${lat},${lng}&q=${label}`
      : `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`
    window.open(url, '_blank')
  }

  const handleFavorite = () => {
    if (!isFan) {
      navigate({ to: '/login' })
      return
    }
    if (isFavorited) {
      unfavoriteMutation.mutate({ barId: bar.id })
    } else {
      favoriteMutation.mutate({ barId: bar.id })
    }
  }

  return (
    <AppShell role="fan" userMeta={bar.name}>
      <Link
        to="/dashboard"
        className="inline-flex items-center gap-2 text-sm font-bold text-zinc-500 hover:text-black mb-4"
      >
        <HugeiconsIcon
          icon={ArrowLeftBigIcon}
          size={16}
          color="currentColor"
          strokeWidth={1.5}
        />{' '}
        Voltar
      </Link>

      <BarHeroSection
        bar={bar}
        liveEvent={liveEvent}
        isFavorited={isFavorited}
        onDirections={handleDirections}
        onFavorite={handleFavorite}
      />

      <div className="grid lg:grid-cols-[1fr_340px] gap-8">
        <div className="space-y-8 min-w-0">
          <EventsList
            liveEvent={liveEvent}
            upcomingEvents={upcomingEvents}
            allEvents={bar.events}
          />
        </div>

        <BarInfoSidebar bar={bar} onDirections={handleDirections} />
      </div>
    </AppShell>
  )
}
