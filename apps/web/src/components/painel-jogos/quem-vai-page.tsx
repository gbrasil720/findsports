import { brasiliaDay } from '@findsports_oficial/db/event-window'
import { gameTitle } from '@findsports_oficial/db/game-title'
import { Skeleton } from '@findsports_oficial/ui/components/skeleton'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useEffect } from 'react'
import { useMyBar, useMySubscription } from '@/components/admin/admin-queries'
import { LateCodeEntry } from '@/components/admin/late-code-entry'
import { getEventTemporalState } from '@/domain/events'
import { rotuloDia } from '@/domain/painel-jogos'
import { formatEventTime } from '@/domain/pub-profile'
import { BAR_RESERVATIONS_QUERY } from '@/lib/query-cache'
import { useTRPC, useTRPCClient } from '@/utils/trpc'
import {
  CabecalhoPagina,
  Card,
  ErroBloco,
  IconeBotao,
  Progresso,
  propsBotao
} from '../painel'
import { PessoaQuemVai, resumoQuemVai, SeloJogo } from './jogo-aberto'

/**
 * Quem vai (o design não desenha a página): por jogo com a validação aberta,
 * quem marcou "Vou assistir aqui" e quem já validou o código, com as mesmas
 * peças do jogo aberto em Jogos. Ninguém aprova nada: quem marca já recebe o
 * código, e a oferta só sai quando o código é validado.
 *
 * Sem Elite a página só existe porque há código em aberto (WEB-341): o bar
 * honra quem já marcou. O bar Elite que confirma pela comanda lança aqui os
 * códigos anotados (WEB-412).
 */
export function QuemVaiPage() {
  const trpc = useTRPC()
  const { data: subscription } = useMySubscription()
  const { data: bar } = useMyBar()
  const elite = subscription?.currentPlan === 'elite'
  const confirmsLater = elite && bar?.confirmsCodesLater === true

  const query = useQuery({
    ...trpc.barReservations.going.queryOptions(),
    ...BAR_RESERVATIONS_QUERY,
    meta: { errorToast: false }
  })
  const notLogged = useQuery({
    ...trpc.reservationValidation.notLogged.queryOptions(),
    enabled: confirmsLater,
    meta: { errorToast: false }
  })
  // Cliente direto: repetir o lançamento é decisão do dono, nunca automático.
  const { reservationValidation } = useTRPCClient()

  // "Ver os 24 →" chega com `#jogo-<id>`: a lista carrega depois do hash.
  const carregou = query.isSuccess
  useEffect(() => {
    if (!carregou || !window.location.hash) return
    document
      .getElementById(window.location.hash.slice(1))
      ?.scrollIntoView({ block: 'start' })
  }, [carregou])

  const now = Date.now()

  return (
    <>
      <CabecalhoPagina
        titulo="Quem vai"
        acoes={
          <Link to="/admin/validate" {...propsBotao({ variante: 'acid' })}>
            <IconeBotao nome="code" variante="acid" />
            Validar código
          </Link>
        }
      >
        Quem marcou “Vou assistir aqui” recebe um código na hora. A oferta da
        casa só sai quando você valida o código.
      </CabecalhoPagina>

      {elite ? null : (
        <Card role="note">
          <p className="m-0 text-sm">
            A lista de quem vai é um recurso do plano Elite. Os códigos abaixo
            continuam valendo: valide o de quem chegar.
          </p>
        </Card>
      )}

      {confirmsLater ? (
        <LateCodeEntry
          logLate={reservationValidation.logLate.mutate}
          missing={notLogged.data}
          onLogged={() => {
            void notLogged.refetch()
            void query.refetch()
          }}
        />
      ) : null}

      {query.isLoading ? (
        <div role="status" aria-busy="true" className="qv-jogos">
          <span className="sr-only">Carregando quem vai…</span>
          <Skeleton className="h-40 w-full bg-[var(--painel-sub)]" />
          <Skeleton className="h-40 w-full bg-[var(--painel-sub)]" />
        </div>
      ) : query.isError || !query.data ? (
        <ErroBloco
          titulo="Não foi possível carregar quem vai."
          erro={query.error}
          tentar={query.refetch}
          tentando={query.isFetching}
        />
      ) : query.data.length ? (
        <ul className="qv-jogos">
          {query.data.map((jogo) => {
            const startsAt = new Date(jogo.startsAt)
            const estado = getEventTemporalState(startsAt, null, now)
            const comecou = estado !== 'upcoming'
            const tituloId = `qv-${jogo.id}`
            return (
              <li key={jogo.id}>
                <Card
                  id={`jogo-${jogo.id}`}
                  kind={estado === 'live' ? 'live' : undefined}
                  className="qv-jogo"
                  role="article"
                  aria-labelledby={tituloId}
                >
                  <div className="qv-jogo-cab">
                    <span className="jogos-hora">
                      {formatEventTime(startsAt)}
                    </span>
                    <div>
                      <h2 id={tituloId}>{gameTitle(jogo)}</h2>
                      <p>
                        {rotuloDia(brasiliaDay(startsAt), now)} ·{' '}
                        {jogo.championship}
                      </p>
                    </div>
                    {estado === 'live' ? (
                      <SeloJogo startsAt={startsAt} endsAt={null} />
                    ) : null}
                  </div>
                  <div>
                    <p className="m-0 mb-2 font-semibold text-sm">
                      {resumoQuemVai(jogo)}
                    </p>
                    <Progresso
                      valor={jogo.validated}
                      max={jogo.people.length}
                      rotulo={`${jogo.validated} de ${jogo.people.length} validaram`}
                    />
                  </div>
                  <ul className="jogos-quem-vai">
                    {jogo.people.map((pessoa) => (
                      <PessoaQuemVai
                        key={`${pessoa.name}-${pessoa.markedAt}`}
                        pessoa={pessoa}
                        comecou={comecou}
                      />
                    ))}
                  </ul>
                </Card>
              </li>
            )
          })}
        </ul>
      ) : (
        <Card className="jogos-vazio">
          <p>
            <b>Ninguém marcou ainda.</b>
          </p>
          <p>
            Quem tocar em “Vou assistir aqui” no seu perfil aparece aqui, jogo a
            jogo.
          </p>
        </Card>
      )}
    </>
  )
}
