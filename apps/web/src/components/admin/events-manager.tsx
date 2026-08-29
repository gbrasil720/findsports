import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import Calendar from 'reicon-react/icons/Calendar'
import Plus from 'reicon-react/icons/Plus'
import {
  compareEventStartsAscending,
  compareEventStartsDescending,
  getEventTemporalState
} from '@/domain/events'
import { analytics } from '@/lib/analytics'
import { CATALOG_QUERY } from '@/lib/query-cache'
import { useTRPC } from '@/utils/trpc'
import type { EventsState, PolicyState } from './admin-model'
import { EmptyEventsState } from './empty-events-state'
import { type EventForm, EventFormComponent } from './event-form'
import { EventListItem } from './event-list-item'
import { Modal } from './modal'

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

type ManagerProps = {
  eventsState: EventsState
  policyState: PolicyState
}

export function getCreateBlockReason(policyState: PolicyState): string | null {
  if (policyState.status === 'loading') return 'Verificando disponibilidade…'
  if (policyState.status === 'error') {
    return 'Não foi possível verificar a disponibilidade.'
  }
  if (policyState.policy.status === 'inactive') {
    return 'Ative um plano para adicionar eventos.'
  }
  if (!policyState.policy.canCreate) return 'Limite do plano atingido.'
  return null
}

export function EventsManager({ eventsState, policyState }: ManagerProps) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [isCreating, setIsCreating] = useState(false)

  const { data: sports = [] } = useQuery({
    ...trpc.pubs.getSports.queryOptions(),
    ...CATALOG_QUERY
  })
  const events = eventsState.status === 'ready' ? eventsState.events : []
  const blockReason = getCreateBlockReason(policyState)
  const createBlocked = blockReason !== null

  const invalidateEvents = () =>
    queryClient.invalidateQueries({ queryKey: trpc.pub.getMyEvents.queryKey() })
  const invalidateEventsAndPolicy = () =>
    Promise.all([
      invalidateEvents(),
      queryClient.invalidateQueries({
        queryKey: trpc.pub.getMyEventCreationPolicy.queryKey()
      })
    ])

  const deleteMutation = useMutation(
    trpc.pub.deleteEvent.mutationOptions({
      onSuccess: invalidateEventsAndPolicy
    })
  )
  const createMutation = useMutation(
    trpc.pub.createEvent.mutationOptions({
      onSuccess: () => {
        void invalidateEventsAndPolicy()
        setShowModal(false)
      }
    })
  )
  const updateMutation = useMutation(
    trpc.pub.updateEvent.mutationOptions({
      onSuccess: () => {
        void invalidateEvents()
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
            const sport = sports.find((item) => item.id === form.sportId)
            analytics.eventCreated({
              championship: form.championship,
              sport: sport?.name ?? form.sportId,
              has_teams: participantIds.length > 0
            })
          }
        }
      )
    } else if (editingId) {
      updateMutation.mutate({
        eventId: editingId,
        sportId: form.sportId,
        championship: form.championship,
        startsAt,
        endsAt,
        participantIds,
        participantFreeText: form.participantFreeText || undefined
      })
    }
  }

  const openCreate = () => {
    if (createBlocked) return
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

  const liveEvents = events.filter(
    (item) => getEventTemporalState(item.startsAt) === 'live'
  )
  const upcomingEvents = events
    .filter((item) => getEventTemporalState(item.startsAt) === 'upcoming')
    .sort(compareEventStartsAscending)
  const pastEvents = events
    .filter((item) => getEventTemporalState(item.startsAt) === 'past')
    .sort(compareEventStartsDescending)
  const sortedEvents = [...liveEvents, ...upcomingEvents, ...pastEvents]
  const isSaving = createMutation.isPending || updateMutation.isPending

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="onside-display flex items-center gap-2 text-2xl">
            <Calendar
              size={20}
              color="currentColor"
              className="text-[var(--onside-live)]"
              aria-hidden="true"
            />
            Minha grade
          </h2>
          {eventsState.status === 'ready' && events.length > 0 ? (
            <p className="mt-0.5 text-[var(--onside-muted)] text-sm">
              {liveEvents.length > 0 ? (
                <span className="font-semibold text-[var(--onside-live)]">
                  {liveEvents.length} ao vivo ·{' '}
                </span>
              ) : null}
              {upcomingEvents.length} próximo
              {upcomingEvents.length !== 1 ? 's' : ''}
              {pastEvents.length > 0 ? (
                <span>
                  {' '}
                  · {pastEvents.length} passado
                  {pastEvents.length !== 1 ? 's' : ''}
                </span>
              ) : null}
            </p>
          ) : null}
        </div>
        <div className="flex flex-col items-end gap-1">
          <button
            type="button"
            onClick={openCreate}
            disabled={createBlocked}
            title={blockReason ?? undefined}
            className="onside-btn onside-btn-acid min-h-11"
          >
            <Plus size={16} color="currentColor" aria-hidden="true" />
            Novo evento
          </button>
          {blockReason ? (
            <p className="max-w-[16rem] text-right text-xs text-[var(--onside-live-text)]">
              {blockReason}{' '}
              {policyState.status === 'ready' &&
              policyState.policy.status === 'limited' ? (
                <a
                  href="/plan"
                  className="font-bold underline underline-offset-2"
                >
                  Fazer upgrade
                </a>
              ) : null}
              {policyState.status === 'error' ? (
                <button
                  type="button"
                  onClick={policyState.retry}
                  className="font-bold underline underline-offset-2"
                >
                  Tentar novamente
                </button>
              ) : null}
            </p>
          ) : null}
        </div>
      </div>

      <section>
        {eventsState.status === 'loading' ? (
          <div className="space-y-2" aria-busy="true">
            {[1, 2, 3].map((item) => (
              <div
                key={item}
                className="h-[76px] animate-pulse border border-[var(--onside-ink)] bg-[var(--onside-stone)]"
              />
            ))}
          </div>
        ) : eventsState.status === 'error' ? (
          <div className="onside-callout onside-callout-danger" role="alert">
            <p className="text-sm">Não foi possível carregar a grade.</p>
            <button
              type="button"
              onClick={eventsState.retry}
              className="font-bold text-sm underline underline-offset-2"
            >
              Tentar novamente
            </button>
          </div>
        ) : sortedEvents.length === 0 ? (
          <EmptyEventsState
            onCreate={openCreate}
            createDisabled={createBlocked}
          />
        ) : (
          <ul className="space-y-2">
            {sortedEvents.map((item) => (
              <EventListItem
                key={item.id}
                event={item}
                onEdit={openEdit}
                onDelete={(id) => {
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
                    editingEvent.participants?.map((item) => item.team.id) ??
                    [],
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
