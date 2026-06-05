/** biome-ignore-all lint/a11y/useValidAriaRole: <explanation> */
/** biome-ignore-all lint/a11y/useKeyWithClickEvents: <explanation> */
/** biome-ignore-all lint/a11y/noStaticElementInteractions: <explanation> */
/** biome-ignore-all lint/a11y/noLabelWithoutControl: <explanation> */
/** biome-ignore-all lint/suspicious/noAssignInExpressions: <explanation> */
/** biome-ignore-all lint/suspicious/noDuplicateObjectKeys: <explanation> */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import {
  Calendar,
  Check,
  Edit3,
  Eye,
  EyeOff,
  Loader2,
  MapPin,
  Phone,
  Plus,
  Trash2,
  Tv2,
  X
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { AppShell } from '@/components/app/app-shell'
import { useTRPC } from '@/utils/trpc'

export const Route = createFileRoute('/admin')({
  head: () => ({
    meta: [
      { title: 'Painel do Bar — FindSports' },
      {
        name: 'description',
        content: 'Gerencie a agenda de jogos que o seu bar vai transmitir.'
      },
      { name: 'robots', content: 'noindex' }
    ]
  }),
  component: PubDashboard
})

// --------------------------------------------------------------------------
// Tipos
// --------------------------------------------------------------------------

type ProfileForm = {
  name: string
  address: string
  neighborhood: string
  city: string
  phone: string
  description: string
}

type EventForm = {
  sportId: string
  championship: string
  startsAt: string
  participantIds: string[] // IDs dos times selecionados do banco
  participantFreeText: string // texto livre para times não cadastrados
}

const DIRECT_CONFRONTATION_SLUGS = new Set([
  'futebol',
  'basquete',
  'volei',
  'futebol-americano'
])

const EMPTY_FORM: EventForm = {
  sportId: '',
  championship: '',
  startsAt: '',
  participantIds: [],
  participantFreeText: ''
}

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

function formatEventDate(startsAt: string | Date): {
  date: string
  time: string
} {
  const d = new Date(startsAt)
  const today = new Date()
  const tomorrow = new Date()
  tomorrow.setDate(today.getDate() + 1)

  let date: string
  if (d.toDateString() === today.toDateString()) date = 'Hoje'
  else if (d.toDateString() === tomorrow.toDateString()) date = 'Amanhã'
  else
    date = d.toLocaleDateString('pt-BR', {
      weekday: 'short',
      day: 'numeric',
      month: 'short'
    })

  const time = d.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit'
  })
  return { date, time }
}

function toISOWithTimezone(datetimeLocal: string): string {
  return new Date(datetimeLocal).toISOString()
}

const LIVE_WINDOW_MS = 3 * 60 * 60 * 1000

function isLive(startsAt: string | Date): boolean {
  const start = new Date(startsAt).getTime()
  const now = Date.now()
  return now >= start && now <= start + LIVE_WINDOW_MS
}

function isPast(startsAt: string | Date): boolean {
  return new Date(startsAt).getTime() + LIVE_WINDOW_MS < Date.now()
}

function isUpcomingSoon(startsAt: string | Date): boolean {
  const diff = new Date(startsAt).getTime() - Date.now()
  return diff > 0 && diff < 24 * 60 * 60 * 1000
}

function getTimeUntil(startsAt: string | Date): string {
  const diff = new Date(startsAt).getTime() - Date.now()
  if (diff <= 0) return ''
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `em ${mins}min`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `em ${hours}h`
  const days = Math.floor(hours / 24)
  return `em ${days} dia${days !== 1 ? 's' : ''}`
}

// --------------------------------------------------------------------------
// Componente raiz
// --------------------------------------------------------------------------

