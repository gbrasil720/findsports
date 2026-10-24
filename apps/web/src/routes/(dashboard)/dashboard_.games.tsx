import { gameTitle } from '@findsports_oficial/db/game-title'
import { Skeleton } from '@findsports_oficial/ui/components/skeleton'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useState } from 'react'
import { AppShell } from '@/components/app/app-shell'
import {
  formatCode,
  getOffAirNotice,
  type MyGame,
  pastLabel
} from '@/domain/my-games'
import { formatDayLabel, formatEventTime } from '@/domain/pub-profile'
import { PWA_LINKS, PWA_META } from '@/lib/pwa'
import { getUserFacingMessage } from '@/lib/user-facing-error'
import { useTRPC } from '@/utils/trpc'

export const Route = createFileRoute('/(dashboard)/dashboard_/games')({
  head: () => ({
    meta: [
      { title: 'Meus jogos — Onside' },
      { name: 'robots', content: 'noindex' },
      ...PWA_META
    ],
    links: [...PWA_LINKS]
  }),
  component: MyGamesPage
})

/**
 * "Meus jogos" (3e do design): onde o torcedor marcou "Vou assistir aqui".
 * Nos bares Elite, cada jogo traz o código que ele mostra no balcão para
 * ganhar a oferta da casa. Continua legível mesmo se o bar perder o plano ou
 * sair do ar: o código vale até a janela de validação fechar.
 */
