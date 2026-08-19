import type { AppRouter } from '@findsports_oficial/api/routers/index'
import { Skeleton } from '@findsports_oficial/ui/components/skeleton'
import { useQuery } from '@tanstack/react-query'
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
import { BarHeroSection } from '@/components/pub/bar-hero-section'
import { BarInfoSidebar } from '@/components/pub/bar-info-sidebar'
import { EventsList } from '@/components/pub/events-list'
import { shellVariantForViewer } from '@/domain/viewer'
import { analytics } from '@/lib/analytics'
import { authClient } from '@/lib/auth-client'
import { trackCommercialEvent } from '@/lib/commercial-tracking'
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
type RawEvent = PubOutput['events'][number]
type RawSport = RawEvent['sport']
type RawParticipant = RawEvent['participants'][number]
type RawTeam = NonNullable<RawParticipant['team']>

type NormalizedTeam = Omit<RawTeam, 'createdAt'> & { createdAt: Date }
type NormalizedSport = Omit<RawSport, 'createdAt'> & { createdAt: Date }
type NormalizedParticipant = Omit<RawParticipant, 'team'> & {
  team: NormalizedTeam
}
type NormalizedEvent = Omit<
  RawEvent,
  'createdAt' | 'startsAt' | 'endsAt' | 'sport' | 'participants'
> & {
  createdAt: Date
  startsAt: Date
  endsAt: Date | null
  sport: NormalizedSport
  participants: NormalizedParticipant[]
}

type NormalizedPub = Omit<PubOutput, 'createdAt' | 'updatedAt' | 'events'> & {
  createdAt: Date
  updatedAt: Date
  events: NormalizedEvent[]
}

/**
 * Normalize tRPC-serialized dates (string → Date) so component Props
 * (InferSelectModel) are satisfied without `as any`.
 */
function normalizePub(raw: PubOutput | undefined): NormalizedPub | undefined {
  if (!raw) return undefined
  return {
    ...raw,
    createdAt: new Date(raw.createdAt),
    updatedAt: new Date(raw.updatedAt),
    events: raw.events.map((ev) => ({
      ...ev,
      createdAt: new Date(ev.createdAt),
      startsAt: new Date(ev.startsAt),
      endsAt: ev.endsAt ? new Date(ev.endsAt) : null,
      sport: {
        ...ev.sport,
        createdAt: new Date(ev.sport.createdAt)
      },
      participants: ev.participants.map((p) => ({
        ...p,
        team: { ...p.team, createdAt: new Date(p.team.createdAt) }
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
  const trpc = useTRPC()

  const {
    data: pub,
    isLoading: isLoadingPub,
    isError
  } = useQuery({
    ...trpc.pubs.getById.queryOptions({ id: pubId }),
    enabled: Boolean(session)
  })

  // Normalize serialized dates to Date instances
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

  const handleOpenDirections = () => {
    analytics.barIntent({ bar_id: pubId, action: 'directions' })
    trackCommercialEvent({
      pubId,
      type: 'directions_opened',
      sourceEventId: eventId ?? undefined
    })
  }

  const handlePhoneClick = () => {
    analytics.barIntent({ bar_id: pubId, action: 'phone' })
    trackCommercialEvent({
      pubId,
      type: 'phone_clicked',
      sourceEventId: eventId ?? undefined
    })
  }

  const handleWhatsAppClick = () => {
    analytics.barIntent({ bar_id: pubId, action: 'whatsapp' })
    trackCommercialEvent({
      pubId,
      type: 'whatsapp_opened',
      sourceEventId: eventId ?? undefined
    })
  }

  const isAuthed = Boolean(session)
  // O cabeçalho segue o papel de quem visita, não o tipo da página: o
  // torcedor não pode receber a navegação do painel do bar.
  const shellVariant = shellVariantForViewer(session?.user?.role)

  return (
    <div className="onside-app flex min-h-dvh">
      {/* Auth gate dialog — shown when no session */}
      {!isAuthed && <AuthRequiredDialog open />}

      {/* Authenticated content — inert + aria-hidden when no session (spec §8.1) */}
      <div
        className="onside-content-grid flex w-full flex-col"
        inert={!isAuthed}
        aria-hidden={!isAuthed}
      >
        <AppShell variant={shellVariant}>
          <main className="onside-main">
            <div className="onside-container">
              <div className="mb-6 flex items-center gap-2 font-[family-name:var(--onside-mono)] text-[10px] text-[var(--onside-muted)] uppercase tracking-[0.16em]">
                <span className="onside-live-dot" aria-hidden="true" />
                Perfil do bar
              </div>

              {isLoadingPub ? (
                <div className="space-y-6">
                  <div className="flex flex-col gap-6 lg:flex-row">
                    <div className="min-w-0 flex-1">
                      <Skeleton className="h-[220px] w-full rounded-[12px]" />
                    </div>
                    <div className="w-full shrink-0 basis-[320px]">
                      <Skeleton className="h-[280px] w-full rounded-[12px]" />
                    </div>
                  </div>
                  <Skeleton className="h-[180px] w-full rounded-[12px]" />
                </div>
              ) : normalizedPub ? (
                <>
                  <div className="flex flex-col gap-6 lg:flex-row">
                    <div className="min-w-0 flex-1">
                      <BarHeroSection pub={normalizedPub} />
                    </div>
                    <div className="w-full shrink-0 basis-[320px]">
                      <BarInfoSidebar
                        pub={normalizedPub}
                        onOpenDirections={handleOpenDirections}
                        onPhoneClick={handlePhoneClick}
                        onWhatsAppClick={handleWhatsAppClick}
                      />
                    </div>
                  </div>

                  <EventsList events={normalizedPub.events} />
                </>
              ) : null}
            </div>
          </main>
        </AppShell>
      </div>
    </div>
  )
}