function PubDashboard() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()

  const [, setTick] = useState(0)
  const [showEditModal, setShowEditModal] = useState(false)

  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 60_000)
    return () => clearInterval(interval)
  }, [])

  const { data: bar, isLoading: loadingBar } = useQuery(
    trpc.pub.getMe.queryOptions()
  )

  const { data: events = [] } = useQuery(trpc.pub.getMyEvents.queryOptions())

  const updateMeMutation = useMutation(
    trpc.pub.updateMe.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: trpc.pub.getMe.queryKey() })
        setShowEditModal(false)
      }
    })
  )

  if (loadingBar) {
    return (
      <AppShell role="pub">
        <div className="flex items-center justify-center py-24 text-zinc-400">
          <Loader2 className="size-6 animate-spin mr-2" />
        </div>
      </AppShell>
    )
  }

  const liveEvent = events.find((e) => isLive(e.startsAt))
  const upcomingCount = events.filter((e) => !isLive(e.startsAt)).length

  return (
    <AppShell role="pub" userMeta={bar?.name}>
      <section className="relative rounded-3xl overflow-hidden bg-gradient-to-br from-zinc-900 via-black to-zinc-900 text-white mb-8">
        <div className="absolute inset-0 opacity-30 bg-[radial-gradient(circle_at_30%_20%,rgba(255,90,31,0.6),transparent_40%),radial-gradient(circle_at_80%_80%,rgba(30,107,255,0.5),transparent_45%)]" />
        <div className="relative p-8 md:p-10 grid md:grid-cols-[1fr_auto] gap-6 items-end">
          <div>
            <div className="flex items-center gap-3 mb-3">
              <div className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.25em] text-brand-blue">
                <Tv2 className="size-3" /> Painel administrativo
              </div>
              {bar?.isActive ? (
                <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-400">
                  <Eye className="size-3" /> Visível
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-white/40">
                  <EyeOff className="size-3" /> Não visível
                </span>
              )}
            </div>

            {liveEvent && (
              <div className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.25em] text-brand-orange mb-3">
                <span className="size-1.5 rounded-full bg-brand-orange animate-pulse" />
                Ao vivo ·{' '}
                {liveEvent.participants.length > 0
                  ? liveEvent.participants.map((p) => p.team.name).join(' × ')
                  : liveEvent.championship}
              </div>
            )}

            <h1 className="font-heading text-4xl md:text-5xl font-bold tracking-tight leading-[0.95] mb-3">
              {bar?.name ?? 'Meu bar'}
            </h1>

            <div className="flex flex-wrap items-center gap-4 text-sm text-white/80">
              {bar?.address && (
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="size-4" />
                  {bar.address} · {bar.neighborhood}
                </span>
              )}
              {bar?.phone && (
                <span className="inline-flex items-center gap-1.5">
                  <Phone className="size-4" /> {bar.phone}
                </span>
              )}
            </div>

            {bar?.description && (
              <p className="text-sm text-white/60 mt-3 max-w-lg">
                {bar.description}
              </p>
            )}
          </div>

          <div className="flex flex-col items-end gap-4">
            <div className="flex gap-6 text-center">
              <div>
                <div className="font-heading text-3xl font-bold tabular-nums">
                  {liveEvent ? upcomingCount + 1 : upcomingCount}
                </div>
                <div className="text-[10px] uppercase tracking-widest text-white/50 mt-0.5">
                  {(liveEvent ? upcomingCount + 1 : upcomingCount) === 1
                    ? 'Jogo'
                    : 'Jogos'}
                </div>
              </div>
              {liveEvent && (
                <div>
                  <div className="font-heading text-3xl font-bold text-brand-orange tabular-nums">
                    1
                  </div>
                  <div className="text-[10px] uppercase tracking-widest text-brand-orange/70 mt-0.5">
                    Ao vivo
                  </div>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => setShowEditModal(true)}
              className="inline-flex items-center gap-2 bg-white/10 hover:bg-white/20 backdrop-blur text-white text-xs font-bold px-4 py-2.5 rounded-full transition-colors"
            >
              <Edit3 className="size-3.5" /> Editar perfil
            </button>
          </div>
        </div>
      </section>

      <EventsManager />

      {showEditModal && bar && (
        <Modal title="Editar perfil do bar" onClose={() => setShowEditModal(false)}>
          <EditProfileForm
            initial={{
              name: bar.name,
              address: bar.address,
              neighborhood: bar.neighborhood,
              city: bar.city,
              phone: bar.phone ?? '',
              description: bar.description ?? ''
            }}
            onSave={(data) =>
              updateMeMutation.mutate({
                name: data.name || undefined,
                address: data.address || undefined,
                neighborhood: data.neighborhood || undefined,
                city: data.city || undefined,
                phone: data.phone || undefined,
                description: data.description || undefined
              })
            }
            onCancel={() => setShowEditModal(false)}
            isSaving={updateMeMutation.isPending}
            error={updateMeMutation.error?.message}
          />
        </Modal>
      )}
    </AppShell>
  )
}

