import type { AppRouter } from '@findsports_oficial/api/routers/index'
import type { inferRouterOutputs } from '@trpc/server'
import Check from 'reicon-react/icons/Check'
import EyeSlash from 'reicon-react/icons/EyeSlash'
import Xmark from 'reicon-react/icons/Xmark'
import { formatDayLabel } from '@/domain/pub-profile'

type Ratings = inferRouterOutputs<AppRouter>['pub']['getMyRatings']

type Props = {
  state:
    | { status: 'loading' }
    | { status: 'error'; retry: () => void }
    | { status: 'ready'; ratings: Ratings }
}

/**
 * O que os torcedores responderam sobre ver jogo aqui.
 *
 * O dono vê tudo desde a primeira resposta, inclusive antes de a nota ficar
 * pública. Isso é deliberado: o piso existe para não expor amostra minúscula
 * ao torcedor, não para esconder do dono o que dizem do espaço dele — e
 * saber cedo é o que dá a ele chance de corrigir antes de a nota valer.
 *
 * Não mostra quem respondeu. A resposta é binária, a base é pequena e o dono
 * tem o telefone de quem abriu o WhatsApp: um nome ao lado de "não voltaria"
 * viraria conflito pessoal, não melhoria de serviço.
 */
export function RatingsPanel({ state }: Props) {
  if (state.status === 'loading') {
    return (
      <section className="onside-panel p-5 md:p-6">
        <p className="text-[var(--onside-muted)] text-sm">
          Carregando avaliações…
        </p>
      </section>
    )
  }

  if (state.status === 'error') {
    return (
      <section className="onside-panel p-5 md:p-6">
        <p className="text-[var(--onside-live-text)] text-sm">
          Não foi possível carregar as avaliações.
        </p>
        <button
          type="button"
          onClick={state.retry}
          className="mt-2 min-h-11 font-bold text-[var(--onside-ink)] text-sm underline underline-offset-2"
        >
          Tentar de novo
        </button>
      </section>
    )
  }

  const { ratings } = state
  const negative = ratings.total - ratings.positive
  const missing = Math.max(ratings.floor - ratings.total, 0)

  return (
    <section
      className="onside-panel p-5 md:p-6"
      aria-labelledby="admin-ratings-title"
    >
      <p className="onside-kicker mb-1">Avaliações</p>
      <h2 id="admin-ratings-title" className="onside-display text-2xl">
        Voltariam pra ver jogo aqui?
      </h2>

      {ratings.total === 0 ? (
        <p className="mt-3 max-w-2xl text-[var(--onside-muted)] text-sm leading-relaxed">
          Ninguém avaliou ainda. A pergunta aparece para quem abriu rota ou
          WhatsApp do seu bar, no dia seguinte ao jogo — quanto mais jogos na
          sua grade, mais gente é convidada a responder.
        </p>
      ) : (
        <>
          <div className="mt-4 flex flex-wrap items-end gap-6">
            <div>
              <div className="onside-display text-4xl tabular-nums">
                {ratings.percentage}%
              </div>
              <div className="mt-0.5 font-[family-name:var(--onside-mono)] text-[10px] text-[var(--onside-muted)] uppercase tracking-widest">
                Voltariam
              </div>
            </div>
            <div className="flex gap-5">
              <div>
                <div className="font-bold text-2xl tabular-nums">
                  {ratings.positive}
                </div>
                <div className="mt-0.5 font-[family-name:var(--onside-mono)] text-[10px] text-[var(--onside-muted)] uppercase tracking-widest">
                  Sim
                </div>
              </div>
              <div>
                <div className="font-bold text-2xl tabular-nums">
                  {negative}
                </div>
                <div className="mt-0.5 font-[family-name:var(--onside-mono)] text-[10px] text-[var(--onside-muted)] uppercase tracking-widest">
                  Não
                </div>
              </div>
            </div>
          </div>

          {ratings.isPublic ? null : (
            <div
              className="onside-callout onside-callout-stone mt-4"
              role="status"
            >
              <EyeSlash
                size={16}
                color="currentColor"
                className="mt-0.5 shrink-0"
                aria-hidden="true"
              />
              <p className="min-w-0 text-sm">
                Ainda não aparece para o torcedor. A nota fica pública a partir
                de {ratings.floor} avaliações —{' '}
                {missing === 1 ? 'falta 1' : `faltam ${missing}`}. Amostra
                pequena diria mais sobre o acaso do que sobre o seu bar.
              </p>
            </div>
          )}

          <ul className="mt-5 space-y-2">
            {ratings.recent.map((item) => (
              <li
                key={`${item.startsAt}-${item.createdAt}`}
                className="flex min-w-0 items-center gap-3 border border-[var(--onside-line)] bg-[var(--onside-stone)]/55 px-3 py-2"
              >
                <span
                  className={`grid size-6 shrink-0 place-items-center border border-[var(--onside-ink)] ${
                    item.wouldReturn
                      ? 'bg-[var(--onside-acid)]'
                      : 'bg-[var(--onside-paper)]'
                  }`}
                  aria-hidden="true"
                >
                  {item.wouldReturn ? (
                    <Check size={13} color="var(--onside-ink)" />
                  ) : (
                    <Xmark size={13} color="var(--onside-ink)" />
                  )}
                </span>
                <div className="min-w-0">
                  <p className="truncate font-semibold text-sm">
                    {item.championship}
                  </p>
                  <p className="text-[var(--onside-muted)] text-xs">
                    {formatDayLabel(new Date(item.startsAt))} ·{' '}
                    {item.wouldReturn ? 'Voltaria' : 'Não voltaria'}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}
