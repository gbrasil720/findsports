import { useQuery } from '@tanstack/react-query'

import { useTRPC } from '@/utils/trpc'
import { Footer, TopBar } from './bar-page'
import { clock, gameState } from './bar-page-model'

/**
 * Estado 4: bar fora do ar (200, `noindex`) e link que não leva a bar
 * nenhum (404). Os jogos de hoje vêm de `pubs.todayGames`, a agenda pública
 * da splash do app; jogo não tem página própria, então a lista não é link.
 */
export function BarGone({ invalid }: { invalid: boolean }) {
  const trpc = useTRPC()
  const today = useQuery({
    ...trpc.pubs.todayGames.queryOptions(),
    meta: { errorToast: false }
  })
  const now = new Date()
  const games = (today.data ?? []).filter(
    (game) =>
      gameState({ startsAt: new Date(game.startsAt), endsAt: null }, now) !==
      'ended'
  )
  return (
    <div className="bp">
      <TopBar />
      <main className="wrap gone">
        <span className="code">
          {invalid ? '404 · LINK SEM BAR' : 'BAR FORA DO AR'}
        </span>
        <h1>
          {invalid ? (
            <>
              Esse link não leva
              <br />a <span className="hl">nenhum bar</span>
            </>
          ) : (
            <>
              Este bar saiu
              <br />
              <span className="hl">do ar</span>
            </>
          )}
        </h1>
        <p>
          {invalid
            ? 'Pode ter vindo cortado no WhatsApp. Veja onde tem jogo hoje.'
            : 'Ele não está mostrando jogos na Onside agora. Se voltar, este mesmo link volta a funcionar. Enquanto isso, veja onde tem jogo hoje.'}
        </p>
        {games.length ? (
          <ul className="tl" aria-label="Jogos de hoje">
            {games.slice(0, 6).map((game) => (
              <li key={`${game.title}-${game.startsAt}`}>
                <span className="h">{clock(new Date(game.startsAt))}</span>
                <b>{game.title}</b>
              </li>
            ))}
          </ul>
        ) : null}
        <div style={{ marginTop: 22 }}>
          <a className="btn b-acid" href="/dashboard">
            Ver bares com jogo hoje
          </a>
        </div>
      </main>
      <Footer />
    </div>
  )
}
