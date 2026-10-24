import {
  EVENT_CHAMPIONSHIP_MAX_LENGTH,
  EVENT_CHAMPIONSHIP_MIN_LENGTH,
  EVENT_PARTICIPANT_FREE_TEXT_MAX_LENGTH
} from '@findsports_oficial/db/event-limits'
import {
  EVENT_START_PROBLEM_MESSAGE,
  getEventStartProblem
} from '@findsports_oficial/db/event-window'
import { Skeleton } from '@findsports_oficial/ui/components/skeleton'
import { useQuery } from '@tanstack/react-query'
import { useId, useState } from 'react'
import { groupTeamsByKind, TeamGroup } from '@/components/sports/team-groups'
import { useTeamSearch } from '@/components/sports/team-picker'
import { CATALOG_QUERY } from '@/lib/query-cache'
import { useTRPC } from '@/utils/trpc'
import { Badge, Botao, Campo, Chip, EmBreve, Icone, Toggle } from '../painel'
import {
  DateTimeInput,
  formatDateTime,
  parseDateTime,
  timeOf
} from './date-time-input'

// Tênis entra pelo jogo de simples (um contra um); dupla vai no texto livre.
const DIRECT_CONFRONTATION_SLUGS = new Set([
  'futebol',
  'basquete',
  'volei',
  'futebol-americano',
  'tenis'
])

/** A ordem dos esportes no design (`SPORTS`); o que não está nela vai no fim. */
const SPORT_ORDER = [
  'futebol',
  'basquete',
  'volei',
  'formula-1',
  'mma-ufc',
  'tenis',
  'futebol-americano'
]
const bySportOrder = (a: { slug: string }, b: { slug: string }) =>
  (SPORT_ORDER.indexOf(a.slug) >>> 0) - (SPORT_ORDER.indexOf(b.slug) >>> 0)

type EventForm = {
  sportId: string
  championship: string
  startsAt: string
  endsAt: string
  participantIds: string[]
  participantFreeText: string
  /** WEB-399: nasce das características do bar; o dono desmarca por jogo. */
  onBigScreen: boolean
  withSound: boolean
}

type Sport = { id: string; name: string; slug: string }

type Props = {
  initial: EventForm
  sports: Sport[]
  onSave: (form: EventForm) => void
  isSaving: boolean
  loadingSports: boolean
  /** Nomes dos times do jogo em edição: podem não estar entre os em destaque. */
  initialParticipants?: { id: string; name: string }[]
  /** Jogo novo publica; o que já existe só salva. */
  editing?: boolean
  /** Para a prévia "Assim aparece no app". */
  barName?: string
  houseOffer?: string | null
  /** O bar emite código para quem marca "Vou assistir aqui" (Elite). */
  showsGoing?: boolean
  error?: string
}

/** Contador sob o campo e o aviso de quanto passou do limite do servidor. */
function limitError(subject: string, length: number, max: number) {
  const over = length - max
  return over > 0
    ? `${subject} aceita até ${max} caracteres. Tire ${over}.`
    : null
}

/**
 * Formulário do jogo (telas 1p/1q): esporte, campeonato, times, horário, o que
 * o jogo tem e a prévia do app. Rascunho, lista de quem vai e oferta por jogo
 * ainda não existem no servidor: aparecem com "em breve".
 */
