import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import Check from 'reicon-react/icons/Check'
import Loader from 'reicon-react/icons/Loader'
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
  const hasFreeText = form.participantFreeText.trim().length > 0

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
    <div className="max-h-[70dvh] space-y-4 overflow-y-auto overscroll-contain pr-1">
      <label className="block">
        <span className="onside-label mb-1.5 block">Esporte *</span>
        <select
          value={form.sportId}
          onChange={(e) => handleSportChange(e.target.value)}
          className="onside-select font-semibold"
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
        <span className="onside-label mb-1.5 block">Campeonato *</span>
        <input
          value={form.championship}
          onChange={(e) => setForm({ ...form, championship: e.target.value })}
          className="onside-input font-semibold"
          placeholder="Ex: Brasileirão Série A, Copa do Mundo..."
        />
      </label>

      <label className="block">
        <span className="onside-label mb-1.5 block">Data e horário *</span>
        <input
          type="datetime-local"
          value={form.startsAt}
          onChange={(e) => setForm({ ...form, startsAt: e.target.value })}
          className="onside-input font-semibold"
        />
      </label>

      <label className="block">
        <span className="onside-label mb-1.5 block">Horário de término</span>
        <input
          type="datetime-local"
          value={form.endsAt}
          min={form.startsAt || undefined}
          onChange={(e) => setForm({ ...form, endsAt: e.target.value })}
          className="onside-input font-semibold"
        />
        {form.endsAt && form.startsAt && form.endsAt <= form.startsAt && (
          <p className="text-xs text-[var(--onside-live-text)] mt-1">
            Término deve ser posterior ao início.
          </p>
        )}
      </label>

      {form.sportId && (
        <div>
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--onside-muted)] mb-2 block">
            Times / participantes
          </span>

          {loadingTeams ? (
            <div className="flex items-center gap-2 text-[var(--onside-muted)] text-sm py-2">
              <Loader size={16} color="currentColor" className="animate-spin" />{' '}
              Carregando times...
            </div>
          ) : teams.length > 0 ? (
            <>
              <div className="flex flex-wrap gap-2 mb-3">
                {teams.map((t) => {
                  const selected = form.participantIds.includes(t.id)
                  const maxReached =
                    hasLimit && form.participantIds.length >= 2 && !selected
                  const disabled = maxReached || hasFreeText
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => !disabled && toggleTeam(t.id)}
                      disabled={disabled}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-none text-xs font-bold transition-colors ${
                        selected
                          ? 'bg-[var(--onside-acid)] text-[var(--onside-ink)]'
                          : disabled
                            ? 'bg-[var(--onside-stone)] text-[var(--onside-muted)] cursor-not-allowed opacity-50'
                            : 'bg-[var(--onside-stone)] text-[var(--onside-ink)] hover:bg-[var(--onside-stone)]'
                      }`}
                    >
                      {selected && <Check size={12} color="currentColor" />}
                      {t.name}
                    </button>
                  )
                })}
              </div>
              {!hasFreeText && (
                <p className="text-[10px] text-[var(--onside-muted)] mb-2">
                  {form.participantIds.length}
                  {hasLimit ? '/2' : ''} selecionado
                  {form.participantIds.length !== 1 ? 's' : ''}
                  {hasLimit ? ' — máximo 2' : ''}
                </p>
              )}
            </>
          ) : null}

          <input
            value={form.participantFreeText}
            onChange={(e) => {
              const participantFreeText = e.target.value
              setForm((prev) => ({
                ...prev,
                participantFreeText,
                participantIds: participantFreeText ? [] : prev.participantIds
              }))
            }}
            className="onside-input font-semibold"
            placeholder={
              teams.length > 0
                ? 'Ou digite algo diferente... (ex: outros, classificatória)'
                : 'Ex: Max Verstappen, Flamengo × Palmeiras...'
            }
          />
          <p className="text-[10px] text-[var(--onside-muted)] mt-1">
            {teams.length > 0
              ? hasFreeText
                ? 'Escreveu texto livre — chips de times desabilitados. Limpe o campo para voltar a selecioná-los.'
                : 'Use os chips acima para times cadastrados, ou escreva livremente.'
              : 'Texto livre — use para esportes sem times fixos como F1 ou UFC.'}
          </p>
        </div>
      )}

      {error && (
        <p className="text-xs text-[var(--onside-live-text)]" role="alert">
          {error}
        </p>
      )}

      <div className="flex gap-2 justify-end pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 rounded-none text-sm font-bold text-[var(--onside-muted)] hover:bg-[var(--onside-stone)]"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={() => onSave(form)}
          disabled={!canSave || isSaving}
          className="px-5 py-2 rounded-none text-sm font-bold bg-[var(--onside-acid)] text-[var(--onside-ink)] disabled:opacity-50"
        >
          {isSaving ? 'Salvando…' : 'Salvar'}
        </button>
      </div>
    </div>
  )
}

export type { EventForm }
