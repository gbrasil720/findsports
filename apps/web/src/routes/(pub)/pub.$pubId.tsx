/** biome-ignore-all lint/a11y/useValidAriaRole: AppShell role prop is product role, not ARIA */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import ArrowLeft from 'reicon-react/icons/ArrowLeft'
import Loader from 'reicon-react/icons/Loader'
import { AppShell } from '@/components/app/app-shell'
import { BarHeroSection } from '@/components/pub/bar-hero-section'
import { BarInfoSidebar } from '@/components/pub/bar-info-sidebar'
import { EventsList } from '@/components/pub/events-list'
import { getEventTemporalState } from '@/domain/events'
import { authClient } from '@/lib/auth-client'
import { useTRPC } from '@/utils/trpc'

export const Route = createFileRoute('/(pub)/pub/$pubId')({
  head: () => ({
    meta: [
      { title: 'Bar no Onside' },
      {
        name: 'description',
        content:
          'Veja a programação de jogos, horários e como chegar neste bar parceiro do Onside.'
      }
    ]
  }),
  component: BarPage
})

type FavCache = { isFavorited: boolean }

function BarPage() {
  const { pubId } = Route.useParams()
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const { data: sessionData } = authClient.useSession()
  const role = sessionData?.user?.role
  const isFan = role === 'fan'
  const isLoggedIn = Boolean(sessionData?.user)
  const shellVariant = isFan
    ? 'fan'
    : role === 'pub' || role === 'admin'
      ? 'pub'
      : 'public'

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

  useEffect(() => {
    if (bar?.name) document.title = `${bar.name} — Onside`
  }, [bar?.name])

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
      <AppShell variant="public">
        <div
          className="flex items-center justify-center py-24 text-[var(--onside-muted)]"
          aria-live="polite"
        >
          <Loader
            size={24}
            color="currentColor"
            className="mr-2 animate-spin"
            aria-hidden="true"
          />
          <span className="text-sm">Carregando…</span>
        </div>
      </AppShell>
    )
  }

  if (isError || !bar) {
    return (
      <AppShell variant="public">
        <div className="onside-panel py-16 text-center">
          <p className="mb-3 font-semibold text-[var(--onside-muted)]">
            Bar não encontrado ou removido.
          </p>
          <Link
            to={isLoggedIn ? '/dashboard' : '/'}
            className="font-bold text-[var(--onside-live-text)] text-sm hover:underline"
          >
            Voltar
          </Link>
        </div>
      </AppShell>
    )
  }

  const now = Date.now()
  const liveEvent = bar.events.find(
    (event) => getEventTemporalState(event.startsAt, now) === 'live'
  )
  const upcomingEvents = bar.events.filter(
    (event) => getEventTemporalState(event.startsAt, now) === 'upcoming'
  )

  const handleDirections = () => {
    const lat = parseFloat(bar.latitude)
    const lng = parseFloat(bar.longitude)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return
    const label = encodeURIComponent(bar.name)
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
    const url = isIOS
      ? `maps://maps.apple.com/?daddr=${lat},${lng}&q=${label}`
      : `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`
    window.open(url, '_blank')
  }

  const favoritePending =
    favoriteMutation.isPending || unfavoriteMutation.isPending

  const handleFavorite = () => {
    if (!isLoggedIn) {
      navigate({ to: '/login' })
      return
    }
    if (!isFan) {
      return
    }
    if (favoritePending) return
    if (isFavorited) {
      unfavoriteMutation.mutate({ barId: bar.id })
    } else {
      favoriteMutation.mutate({ barId: bar.id })
    }
  }

  return (
    <AppShell variant={shellVariant} userMeta={isFan ? bar.name : undefined}>
      <Link
        to={isLoggedIn && isFan ? '/dashboard' : '/'}
        className="mb-4 inline-flex min-h-11 items-center gap-2 font-[family-name:var(--onside-mono)] text-[11px] font-bold text-[var(--onside-muted)] uppercase tracking-[0.12em] hover:text-[var(--onside-ink)]"
      >
        <ArrowLeft size={16} color="currentColor" aria-hidden="true" />
        Voltar
      </Link>

      <BarHeroSection
        bar={bar}
        liveEvent={liveEvent}
        isFavorited={isFavorited}
        favoritePending={favoritePending}
        favoriteDisabled={!isFan && isLoggedIn}
        favoriteHint={
          !isLoggedIn
            ? 'Entre para favoritar'
            : !isFan
              ? 'Favoritos são exclusivos de torcedores'
              : undefined
        }
        onDirections={handleDirections}
        onFavorite={handleFavorite}
      />

      <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-8">
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