export function EventFormComponent({
  initial,
  sports,
  onSave,
  isSaving,
  loadingSports,
  initialParticipants = [],
  editing = false,
  barName,
  houseOffer = null,
  showsGoing = false,
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

  // WEB-381: o catálogo inteiro só vem pela busca; o nome de quem foi
  // marcado fica guardado para o confronto e para o chip continuar na tela.
  const search = useTeamSearch(form.sportId ? [form.sportId] : [])
  const [picked, setPicked] = useState(
    () => new Map(initialParticipants.map((team) => [team.id, team.name]))
  )
  const known = new Map([
    ...[...teams, ...(search.results.data ?? [])].map(
      (team) => [team.id, team.name] as const
    ),
    ...picked
  ])

  const toggleTeam = (team: { id: string; name: string }) => {
    setPicked((prev) => new Map(prev).set(team.id, team.name))
    setForm((prev) => ({
      ...prev,
      participantIds: prev.participantIds.includes(team.id)
        ? prev.participantIds.filter((t) => t !== team.id)
        : [...prev.participantIds, team.id]
    }))
  }

  // A ordem em que os chips foram marcados é a do confronto: o primeiro é o
  // mandante. Vazio enquanto os times carregam.
  const matchup = form.participantIds.flatMap((id) => known.get(id) ?? [])
  const featuredIds = new Set(teams.map((t) => t.id))
  const pickedOutside = form.participantIds.flatMap((id) => {
    const name = known.get(id)
    return name && !featuredIds.has(id) ? [{ id, name }] : []
  })

  const confrontoFechado = hasLimit && form.participantIds.length >= 2

  const renderChip = (t: { id: string; name: string }) => {
    const selected = form.participantIds.includes(t.id)
    const maxReached = hasLimit && form.participantIds.length >= 2 && !selected
    return (
      <Chip
        key={t.id}
        ativo={selected}
        onClick={() => toggleTeam(t)}
        disabled={maxReached || hasFreeText}
      >
        {t.name}
      </Chip>
    )
  }

  const handleSportChange = (sportId: string) => {
    search.setText('')
    setForm((prev) => ({
      ...prev,
      sportId,
      participantIds: [],
      participantFreeText: ''
    }))
  }

  // Data que existe mas não serve para jogo (passado, ano errado). Na edição
  // só conta se o início mudou, como no servidor.
  const startProblem =
    starts.value && startsText !== formatDateTime(initial.startsAt)
      ? getEventStartProblem(new Date(starts.value))
      : null

  const endsBeforeStart =
    !!ends.value && !!starts.value && ends.value <= starts.value
  const endsAtValid =
    ends.value === '' || (!!ends.value && !!starts.value && !endsBeforeStart)
  // Os mesmos números do servidor (`pub.createEvent`), contados igual.
  const championshipError = limitError(
    'O campeonato',
    form.championship.length,
    EVENT_CHAMPIONSHIP_MAX_LENGTH
  )
  const freeTextError = limitError(
    'O texto livre',
    form.participantFreeText.length,
    EVENT_PARTICIPANT_FREE_TEXT_MAX_LENGTH
  )
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
    !startProblem &&
    endsAtValid &&
    !championshipError &&
    !freeTextError

  const previewTitle =
    matchup.length === 2
      ? matchup.join(' × ')
      : form.participantFreeText.trim() ||
        form.championship.trim() ||
        'Seu jogo'

  return (
    <>
      <div className="jogos-folha-corpo jogos-form">
        <fieldset
          className="jogos-form-grupo"
          aria-busy={loadingSports || undefined}
        >
          <legend>Esporte</legend>
          {loadingSports ? (
            <p className="painel-muted" role="status">
              Carregando esportes…
            </p>
          ) : (
            <div className="jogos-chips">
              {[...sports].sort(bySportOrder).map((s) => (
                <Chip
                  key={s.id}
                  ativo={s.id === form.sportId}
                  onClick={() => handleSportChange(s.id)}
                >
                  {s.name}
                </Chip>
              ))}
            </div>
          )}
        </fieldset>

        <div>
          <Campo
            rotulo="Campeonato"
            aside={
              <span
                aria-hidden="true"
                data-erro={!!championshipError || undefined}
              >
                {form.championship.length}/{EVENT_CHAMPIONSHIP_MAX_LENGTH}
              </span>
            }
            value={form.championship}
            onChange={(e) => setForm({ ...form, championship: e.target.value })}
            placeholder="Ex: Brasileirão Série A, Copa do Mundo..."
            required
            aria-invalid={!!championshipError || undefined}
            aria-describedby={
              championshipError ? championshipErrorId : undefined
            }
          />
          {championshipError ? (
            <p id={championshipErrorId} className="jogos-erro" role="alert">
              {championshipError}
            </p>
          ) : null}
        </div>

        {form.sportId ? (
          <div className="jogos-form-grupo">
            <span className="jogos-form-rotulo">Times</span>
            {loadingTeams ? (
              <div className="jogos-chips" role="status" aria-busy="true">
                <span className="sr-only">Carregando times…</span>
                <Skeleton className="h-[34px] w-24 bg-[var(--painel-sub)]" />
                <Skeleton className="h-[34px] w-28 bg-[var(--painel-sub)]" />
                <Skeleton className="h-[34px] w-20 bg-[var(--painel-sub)]" />
              </div>
            ) : teams.length > 0 || pickedOutside.length > 0 ? (
              <>
                <Campo
                  aria-label="Buscar time ou atleta"
                  placeholder="Buscar time"
                  type="text"
                  inputMode="search"
                  enterKeyHint="search"
                  autoComplete="off"
                  maxLength={60}
                  value={search.text}
                  onChange={(e) => search.setText(e.target.value)}
                  inicio={
                    <Icone
                      nome="search"
                      tamanho={18}
                      acento="var(--painel-muted)"
                      className="painel-muted"
                    />
                  }
                />
                <div className="jogos-form-times" aria-live="polite">
                  {search.active ? (
                    search.results.isError ? (
                      <p role="alert">Não foi possível buscar.</p>
                    ) : !search.results.data ? (
                      <p className="painel-muted" role="status">
                        Buscando…
                      </p>
                    ) : search.results.data.length === 0 ? (
                      <p className="painel-muted">
                        Nada com “{search.query}”. Use o texto livre abaixo.
                      </p>
                    ) : (
                      <div className="jogos-chips">
                        {search.results.data.map(renderChip)}
                      </div>
                    )
                  ) : (
                    <>
                      {pickedOutside.length > 0 ? (
                        <div className="jogos-chips">
                          {pickedOutside.map(renderChip)}
                        </div>
                      ) : null}
                      {/* Confronto fechado: só os dois marcados, para a folha
                          não virar um mural; desmarcar um traz a lista de volta. */}
                      {confrontoFechado ? (
                        <div className="jogos-chips">
                          {teams
                            .filter((t) => form.participantIds.includes(t.id))
                            .map(renderChip)}
                        </div>
                      ) : (
                        groupTeamsByKind(teams).map((group) => (
                          <TeamGroup key={group.label} label={group.label}>
                            {group.teams.map(renderChip)}
                          </TeamGroup>
                        ))
                      )}
                    </>
                  )}
                </div>
                {matchup.length >= 2 ? (
                  <div className="jogos-confronto">
                    <b aria-live="polite">
                      <span className="sr-only">Confronto: </span>
                      {matchup.join(' × ')}
                    </b>
                    <span className="painel-muted">
                      o primeiro é o mandante
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setForm((prev) => ({
                          ...prev,
                          participantIds: [...prev.participantIds].reverse()
                        }))
                      }
                    >
                      Inverter
                    </button>
                  </div>
                ) : !hasFreeText ? (
                  <p className="jogos-dica">
                    {form.participantIds.length}
                    {hasLimit ? '/2' : ''} selecionado
                    {form.participantIds.length !== 1 ? 's' : ''}
                    {hasLimit ? ' — máximo 2' : ''}
                  </p>
                ) : null}
              </>
            ) : null}

            <Campo
              aria-label="Times ou participantes em texto livre"
              value={form.participantFreeText}
              onChange={(e) => {
                const participantFreeText = e.target.value
                setForm((prev) => ({
                  ...prev,
                  participantFreeText,
                  participantIds: participantFreeText ? [] : prev.participantIds
                }))
              }}
              placeholder={
                teams.length > 0
                  ? 'Ou digite algo diferente... (ex: outros, classificatória)'
                  : 'Ex: Max Verstappen, Flamengo × Palmeiras...'
              }
              aria-invalid={!!freeTextError || undefined}
              aria-describedby={freeTextError ? freeTextErrorId : undefined}
              dica={
                <>
                  {teams.length > 0
                    ? hasFreeText
                      ? 'Escreveu texto livre — chips de times desabilitados. Limpe o campo para voltar a selecioná-los.'
                      : 'Use os chips acima para times cadastrados, ou escreva livremente.'
                    : 'Texto livre — use para esportes sem times fixos como F1 ou UFC.'}{' '}
                  <span
                    aria-hidden="true"
                    className="jogos-contador"
                    data-erro={!!freeTextError || undefined}
                  >
                    {form.participantFreeText.length}/
                    {EVENT_PARTICIPANT_FREE_TEXT_MAX_LENGTH}
                  </span>
                </>
              }
            />
            {freeTextError ? (
              <p id={freeTextErrorId} className="jogos-erro" role="alert">
                {freeTextError}
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="jogos-form-horario">
          <DateTimeInput
            label="Começa"
            icone
            value={startsText}
            onChange={setStartsText}
            required
            error={
              startProblem
                ? EVENT_START_PROBLEM_MESSAGE[startProblem]
                : undefined
            }
          />
          <DateTimeInput
            label="Termina"
            hint="Opcional"
            value={endsText}
            onChange={setEndsText}
            error={
              endsBeforeStart
                ? 'Término deve ser posterior ao início.'
                : undefined
            }
          />
        </div>

        <fieldset className="jogos-form-grupo">
          <legend>Neste jogo</legend>
          <div className="jogos-chips">
            {(
              [
                ['onBigScreen', 'Telão'],
                ['withSound', 'Som do jogo ligado']
              ] as const
            ).map(([key, label]) => (
              <Chip
                key={key}
                ativo={form[key]}
                onClick={() =>
                  setForm((prev) => ({ ...prev, [key]: !prev[key] }))
                }
              >
                {label}
              </Chip>
            ))}
          </div>
          <p className="jogos-dica">
            Vem das características do bar. Desmarque o que este jogo não tem.
          </p>
        </fieldset>

        <div className="jogos-sub jogos-sub-lista">
          <div className="jogos-sub-linha">
            <div>
              <b>
                Lista de quem vai <EmBreve />
              </b>
              <span>
                Torcedores marcam “Vou assistir aqui” e recebem um código.
              </span>
            </div>
            <Toggle
              ligado={showsGoing}
              onChange={() => {}}
              disabled
              rotulo="Lista de quem vai neste jogo"
            />
          </div>
          <div className="jogos-sub-linha">
            <div>
              <b>
                Oferta da casa neste jogo <EmBreve />
              </b>
              <span>{houseOffer ?? 'Sem oferta da casa no seu espaço.'}</span>
            </div>
            <Toggle
              ligado={!!houseOffer}
              onChange={() => {}}
              disabled
              rotulo="Oferta da casa neste jogo"
            />
          </div>
        </div>

        <div className="jogos-form-grupo">
          <span className="jogos-form-rotulo">Assim aparece no app</span>
          <div className="jogos-previa">
            <span className="painel-disp jogos-previa-hora">
              {timeOf(starts.value) ?? '--:--'}
            </span>
            <div>
              <b>{previewTitle}</b>
              <span>
                {[form.championship.trim(), barName]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </div>
            {houseOffer ? <Badge tipo="acid">Oferta</Badge> : null}
          </div>
        </div>

        {error ? (
          <p className="jogos-erro" role="alert">
            {error}
          </p>
        ) : null}
        {missing.length > 0 ? (
          <p id={missingId} className="jogos-dica">
            Para salvar, falta preencher: {missing.join(', ')}.
          </p>
        ) : null}
      </div>

      <div className="jogos-folha-pe">
        {/* Rascunho não existe no modelo do jogo: em breve. */}
        <Botao disabled title="Em breve">
          Salvar rascunho
        </Botao>
        <Botao
          variante="acid"
          onClick={() =>
            onSave({
              ...form,
              startsAt: starts.value ?? '',
              endsAt: ends.value ?? ''
            })
          }
          disabled={!canSave || isSaving}
          aria-describedby={missing.length > 0 ? missingId : undefined}
        >
          {isSaving ? 'Salvando…' : editing ? 'Salvar' : 'Publicar jogo'}
        </Botao>
      </div>
    </>
  )
}

export type { EventForm }
