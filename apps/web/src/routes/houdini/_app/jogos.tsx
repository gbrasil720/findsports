import type { AppRouter } from '@findsports_oficial/api/routers/index'
import {
  EVENT_CHAMPIONSHIP_MAX_LENGTH,
  EVENT_CHAMPIONSHIP_MIN_LENGTH
} from '@findsports_oficial/db/event-limits'
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient
} from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import type { inferRouterOutputs } from '@trpc/server'
import { useState } from 'react'
import { toast } from 'sonner'
import { refusalMessage } from '@/components/houdini/errors'
import { HoldButton } from '@/components/houdini/hold-button'
import { Icon } from '@/components/houdini/icons'
import { HoudiniShell, PageHead } from '@/components/houdini/shell'
import { countLabel } from '@/lib/plural'
import { getUserFacingMessage } from '@/lib/user-facing-error'
import { useTRPC } from '@/utils/trpc'

export const Route = createFileRoute('/houdini/_app/jogos')({
  head: () => ({ meta: [{ title: 'Jogos — Houdini' }] }),
  component: JogosPage
})

type Game =
  inferRouterOutputs<AppRouter>['adminEvents']['list']['games'][number]
type Warning = Game['warnings'][number]

const FILTERS = [
  { label: 'Hoje', period: 'today', onlyWarnings: false },
  { label: 'Esta semana', period: 'week', onlyWarnings: false },
  { label: 'Todos', period: 'all', onlyWarnings: false },
  { label: 'Com aviso', period: 'all', onlyWarnings: true }
] as const

const WARN_SHORT: Record<Warning['kind'], string> = {
  duplicate: 'duplicado',
  free_text: 'time fora do catálogo'
}

const TZ = 'America/Sao_Paulo'

/** Dia e hora em Brasília, no formato dos campos `date` e `time`. */
function brt(date: Date | string) {
  const [day = '', time = ''] = new Date(date)
    .toLocaleString('sv-SE', { timeZone: TZ })
    .split(' ')
  return { day, time: time.slice(0, 5) }
}

// ponytail: Brasília em -03:00 fixo; o Brasil não tem horário de verão desde 2019.
function fromBrt(day: string, time: string) {
  return new Date(`${day}T${time}:00-03:00`)
}

function whenLabel(startsAt: Date | string) {
  const { day, time } = brt(startsAt)
  const today = brt(new Date()).day
  const tomorrow = brt(new Date(Date.now() + 86_400_000)).day
  if (day === today) return `hoje ${time}`
  if (day === tomorrow) return `amanhã ${time}`
  return `${day.slice(8, 10)}/${day.slice(5, 7)} ${time}`
}

function matchTitle(game: Game) {
  return (
    game.participants.join(' × ') ||
    game.participantFreeText ||
    game.championship
  )
}

/** Códigos do balcão em vigor: quem marcou "Vou assistir aqui" no Elite. */
function codesLabel(game: Game) {
  return game.codes ? countLabel(game.codes, 'código', 'códigos') : '—'
}

