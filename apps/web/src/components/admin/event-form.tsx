import {
  EVENT_CHAMPIONSHIP_MAX_LENGTH,
  EVENT_CHAMPIONSHIP_MIN_LENGTH,
  EVENT_PARTICIPANT_FREE_TEXT_MAX_LENGTH
} from '@findsports_oficial/db/event-limits'
import { Skeleton } from '@findsports_oficial/ui/components/skeleton'
import { useQuery } from '@tanstack/react-query'
import { type ReactNode, useId, useState } from 'react'
import Check from 'reicon-react/icons/Check'
import { groupTeamsByKind, TeamGroup } from '@/components/sports/team-groups'
import { CATALOG_QUERY } from '@/lib/query-cache'
import { useTRPC } from '@/utils/trpc'
import { DateTimeInput, formatDateTime, parseDateTime } from './date-time-input'

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
  loadingSports: boolean
  error?: string
}

/**
 * Contador e aviso de limite sob um campo de texto, como no editor da oferta
 * da casa: o campo deixa digitar além, mostra quanto passou e o SALVAR trava.
 * Cortar no `maxLength` engoliria em silêncio o fim de um texto colado.
 */
function FieldLimit({
  errorId,
  subject,
  length,
  max,
  children
}: {
  errorId: string
  subject: string
  length: number
  max: number
  /** Texto de apoio do campo, à esquerda do contador. */
  children?: ReactNode
}) {
  const over = length - max
  return (
    <>
      <div className="mt-1 flex items-start gap-2">
        {children ? (
          <p className="text-[10px] text-[var(--onside-muted)]">{children}</p>
        ) : null}
        <p
          className={`ml-auto shrink-0 font-[family-name:var(--onside-mono)] text-xs tabular-nums ${over > 0 ? 'text-[var(--onside-live-text)]' : 'text-[var(--onside-muted)]'}`}
          aria-hidden="true"
        >
          {length}/{max}
        </p>
      </div>
      {over > 0 ? (
        <p id={errorId} className="onside-field-error" role="alert">
          {subject} aceita até {max} caracteres. Tire {over}.
        </p>
      ) : null}
    </>
  )
}

