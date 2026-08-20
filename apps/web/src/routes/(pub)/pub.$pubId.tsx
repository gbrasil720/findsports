import type { AppRouter } from '@findsports_oficial/api/routers/index'
import { Skeleton } from '@findsports_oficial/ui/components/skeleton'
import { useMutation, useQuery } from '@tanstack/react-query'
import {
  createFileRoute,
  useLocation,
  useNavigate
} from '@tanstack/react-router'
import type { inferRouterOutputs } from '@trpc/server'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { AppShell } from '@/components/app/app-shell'
import { MinuteTickProvider } from '@/components/app/minute-tick'
import { AuthRequiredDialog } from '@/components/pub/auth-required-dialog'
import { BarActions } from '@/components/pub/bar-action-bar'
import { BarCharacteristics } from '@/components/pub/bar-characteristics'
import { BarCover } from '@/components/pub/bar-cover'
import { BarLocationBlock } from '@/components/pub/bar-location-block'
import { EventsList } from '@/components/pub/events-list'
import { HeroEventCard } from '@/components/pub/hero-event-card'
import { OwnerPreviewBanner } from '@/components/pub/owner-notice'
import { buildBarFacts } from '@/domain/bar-facts'
import {
  formatDayLabel,
  formatEventTime,
  formatMatchup,
  type ProfileEvent,
  resolveHeroEvent
} from '@/domain/pub-profile'
import { canFavoriteBars, shellVariantForViewer } from '@/domain/viewer'
import { analytics } from '@/lib/analytics'
import { authClient } from '@/lib/auth-client'
import { trackCommercialEvent } from '@/lib/commercial-tracking'
import { buildDirectionsUrl } from '@/lib/maps-link'
import { buildWhatsAppLink } from '@/lib/whatsapp-link'
import { useTRPC } from '@/utils/trpc'

export const Route = createFileRoute('/(pub)/pub/$pubId')({
  // A página exige login (o registro de analytics depende de um fã
  // identificado), então não deve ser indexada: um resultado de busca que
  // leva a um portão de login é ruim para quem chega e inútil para o bar.
  head: () => ({
    meta: [{ title: 'Bar — Onside' }, { name: 'robots', content: 'noindex' }]
  }),
  component: PubPage
})

type RouterOutputs = inferRouterOutputs<AppRouter>
type PubOutput = NonNullable<RouterOutputs['pubs']['getById']>

type NormalizedPub = Omit<PubOutput, 'events'> & { events: ProfileEvent[] }

/**
 * tRPC serializa `Date` como string. A normalização acontece uma vez, aqui,
 * para que os componentes recebam `Date` e nenhum deles precise adivinhar o
 * formato.
 */
function normalizePub(raw: PubOutput | undefined): NormalizedPub | undefined {
  if (!raw) return undefined

  return {
    ...raw,
    events: raw.events.map((event) => ({
      id: event.id,
      championship: event.championship,
      startsAt: new Date(event.startsAt),
      endsAt: event.endsAt ? new Date(event.endsAt) : null,
      participantFreeText: event.participantFreeText,
      sport: { name: event.sport.name, slug: event.sport.slug },
      participants: event.participants.map((participant) => ({
        team: {
          name: participant.team.name,
          logoUrl: participant.team.logoUrl
        }
      }))
    }))
  }
}

