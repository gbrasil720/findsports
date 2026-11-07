import { gameHouseOfferFromForm } from '@findsports_oficial/api/lib/house-offer'
import {
  EVENT_CHAMPIONSHIP_MAX_LENGTH,
  EVENT_CHAMPIONSHIP_MIN_LENGTH,
  EVENT_PARTICIPANT_FREE_TEXT_MAX_LENGTH
} from '@findsports_oficial/db/event-limits'
import {
  EVENT_START_PROBLEM_MESSAGE,
  getEventStartProblem
} from '@findsports_oficial/db/event-window'
import {
  HOUSE_OFFER_MAX_LENGTH,
  houseOfferLength,
  normalizeHouseOffer
} from '@findsports_oficial/db/house-offer'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useId, useRef, useState } from 'react'
import type { AdminEvent } from '@/components/admin/admin-model'
import { useMyBar } from '@/components/admin/admin-queries'
import {
  formatDateTime,
  maskDateTime,
  parseDateTime
} from '@/components/admin/date-time-input'
import {
  Beer,
  Check,
  Close,
  People,
  Search,
  Sound,
  Tv
} from '@/components/landing/v3/icons'
import { groupTeamsByKind } from '@/components/sports/team-groups'
import { useTeamSearch } from '@/components/sports/team-picker'
import { analytics } from '@/lib/analytics'
import { CATALOG_QUERY } from '@/lib/query-cache'
import { getUserFacingMessage, isRetryableError } from '@/lib/user-facing-error'
import { useTRPC } from '@/utils/trpc'
import { gameOffer, gameScreen, isDraft } from './dados'
import { Interruptor, usePainel } from './painel-shell'

