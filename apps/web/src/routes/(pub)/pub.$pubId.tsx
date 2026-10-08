import { Skeleton } from '@findsports_oficial/ui/components/skeleton'
import { useMutation, useQuery } from '@tanstack/react-query'
import {
  createFileRoute,
  Link,
  useLocation,
  useNavigate
} from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { AppShell } from '@/components/app/app-shell'
import {
  AttendanceControl,
  HeroAttendance
} from '@/components/pub/attendance-control'
import { AuthRequiredDialog } from '@/components/pub/auth-required-dialog'
import { BarActions } from '@/components/pub/bar-action-bar'
import { BarCharacteristics } from '@/components/pub/bar-characteristics'
import { BarCover } from '@/components/pub/bar-cover'
import { BarLocationBlock } from '@/components/pub/bar-location-block'
import { EventsList } from '@/components/pub/events-list'
import { HeroEventCard } from '@/components/pub/hero-event-card'
import { HouseOfferSection } from '@/components/pub/house-offer-section'
import { OwnerPreviewBanner } from '@/components/pub/owner-notice'
import { ReservationRequestDialog } from '@/components/pub/reservation-request-dialog'
import { buildBarFacts } from '@/domain/bar-facts'
import {
  formatMatchup,
  normalizePub,
  resolveHeroEvent,
  resolveProfileActions
} from '@/domain/pub-profile'
import {
  canFavoriteBars,
  canRecordCommercialEvents,
  shellVariantForViewer
} from '@/domain/viewer'
import { getPubName } from '@/functions/get-pub-name'
import { useSession } from '@/hooks/use-session'
import { analytics } from '@/lib/analytics'
import { trackCommercialEvent } from '@/lib/commercial-tracking'
import { SITE_URL } from '@/lib/site'
import { getUserFacingMessage, isRetryableError } from '@/lib/user-facing-error'
import { useTRPC } from '@/utils/trpc'