export function EventFormComponent({
  initial,
  sports,
  onSave,
  onCancel,
  isSaving,
  loadingSports,
  error
}: Props) {
  const trpc = useTRPC()
  const ids = useId()
  const championshipErrorId = `${ids}-championship-error`
  const freeTextErrorId = `${ids}-free-text-error`
  const missingId = `${ids}-missing`
  const [form, setForm] = useState<EventForm>(initial)
  // Data e hora ficam como texto com máscara enquanto se digita (WEB-306);
  // `onSave` recebe o mesmo `aaaa-mm-ddThh:mm` que o campo nativo entregava.
  const [startsText, setStartsText] = useState(formatDateTime(initial.startsAt))
  const [endsText, setEndsText] = useState(formatDateTime(initial.endsAt))
  const starts = parseDateTime(startsText)
  const ends = parseDateTime(endsText)

  const { data: teams = [], isLoading: loadingTeams } = useQuery({
    ...trpc.pubs.getTeamsBySport.queryOptions({ sportId: form.sportId }),
    ...CATALOG_QUERY,
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

  // A ordem em que os chips foram marcados é a do confronto: o primeiro é o
  // mandante. Vazio enquanto os times carregam.
  const matchup = form.participantIds.flatMap(
    (id) => teams.find((t) => t.id === id)?.name ?? []
  )

  const handleSportChange = (sportId: string) => {
    setForm((prev) => ({
      ...prev,
      sportId,
      participantIds: [],
      participantFreeText: ''
    }))
  }

  const endsBeforeStart =
    !!ends.value && !!starts.value && ends.value <= starts.value
  const endsAtValid =
    ends.value === '' || (!!ends.value && !!starts.value && !endsBeforeStart)
  // Os mesmos números do servidor (`pub.createEvent`), contados igual.
  const championshipTooLong =
    form.championship.length > EVENT_CHAMPIONSHIP_MAX_LENGTH
  const freeTextTooLong =
    form.participantFreeText.length > EVENT_PARTICIPANT_FREE_TEXT_MAX_LENGTH
  const missing = [
    !form.sportId && 'esporte',
    form.championship.trim().length < EVENT_CHAMPIONSHIP_MIN_LENGTH &&
      `campeonato (pelo menos ${EVENT_CHAMPIONSHIP_MIN_LENGTH} caracteres)`,
    // Incompleto também é "falta preencher"; data ou hora impossível tem a
    // própria mensagem embaixo do campo.
    (starts.value === '' || starts.problem === 'incomplete') && 'data e horário'
  ].filter(Boolean)
  const canSave =
    missing.length === 0 &&
    !!starts.value &&
    endsAtValid &&
    !championshipTooLong &&
    !freeTextTooLong

  return (
    <div className="max-h-[70dvh] space-y-4 overflow-y-auto overscroll-contain pr-1">
      <label className="block" aria-busy={loadingSports || undefined}>
        <span className="onside-label mb-1.5 block">Esporte *</span>
        <select
          value={form.sportId}
          onChange={(e) => handleSportChange(e.target.value)}
          disabled={loadingSports}
          required
          className="onside-select font-semibold"
        >
          <option value="">
            {loadingSports ? 'Carregando esportes…' : 'Selecione um esporte'}
          </option>
          {sports.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>

      <div>
        <label className="block">
          <span className="onside-label mb-1.5 block">Campeonato *</span>
          <input
            value={form.championship}
            onChange={(e) => setForm({ ...form, championship: e.target.value })}
            className="onside-input font-semibold"
            placeholder="Ex: Brasileirão Série A, Copa do Mundo..."
            required
            aria-invalid={championshipTooLong || undefined}
            aria-describedby={
              championshipTooLong ? championshipErrorId : undefined
            }
          />
        </label>
        <FieldLimit
          errorId={championshipErrorId}
          subject="O campeonato"
          length={form.championship.length}
          max={EVENT_CHAMPIONSHIP_MAX_LENGTH}
        />
      </div>

      <DateTimeInput
        label="Data e horário *"
        value={startsText}
        onChange={setStartsText}
        required
      />

      <DateTimeInput
        label="Horário de término"
        value={endsText}
        onChange={setEndsText}
        error={
          endsBeforeStart ? 'Término deve ser posterior ao início.' : undefined
        }
      />

      {form.sportId && (
        <div>
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--onside-muted)] mb-2 block">
            Times / participantes
          </span>

          {loadingTeams ? (
            <div
              className="flex flex-wrap gap-2 py-2"
              role="status"
              aria-busy="true"
              aria-live="polite"
            >
              <span className="sr-only">Carregando times…</span>
              <Skeleton className="h-9 w-24" />
              <Skeleton className="h-9 w-28" />
              <Skeleton className="h-9 w-20" />
            </div>
          ) : teams.length > 0 ? (
            <>
              <div className="mb-3 space-y-3">
                {groupTeamsByKind(teams).map((group) => (
                  <TeamGroup key={group.label} label={group.label}>
                    {group.teams.map((t) => {
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
                  </TeamGroup>
                ))}
              </div>
              {!hasFreeText && (
                <p className="text-[10px] text-[var(--onside-muted)] mb-2">
                  {form.participantIds.length}
                  {hasLimit ? '/2' : ''} selecionado
                  {form.participantIds.length !== 1 ? 's' : ''}
                  {hasLimit ? ' — máximo 2' : ''}
                </p>
              )}
              {matchup.length >= 2 && (
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <p className="font-semibold text-sm" aria-live="polite">
                    Confronto: {matchup.join(' × ')}
                  </p>
                  <button
                    type="button"
                    onClick={() =>
                      setForm((prev) => ({
                        ...prev,
                        participantIds: [...prev.participantIds].reverse()
                      }))
                    }
                    className="onside-btn onside-btn-ghost min-h-11 px-3 text-xs"
                  >
                    Inverter
                  </button>
                  <p className="w-full text-[10px] text-[var(--onside-muted)]">
                    O primeiro time marcado é o mandante.
                  </p>
                </div>
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
            aria-label="Times ou participantes em texto livre"
            placeholder={
              teams.length > 0
                ? 'Ou digite algo diferente... (ex: outros, classificatória)'
                : 'Ex: Max Verstappen, Flamengo × Palmeiras...'
            }
            aria-invalid={freeTextTooLong || undefined}
            aria-describedby={freeTextTooLong ? freeTextErrorId : undefined}
          />
          <FieldLimit
            errorId={freeTextErrorId}
            subject="O texto livre"
            length={form.participantFreeText.length}
            max={EVENT_PARTICIPANT_FREE_TEXT_MAX_LENGTH}
          >
            {teams.length > 0
              ? hasFreeText
                ? 'Escreveu texto livre — chips de times desabilitados. Limpe o campo para voltar a selecioná-los.'
                : 'Use os chips acima para times cadastrados, ou escreva livremente.'
              : 'Texto livre — use para esportes sem times fixos como F1 ou UFC.'}
          </FieldLimit>
        </div>
      )}

      {error && (
        <p className="text-xs text-[var(--onside-live-text)]" role="alert">
          {error}
        </p>
      )}

      {missing.length > 0 && (
        <p id={missingId} className="text-[var(--onside-muted)] text-xs">
          Para salvar, falta preencher: {missing.join(', ')}.
        </p>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="onside-btn onside-btn-ghost min-h-11 px-4 text-xs"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={() =>
            onSave({
              ...form,
              startsAt: starts.value ?? '',
              endsAt: ends.value ?? ''
            })
          }
          disabled={!canSave || isSaving}
          aria-describedby={missing.length > 0 ? missingId : undefined}
          className="onside-btn onside-btn-acid min-h-11 px-5 text-xs"
        >
          {isSaving ? 'Salvando…' : 'Salvar'}
        </button>
      </div>
    </div>
  )
}

export type { EventForm }
