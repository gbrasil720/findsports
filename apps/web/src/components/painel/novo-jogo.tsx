import {
  EVENT_CHAMPIONSHIP_MAX_LENGTH,
  EVENT_CHAMPIONSHIP_MIN_LENGTH,
  EVENT_PARTICIPANT_FREE_TEXT_MAX_LENGTH
} from '@findsports_oficial/db/event-limits'
import {
  EVENT_START_PROBLEM_MESSAGE,
  getEventStartProblem
} from '@findsports_oficial/db/event-window'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useEffect, useId, useRef, useState } from 'react'
import type { AdminEvent } from '@/components/admin/admin-model'
import { useMyBar } from '@/components/admin/admin-queries'
import {
  formatDateTime,
  maskDateTime,
  parseDateTime
} from '@/components/admin/date-time-input'
import { Check, Close, Search } from '@/components/landing/v3/icons'
import { groupTeamsByKind } from '@/components/sports/team-groups'
import { useTeamSearch } from '@/components/sports/team-picker'
import { analytics } from '@/lib/analytics'
import { CATALOG_QUERY } from '@/lib/query-cache'
import { getUserFacingMessage, isRetryableError } from '@/lib/user-facing-error'
import { useTRPC } from '@/utils/trpc'
import { barScreen } from './dados'

/*
 * "Novo jogo" (WEB-501, fase 2; protótipo `openSheet`, `drawPick`): a folha
 * da direita no computador e de baixo no celular. A lógica é a do formulário
 * antigo (`event-form.tsx`): esporte, times do catálogo pela busca (WEB-381),
 * campeonato, dia e hora com máscara (WEB-306) e o "falta preencher"
 * (WEB-270). Não existe catálogo de jogos: o jogo é montado pelos times.
 * Telão, som, lista e oferta por jogo não existem no servidor; a folha diz que
 * vêm do cadastro do bar.
 */

// Tênis entra pelo jogo de simples (um contra um); dupla vai no texto livre.
const DIRECT_CONFRONTATION_SLUGS = new Set([
  'futebol',
  'basquete',
  'volei',
  'futebol-americano',
  'tenis'
])

const DAY_MS = 86_400_000
const MAX_DURATION_MS = 12 * 3_600_000

export type NovoJogoMode =
  | { kind: 'new'; day?: string }
  | { kind: 'edit'; event: AdminEvent }
  | { kind: 'duplicate'; event: AdminEvent }

function toDatetimeLocal(date: string | Date): string {
  const d = new Date(date)
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16)
}

const maskDate = (raw: string, atEnd: boolean) =>
  maskDateTime(raw, atEnd).slice(0, 10)

function maskTime(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 4)
  return digits.length > 2 ? `${digits.slice(0, 2)}:${digits.slice(2)}` : digits
}

/** `aaaa-mm-ddThh:mm` → dia e hora como estão nos campos. */
function splitLocal(local: string): { date: string; time: string } {
  const [date = '', time = ''] = formatDateTime(local).split(' ')
  return { date, time }
}

function initialOf(mode: NovoJogoMode) {
  if (mode.kind === 'new') {
    return {
      sportId: '',
      championship: '',
      participantIds: [] as string[],
      participantFreeText: '',
      start: mode.day ? splitLocal(`${mode.day}T`) : { date: '', time: '' },
      end: ''
    }
  }
  const { event } = mode
  const shift = mode.kind === 'duplicate' ? 7 * DAY_MS : 0
  const start = new Date(Date.parse(event.startsAt) + shift)
  return {
    sportId: event.sportId,
    championship: event.championship,
    participantIds: event.participants.map((item) => item.team.id),
    participantFreeText: event.participantFreeText ?? '',
    start: splitLocal(toDatetimeLocal(start)),
    end: event.endsAt
      ? splitLocal(toDatetimeLocal(new Date(Date.parse(event.endsAt) + shift)))
          .time
      : ''
  }
}

export function NovoJogo({
  mode,
  onClose
}: {
  mode: NovoJogoMode
  onClose: () => void
}) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current
    if (dialog && !dialog.open) dialog.showModal()
  }, [])

  const title = mode.kind === 'edit' ? 'Editar jogo' : 'Novo jogo'
  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: o Esc já fecha o `<dialog>` nativo; o clique é só o do fundo.
    <dialog
      ref={ref}
      className="pn-sheet"
      aria-labelledby="pn-sheet-t"
      onClose={onClose}
      onClick={(event) => {
        if (event.target === ref.current) onClose()
      }}
    >
      <div className="pn-sheet-in">
        <header>
          <h2 className="pn-disp" id="pn-sheet-t">
            {title}
          </h2>
          <button
            type="button"
            className="pn-btn pn-ghost pn-ic"
            aria-label="Fechar"
            onClick={onClose}
          >
            <Close size={18} />
          </button>
        </header>
        <Formulario mode={mode} onDone={onClose} />
      </div>
    </dialog>
  )
}

