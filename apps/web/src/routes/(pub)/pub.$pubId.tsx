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

function PubPageSkeleton() {
  return (
    <div
      className="onside-pub-page space-y-4 md:space-y-5"
      role="status"
      aria-busy="true"
      aria-live="polite"
    >
      <span className="sr-only">Carregando perfil do bar…</span>
      <section className="onside-panel overflow-hidden">
        <Skeleton className="h-[300px] w-full md:h-[360px]" />
        <div className="flex items-start justify-between gap-4 p-5 md:p-6">
          <div className="min-w-0 flex-1 space-y-3">
            <Skeleton className="h-9 w-2/3 max-w-full" />
            <Skeleton className="h-3 w-40 max-w-full" />
          </div>
          <Skeleton className="h-11 w-28 shrink-0" />
        </div>
      </section>

      <section className="onside-panel p-5 md:p-6">
        <div className="mb-4 flex gap-2">
          <Skeleton className="h-7 w-28" />
          <Skeleton className="h-7 w-36" />
        </div>
        <div className="flex items-center gap-4">
          <Skeleton className="size-10 shrink-0" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-7 w-2/3 max-w-full" />
            <Skeleton className="h-3 w-1/2 max-w-full" />
          </div>
        </div>
      </section>

      <section className="onside-panel p-5 md:p-6">
        <Skeleton className="mb-4 h-7 w-36" />
        <div className="flex flex-col gap-2 sm:flex-row">
          <Skeleton className="h-12 w-full sm:flex-1" />
          <Skeleton className="h-12 w-full sm:w-32" />
          <Skeleton className="h-12 w-full sm:w-32" />
        </div>
      </section>

      <section className="onside-panel p-5 md:p-6">
        <Skeleton className="mb-4 h-7 w-32" />
        <div className="space-y-2">
          {[1, 2, 3].map((item) => (
            <div
              key={item}
              className="flex min-h-[58px] items-center gap-3 border border-[var(--onside-line)] p-3"
            >
              <Skeleton className="h-4 w-12 shrink-0" />
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-4 w-2/3 max-w-full" />
                <Skeleton className="h-3 w-1/2 max-w-full" />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="onside-panel p-5 md:p-6">
        <Skeleton className="mb-4 h-7 w-48" />
        <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,280px)]">
          <div className="space-y-3">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-4 w-3/4 max-w-full" />
            <Skeleton className="h-4 w-2/3 max-w-full" />
          </div>
          <div className="space-y-3">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        </div>
      </section>
    </div>
  )
}

function PubPage() {
  const { pubId } = Route.useParams()
  const navigate = useNavigate()
  const { href } = useLocation()
  const { data: session } = authClient.useSession()
  const [eventId, setEventId] = useState<string | null>(null)
  const [isFavorited, setIsFavorited] = useState(false)
  const [favoritePending, setFavoritePending] = useState(false)
  const [recommendationRunId, setRecommendationRunId] = useState<string | null>(
    null
  )
  const trpc = useTRPC()

  const {
    data: pub,
    isLoading: isLoadingPub,
    isError
  } = useQuery({
    ...trpc.pubs.getById.queryOptions({ id: pubId }),
    enabled: Boolean(session),
    // A tela já avisa e redireciona quando o bar não existe. Com o toast
    // global ligado, o mesmo "Bar não encontrado." aparecia duas vezes.
    meta: { errorToast: false }
  })

  const normalizedPub = useMemo(() => normalizePub(pub), [pub])

  // Extract eventId from URL search params (stable — no re-run on navigation)
  useEffect(() => {
    const params = new URLSearchParams(href.split('?')[1])
    const id = params.get('eventId')
    if (id) setEventId(id)
  }, [href])

  useEffect(() => {
    const storageKey = `onside:recommendation:${pubId}`
    setRecommendationRunId(sessionStorage.getItem(storageKey))
    sessionStorage.removeItem(storageKey)
  }, [pubId])

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

  /*
   * Bar inexistente devolve quem estava olhando à casa do próprio papel. O
   * destino era `/dashboard` fixo, e dono de bar não entra lá: a guarda de
   * rota o mandava para `/admin`, então o que ele via era um redirecionamento
   * duplo terminando numa tela que não explica nada.
   */
  const viewerRole = session?.user?.role
  useEffect(() => {
    if (!isLoadingPub && !normalizedPub && isError) {
      toast.error('Bar não encontrado.')
      navigate({ to: viewerRole === 'pub' ? '/admin' : '/dashboard' })
    }
  }, [isLoadingPub, normalizedPub, isError, navigate, viewerRole])

  const canFavorite = canFavoriteBars(session?.user?.role)

  const { data: favoriteData, isLoading: favoriteLoading } = useQuery({
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
        await unfavoriteMutation.mutateAsync({
          barId: pubId,
          recommendationRunId: recommendationRunId ?? undefined
        })
      } else {
        await favoriteMutation.mutateAsync({
          barId: pubId,
          recommendationRunId: recommendationRunId ?? undefined
        })
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
    trackCommercialEvent({
      pubId,
      type: 'directions_opened',
      sourceEventId,
      recommendationRunId: recommendationRunId ?? undefined
    })
  }

  const handlePhoneClick = () => {
    analytics.barIntent({ bar_id: pubId, action: 'phone' })
    trackCommercialEvent({
      pubId,
      type: 'phone_clicked',
      sourceEventId,
      recommendationRunId: recommendationRunId ?? undefined
    })
  }

  const handleWhatsAppClick = () => {
    analytics.barIntent({ bar_id: pubId, action: 'whatsapp' })
    trackCommercialEvent({
      pubId,
      type: 'whatsapp_opened',
      sourceEventId,
      recommendationRunId: recommendationRunId ?? undefined
    })
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
    /*
     * `flex-col`: como item de um flex em linha, o `.onside-app` do AppShell
     * encolhia até o conteúdo e a página ficava numa coluna estreita no
     * celular. Em coluna o item estica na largura.
     */
    <div className="flex min-h-dvh flex-col">
      <AppShell variant={shellVariant}>
        {/* Auth gate dialog — shown when no session */}
        {!isAuthed && <AuthRequiredDialog open />}

        {/* Authenticated content — inert + aria-hidden when no session (spec §8.1) */}
        <div
          className="flex w-full flex-col"
          inert={!isAuthed}
          aria-hidden={!isAuthed}
        >
          {isLoadingPub ? (
            <PubPageSkeleton />
          ) : normalizedPub ? (
            <div className="onside-pub-page space-y-4 md:space-y-5">
              {isOwner && (
                <OwnerPreviewBanner
                  isPublished={normalizedPub?.isActive !== false}
                />
              )}

              <BarCover
                name={normalizedPub.name}
                neighborhood={normalizedPub.neighborhood}
                city={normalizedPub.city}
                photoUrl={normalizedPub.photoUrl}
                plan={normalizedPub.plan}
                canFavorite={canFavorite}
                isFavorited={isFavorited}
                favoritePending={
                  favoritePending || (canFavorite && favoriteLoading)
                }
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
        </div>
      </AppShell>
    </div>
  )
}
