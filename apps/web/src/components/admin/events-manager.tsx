import { CalendarsIcon, PlusSignIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { analytics } from '@/lib/analytics'
import { useTRPC } from '@/utils/trpc'
import { EmptyEventsState } from './empty-events-state'
import { type EventForm, EventFormComponent } from './event-form'
import { EventListItem } from './event-list-item'
import { Modal } from './modal'

const LIVE_WINDOW_MS = 3 * 60 * 60 * 1000

function isLive(startsAt: string | Date): boolean {
  const start = new Date(startsAt).getTime()
  const now = Date.now()
  return now >= start && now <= start + LIVE_WINDOW_MS
}

function isPast(startsAt: string | Date): boolean {
  return new Date(startsAt).getTime() + LIVE_WINDOW_MS < Date.now()
}

function toISOWithTimezone(datetimeLocal: string): string {
  return new Date(datetimeLocal).toISOString()
}

function toDatetimeLocal(date: string | Date): string {
  const d = new Date(date)
  const offsetMs = d.getTimezoneOffset() * 60000
  return new Date(d.getTime() - offsetMs).toISOString().slice(0, 16)
}

const EMPTY_FORM: EventForm = {
  sportId: '',
  championship: '',
  startsAt: '',
  endsAt: '',
  participantIds: [],
  participantFreeText: ''
}

export function EventsManager() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()

  const [editingId, setEditingId] = useState<string | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [isCreating, setIsCreating] = useState(false)

  const { data: events = [], isLoading } = useQuery(
    trpc.pub.getMyEvents.queryOptions()
  )
  const { data: sports = [] } = useQuery(trpc.pubs.getSports.queryOptions())

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: trpc.pub.getMyEvents.queryKey() })

  const deleteMutation = useMutation(
    trpc.pub.deleteEvent.mutationOptions({ onSuccess: invalidate })
  )
  const createMutation = useMutation(
    trpc.pub.createEvent.mutationOptions({
      onSuccess: () => {
        invalidate()
        setShowModal(false)
      }
    })
  )
  const updateMutation = useMutation(
    trpc.pub.updateEvent.mutationOptions({
      onSuccess: () => {
        invalidate()
        setShowModal(false)
        setEditingId(null)
      }
    })
  )

  const editingEvent = editingId ? events.find((e) => e.id === editingId) : null

  const handleSave = (form: EventForm) => {
    const startsAt = toISOWithTimezone(form.startsAt)
    const endsAt = form.endsAt ? toISOWithTimezone(form.endsAt) : undefined
    const participantIds = form.participantIds

    if (isCreating) {
      createMutation.mutate(
        {
          sportId: form.sportId,
          championship: form.championship,
          startsAt,
          endsAt,
          participantIds,
          participantFreeText: form.participantFreeText || undefined
        },
        {
          onSuccess: () => {
            const sport = sports.find((s) => s.id === form.sportId)
            analytics.eventCreated({
              championship: form.championship,
              sport: sport?.name ?? form.sportId,
              has_teams: participantIds.length > 0
            })
          }
        }
      )
    } else if (editingId) {
      updateMutation.mutate(
        {
          eventId: editingId,
          sportId: form.sportId,
          championship: form.championship,
          startsAt,
          endsAt,
          participantIds,
          participantFreeText: form.participantFreeText || undefined
        },
        {
          onSuccess: () => {
            analytics.eventUpdated(editingId)
          }
        }
      )
    }
  }

  const openCreate = () => {
    setIsCreating(true)
    setEditingId(null)
    setShowModal(true)
  }

  const openEdit = (id: string) => {
    setIsCreating(false)
    setEditingId(id)
    setShowModal(true)
  }

  const closeModal = () => {
    setShowModal(false)
    setEditingId(null)
    setIsCreating(false)
  }

  const isSaving = createMutation.isPending || updateMutation.isPending

  const liveEvs = events.filter((e) => isLive(e.startsAt))
  const upcomingEvs = events
    .filter((e) => !isLive(e.startsAt) && !isPast(e.startsAt))
    .sort(
      (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()
    )
  const pastEvs = events
    .filter((e) => isPast(e.startsAt))
    .sort(
      (a, b) => new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime()
    )
  const sortedEvents = [...liveEvs, ...upcomingEvs, ...pastEvs]

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="font-heading text-2xl font-bold flex items-center gap-2">
            <HugeiconsIcon
              icon={CalendarsIcon}
              size={20}
              color="currentColor"
              strokeWidth={1.5}
              className="text-brand-blue"
            />{' '}
            Agenda de jogos
          </h2>
          {!isLoading && events.length > 0 && (
            <p className="text-sm text-zinc-500 mt-0.5">
              {liveEvs.length > 0 && (
                <span className="text-brand-orange font-semibold">
                  {liveEvs.length} ao vivo ·{' '}
                </span>
              )}
              {upcomingEvs.length} próximo{upcomingEvs.length !== 1 ? 's' : ''}
              {pastEvs.length > 0 && (
                <span className="text-zinc-400">
                  {' '}
                  · {pastEvs.length} passado{pastEvs.length !== 1 ? 's' : ''}
                </span>
              )}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="bg-black text-white text-xs font-bold px-4 py-3 rounded-full inline-flex items-center gap-2 hover:bg-brand-blue transition-colors min-h-[44px]"
        >
          <HugeiconsIcon
            icon={PlusSignIcon}
            size={16}
            color="currentColor"
            strokeWidth={1.5}
          />{' '}
          Novo evento
        </button>
      </div>

      <section>
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-[76px] rounded-xl bg-zinc-100 animate-pulse"
              />
            ))}
          </div>
        ) : sortedEvents.length === 0 ? (
          <EmptyEventsState onCreate={openCreate} />
        ) : (
          <ul className="space-y-2">
            {sortedEvents.map((e) => (
              <EventListItem
                key={e.id}
                event={e}
                onEdit={openEdit}
                onDelete={(id) => {
                  analytics.eventDeleted(id)
                  deleteMutation.mutate({ eventId: id })
                }}
                isDeleting={deleteMutation.isPending}
              />
            ))}
          </ul>
        )}
      </section>

      <Modal
        open={showModal}
        onClose={closeModal}
        title={isCreating ? 'Novo evento' : 'Editar evento'}
      >
        <EventFormComponent
          initial={
            editingEvent
              ? {
                  sportId: editingEvent.sportId,
                  championship: editingEvent.championship,
                  startsAt: toDatetimeLocal(editingEvent.startsAt),
                  endsAt: editingEvent.endsAt
                    ? toDatetimeLocal(editingEvent.endsAt)
                    : '',
                  participantIds:
                    editingEvent.participants?.map(
                      (p: { team: { id: string } }) => p.team.id
                    ) ?? [],
                  participantFreeText: editingEvent.participantFreeText ?? ''
                }
              : EMPTY_FORM
          }
          sports={sports}
          onSave={handleSave}
          onCancel={closeModal}
          isSaving={isSaving}
          error={createMutation.error?.message ?? updateMutation.error?.message}
        />
      </Modal>
    </>
  )
}