function MyGamesPage() {
  const trpc = useTRPC()
  const query = useQuery({
    ...trpc.attendance.mine.queryOptions(),
    meta: { errorToast: false }
  })
  // Jogo que ainda tem "Você foi?" ou "Voltaria?" ganha o "Avaliar".
  const ratings = useQuery({
    ...trpc.ratings.getPending.queryOptions(),
    meta: { errorToast: false }
  })
  const reports = useQuery({
    ...trpc.attendance.pendingReports.queryOptions(),
    meta: { errorToast: false }
  })
  const toRate = new Set(
    [...(ratings.data ?? []), ...(reports.data ?? [])].map(
      (item) => item.eventId
    )
  )
  const [announcement, setAnnouncement] = useState('')
  const games = query.data ?? []
  // O servidor manda do mais recente para o mais antigo; as próximas vão do
  // mais perto ao mais longe.
  const upcoming = games.filter((game) => !game.ended).reverse()
  const past = games.filter((game) => game.ended)

  return (
    <AppShell variant="fan">
      <div className="mx-auto w-full max-w-2xl space-y-4">
        <h1 className="onside-display text-3xl">Meus jogos</h1>
        <p className="sr-only" role="status" aria-live="polite">
          {announcement}
        </p>

        {query.isLoading ? (
          <div role="status" aria-busy="true" className="space-y-3">
            <span className="sr-only">Carregando seus jogos…</span>
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : query.isError ? (
          <div className="onside-panel p-5" role="alert">
            <p className="text-sm">
              {getUserFacingMessage(
                query.error,
                'Não foi possível carregar seus jogos. Tente novamente.'
              )}
            </p>
            <button
              type="button"
              onClick={() => void query.refetch()}
              className="onside-btn onside-btn-outline mt-3"
            >
              Tentar novamente
            </button>
          </div>
        ) : games.length ? (
          <>
            <section aria-labelledby="games-upcoming" className="space-y-3">
              <h2 id="games-upcoming" className="onside-kicker">
                Próximos · {upcoming.length}
              </h2>
              {upcoming.length ? (
                <ul className="space-y-3">
                  {upcoming.map((game) => (
                    <li key={game.eventId}>
                      <UpcomingCard game={game} onAnnounce={setAnnouncement} />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[var(--onside-muted)] text-sm">
                  Nenhum jogo marcado daqui para a frente.
                </p>
              )}
              {upcoming.some((game) => game.code) ? (
                <p className="text-[var(--onside-muted)] text-xs">
                  O código vale só no dia do jogo, no bar que você marcou.
                </p>
              ) : null}
            </section>
            {past.length ? (
              <section aria-labelledby="games-past" className="space-y-3">
                <h2 id="games-past" className="onside-kicker">
                  Anteriores
                </h2>
                <ul className="onside-panel divide-y divide-[var(--onside-line)]">
                  {past.map((game) => (
                    <li
                      key={game.eventId}
                      className="flex items-center justify-between gap-3 p-4"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{game.barName}</p>
                        <p className="truncate text-[var(--onside-muted)] text-sm">
                          {gameTitle(game)} ·{' '}
                          {new Date(game.startsAt).toLocaleDateString('pt-BR', {
                            day: 'numeric',
                            month: 'short',
                            timeZone: 'America/Sao_Paulo'
                          })}
                        </p>
                      </div>
                      {toRate.has(game.eventId) ? (
                        <Link
                          to="/dashboard"
                          search={{ avaliar: game.eventId }}
                          className="onside-btn onside-btn-ink"
                          aria-label={`Avaliar o ${game.barName}`}
                        >
                          Avaliar
                        </Link>
                      ) : (
                        <span
                          className={`onside-badge ${game.validated ? 'onside-badge-acid' : 'onside-badge-stone'}`}
                        >
                          {pastLabel(game)}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </>
        ) : (
          <div className="onside-panel p-6 text-center">
            <p className="font-semibold text-sm">
              Você ainda não marcou nenhum jogo.
            </p>
            <p className="mt-1 text-[var(--onside-muted)] text-sm">
              Na página de um bar, toque em “Vou assistir aqui”. Nos bares Elite
              você recebe um código na hora e ganha a oferta da casa no balcão.
            </p>
            <Link to="/dashboard" className="onside-btn onside-btn-acid mt-4">
              Procurar bares
            </Link>
          </div>
        )}
      </div>
    </AppShell>
  )
}

function UpcomingCard({
  game,
  onAnnounce
}: {
  game: MyGame
  onAnnounce: (message: string) => void
}) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const startsAt = new Date(game.startsAt)
  const titleId = `game-${game.eventId}`
  const offAirNotice = getOffAirNotice(game)
  const live = startsAt.getTime() <= Date.now()

  const unmark = useMutation(
    trpc.attendance.set.mutationOptions({
      onSuccess: () => {
        onAnnounce('Marcação desfeita.')
        void queryClient.invalidateQueries({
          queryKey: trpc.pubs.getById.queryKey()
        })
        return queryClient.invalidateQueries({
          queryKey: trpc.attendance.mine.queryKey()
        })
      },
      onError: (err) =>
        setError(
          getUserFacingMessage(
            err,
            'Não foi possível desmarcar. Tente novamente.'
          )
        )
    })
  )

  return (
    <article className="onside-panel p-5" aria-labelledby={titleId}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="onside-kicker">
            {formatDayLabel(startsAt)} · {formatEventTime(startsAt)}
          </p>
          <h3 id={titleId} className="font-bold text-lg">
            {/* Bar fora do ar não tem perfil para abrir (WEB-360). */}
            {offAirNotice ? (
              game.barName
            ) : (
              <Link
                to="/pub/$pubId"
                params={{ pubId: game.barId }}
                className="underline"
              >
                {game.barName}
              </Link>
            )}
          </h3>
          <p className="text-[var(--onside-muted)] text-sm">
            {gameTitle(game)} · {game.championship}
          </p>
        </div>
        <span
          className={`onside-badge ${game.validated ? 'onside-badge-ink' : 'onside-badge-acid'}`}
        >
          {game.validated ? 'Validado' : 'Você vai'}
        </span>
      </div>

      {offAirNotice ? (
        <p className="onside-callout onside-callout-warn mt-3 text-sm">
          {offAirNotice}
        </p>
      ) : null}

      {game.code ? (
        <div className="mt-3 border-[1.5px] border-[var(--onside-line)] p-3">
          <p className="onside-kicker">
            {/* Bar que confirma pela comanda (WEB-412). */}
            {game.confirmsCodesLater
              ? 'Para o garçom: anote na comanda'
              : 'Código'}
          </p>
          <p className="font-[family-name:var(--onside-mono)] font-bold text-2xl tracking-[0.2em]">
            {formatCode(game.code)}
          </p>
          {game.window ? (
            <p className="text-[var(--onside-muted)] text-xs">
              Vale das {formatEventTime(new Date(game.window.opensAt))} às{' '}
              {formatEventTime(new Date(game.window.closesAt))}, uma vez só.
            </p>
          ) : null}
        </div>
      ) : null}

      {game.offer ? (
        <p className="mt-3 text-sm [overflow-wrap:anywhere]">
          <span className="font-semibold">Oferta da casa:</span> {game.offer}
        </p>
      ) : null}

      {error ? (
        <p className="onside-field-error" role="alert">
          {error}
        </p>
      ) : null}

      {/* O servidor recusa desmarcar jogo começado ou código validado. */}
      {!live && !game.validated ? (
        <button
          type="button"
          onClick={() => {
            setError(null)
            unmark.mutate({ eventId: game.eventId, attending: false })
          }}
          disabled={unmark.isPending}
          className="onside-btn onside-btn-ghost mt-3"
        >
          {unmark.isPending ? 'Desmarcando…' : 'Desmarcar'}
        </button>
      ) : null}
    </article>
  )
}
