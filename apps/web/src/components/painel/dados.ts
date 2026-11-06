import { useQuery } from '@tanstack/react-query'
import { BAR_RESERVATIONS_QUERY } from '@/lib/query-cache'
import { useTRPC } from '@/utils/trpc'
import { usePainel } from './painel-shell'

/*
 * Leituras que Hoje e Jogos dividem (WEB-501, fase 2). A chave é a mesma da
 * casca, então não há ida extra ao servidor.
 */

/** Quem vai, por jogo com a validação aberta: Elite ou código em aberto. */
export function useGoing() {
  const trpc = useTRPC()
  const { showsGoing } = usePainel()
  return useQuery({
    ...trpc.barReservations.going.queryOptions(),
    ...BAR_RESERVATIONS_QUERY,
    enabled: showsGoing,
    meta: { errorToast: false }
  })
}

export type GoingGame = NonNullable<ReturnType<typeof useGoing>['data']>[number]

/** Quantos marcaram e quantos já validaram no balcão. */
export function goingCount(game: GoingGame | undefined) {
  const going = game?.people.length ?? 0
  const arrived = game?.people.filter((p) => p.validatedAt).length ?? 0
  return { going, arrived }
}

/** Interesse do jogo sobre a média do bar (WEB-127): nunca a contagem. */
export function useInterest() {
  const trpc = useTRPC()
  const { data } = useQuery({
    ...trpc.pub.getMyInterest.queryOptions(),
    meta: { errorToast: false }
  })
  return {
    gathering: data?.status === 'gathering',
    ratio: new Map(
      data?.status === 'ready'
        ? data.events.map((item) => [item.eventId, item.ratio])
        : []
    )
  }
}

export function interestLabel(ratio: number): string {
  return `Interesse: ${ratio.toLocaleString('pt-BR')}x a média deste bar`
}

/** Telão e som são do cadastro do bar: não existe a escolha por jogo. */
export function barScreen(bar: {
  amenities: number[]
  screenCount: number | null
}) {
  return {
    tv: bar.amenities.includes(1),
    screens: bar.screenCount,
    sound: bar.amenities.includes(2)
  }
}