// --------------------------------------------------------------------------
// Gerenciador de eventos
// --------------------------------------------------------------------------

function EventsManager() {
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
    // Combina IDs do banco com texto livre convertido em IDs vazios
    // Texto livre é informativo — só participantIds vai pro banco
    const participantIds = form.participantIds

    if (isCreating) {
      createMutation.mutate({
        sportId: form.sportId,
        championship: form.championship,
        startsAt,
        participantIds
      })
    } else if (editingId) {
      updateMutation.mutate({
        eventId: editingId,
        sportId: form.sportId,
        championship: form.championship,
        startsAt,
        participantIds
      })
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
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())
  const pastEvs = events
    .filter((e) => isPast(e.startsAt))
    .sort((a, b) => new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime())
  const sortedEvents = [...liveEvs, ...upcomingEvs, ...pastEvs]

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="font-heading text-2xl font-bold flex items-center gap-2">
            <Calendar className="size-5 text-brand-blue" /> Agenda de jogos
          </h2>
          {!isLoading && events.length > 0 && (
            <p className="text-sm text-zinc-500 mt-0.5">
              {liveEvs.length > 0 && (
                <span className="text-brand-orange font-semibold">{liveEvs.length} ao vivo · </span>
              )}
              {upcomingEvs.length} próximo{upcomingEvs.length !== 1 ? 's' : ''}
              {pastEvs.length > 0 && (
                <span className="text-zinc-400"> · {pastEvs.length} passado{pastEvs.length !== 1 ? 's' : ''}</span>
              )}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="bg-black text-white text-xs font-bold px-4 py-2.5 rounded-full inline-flex items-center gap-2 hover:bg-brand-blue transition-colors"
        >
          <Plus className="size-4" /> Novo evento
        </button>
      </div>

      <section>
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-[76px] rounded-xl bg-zinc-100 animate-pulse" />
            ))}
          </div>
        ) : sortedEvents.length === 0 ? (
          <div className="bg-white rounded-2xl ring-1 ring-black/5 p-12 flex flex-col items-center gap-4 text-center">
            <div className="size-16 rounded-2xl bg-zinc-100 flex items-center justify-center">
              <Calendar className="size-7 text-zinc-400" />
            </div>
            <div>
              <p className="font-heading font-bold text-zinc-900 mb-1">Nenhum jogo cadastrado</p>
              <p className="text-sm text-zinc-500 max-w-xs">
                Adicione jogos para começar a aparecer nas buscas dos torcedores.
              </p>
            </div>
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex items-center gap-2 bg-black text-white text-xs font-bold px-5 py-2.5 rounded-full hover:bg-brand-blue transition-colors"
            >
              <Plus className="size-4" /> Adicionar primeiro jogo
            </button>
          </div>
        ) : (
          <ul className="space-y-2">
            {sortedEvents.map((e) => {
              const { date, time } = formatEventDate(e.startsAt)
              const live = isLive(e.startsAt)
              const past = isPast(e.startsAt)
              const soon = !live && !past && isUpcomingSoon(e.startsAt)
              const timeUntil = soon ? getTimeUntil(e.startsAt) : null
              const participants = e.participants?.map((p: any) => p.team.name).join(' × ')

              return (
                <li
                  key={e.id}
                  className={`group relative rounded-xl overflow-hidden transition-all duration-200 ${
                    live
                      ? 'bg-gradient-to-r from-orange-50 to-white ring-1 ring-orange-200 shadow-sm shadow-orange-100/50'
                      : past
                        ? 'bg-zinc-50 ring-1 ring-zinc-100'
                        : 'bg-white ring-1 ring-zinc-100 hover:ring-zinc-200 hover:shadow-sm'
                  }`}
                >
                  {live && (
                    <div className="absolute left-0 inset-y-0 w-1 bg-gradient-to-b from-brand-orange to-orange-400 rounded-l-xl" />
                  )}

                  <div className={`flex items-center gap-4 px-4 py-3.5 ${live ? 'pl-5' : ''}`}>
                    {/* Date/time */}
                    <div className="text-center w-14 shrink-0">
                      <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 leading-none mb-1">
                        {date}
                      </div>
                      <div
                        className={`font-heading font-bold text-xl tabular-nums leading-none ${
                          past ? 'text-zinc-400' : 'text-zinc-900'
                        }`}
                      >
                        {time}
                      </div>
                      {live && (
                        <div className="flex items-center justify-center gap-1 mt-1.5">
                          <span className="size-1.5 rounded-full bg-brand-orange animate-pulse" />
                          <span className="text-[9px] font-black uppercase tracking-wider text-brand-orange">
                            Live
                          </span>
                        </div>
                      )}
                      {soon && timeUntil && (
                        <div className="text-[9px] font-bold text-brand-blue mt-1.5 tabular-nums">
                          {timeUntil}
                        </div>
                      )}
                    </div>

                    <div className={`w-px self-stretch ${live ? 'bg-orange-200' : 'bg-zinc-100'}`} />

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span
                          className={`inline-block text-[9px] font-black uppercase tracking-[0.2em] px-2 py-0.5 rounded-full ${
                            live
                              ? 'bg-orange-100 text-brand-orange'
                              : 'bg-zinc-100 text-zinc-500'
                          }`}
                        >
                          {e.sport?.name}
                        </span>
                        <span className="text-[10px] text-zinc-400 truncate">{e.championship}</span>
                      </div>
                      <div
                        className={`font-heading font-semibold text-base leading-snug truncate ${
                          past ? 'text-zinc-400' : 'text-zinc-900'
                        }`}
                      >
                        {participants || e.championship}
                      </div>
                    </div>

                    {/* Actions */}
                    <div
                      className={`flex gap-1 shrink-0 transition-opacity duration-150 ${
                        past ? 'opacity-40' : 'opacity-0 group-hover:opacity-100'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => openEdit(e.id)}
                        className="p-2 rounded-lg hover:bg-zinc-100 transition-colors"
                      >
                        <Edit3 className="size-4 text-zinc-600" />
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteMutation.mutate({ eventId: e.id })}
                        disabled={deleteMutation.isPending}
                        className="p-2 rounded-lg hover:bg-red-50 hover:text-red-500 transition-colors disabled:opacity-40"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {showModal && (
        <Modal
          onClose={closeModal}
          title={isCreating ? 'Novo evento' : 'Editar evento'}
        >
          <EventFormComponent
            initial={
              editingEvent
                ? {
                    sportId: editingEvent.sportId,
                    championship: editingEvent.championship,
                    startsAt: new Date(editingEvent.startsAt)
                      .toISOString()
                      .slice(0, 16),
                    participantIds:
                      editingEvent.participants?.map((p: any) => p.team.id) ??
                      [],
                    participantFreeText: ''
                  }
                : EMPTY_FORM
            }
            sports={sports}
            onSave={handleSave}
            onCancel={closeModal}
            isSaving={isSaving}
            error={
              createMutation.error?.message ?? updateMutation.error?.message
            }
          />
        </Modal>
      )}
    </>
  )
}

// --------------------------------------------------------------------------
// Formulário de evento
// --------------------------------------------------------------------------

function EventFormComponent({
  initial,
  sports,
  onSave,
  onCancel,
  isSaving,
  error
}: {
  initial: EventForm
  sports: { id: string; name: string; slug: string }[]
  onSave: (form: EventForm) => void
  onCancel: () => void
  isSaving: boolean
  error?: string
}) {
  const trpc = useTRPC()
  const [form, setForm] = useState<EventForm>(initial)

  // Busca times quando esporte é selecionado
  const { data: teams = [], isLoading: loadingTeams } = useQuery({
    ...trpc.pubs.getTeamsBySport.queryOptions({ sportId: form.sportId }),
    enabled: !!form.sportId
  })
  const selectedSport = sports.find((s) => s.id === form.sportId)
  const hasLimit = selectedSport
    ? DIRECT_CONFRONTATION_SLUGS.has(selectedSport.slug)
    : false

  const toggleTeam = (id: string) => {
    setForm((prev) => ({
      ...prev,
      participantIds: prev.participantIds.includes(id)
        ? prev.participantIds.filter((t) => t !== id)
        : [...prev.participantIds, id]
    }))
  }

  const handleSportChange = (sportId: string) => {
    // Limpa times selecionados ao trocar de esporte
    setForm((prev) => ({
      ...prev,
      sportId,
      participantIds: [],
      participantFreeText: ''
    }))
  }

  const canSave = form.sportId && form.championship && form.startsAt

  return (
    <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
      <Field label="Esporte *">
        <select
          value={form.sportId}
          onChange={(e) => handleSportChange(e.target.value)}
          className="input"
        >
          <option value="">Selecione um esporte</option>
          {sports.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Campeonato *">
        <input
          value={form.championship}
          onChange={(e) => setForm({ ...form, championship: e.target.value })}
          className="input"
          placeholder="Ex: Brasileirão Série A, Copa do Mundo..."
        />
      </Field>

      <Field label="Data e horário *">
        <input
          type="datetime-local"
          value={form.startsAt}
          onChange={(e) => setForm({ ...form, startsAt: e.target.value })}
          className="input"
        />
      </Field>

      {/* Times do banco */}
      {form.sportId && (
        <div>
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500 mb-2 block">
            Times / participantes
          </span>

          {loadingTeams ? (
            <div className="flex items-center gap-2 text-zinc-400 text-sm py-2">
              <Loader2 className="size-4 animate-spin" /> Carregando times...
            </div>
          ) : teams.length > 0 ? (
            <>
              <div className="flex flex-wrap gap-2 mb-3">
                {teams.map((t) => {
                  const selected = form.participantIds.includes(t.id)
                  const maxReached =
                    hasLimit && form.participantIds.length >= 2 && !selected
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => !maxReached && toggleTeam(t.id)}
                      disabled={maxReached}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${
                        selected
                          ? 'bg-brand-blue text-white'
                          : maxReached
                            ? 'bg-zinc-100 text-zinc-400 cursor-not-allowed opacity-50'
                            : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'
                      }`}
                    >
                      {selected && <Check className="size-3" />}
                      {t.name}
                    </button>
                  )
                })}
              </div>
              <p className="text-[10px] text-zinc-400 mb-2">
                {form.participantIds.length}
                {hasLimit ? '/2' : ''} selecionado
                {form.participantIds.length !== 1 ? 's' : ''}
                {hasLimit ? ' — máximo 2' : ''}
              </p>
            </>
          ) : null}

          {/* Texto livre sempre disponível */}
          <input
            value={form.participantFreeText}
            onChange={(e) =>
              setForm({ ...form, participantFreeText: e.target.value })
            }
            className="input"
            placeholder={
              teams.length > 0
                ? 'Ou digite algo diferente... (ex: outros, classificatória)'
                : 'Ex: Max Verstappen, Flamengo × Palmeiras...'
            }
          />
          <p className="text-[10px] text-zinc-400 mt-1">
            {teams.length > 0
              ? 'Use os chips acima para times cadastrados, ou escreva livremente.'
              : 'Texto livre — use para esportes sem times fixos como F1 ou UFC.'}
          </p>
        </div>
      )}

      {error && <p className="text-xs text-red-500">{error}</p>}

      <div className="flex gap-2 justify-end pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 rounded-full text-sm font-bold text-zinc-600 hover:bg-zinc-100"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={() => onSave(form)}
          disabled={!canSave || isSaving}
          className="px-5 py-2 rounded-full text-sm font-bold bg-brand-blue text-white disabled:opacity-50"
        >
          {isSaving ? 'Salvando...' : 'Salvar'}
        </button>
      </div>
    </div>
  )
}