function JogosPage() {
  const { env, admin } = Route.useRouteContext()
  const trpc = useTRPC()
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState(1)
  const [page, setPage] = useState(1)
  const [pickedId, setPickedId] = useState<string | null>(null)
  const { period, onlyWarnings } = FILTERS[filter] ?? FILTERS[1]

  const query = useQuery({
    ...trpc.adminEvents.list.queryOptions({
      period,
      onlyWarnings,
      search: search.trim() || undefined,
      page
    }),
    placeholderData: keepPreviousData,
    meta: { errorToast: false }
  })
  const games = query.data?.games ?? []
  const picked = games.find((g) => g.id === pickedId) ?? games[0] ?? null
  const lastPage = Math.max(
    1,
    Math.ceil((query.data?.matched ?? 0) / (query.data?.pageSize ?? 1))
  )

  return (
    <HoudiniShell env={env} user={admin}>
      <div className="hd-page">
        <PageHead
          overline="Gente e bares"
          title="Jogos"
          titleId="jogos-h"
          summary={
            query.data ? (
              <>
                <b>{query.data.total}</b> futuros · <b>{query.data.warned}</b>{' '}
                com aviso
              </>
            ) : null
          }
        />
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 12,
            alignItems: 'center'
          }}
        >
          <label className="hd-search">
            <Icon name="search" size={18} />
            <span className="hd-sr">Buscar jogo</span>
            <input
              type="search"
              className="hd-input"
              placeholder="Buscar por time, campeonato ou bar..."
              value={search}
              onChange={(event) => {
                setSearch(event.target.value)
                setPage(1)
              }}
            />
          </label>
          <fieldset className="hd-seg" aria-label="Período">
            {FILTERS.map((f, index) => (
              <button
                key={f.label}
                type="button"
                aria-pressed={index === filter}
                onClick={() => {
                  setFilter(index)
                  setPage(1)
                }}
              >
                {f.label}
              </button>
            ))}
          </fieldset>
        </div>
        <div className="hd-cols">
          <section className="grow" aria-labelledby="jogos-h">
            {query.isError ? (
              <div className="hd-card" role="alert">
                <p style={{ margin: 0 }}>
                  {getUserFacingMessage(
                    query.error,
                    'Não foi possível carregar os jogos.'
                  )}
                </p>
              </div>
            ) : (
              <div className="hd-table-wrap" aria-busy={query.isFetching}>
                <table className="hd-table" style={{ minWidth: 680 }}>
                  <thead>
                    <tr>
                      <th scope="col">Quando</th>
                      <th scope="col">Jogo</th>
                      <th scope="col">Bar</th>
                      <th scope="col">Códigos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {query.isLoading ? (
                      <tr>
                        <td colSpan={4}>
                          <div
                            className="hd-skeleton"
                            style={{ height: 160 }}
                          />
                        </td>
                      </tr>
                    ) : games.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="hd-empty">
                          {onlyWarnings
                            ? 'Nenhum jogo com aviso. Tudo em ordem.'
                            : 'Nenhum jogo neste período.'}
                        </td>
                      </tr>
                    ) : (
                      games.map((game) => (
                        <tr
                          key={game.id}
                          aria-selected={game.id === picked?.id}
                        >
                          <td
                            className="hd-mono"
                            style={{ fontSize: 12, whiteSpace: 'nowrap' }}
                          >
                            {whenLabel(game.startsAt)}
                          </td>
                          <td>
                            <button
                              type="button"
                              className="hd-cell-btn"
                              onClick={() => setPickedId(game.id)}
                            >
                              {matchTitle(game)}
                              <span className="hd-sub">
                                {game.championship}
                              </span>
                              {game.warnings.length > 0 ? (
                                <span
                                  style={{
                                    fontWeight: 600,
                                    fontSize: 11,
                                    color: 'var(--hd-sand-text)'
                                  }}
                                >
                                  {game.warnings
                                    .map((w) => WARN_SHORT[w.kind])
                                    .join(' · ')}
                                </span>
                              ) : null}
                            </button>
                          </td>
                          <td style={{ color: 'var(--hd-body)' }}>
                            {game.barName}
                          </td>
                          <td className="hd-mono" style={{ fontSize: 12 }}>
                            {codesLabel(game)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
            {lastPage > 1 ? (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button
                  type="button"
                  className="hd-btn"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Anterior
                </button>
                <span className="hd-mono hd-small">
                  {page} / {lastPage}
                </span>
                <button
                  type="button"
                  className="hd-btn"
                  disabled={page >= lastPage}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Próxima
                </button>
              </div>
            ) : null}
          </section>

          <aside className="hd-card hd-aside side" aria-label="Jogo escolhido">
            {picked ? (
              <GamePanel key={picked.id} game={picked} />
            ) : (
              <p className="hd-empty">Escolha um jogo na lista.</p>
            )}
          </aside>
        </div>
      </div>
    </HoudiniShell>
  )
}

function warningCopy(warning: Warning): {
  title: string
  text: string
  fix: string | null
} {
  switch (warning.kind) {
    case 'duplicate':
      return {
        title: 'Jogo duplicado',
        text: warning.canDelete
          ? 'O mesmo bar tem outro jogo com os mesmos times no mesmo horário. Este não tem código de ninguém e pode sair sem levar nada junto.'
          : 'O mesmo bar tem outro jogo com os mesmos times no mesmo horário. Este tem código de quem vai, então fica: apague o outro, se ele estiver sem código.',
        fix: warning.canDelete ? 'Apagar este duplicado' : null
      }
    case 'free_text': {
      const names = warning.suggestion?.map((t) => t.name).join(' e ')
      return {
        title: 'Time fora do catálogo',
        text: names
          ? `“${warning.text}” foi digitado à mão e não está ligado a nenhum time. O jogo não aparece para quem segue o ${names}.`
          : `“${warning.text}” foi digitado à mão e não está ligado a nenhum time. Nenhum time do catálogo casa com esse nome sem dúvida, então não há conserto automático.`,
        fix: names ? `Ligar ao ${names}` : null
      }
    }
  }
}

function GamePanel({ game }: { game: Game }) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const start = brt(game.startsAt)
  const [day, setDay] = useState(start.day)
  const [startTime, setStartTime] = useState(start.time)
  const [endTime, setEndTime] = useState(
    game.endsAt ? brt(game.endsAt).time : ''
  )
  const [championship, setChampionship] = useState(game.championship)
  const [fixedText, setFixedText] = useState<string | null>(null)

  async function refresh() {
    await queryClient.invalidateQueries({
      queryKey: trpc.adminEvents.list.queryKey()
    })
  }

  const fix = useMutation(
    trpc.adminEvents.fix.mutationOptions({
      onSuccess: async (result) => {
        if (result.warning === 'duplicate') {
          toast.success('Duplicado apagado.')
        } else {
          setFixedText(
            `Ligado ao ${result.teams.join(' e ')}. Já aparece para quem segue o time.`
          )
        }
        await refresh()
      },
      onError: (error) =>
        toast.error(refusalMessage(error, 'Não foi possível consertar.'))
    })
  )
  const update = useMutation(
    trpc.adminEvents.update.mutationOptions({
      onSuccess: async (result) => {
        toast.success(
          result.changed.length ? 'Jogo salvo.' : 'Nada mudou no jogo.'
        )
        await refresh()
      },
      onError: (error) =>
        toast.error(refusalMessage(error, 'Não foi possível salvar.'))
    })
  )
  const remove = useMutation(
    trpc.adminEvents.delete.mutationOptions({
      onSuccess: async () => {
        toast.success('Jogo apagado.')
        await refresh()
      },
      onError: (error) =>
        toast.error(refusalMessage(error, 'Não foi possível apagar.'))
    })
  )
  const busy = fix.isPending || update.isPending || remove.isPending

  function save() {
    const startsAt = fromBrt(day, startTime)
    let endsAt: Date | null = null
    if (endTime) {
      endsAt = fromBrt(day, endTime)
      // Termina antes do começo no relógio: o jogo vira a meia-noite.
      if (endsAt <= startsAt) endsAt = new Date(endsAt.getTime() + 86_400_000)
    }
    if (Number.isNaN(startsAt.getTime())) {
      toast.error('Preencha o dia e a hora de início.')
      return
    }
    update.mutate({
      eventId: game.id,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt?.toISOString() ?? null,
      championship
    })
  }

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span className="hd-eyebrow">Jogo escolhido</span>
        <h2 className="hd-h1 is-sm">{matchTitle(game)}</h2>
        <span className="hd-small">
          {game.championship} · {game.barName}
        </span>
      </div>

      {game.warnings.map((warning) => {
        const copy = warningCopy(warning)
        return (
          <div key={warning.kind} className="hd-alert" role="alert">
            <span className="hd-alert-title">
              <Icon name="warn" size={16} strokeWidth={1.8} />
              {copy.title}
            </span>
            <p>{copy.text}</p>
            {copy.fix ? (
              <button
                type="button"
                className="hd-btn hd-btn-primary"
                disabled={busy}
                style={{ alignSelf: 'flex-start' }}
                onClick={() =>
                  fix.mutate({ eventId: game.id, warning: warning.kind })
                }
              >
                {fix.isPending ? 'Consertando…' : copy.fix}
              </button>
            ) : null}
          </div>
        )
      })}
      {fixedText ? (
        <div role="status" className="hd-done">
          <Icon name="check" size={16} />
          {fixedText}
        </div>
      ) : null}

      <form
        method="post"
        style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
        onSubmit={(event) => {
          event.preventDefault()
          save()
        }}
      >
        <label className="hd-label">
          Dia
          <input
            type="date"
            className="hd-input"
            required
            value={day}
            onChange={(event) => setDay(event.target.value)}
          />
        </label>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
            gap: 8
          }}
        >
          <label className="hd-label">
            Começa
            <input
              type="time"
              className="hd-input"
              required
              value={startTime}
              onChange={(event) => setStartTime(event.target.value)}
            />
          </label>
          <label className="hd-label">
            Termina
            <input
              type="time"
              className="hd-input"
              value={endTime}
              onChange={(event) => setEndTime(event.target.value)}
            />
          </label>
        </div>
        <label className="hd-label">
          Campeonato
          <input
            className="hd-input"
            required
            minLength={EVENT_CHAMPIONSHIP_MIN_LENGTH}
            maxLength={EVENT_CHAMPIONSHIP_MAX_LENGTH}
            value={championship}
            onChange={(event) => setChampionship(event.target.value)}
          />
        </label>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            paddingTop: 14,
            borderTop: '1px solid var(--hd-line)'
          }}
        >
          <button
            type="submit"
            className="hd-btn hd-btn-primary"
            disabled={busy}
          >
            {update.isPending ? 'Salvando…' : 'Salvar no lugar do bar'}
          </button>
          <HoldButton
            label="Segure para apagar"
            busyLabel="Apagando…"
            busy={remove.isPending}
            disabled={busy}
            onConfirm={() => remove.mutate({ eventId: game.id })}
          />
          <p className="hd-small" style={{ margin: 0, lineHeight: 1.5 }}>
            O dono vê a mudança na hora. Quem reservou não é avisado. Tudo vai
            para o Grimório.
          </p>
        </div>
      </form>
    </>
  )
}
