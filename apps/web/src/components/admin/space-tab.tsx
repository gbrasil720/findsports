import {
  mensagemEnderecoNaoEncontrado,
  motivoTelefoneInvalido
} from '@findsports_oficial/api/lib/bar-profile-validation'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useMinuteNow } from '@/components/app/minute-tick'
import { getEventTemporalState } from '@/domain/events'
import { getUserFacingMessage, isRetryableError } from '@/lib/user-facing-error'
import { useTRPC } from '@/utils/trpc'
import type { PlanState, ProfileState } from './admin-model'
import { useEventsState, useMyBar, useMySubscription } from './admin-queries'
import { AdminTabPanel } from './admin-tabs'
import { BarMenuEditor } from './bar-menu-editor'
import { BarPreview } from './bar-preview'
import { ConversionReadiness } from './conversion-readiness'
import { HouseOfferEditor } from './house-offer-editor'
import { PubHeroSection } from './pub-hero-section'
import { QueryError } from './query-error'
import { RatingsPanel } from './ratings-panel'
import { ReservationIntakeCard } from './reservation-intake-card'

export function SpaceTab({
  active,
  onCreateEvent
}: {
  active: boolean
  onCreateEvent: () => void
}) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const now = useMinuteNow()
  const [profileError, setProfileError] = useState<string | null>(null)
  const [barMenuError, setBarMenuError] = useState<string | null>(null)

  const { data: bar } = useMyBar()
  const eventsState = useEventsState()

  const {
    data: subscription,
    isError: subError,
    error: subscriptionQueryError,
    refetch: refetchSub
  } = useMySubscription()

  // A prévia lê o perfil público, com a resolução de plano e recebimento do
  // servidor: o que o bar muda aqui muda os dois.
  const profileQuery = useQuery({
    ...trpc.pubs.getById.queryOptions({ id: bar?.id ?? '' }),
    enabled: Boolean(bar),
    meta: { errorToast: false }
  })
  const invalidateBar = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: trpc.pub.getMe.queryKey() }),
      queryClient.invalidateQueries({ queryKey: trpc.pubs.getById.pathKey() })
    ])

  const {
    data: ratings,
    isLoading: loadingRatings,
    isError: ratingsError,
    error: ratingsQueryError,
    refetch: refetchRatings
  } = useQuery({
    ...trpc.pub.getMyRatings.queryOptions(),
    meta: { errorToast: false }
  })

  const updateMeMutation = useMutation(
    trpc.pub.updateMe.mutationOptions({
      onSuccess: () => {
        setProfileError(null)
        invalidateBar()
      },
      onError: (err, input) => {
        setProfileError(
          // O telefone já foi conferido no `onSave`; sobra a recusa do
          // endereço (WEB-115).
          err.data?.code === 'UNPROCESSABLE_CONTENT'
            ? mensagemEnderecoNaoEncontrado(input.city ?? bar?.city ?? '')
            : getUserFacingMessage(
                err,
                'Não foi possível salvar o perfil. Tente novamente.'
              )
        )
      }
    })
  )

  const confirmWhatsAppMutation = useMutation(
    trpc.pub.updateMe.mutationOptions({
      onSuccess: () => {
        invalidateBar()
      },
      onError: (err) => {
        setProfileError(
          getUserFacingMessage(
            err,
            'Não foi possível confirmar o WhatsApp. Tente novamente.'
          )
        )
      }
    })
  )

  // O erro de cada card é o da própria mutation: um novo envio o limpa.
  const updateHouseOfferMutation = useMutation(
    trpc.pub.updateHouseOffer.mutationOptions({
      onSuccess: () => {
        invalidateBar()
      }
    })
  )

  const updateAcceptsReservationsMutation = useMutation(
    trpc.pub.updateAcceptsReservations.mutationOptions({
      onSuccess: () => {
        invalidateBar()
      }
    })
  )

  const updateMenuInfoMutation = useMutation(
    trpc.pub.updateMenuInfo.mutationOptions({
      onMutate: () => {
        setBarMenuError(null)
      },
      // Devolver a promessa faz o `mutateAsync` esperar o refetch: o
      // formulário só diz "salvos" quando já recebeu o valor gravado. O perfil
      // público também muda, então a prévia do dono não pode ficar em cache.
      onSuccess: invalidateBar,
      onError: (err) => {
        // Recusa por plano quer dizer que a assinatura mudou com o painel
        // aberto: reler o plano troca o formulário pelo estado bloqueado.
        if (err.data?.code === 'FORBIDDEN') {
          void queryClient.invalidateQueries({
            queryKey: trpc.pub.getMySubscription.queryKey()
          })
        }
        setBarMenuError(
          getUserFacingMessage(
            err,
            'Não foi possível salvar o cardápio e o preço médio. Tente novamente.'
          )
        )
      }
    })
  )

  // A página só monta as abas com o bar carregado; o cache não o perde depois.
  if (!bar) return null

  // Plano vigente, com status — não `bar.plan`. Dado em cache vence erro de
  // refetch em segundo plano: trocar o formulário pelo aviso apagaria o que o
  // dono digitou.
  const planState: PlanState =
    subscription !== undefined
      ? {
          status: 'ready',
          plan: subscription?.plan ?? 'starter',
          currentPlan: subscription?.currentPlan ?? null
        }
      : subError
        ? { status: 'error' }
        : { status: 'loading' }

  const profileState: ProfileState = profileQuery.data
    ? { status: 'ready', profile: profileQuery.data }
    : profileQuery.isError
      ? { status: 'error' }
      : { status: 'loading' }

  const eventList = eventsState.status === 'ready' ? eventsState.events : []
  const hasUpcomingEvent = eventList.some(
    (e) => getEventTemporalState(e.startsAt, e.endsAt, now) === 'upcoming'
  )
  const liveEvent = eventList.find(
    (item) => getEventTemporalState(item.startsAt, item.endsAt, now) === 'live'
  )

  const handleConfirmWhatsApp = async () => {
    if (!bar.phone) return
    setProfileError(null)
    await confirmWhatsAppMutation.mutateAsync({
      phone: bar.phone,
      phoneAcceptsWhatsapp: true
    })
  }

  return (
    <AdminTabPanel id="admin-espaco" active={active} className="space-y-6">
      <ConversionReadiness
        bar={bar}
        hasUpcomingEvent={hasUpcomingEvent}
        isConfirmingWhatsApp={confirmWhatsAppMutation.isPending}
        onConfirmWhatsApp={handleConfirmWhatsApp}
        onEditProfile={() => {
          document
            .getElementById('admin-profile-editor')
            ?.scrollIntoView({ behavior: 'smooth' })
        }}
        onCreateEvent={onCreateEvent}
      />

      <PubHeroSection
        bar={bar}
        liveEvent={liveEvent}
        totalCount={eventList.length}
        isSaving={updateMeMutation.isPending}
        saveError={profileError}
        onSave={async (data) => {
          // Mesma regra do servidor, conferida antes de enviar: o
          // padrão do WEB-118 não mostra o texto da recusa.
          const motivoTelefone = motivoTelefoneInvalido(data.phone, bar.phone)
          setProfileError(motivoTelefone)
          // Rejeitar mantém o formulário aberto, como a recusa do
          // servidor já faz.
          if (motivoTelefone) throw new Error(motivoTelefone)
          // Nome e endereço são obrigatórios (o servidor recusa ''),
          // então vazio vira "não mexer". Telefone e descrição são
          // opcionais: '' vai como está e limpa o campo (WEB-143).
          await updateMeMutation.mutateAsync({
            name: data.name || undefined,
            address: data.address || undefined,
            neighborhood: data.neighborhood || undefined,
            city: data.city || undefined,
            phone: data.phone,
            description: data.description,
            amenities: data.amenities,
            screenCount: data.screenCount
          })
        }}
        onPhotoUpdate={async (url: string) => {
          // ESC-15: o arquivo agora sobe direto do navegador, então a
          // rota de upload não grava mais nada. Quem persiste a URL é
          // esta chamada — e o servidor confere que ela pertence ao
          // armazenamento e à pasta deste bar antes de aceitar.
          await updateMeMutation.mutateAsync({ photoUrl: url })
          queryClient.invalidateQueries({
            queryKey: trpc.pub.getMe.queryKey()
          })
        }}
      />

      {/* Os cards pagos e o preview dependem da mesma consulta: a falha
          aparece uma vez só, aqui, e não em cada card (WEB-142). */}
      {planState.status === 'error' ? (
        <QueryError
          message="Não foi possível conferir o seu plano."
          retryable={isRetryableError(subscriptionQueryError)}
          onRetry={() => {
            void refetchSub()
          }}
        />
      ) : null}

      <BarMenuEditor
        menuUrl={bar.menuUrl}
        averageSpendCents={bar.averageSpendCents}
        plan={planState}
        isSaving={updateMenuInfoMutation.isPending}
        saveError={barMenuError}
        onSave={(changes) => updateMenuInfoMutation.mutateAsync(changes)}
      />

      <ReservationIntakeCard
        acceptsReservations={bar.acceptsReservations}
        hasHouseOffer={bar.houseOffer !== null}
        plan={planState}
        isSaving={updateAcceptsReservationsMutation.isPending}
        saveError={
          updateAcceptsReservationsMutation.error
            ? getUserFacingMessage(
                updateAcceptsReservationsMutation.error,
                'Não foi possível mudar o recebimento de reservas. Tente novamente.'
              )
            : null
        }
        onChange={(acceptsReservations) =>
          updateAcceptsReservationsMutation.mutateAsync({
            acceptsReservations
          })
        }
      />

      <HouseOfferEditor
        houseOffer={bar.houseOffer}
        plan={planState}
        isSaving={updateHouseOfferMutation.isPending}
        saveError={
          updateHouseOfferMutation.error
            ? getUserFacingMessage(
                updateHouseOfferMutation.error,
                'Não foi possível salvar a oferta. Tente novamente.'
              )
            : null
        }
        onSave={(houseOffer) =>
          updateHouseOfferMutation.mutateAsync({ houseOffer })
        }
      />

      <RatingsPanel
        state={
          loadingRatings
            ? { status: 'loading' }
            : ratingsError || !ratings
              ? {
                  status: 'error',
                  retryable: isRetryableError(ratingsQueryError),
                  retry: () => {
                    void refetchRatings()
                  }
                }
              : { status: 'ready', ratings }
        }
      />

      <BarPreview
        bar={{
          id: bar.id,
          name: bar.name,
          neighborhood: bar.neighborhood,
          city: bar.city,
          latitude: bar.latitude,
          longitude: bar.longitude,
          photoUrl: bar.photoUrl
        }}
        eventsState={eventsState}
        planState={planState}
        profileState={profileState}
      />
    </AdminTabPanel>
  )
}
