import { Skeleton } from '@findsports_oficial/ui/components/skeleton'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { formatDayLabel, formatEventTime } from '@/domain/pub-profile'
import { getGameTitle } from '@/domain/reservation-validation'
import { countLabel } from '@/lib/plural'
import { BAR_RESERVATIONS_QUERY } from '@/lib/query-cache'
import { isRetryableError } from '@/lib/user-facing-error'
import { useTRPC } from '@/utils/trpc'
import { AdminTabPanel } from './admin-tabs'
import { QueryError } from './query-error'

/** "Marcou há 2 h", "Marcou há 40 min". */
function markedAgo(at: Date, now = Date.now()) {
  const minutes = Math.max(1, Math.round((now - at.getTime()) / 60_000))
  if (minutes < 60) return `Marcou há ${minutes} min`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `Marcou há ${hours} h`
  return `Marcou há ${countLabel(Math.round(hours / 24), 'dia', 'dias')}`
}

/**
 * "Quem vai" (2s do design): por jogo, quem marcou "Vou assistir aqui" e quem
 * já validou o código no balcão. Ninguém precisa de aprovação: quem marca já
 * recebe o código, e a oferta só sai quando o código é validado.
 *
 * Sem `elite`, a aba só existe porque há código em aberto (WEB-341): o bar
 * honra quem já marcou, avisado de que não chega gente nova pela lista.
 */
export function GoingTab({
  active,
  elite
}: {
  active: boolean
  elite: boolean
}) {
  const trpc = useTRPC()
  const query = useQuery({
    ...trpc.barReservations.going.queryOptions(),
    ...BAR_RESERVATIONS_QUERY,
    meta: { errorToast: false }
  })

  return (
    <AdminTabPanel id="admin-quem-vai" active={active}>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="onside-display text-2xl">Quem vai</h2>
          <p className="mt-1 text-sm text-[var(--onside-muted)]">
            Quem marcou “Vou assistir aqui” recebe um código na hora. A oferta
            da casa só sai quando você valida o código.
          </p>
        </div>
        <Link to="/admin/validate" className="onside-btn onside-btn-acid">
          Validar código
        </Link>
      </div>
      {elite ? null : (
        <div className="onside-callout onside-callout-stone mb-6" role="note">
          <p className="text-sm">
            A lista de quem vai é um recurso do plano Elite. Os códigos abaixo
            continuam valendo: valide o de quem chegar.
          </p>
        </div>
      )}

      {query.isLoading ? (
        <div role="status" aria-busy="true" className="space-y-3">
          <span className="sr-only">Carregando quem vai…</span>
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : query.isError || !query.data ? (
        <QueryError
          message="Não foi possível carregar quem vai."
          retryable={isRetryableError(query.error)}
          onRetry={() => void query.refetch()}
        />
      ) : query.data.length ? (
        <ul className="space-y-3">
          {query.data.map((game) => {
            const startsAt = new Date(game.startsAt)
            return (
              <li key={game.id}>
                <article
                  className="onside-panel p-5"
                  aria-labelledby={`going-${game.id}`}
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 id={`going-${game.id}`} className="font-bold text-lg">
                      {getGameTitle(game)}
                    </h3>
                    <p className="font-[family-name:var(--onside-mono)] text-sm">
                      {formatDayLabel(startsAt)} · {formatEventTime(startsAt)}
                    </p>
                  </div>
                  <p className="text-[var(--onside-muted)] text-sm">
                    {countLabel(game.people.length, 'vai', 'vão')} assistir ·{' '}
                    {game.validated}{' '}
                    {game.validated === 1 ? 'validou' : 'validaram'}
                  </p>
                  <ul className="mt-3 divide-y divide-[var(--onside-line)] border-[var(--onside-line)] border-t">
                    {game.people.map((person) => (
                      <li
                        key={`${person.name}-${person.markedAt}`}
                        className="flex items-center justify-between gap-3 py-2.5"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-sm">
                            {person.name}
                          </p>
                          <p className="text-[var(--onside-muted)] text-xs">
                            {markedAgo(new Date(person.markedAt))}
                          </p>
                        </div>
                        {person.validatedAt ? (
                          <span className="onside-badge onside-badge-acid">
                            Validou{' '}
                            {formatEventTime(new Date(person.validatedAt))}
                          </span>
                        ) : (
                          <span className="text-[var(--onside-muted)] text-xs">
                            {startsAt.getTime() > Date.now()
                              ? formatDayLabel(startsAt)
                              : 'Ainda não chegou'}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </article>
              </li>
            )
          })}
        </ul>
      ) : (
        <div className="onside-panel p-6 text-center">
          <p className="font-semibold text-sm">Ninguém marcou ainda.</p>
          <p className="mt-1 text-[var(--onside-muted)] text-sm">
            Quem tocar em “Vou assistir aqui” no seu perfil aparece aqui, jogo a
            jogo.
          </p>
        </div>
      )}
    </AdminTabPanel>
  )
}