// --------------------------------------------------------------------------
// Componentes auxiliares
// --------------------------------------------------------------------------

function EditProfileForm({
  initial,
  onSave,
  onCancel,
  isSaving,
  error
}: {
  initial: ProfileForm
  onSave: (data: ProfileForm) => void
  onCancel: () => void
  isSaving: boolean
  error?: string
}) {
  const [form, setForm] = useState<ProfileForm>(initial)
  const set =
    (key: keyof ProfileForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((prev) => ({ ...prev, [key]: e.target.value }))

  const canSave = form.name.length >= 2 && form.address.length >= 5

  return (
    <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
      <Field label="Nome do bar *">
        <input
          value={form.name}
          onChange={set('name')}
          className="input"
          placeholder="Nome do bar"
          autoComplete="organization"
        />
      </Field>

      <Field label="Endereço *">
        <input
          value={form.address}
          onChange={set('address')}
          className="input"
          placeholder="Rua, número"
          autoComplete="street-address"
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Bairro *">
          <input
            value={form.neighborhood}
            onChange={set('neighborhood')}
            className="input"
            placeholder="Bairro"
          />
        </Field>
        <Field label="Cidade *">
          <input
            value={form.city}
            onChange={set('city')}
            className="input"
            placeholder="Cidade"
            autoComplete="address-level2"
          />
        </Field>
      </div>

      <Field label="Telefone">
        <input
          type="tel"
          value={form.phone}
          onChange={set('phone')}
          className="input"
          placeholder="(11) 99999-9999"
          autoComplete="tel"
        />
      </Field>

      <Field label="Descrição">
        <textarea
          value={form.description}
          onChange={set('description')}
          className="input resize-none"
          rows={3}
          placeholder="Descreva o ambiente do seu bar..."
        />
      </Field>

      {error && <p className="text-xs text-red-500">{error}</p>}

      <div className="flex gap-2 justify-end pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 rounded-full text-sm font-bold text-zinc-600 hover:bg-zinc-100"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={() => onSave(form)}
          disabled={!canSave || isSaving}
          className="px-5 py-2 rounded-full text-sm font-bold bg-brand-blue text-white disabled:opacity-50"
        >
          {isSaving ? 'Salvando...' : 'Salvar'}
        </button>
      </div>
    </div>
  )
}

function Field({
  label,
  children
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500 mb-1.5 block">
        {label}
      </span>
      {children}
    </label>
  )
}

function Modal({
  title,
  children,
  onClose
}: {
  title: string
  children: React.ReactNode
  onClose: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/40 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-heading text-xl font-bold">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full hover:bg-zinc-100"
          >
            <X className="size-4" />
          </button>
        </div>
        {children}
      </div>
      <style>{`.input{width:100%;padding:0.625rem 0.75rem;border-radius:0.5rem;background:#fafafa;font-size:0.875rem;font-weight:600;outline:none}.input:focus{box-shadow:0 0 0 2px rgba(30,107,255,0.3)}`}</style>
    </div>
  )
}