/*
 * "Novo jogo" (WEB-501, fase 2; protótipo `openSheet`, `drawPick`): a folha
 * da direita no computador e de baixo no celular. A lógica é a do formulário
 * antigo (`event-form.tsx`): esporte, times do catálogo pela busca (WEB-381),
 * campeonato, dia e hora com máscara (WEB-306) e o "falta preencher"
 * (WEB-270). Não existe catálogo de jogos: o jogo é montado pelos times.
 * "No bar" traz telão e som deste jogo (WEB-399, nascem das características),
 * a lista de quem vai (WEB-437) e a oferta deste jogo (WEB-422), as duas só
 * no Elite. Jogo novo e rascunho salvam como rascunho ou publicam (WEB-436);
 * o publicado não volta a rascunho.
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
      // Só o fechamento desta folha: o React repassa o `close` de um
      // `<dialog>` de dentro (uma confirmação) para cá.
      onClose={(event) => {
        if (event.target === ref.current) onClose()
      }}
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
  const { elite } = usePainel()
  const [initial] = useState(() => initialOf(mode))
  // O que o jogo tem no bar: o do jogo aberto, senão o padrão do cadastro.
  const [noBar] = useState(() => {
    const source = mode.kind === 'new' ? null : mode.event
    const screen = gameScreen(
      source ?? { onBigScreen: null, withSound: null },
      { amenities: bar?.amenities ?? [] }
    )
    const offer = source
      ? gameOffer(source, { houseOffer: bar?.houseOffer ?? null }, true)
      : (bar?.houseOffer ?? null)
    return {
      ...screen,
      attendanceEnabled: source?.attendanceEnabled ?? true,
      ofertaLigada: offer !== null,
      oferta: offer ?? ''
    }
  })
  const [onBigScreen, setOnBigScreen] = useState(noBar.onBigScreen)
  const [withSound, setWithSound] = useState(noBar.withSound)
  const [attendanceEnabled, setAttendanceEnabled] = useState(
    noBar.attendanceEnabled
  )
  const [ofertaLigada, setOfertaLigada] = useState(noBar.ofertaLigada)
  const [ofertaTexto, setOfertaTexto] = useState(noBar.oferta)
  const [publicando, setPublicando] = useState(true)
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
      // A lista de quem vai do jogo muda o que Quem vai mostra (WEB-437).
      queryClient.invalidateQueries({
        queryKey: trpc.barReservations.going.queryKey()
      }),
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
        // Publicar o rascunho passa a contar no limite (WEB-436).
        void invalidate(true)
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
  const ofertaTamanho = houseOfferLength(normalizeHouseOffer(ofertaTexto))
  const ofertaPassou =
    elite && ofertaLigada ? ofertaTamanho - HOUSE_OFFER_MAX_LENGTH : 0
  const canSave =
    missing.length === 0 &&
    !!start.value &&
    !startProblem &&
    !endProblem &&
    !championshipTooLong &&
    !freeTextTooLong &&
    ofertaPassou <= 0
  // Jogo novo e rascunho escolhem entre rascunho e publicar (WEB-436).
  const comRascunho = mode.kind !== 'edit' || isDraft(mode.event)

  /**
   * O que vai do "No bar". Jogo novo manda só o que difere do cadastro (o
   * resto herda); editar manda o que mudou; duplicar copia tudo.
   */
  const noBarInput = () => {
    const sends = <T,>(value: T, before: T) =>
      mode.kind === 'duplicate' || value !== before
    const offerChanged =
      ofertaLigada !== noBar.ofertaLigada || ofertaTexto !== noBar.oferta
    return {
      ...(sends(onBigScreen, noBar.onBigScreen) && { onBigScreen }),
      ...(sends(withSound, noBar.withSound) && { withSound }),
      ...(elite &&
        sends(attendanceEnabled, noBar.attendanceEnabled) && {
          attendanceEnabled
        }),
      ...(elite &&
        (mode.kind === 'duplicate' || offerChanged) &&
        gameHouseOfferFromForm(bar?.houseOffer ?? null, {
          ligada: ofertaLigada,
          texto: ofertaTexto
        }))
    }
  }

  const save = (publicar: boolean) => {
    if (!canSave || !start.value) return
    setPublicando(publicar)
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
        participantFreeText: freeText,
        ...noBarInput(),
        ...(publicar && isDraft(mode.event) && { publish: true as const })
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
        participantFreeText: freeText || undefined,
        ...noBarInput(),
        ...(!publicar && { draft: true })
      },
      {
        onSuccess: () =>
          publicar
            ? analytics.eventCreated({
                championship,
                sport: selectedSport?.name ?? sportId,
                has_teams: participantIds.length > 0
              })
            : undefined
      }
    )
  }

  const padrao = normalizeHouseOffer(bar?.houseOffer ?? null)
  const ofertaDoJogo = ofertaLigada ? normalizeHouseOffer(ofertaTexto) : null
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

        <div className="pn-fl">
          <span className="pn-fl-l">No bar</span>
          <div className="pn-sws">
            <div className="pn-sw">
              <Tv size={20} />
              <span>Passa no telão</span>
              <Interruptor
                ligado={onBigScreen}
                onChange={setOnBigScreen}
                rotulo="Passa no telão"
              />
            </div>
            <div className="pn-sw">
              <Sound size={20} />
              <span>Som do jogo ligado</span>
              <Interruptor
                ligado={withSound}
                onChange={setWithSound}
                rotulo="Som do jogo ligado"
              />
            </div>
            {elite ? (
              <div className="pn-sw">
                <People size={20} />
                <span>
                  Lista de quem vai
                  {/* Desligar não apaga quem já marcou: o código continua
                    valendo no balcão, só não entra ninguém novo. */}
                  <small aria-live="polite">
                    {attendanceEnabled
                      ? 'Torcedores marcam “Vou assistir aqui” e recebem um código.'
                      : 'O app não mostra “Vou assistir aqui” neste jogo. Quem já marcou continua com o código.'}
                  </small>
                </span>
                <Interruptor
                  ligado={attendanceEnabled}
                  onChange={setAttendanceEnabled}
                  rotulo="Lista de quem vai neste jogo"
                />
              </div>
            ) : null}
            {elite ? (
              <div className="pn-sw">
                <Beer size={20} />
                <span>
                  Oferta da casa neste jogo
                  <small aria-live="polite">
                    {!ofertaDoJogo
                      ? 'Sem oferta neste jogo.'
                      : ofertaDoJogo === padrao
                        ? 'A mesma do seu espaço.'
                        : padrao
                          ? 'Só neste jogo. Os outros seguem com a do seu espaço.'
                          : 'Só neste jogo.'}
                  </small>
                </span>
                <Interruptor
                  ligado={ofertaLigada}
                  onChange={(ligado) => {
                    setOfertaLigada(ligado)
                    // Religar em branco volta à padrão, como nasce.
                    if (ligado && !ofertaTexto.trim())
                      setOfertaTexto(padrao ?? '')
                  }}
                  rotulo="Oferta da casa neste jogo"
                />
              </div>
            ) : null}
          </div>
          {elite && ofertaLigada ? (
            <>
              <textarea
                className="pn-inp"
                rows={2}
                value={ofertaTexto}
                onChange={(event) => setOfertaTexto(event.target.value)}
                aria-label="Oferta da casa neste jogo"
                placeholder="Ex.: chopp em dobro até o intervalo"
                aria-invalid={ofertaPassou > 0 || undefined}
              />
              <div className="pn-limit">
                <p className="pn-hint">
                  Quem marca “Vou assistir aqui” ganha ao mostrar o código no
                  balcão.
                </p>
                <span
                  className={ofertaPassou > 0 ? 'is-over' : undefined}
                  aria-hidden="true"
                >
                  {ofertaTamanho}/{HOUSE_OFFER_MAX_LENGTH}
                </span>
              </div>
              {ofertaPassou > 0 ? (
                <p className="pn-ferr" role="alert">
                  A oferta aceita até {HOUSE_OFFER_MAX_LENGTH} caracteres. Tire{' '}
                  {ofertaPassou}.
                </p>
              ) : null}
            </>
          ) : null}
          <p className="pn-hint">
            Telão e som nascem das características do bar. Desmarque o que este
            jogo não tem.
          </p>
        </div>
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
        {/* Com os dois botões, o X do topo é o cancelar. */}
        {comRascunho ? null : (
          <button
            type="button"
            className="pn-btn pn-ghost pn-sm"
            onClick={onDone}
          >
            Cancelar
          </button>
        )}
        {comRascunho ? (
          <button
            type="button"
            className="pn-btn pn-ghost pn-sm"
            onClick={() => save(false)}
            disabled={!canSave || saving}
            aria-describedby={missing.length ? missingId : undefined}
          >
            {saving && !publicando ? 'Salvando…' : 'Salvar rascunho'}
          </button>
        ) : null}
        <button
          type="button"
          className="pn-btn pn-acid pn-sm"
          onClick={() => save(true)}
          disabled={!canSave || saving}
          aria-describedby={missing.length ? missingId : undefined}
        >
          {saving && publicando
            ? 'Salvando…'
            : mutationError && isRetryableError(mutationError)
              ? 'Tentar de novo'
              : comRascunho
                ? 'Publicar jogo'
                : 'Salvar alterações'}
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