function Formulario({
  mode,
  onDone
}: {
  mode: NovoJogoMode
  onDone: () => void
}) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const ids = useId()
  const { data: bar } = useMyBar()
  const [initial] = useState(() => initialOf(mode))
  const [sportId, setSportId] = useState(initial.sportId)
  const [championship, setChampionship] = useState(initial.championship)
  const [participantIds, setParticipantIds] = useState(initial.participantIds)
  const [freeText, setFreeText] = useState(initial.participantFreeText)
  const [dateText, setDateText] = useState(initial.start.date)
  const [timeText, setTimeText] = useState(initial.start.time)
  const [endText, setEndText] = useState(initial.end)
  const [picked, setPicked] = useState(
    () =>
      new Map(
        mode.kind === 'new'
          ? []
          : mode.event.participants.map(
              (item) => [item.team.id, item.team.name] as const
            )
      )
  )

  const sports = useQuery({
    ...trpc.pubs.getSports.queryOptions(),
    ...CATALOG_QUERY,
    meta: { errorToast: false }
  })
  const teams = useQuery({
    ...trpc.pubs.getTeamsBySport.queryOptions({ sportId }),
    ...CATALOG_QUERY,
    enabled: !!sportId
  })
  const search = useTeamSearch(sportId ? [sportId] : [])

  // A prévia do perfil em "Meu espaço" lê a agenda por `pubs.getById`.
  const invalidate = (policy: boolean) =>
    Promise.all([
      queryClient.invalidateQueries({
        queryKey: trpc.pub.getMyEvents.queryKey()
      }),
      queryClient.invalidateQueries({ queryKey: trpc.pub.getMe.queryKey() }),
      queryClient.invalidateQueries({ queryKey: trpc.pubs.getById.pathKey() }),
      policy
        ? queryClient.invalidateQueries({
            queryKey: trpc.pub.getMyEventCreationPolicy.queryKey()
          })
        : null
    ])
  const create = useMutation(
    trpc.pub.createEvent.mutationOptions({
      onSuccess: () => {
        void invalidate(true)
        onDone()
      }
    })
  )
  const update = useMutation(
    trpc.pub.updateEvent.mutationOptions({
      onSuccess: () => {
        void invalidate(false)
        onDone()
      }
    })
  )
  const saving = create.isPending || update.isPending
  const mutationError = create.error ?? update.error

  const sportList = sports.data ?? []
  const featured = teams.data ?? []
  const selectedSport = sportList.find((s) => s.id === sportId)
  const hasLimit = selectedSport
    ? DIRECT_CONFRONTATION_SLUGS.has(selectedSport.slug)
    : false
  const hasFreeText = freeText.trim().length > 0
  const known = new Map([
    ...[...featured, ...(search.results.data ?? [])].map(
      (team) => [team.id, team.name] as const
    ),
    ...picked
  ])
  // A ordem em que os chips foram marcados é a do confronto: o primeiro é o
  // mandante.
  const matchup = participantIds.flatMap((id) => known.get(id) ?? [])
  const featuredIds = new Set(featured.map((t) => t.id))
  const pickedOutside = participantIds.flatMap((id) => {
    const name = known.get(id)
    return name && !featuredIds.has(id) ? [{ id, name }] : []
  })

  const toggleTeam = (team: { id: string; name: string }) => {
    setPicked((prev) => new Map(prev).set(team.id, team.name))
    setParticipantIds((prev) =>
      prev.includes(team.id)
        ? prev.filter((t) => t !== team.id)
        : [...prev, team.id]
    )
  }

  const chip = (team: { id: string; name: string }) => {
    const selected = participantIds.includes(team.id)
    const disabled =
      hasFreeText || (hasLimit && participantIds.length >= 2 && !selected)
    return (
      <button
        key={team.id}
        type="button"
        aria-pressed={selected}
        disabled={disabled}
        onClick={() => toggleTeam(team)}
        className="pn-tchip"
      >
        {selected ? <Check size={14} /> : null}
        {team.name}
      </button>
    )
  }

  // Dia, hora e término.
  const start = parseDateTime(`${dateText} ${timeText}`)
  const dateDigits = dateText.replace(/\D/g, '')
  const timeDigits = timeText.replace(/\D/g, '')
  const dateProblem =
    dateDigits.length === 8 &&
    parseDateTime(`${dateText} 00:00`).problem === 'date'
  const timeProblem =
    timeDigits.length === 4 &&
    parseDateTime(`01/01/2030 ${timeText}`).problem === 'time'
  const startChanged =
    mode.kind !== 'edit' ||
    dateText !== initial.start.date ||
    timeText !== initial.start.time
  const startProblem =
    start.value && startChanged
      ? getEventStartProblem(new Date(start.value))
      : null

  const endDigits = endText.replace(/\D/g, '')
  const endValue = (() => {
    if (!endDigits || !start.value) return null
    if (endDigits.length < 4) return { problem: 'incomplete' as const }
    const end = parseDateTime(`${dateText} ${endText}`)
    if (!end.value) return { problem: 'time' as const }
    let endsAt = new Date(end.value).getTime()
    const startsAt = new Date(start.value).getTime()
    // Termina depois da meia-noite: o fim é no dia seguinte.
    if (endsAt < startsAt) endsAt += DAY_MS
    if (endsAt <= startsAt || endsAt - startsAt > MAX_DURATION_MS) {
      return { problem: 'before' as const }
    }
    return { endsAt: new Date(endsAt).toISOString() }
  })()
  const endProblem =
    endValue && 'problem' in endValue
      ? endValue.problem === 'before'
        ? 'Término deve ser posterior ao início.'
        : endValue.problem === 'time'
          ? 'O horário vai de 00:00 a 23:59.'
          : 'Complete o horário: hh:mm.'
      : null

  const championshipTooLong =
    championship.length > EVENT_CHAMPIONSHIP_MAX_LENGTH
  const freeTextTooLong =
    freeText.length > EVENT_PARTICIPANT_FREE_TEXT_MAX_LENGTH
  const missing = [
    !sportId && 'esporte',
    championship.trim().length < EVENT_CHAMPIONSHIP_MIN_LENGTH &&
      `campeonato (pelo menos ${EVENT_CHAMPIONSHIP_MIN_LENGTH} caracteres)`,
    (start.value === '' || start.problem === 'incomplete') &&
      !dateProblem &&
      !timeProblem &&
      'dia e horário'
  ].filter(Boolean)
  const canSave =
    missing.length === 0 &&
    !!start.value &&
    !startProblem &&
    !endProblem &&
    !championshipTooLong &&
    !freeTextTooLong

  const save = () => {
    if (!canSave || !start.value) return
    const startsAt = new Date(start.value).toISOString()
    const endsAt = endValue && 'endsAt' in endValue ? endValue.endsAt : null
    if (mode.kind === 'edit') {
      update.mutate({
        eventId: mode.event.id,
        sportId,
        championship,
        startsAt,
        endsAt,
        participantIds,
        participantFreeText: freeText
      })
      return
    }
    create.mutate(
      {
        sportId,
        championship,
        startsAt,
        endsAt: endsAt ?? undefined,
        participantIds,
        participantFreeText: freeText || undefined
      },
      {
        onSuccess: () =>
          analytics.eventCreated({
            championship,
            sport: selectedSport?.name ?? sportId,
            has_teams: participantIds.length > 0
          })
      }
    )
  }

  const screen = bar ? barScreen(bar) : null
  const missingId = `${ids}-missing`

  return (
    <>
      <div className="pn-sheet-body">
        <fieldset className="pn-fl">
          <legend>Esporte</legend>
          {sports.isLoading ? (
            <p className="pn-note" role="status">
              Carregando esportes…
            </p>
          ) : sports.isError ? (
            <div className="pn-err" role="alert">
              <p>
                {getUserFacingMessage(
                  sports.error,
                  'Não foi possível carregar os esportes. Tente novamente.'
                )}
              </p>
              {isRetryableError(sports.error) ? (
                <button
                  type="button"
                  className="pn-btn pn-ghost pn-sm"
                  onClick={() => void sports.refetch()}
                >
                  Tentar novamente
                </button>
              ) : null}
            </div>
          ) : (
            <div className="pn-sports">
              {sportList.map((sport) => (
                <label key={sport.id} className="pn-rchip">
                  <input
                    type="radio"
                    name={`${ids}-sport`}
                    value={sport.id}
                    checked={sportId === sport.id}
                    onChange={() => {
                      search.setText('')
                      setSportId(sport.id)
                      setParticipantIds([])
                      setFreeText('')
                    }}
                  />
                  {sport.name}
                </label>
              ))}
            </div>
          )}
        </fieldset>

        {sportId ? (
          <div className="pn-fl">
            <span className="pn-fl-l">Qual jogo</span>
            <label className="pn-q">
              <Search size={18} />
              <span className="sr-only">Buscar time ou atleta</span>
              <input
                type="text"
                inputMode="search"
                enterKeyHint="search"
                autoComplete="off"
                maxLength={60}
                placeholder="Buscar time ou atleta"
                value={search.text}
                onChange={(event) => search.setText(event.target.value)}
              />
            </label>
            <div className="pn-pick" aria-live="polite">
              {search.active ? (
                search.results.isError ? (
                  <p className="pn-note" role="alert">
                    Não foi possível buscar.
                  </p>
                ) : !search.results.data ? (
                  <p className="pn-note" role="status">
                    Buscando…
                  </p>
                ) : search.results.data.length === 0 ? (
                  <p className="pn-note">
                    Nada com “{search.query}”. Escreva o jogo abaixo.
                  </p>
                ) : (
                  <div className="pn-tchips">
                    {search.results.data.map(chip)}
                  </div>
                )
              ) : teams.isLoading ? (
                <p className="pn-note" role="status">
                  Carregando times…
                </p>
              ) : (
                <>
                  {pickedOutside.length ? (
                    <div className="pn-tchips">{pickedOutside.map(chip)}</div>
                  ) : null}
                  {groupTeamsByKind(featured).map((group) =>
                    group.label ? (
                      <fieldset key={group.label} className="pn-tgroup">
                        <legend>{group.label}</legend>
                        <div className="pn-tchips">{group.teams.map(chip)}</div>
                      </fieldset>
                    ) : (
                      <div key="all" className="pn-tchips">
                        {group.teams.map(chip)}
                      </div>
                    )
                  )}
                </>
              )}
            </div>
            {matchup.length >= 2 ? (
              <div className="pn-matchup">
                <p aria-live="polite">
                  <b>Confronto: {matchup.join(' × ')}</b>
                  <span>O primeiro time marcado é o mandante.</span>
                </p>
                <button
                  type="button"
                  className="pn-btn pn-ghost pn-sm"
                  onClick={() =>
                    setParticipantIds((prev) => [...prev].reverse())
                  }
                >
                  Inverter
                </button>
              </div>
            ) : !hasFreeText && (featured.length || pickedOutside.length) ? (
              <p className="pn-hint">
                {participantIds.length}
                {hasLimit ? '/2' : ''} selecionado
                {participantIds.length !== 1 ? 's' : ''}
                {hasLimit ? ' — máximo 2' : ''}
              </p>
            ) : null}
            <input
              className="pn-inp"
              value={freeText}
              onChange={(event) => {
                setFreeText(event.target.value)
                if (event.target.value) setParticipantIds([])
              }}
              aria-label="Times ou participantes em texto livre"
              placeholder={
                featured.length
                  ? 'Ou escreva o jogo (ex.: classificatória)'
                  : 'Ex.: Max Verstappen, GP de São Paulo…'
              }
              aria-invalid={freeTextTooLong || undefined}
            />
            <Limit
              length={freeText.length}
              max={EVENT_PARTICIPANT_FREE_TEXT_MAX_LENGTH}
              subject="O texto livre"
              hint={
                featured.length
                  ? hasFreeText
                    ? 'Com o texto livre, os times ficam travados. Apague para voltar a marcar.'
                    : 'Marque os times acima ou escreva livremente.'
                  : 'Texto livre: para esportes sem times fixos, como F1 ou UFC.'
              }
            />
          </div>
        ) : null}

        <label className="pn-fl">
          <span className="pn-fl-l">Campeonato</span>
          <input
            className="pn-inp"
            value={championship}
            onChange={(event) => setChampionship(event.target.value)}
            placeholder="Ex.: Brasileirão, Copa do Brasil…"
            aria-invalid={championshipTooLong || undefined}
          />
        </label>
        <Limit
          length={championship.length}
          max={EVENT_CHAMPIONSHIP_MAX_LENGTH}
          subject="O campeonato"
        />

        <div className="pn-two">
          <label className="pn-fl">
            <span className="pn-fl-l">Dia</span>
            <input
              className="pn-inp"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              placeholder="dd/mm/aaaa"
              value={dateText}
              onChange={(event) => {
                const input = event.target
                const atEnd =
                  (input.selectionStart ?? input.value.length) ===
                  input.value.length
                // ponytail: no meio do texto o cursor vai para o fim; o
                // `DateTimeInput` antigo guarda a posição, se fizer falta.
                setDateText(maskDate(input.value, atEnd))
              }}
              aria-invalid={dateProblem || Boolean(startProblem) || undefined}
            />
          </label>
          <label className="pn-fl">
            <span className="pn-fl-l">Horário</span>
            <input
              className="pn-inp"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              placeholder="hh:mm"
              value={timeText}
              onChange={(event) => setTimeText(maskTime(event.target.value))}
              aria-invalid={timeProblem || undefined}
            />
          </label>
        </div>
        {dateProblem ? (
          <p className="pn-ferr" role="alert">
            Essa data não existe. Confira o dia e o mês.
          </p>
        ) : null}
        {timeProblem ? (
          <p className="pn-ferr" role="alert">
            O horário vai de 00:00 a 23:59.
          </p>
        ) : null}
        {startProblem ? (
          <p className="pn-ferr" role="alert">
            {EVENT_START_PROBLEM_MESSAGE[startProblem]}
          </p>
        ) : null}

        <label className="pn-fl">
          <span className="pn-fl-l">Termina às · opcional</span>
          <input
            className="pn-inp pn-inp-short"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            placeholder="hh:mm"
            value={endText}
            onChange={(event) => setEndText(maskTime(event.target.value))}
            aria-invalid={Boolean(endProblem) || undefined}
          />
        </label>
        {endProblem ? (
          <p className="pn-ferr" role="alert">
            {endProblem}
          </p>
        ) : (
          <p className="pn-hint">Sem término, o jogo dura 3 horas.</p>
        )}

        {screen ? (
          <div className="pn-fl">
            <span className="pn-fl-l">No bar</span>
            <p className="pn-note">
              {[
                screen.tv
                  ? screen.screens && screen.screens > 1
                    ? `${screen.screens} telões`
                    : 'Telão'
                  : null,
                screen.sound ? 'som do jogo ligado' : null
              ]
                .filter(Boolean)
                .join(' · ') || 'Sem telão nem som marcados'}
              . Vale para todos os jogos e muda em{' '}
              <Link to="/admin/meu-espaco" className="pn-lnk">
                Meu espaço
              </Link>
              .
            </p>
          </div>
        ) : null}
      </div>

      <footer className="pn-sheet-f">
        <div className="pn-sheet-msg">
          {mutationError ? (
            <p className="pn-ferr" role="alert">
              {getUserFacingMessage(
                mutationError,
                mode.kind === 'edit'
                  ? 'Não foi possível atualizar o jogo. Verifique os dados e tente novamente.'
                  : 'Não foi possível criar o jogo. Verifique os dados e tente novamente.'
              )}
            </p>
          ) : missing.length ? (
            <p id={missingId} className="pn-hint">
              Para salvar, falta preencher: {missing.join(', ')}.
            </p>
          ) : null}
        </div>
        <button
          type="button"
          className="pn-btn pn-ghost pn-sm"
          onClick={onDone}
        >
          Cancelar
        </button>
        <button
          type="button"
          className="pn-btn pn-acid pn-sm"
          onClick={save}
          disabled={!canSave || saving}
          aria-describedby={missing.length ? missingId : undefined}
        >
          {saving
            ? 'Salvando…'
            : mutationError && isRetryableError(mutationError)
              ? 'Tentar de novo'
              : mode.kind === 'edit'
                ? 'Salvar alterações'
                : 'Publicar jogo'}
        </button>
      </footer>
    </>
  )
}

/**
 * Contador sob o campo: deixa digitar além, mostra quanto passou e trava o
 * salvar. Cortar no `maxLength` engoliria o fim de um texto colado.
 */
function Limit({
  length,
  max,
  subject,
  hint
}: {
  length: number
  max: number
  subject: string
  hint?: string
}) {
  const over = length - max
  return (
    <>
      <div className="pn-limit">
        {hint ? <p className="pn-hint">{hint}</p> : null}
        <span className={over > 0 ? 'is-over' : undefined} aria-hidden="true">
          {length}/{max}
        </span>
      </div>
      {over > 0 ? (
        <p className="pn-ferr" role="alert">
          {subject} aceita até {max} caracteres. Tire {over}.
        </p>
      ) : null}
    </>
  )
}
