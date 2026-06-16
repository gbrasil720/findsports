import { LoaderPinwheelIcon, Tick01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useTRPC } from '@/utils/trpc'

const DIRECT_CONFRONTATION_SLUGS = new Set([
  'futebol',
  'basquete',
  'volei',
  'futebol-americano'
])

type EventForm = {
  sportId: string
  championship: string
  startsAt: string
  endsAt: string
  participantIds: string[]
  participantFreeText: string
}

type Sport = { id: string; name: string; slug: string }

type Props = {
  initial: EventForm
  sports: Sport[]
  onSave: (form: EventForm) => void
  onCancel: () => void
  isSaving: boolean
  error?: string
}

export function EventFormComponent({
  initial,
  sports,
  onSave,
  onCancel,
  isSaving,
  error
}: Props) {
  const trpc = useTRPC()
  const [form, setForm] = useState<EventForm>(initial)

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
    setForm((prev) => ({
      ...prev,
      sportId,
      participantIds: [],
      participantFreeText: ''
    }))
  }

  const endsAtValid =
    !form.endsAt || (!!form.startsAt && form.endsAt > form.startsAt)
  const canSave =
    form.sportId && form.championship && form.startsAt && endsAtValid

  return (
    <div className="space-y-4 max-h-[70dvh] overflow-y-auto pr-1">
      <label className="block">
        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500 mb-1.5 block">
          Esporte *
        </span>
        <select
          value={form.sportId}
          onChange={(e) => handleSportChange(e.target.value)}
          className="admin-input"
        >
          <option value="">Selecione um esporte</option>
          {sports.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500 mb-1.5 block">
          Campeonato *
        </span>
        <input
          value={form.championship}
          onChange={(e) => setForm({ ...form, championship: e.target.value })}
          className="admin-input"
          placeholder="Ex: Brasileirão Série A, Copa do Mundo..."
        />
      </label>

      <label className="block">
        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500 mb-1.5 block">
          Data e horário *
        </span>
        <input
          type="datetime-local"
          value={form.startsAt}
          onChange={(e) => setForm({ ...form, startsAt: e.target.value })}
          className="admin-input"
        />
      </label>

      <label className="block">
        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500 mb-1.5 block">
          Horário de término
        </span>
        <input
          type="datetime-local"
          value={form.endsAt}
          min={form.startsAt || undefined}
          onChange={(e) => setForm({ ...form, endsAt: e.target.value })}
          className="admin-input"
        />
        {form.endsAt && form.startsAt && form.endsAt <= form.startsAt && (
          <p className="text-xs text-red-500 mt-1">
            Término deve ser posterior ao início.
          </p>
        )}
      </label>

      {form.sportId && (
        <div>
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500 mb-2 block">
            Times / participantes
          </span>

          {loadingTeams ? (
            <div className="flex items-center gap-2 text-zinc-400 text-sm py-2">
              <HugeiconsIcon
                icon={LoaderPinwheelIcon}
                size={16}
                color="currentColor"
                strokeWidth={1.5}
                className="animate-spin"
              />{' '}
              Carregando times...
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
                      {selected && (
                        <HugeiconsIcon
                          icon={Tick01Icon}
                          size={12}
                          color="currentColor"
                          strokeWidth={1.5}
                        />
                      )}
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

          <input
            value={form.participantFreeText}
            onChange={(e) =>
              setForm({ ...form, participantFreeText: e.target.value })
            }
            className="admin-input"
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

export type { EventForm }