function PubPage() {
  const { pubId } = Route.useParams()
  const navigate = useNavigate()
  const { href } = useLocation()
  const { data: session } = authClient.useSession()
  const [eventId, setEventId] = useState<string | null>(null)
  const [isFavorited, setIsFavorited] = useState(false)
  const [favoritePending, setFavoritePending] = useState(false)
  const trpc = useTRPC()

  const {
    data: pub,
    isLoading: isLoadingPub,
    isError
  } = useQuery({
    ...trpc.pubs.getById.queryOptions({ id: pubId }),
    enabled: Boolean(session)
  })

  const normalizedPub = useMemo(() => normalizePub(pub), [pub])

  // Extract eventId from URL search params (stable — no re-run on navigation)
  useEffect(() => {
    const params = new URLSearchParams(href.split('?')[1])
    const id = params.get('eventId')
    if (id) setEventId(id)
  }, [href])

  // Track profile_view when pub data loads (only after auth, only on success)
  useEffect(() => {
    if (normalizedPub) {
      trackCommercialEvent({
        pubId,
        type: 'profile_view',
        sourceEventId: eventId ?? undefined
      })
    }
  }, [normalizedPub, pubId, eventId])

  // Redirect if pub not found (only after auth resolves)
  useEffect(() => {
    if (!isLoadingPub && !normalizedPub && isError) {
      toast.error('Bar não encontrado')
      navigate({ to: '/dashboard' })
    }
  }, [isLoadingPub, normalizedPub, isError, navigate])

  const canFavorite = canFavoriteBars(session?.user?.role)

  const { data: favoriteData } = useQuery({
    ...trpc.pubs.isFavorited.queryOptions({ barId: pubId }),
    enabled: canFavorite && Boolean(normalizedPub)
  })

  useEffect(() => {
    if (favoriteData !== undefined) setIsFavorited(favoriteData.isFavorited)
  }, [favoriteData])

  const favoriteMutation = useMutation(
    trpc.pubs.favorite.mutationOptions({
      onSuccess: () => {
        toast.success('Adicionado aos favoritos')
        setIsFavorited(true)
      },
      onError: (err) => toast.error(err.message || 'Erro ao favoritar')
    })
  )

  const unfavoriteMutation = useMutation(
    trpc.pubs.unfavorite.mutationOptions({
      onSuccess: () => {
        toast.success('Removido dos favoritos')
        setIsFavorited(false)
      },
      onError: (err) => toast.error(err.message || 'Erro ao remover favorito')
    })
  )

  const handleToggleFavorite = async () => {
    if (!canFavorite) return
    setFavoritePending(true)
    try {
      if (isFavorited) {
        await unfavoriteMutation.mutateAsync({ barId: pubId })
      } else {
        await favoriteMutation.mutateAsync({ barId: pubId })
      }
    } catch {
      // errors handled in mutation callbacks
    } finally {
      setFavoritePending(false)
    }
  }

  const heroEvent = useMemo(
    () =>
      normalizedPub ? resolveHeroEvent(normalizedPub.events, eventId) : null,
    [normalizedPub, eventId]
  )

  // Os fatos derivados saem do que a resposta já traz — a agenda e a data de
  // cadastro. Nenhuma query a mais para a seção de características não ficar
  // dependente do que o dono digitou.
  const barFacts = useMemo(
    () =>
      normalizedPub
        ? buildBarFacts({
            events: normalizedPub.events,
            createdAt: normalizedPub.createdAt,
            rating: normalizedPub.rating
          })
        : [],
    [normalizedPub]
  )

  const whatsappUrl = normalizedPub
    ? buildWhatsAppLink({
        phone: normalizedPub.phone,
        acceptsWhatsapp: normalizedPub.phoneAcceptsWhatsapp,
        event: heroEvent
          ? {
              matchup: formatMatchup(heroEvent),
              when: `${formatDayLabel(heroEvent.startsAt).toLowerCase()} às ${formatEventTime(heroEvent.startsAt)}`
            }
          : null
      })
    : null

  const directionsUrl = normalizedPub
    ? buildDirectionsUrl({
        latitude: normalizedPub.latitude,
        longitude: normalizedPub.longitude,
        name: normalizedPub.name,
        address: normalizedPub.address
      })
    : null

  // O jogo de origem contextualiza toda ação comercial: o bar precisa saber
  // qual jogo trouxe o contato, não só que houve contato.
  const sourceEventId = heroEvent?.id ?? eventId ?? undefined

  const handleOpenDirections = () => {
    analytics.barIntent({ bar_id: pubId, action: 'directions' })
    trackCommercialEvent({ pubId, type: 'directions_opened', sourceEventId })
  }

  const handlePhoneClick = () => {
    analytics.barIntent({ bar_id: pubId, action: 'phone' })
    trackCommercialEvent({ pubId, type: 'phone_clicked', sourceEventId })
  }

  const handleWhatsAppClick = () => {
    analytics.barIntent({ bar_id: pubId, action: 'whatsapp' })
    trackCommercialEvent({ pubId, type: 'whatsapp_opened', sourceEventId })
  }

  const isAuthed = Boolean(session)
  // Quem decide é o servidor: o cliente não recebe o `userId` do dono.
  const isOwner = normalizedPub?.isOwner === true
  // O cabeçalho segue o papel de quem visita, não o tipo da página: o
  // torcedor não pode receber a navegação do painel do bar.
  const shellVariant = shellVariantForViewer(session?.user?.role)

  const actions = {
    whatsappUrl,
    directionsUrl,
    phone: normalizedPub?.phone ?? null,
    onWhatsApp: handleWhatsAppClick,
    onDirections: handleOpenDirections,
    onPhone: handlePhoneClick
  }

  return (
    <MinuteTickProvider>
      <div className="flex min-h-dvh">
        {/* Auth gate dialog — shown when no session */}
        {!isAuthed && <AuthRequiredDialog open />}

        {/* Authenticated content — inert + aria-hidden when no session (spec §8.1) */}
        <div
          className="flex w-full flex-col"
          inert={!isAuthed}
          aria-hidden={!isAuthed}
        >
          <AppShell variant={shellVariant}>
            {isLoadingPub ? (
              <div className="space-y-4">
                <Skeleton className="h-[260px] w-full" />
                <Skeleton className="h-[140px] w-full" />
                <Skeleton className="h-[200px] w-full" />
              </div>
            ) : normalizedPub ? (
              <div className="onside-pub-page space-y-4 md:space-y-5">
                {isOwner && <OwnerPreviewBanner />}

                <BarCover
                  name={normalizedPub.name}
                  neighborhood={normalizedPub.neighborhood}
                  city={normalizedPub.city}
                  photoUrl={normalizedPub.photoUrl}
                  plan={normalizedPub.plan}
                  canFavorite={canFavorite}
                  isFavorited={isFavorited}
                  favoritePending={favoritePending}
                  onToggleFavorite={handleToggleFavorite}
                  isOwner={isOwner}
                />

                {heroEvent && (
                  <HeroEventCard
                    event={heroEvent}
                    fromSearch={Boolean(eventId) && heroEvent.id === eventId}
                  />
                )}

                <BarActions {...actions} variant="panel" isOwner={isOwner} />

                <BarLocationBlock
                  barId={normalizedPub.id}
                  name={normalizedPub.name}
                  address={normalizedPub.address}
                  neighborhood={normalizedPub.neighborhood}
                  city={normalizedPub.city}
                  latitude={normalizedPub.latitude}
                  longitude={normalizedPub.longitude}
                  plan={normalizedPub.plan}
                  directionsUrl={directionsUrl}
                  onDirections={handleOpenDirections}
                />

                <EventsList
                  events={normalizedPub.events}
                  highlightedEventId={heroEvent?.id ?? null}
                  whatsappUrl={whatsappUrl}
                  onWhatsApp={handleWhatsAppClick}
                  isOwner={isOwner}
                />

                <BarCharacteristics
                  amenities={normalizedPub.amenities}
                  screenCount={normalizedPub.screenCount}
                  description={normalizedPub.description}
                  facts={barFacts}
                  isOwner={isOwner}
                />

                <BarActions {...actions} variant="bar" isOwner={isOwner} />
              </div>
            ) : null}
          </AppShell>
        </div>
      </div>
    </MinuteTickProvider>
  )
}