export const Route = createFileRoute('/(pub)/pub/$pubId')({
  // A página exige login (o registro de analytics depende de um fã
  // identificado), então não deve ser indexada: um resultado de busca que
  // leva a um portão de login é ruim para quem chega e inútil para o bar.
  //
  // O nome do bar vem do loader para sair no HTML do servidor: a prévia de
  // link lê o título dali, sem sessão e sem rodar JS (WEB-312). Custa uma ida
  // ao servidor por abertura de bar; se falhar, fica o título genérico — a
  // página tem o próprio tratamento de erro e não pode cair por causa dele.
  loader: ({ params }) => getPubName({ data: params.pubId }).catch(() => null),
  head: ({ loaderData, params }) => {
    const title = `${loaderData ?? 'Bar'} — Onside`
    return {
      meta: [
        { title },
        { name: 'robots', content: 'noindex' },
        { property: 'og:title', content: title },
        { property: 'og:url', content: `${SITE_URL}/pub/${params.pubId}` },
        { name: 'twitter:title', content: title }
      ]
    }
  },
  component: PubPage
})

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
  const session = useSession()
  const [eventId, setEventId] = useState<string | null>(null)
  const [isFavorited, setIsFavorited] = useState(false)
  const [favoritePending, setFavoritePending] = useState(false)
  const [reserveOpen, setReserveOpen] = useState(false)
  const [recommendationRunId, setRecommendationRunId] = useState<string | null>(
    null
  )
  const trpc = useTRPC()

  const {
    data: pub,
    isLoading: isLoadingPub,
    isError,
    error: pubQueryError,
    refetch: refetchPub
  } = useQuery({
    ...trpc.pubs.getById.queryOptions({ id: pubId }),
    enabled: Boolean(session),
    // A tela já avisa e redireciona quando o bar não existe. Com o toast
    // global ligado, o mesmo "Bar não encontrado." aparecia duas vezes.
    meta: { errorToast: false }
  })

  const normalizedPub = useMemo(() => pub && normalizePub(pub), [pub])
  const pubErrorRetryable = isRetryableError(pubQueryError)
  const pubErrorMessage = getUserFacingMessage(
    pubQueryError,
    'Não foi possível carregar este bar. Tente novamente.'
  )

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

  const viewerRole = session?.user?.role
  // Só torcedor registra evento comercial: para o dono vendo o próprio
  // perfil o servidor responde 403, então o app nem pergunta (WEB-311).
  const canTrack = canRecordCommercialEvents(
    viewerRole,
    session?.session?.impersonatedBy
  )

  // Track profile_view when pub data loads (only after auth, only on success)
  useEffect(() => {
    if (normalizedPub && canTrack) {
      trackCommercialEvent({
        pubId,
        type: 'profile_view',
        sourceEventId: eventId ?? undefined
      })
    }
  }, [normalizedPub, pubId, eventId, canTrack])

  /*
   * Bar inexistente devolve quem estava olhando à casa do próprio papel. O
   * destino era `/dashboard` fixo, e dono de bar não entra lá: a guarda de
   * rota o mandava para `/admin`, então o que ele via era um redirecionamento
   * duplo terminando numa tela que não explica nada.
   */
  useEffect(() => {
    if (!isLoadingPub && !normalizedPub && isError && !pubErrorRetryable) {
      toast.error('Bar não encontrado.')
      navigate({ to: viewerRole === 'pub' ? '/admin' : '/dashboard' })
    }
  }, [
    isLoadingPub,
    normalizedPub,
    isError,
    navigate,
    pubErrorRetryable,
    viewerRole
  ])

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
      onError: (err) =>
        toast.error(
          getUserFacingMessage(
            err,
            'Não foi possível adicionar aos favoritos. Tente novamente.'
          )
        )
    })
  )

  const unfavoriteMutation = useMutation(
    trpc.pubs.unfavorite.mutationOptions({
      onSuccess: () => {
        toast.success('Removido dos favoritos')
        setIsFavorited(false)
      },
      onError: (err) =>
        toast.error(
          getUserFacingMessage(
            err,
            'Não foi possível remover dos favoritos. Tente novamente.'
          )
        )
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

  const profileActions = useMemo(
    () =>
      normalizedPub &&
      resolveProfileActions(normalizedPub, heroEvent, viewerRole),
    [normalizedPub, heroEvent, viewerRole]
  )
  const whatsappUrl = profileActions?.whatsappUrl ?? null
  const directionsUrl = profileActions?.directionsUrl ?? null
  const canReserve = profileActions?.canReserve ?? false

  // O jogo de origem contextualiza toda ação comercial: o bar precisa saber
  // qual jogo trouxe o contato, não só que houve contato.
  const sourceEventId = heroEvent?.id ?? eventId ?? undefined

  const handleOpenDirections = () => {
    analytics.barIntent({ bar_id: pubId, action: 'directions' })
    if (!canTrack) return
    trackCommercialEvent({
      pubId,
      type: 'directions_opened',
      sourceEventId,
      recommendationRunId: recommendationRunId ?? undefined
    })
  }

  const handlePhoneClick = () => {
    analytics.barIntent({ bar_id: pubId, action: 'phone' })
    if (!canTrack) return
    trackCommercialEvent({
      pubId,
      type: 'phone_clicked',
      sourceEventId,
      recommendationRunId: recommendationRunId ?? undefined
    })
  }

  const handleWhatsAppClick = () => {
    analytics.barIntent({ bar_id: pubId, action: 'whatsapp' })
    if (!canTrack) return
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
    onPhone: handlePhoneClick,
    onReserve: canReserve ? () => setReserveOpen(true) : null,
    reservationsSoldOut: profileActions?.reservationsSoldOut ?? false
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

              <HouseOfferSection offer={normalizedPub.houseOffer} />

              <BarActions
                {...actions}
                presence={
                  heroEvent?.attendance && (
                    <HeroAttendance
                      game={heroEvent}
                      attendance={heroEvent.attendance}
                      canReserve={canReserve}
                    />
                  )
                }
                variant="panel"
                isOwner={isOwner}
              />

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
                // `attendance` só vem onde o botão cabe; o servidor decide (WEB-127).
                renderPresence={(game) =>
                  game.attendance && (
                    <AttendanceControl
                      eventId={game.id}
                      attending={game.attendance.attending}
                      count={game.attendance.count}
                      gameLabel={formatMatchup(game)}
                      compact
                    />
                  )
                }
              />

              <BarCharacteristics
                amenities={normalizedPub.amenities}
                screenCount={normalizedPub.screenCount}
                description={normalizedPub.description}
                menuUrl={normalizedPub.menuUrl}
                averageSpendCents={normalizedPub.averageSpendCents}
                facts={barFacts}
                isOwner={isOwner}
              />

              <BarActions {...actions} variant="bar" isOwner={isOwner} />

              {reserveOpen && (
                <ReservationRequestDialog
                  onClose={() => setReserveOpen(false)}
                  barName={normalizedPub.name}
                  events={profileActions?.reservableEvents ?? []}
                  initialEventId={heroEvent?.id ?? null}
                  houseOffer={normalizedPub.houseOffer}
                />
              )}
            </div>
          ) : isError && pubErrorRetryable ? (
            <div
              className="onside-panel mx-auto max-w-xl p-6 text-center sm:p-8"
              role="alert"
            >
              <p className="onside-kicker">Falha temporária</p>
              <h1 className="onside-display mt-3 text-3xl">
                Não conseguimos carregar este bar.
              </h1>
              <p className="mt-3 text-sm text-[var(--onside-muted)]">
                {pubErrorMessage}
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-3">
                <button
                  type="button"
                  className="onside-btn onside-btn-acid min-h-11"
                  onClick={() => void refetchPub()}
                >
                  Tentar novamente
                </button>
                <Link
                  to={viewerRole === 'pub' ? '/admin' : '/dashboard'}
                  className="onside-btn onside-btn-outline min-h-11"
                >
                  Voltar
                </Link>
              </div>
            </div>
          ) : null}
        </div>
      </AppShell>
    </div>
  )
}
