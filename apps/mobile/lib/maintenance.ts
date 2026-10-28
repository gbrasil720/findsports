import type { AppStatus } from '@findsports_oficial/api/lib/app-status'
import { hashKey, useQuery, useQueryClient } from '@tanstack/react-query'
import * as SecureStore from 'expo-secure-store'
import { useEffect, useState } from 'react'
import { authClient } from './auth-client'
import { env } from './env'
import { type MyGame, pickTodayCode } from './my-games'
import { trpc } from './trpc'

/*
 * Manutenção do app (WEB-466, 26d e 26e). Quem liga é o Houdini (chave
 * `app.maintenance`); o app pergunta a `GET /api/app/status` ao abrir, a cada
 * minuto e ao voltar ao primeiro plano.
 *
 * Manutenção é o que o servidor ANUNCIOU, nunca uma falha: a última resposta
 * boa fica guardada no aparelho e vale enquanto não vier outra. Servidor fora
 * do ar sem anúncio cai no erro de sempre (a faixa "Sem internet", os blocos
 * que não carregaram); com a manutenção anunciada e o servidor caindo no
 * meio dela (uma migration, por exemplo), a tela continua.
 *
 * ponytail: o anúncio guardado não vence sozinho; sem rede depois de uma
 * manutenção, o app abre nela até a primeira resposta. Dar validade a ele se
 * isso aparecer.
 */

export type Maintenance = AppStatus['maintenance']

const STATUS_KEY = 'onside.manutencao'
const CODE_KEY = 'onside.codigo-de-hoje'

function readJson<T>(key: string): T | null {
  try {
    const raw = SecureStore.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

async function fetchStatus(): Promise<Maintenance> {
  const response = await fetch(`${env.EXPO_PUBLIC_SERVER_URL}/api/app/status`, {
    credentials: 'omit'
  })
  // 503 é o servidor sem conseguir ler a chave: não muda o que se sabia.
  if (!response.ok) throw new Error(`app/status ${response.status}`)
  const { maintenance } = (await response.json()) as AppStatus
  SecureStore.setItemAsync(STATUS_KEY, JSON.stringify(maintenance)).catch(
    () => {}
  )
  return maintenance
}

/** A manutenção que vale agora: a última resposta, senão a guardada. */
export function useMaintenance(): Maintenance | null {
  const [stored] = useState(() => readJson<Maintenance>(STATUS_KEY))
  const status = useQuery({
    queryKey: ['app-status'],
    queryFn: fetchStatus,
    refetchInterval: 60_000,
    // Falhou, a próxima volta do minuto tenta de novo.
    retry: false
  })
  return status.data ?? stored
}

// --- O código do jogo de hoje, no aparelho -----------------------------------

/**
 * O que a tela do código mostra, da própria pessoa e já visto por ela em Meus
 * jogos: nenhum dado novo. É o que abre o "Ver meu código de hoje" e o código
 * sem rede (26a e 26d do design: "o código vive no aparelho").
 */
export type SavedCode = Pick<
  MyGame,
  | 'eventId'
  | 'code'
  | 'validated'
  | 'window'
  | 'barName'
  | 'startsAt'
  | 'championship'
  | 'participants'
  | 'participantFreeText'
  | 'offer'
  | 'confirmsCodesLater'
> & { userId: string }

/**
 * O código guardado, se a janela dele ainda está aberta e é de `userId` (sem
 * sessão conhecida, servidor fora do ar, vale o guardado: sair da conta o
 * apaga).
 */
export function readTodayCode(
  userId: string | undefined,
  now = Date.now()
): SavedCode | null {
  const saved = readJson<SavedCode>(CODE_KEY)
  if (!saved || (userId && saved.userId !== userId)) return null
  return pickTodayCode([saved], now) ? saved : null
}

function keepTodayCode(userId: string, games: readonly MyGame[]) {
  const game = pickTodayCode(games, Date.now())
  if (!game) {
    SecureStore.deleteItemAsync(CODE_KEY).catch(() => {})
    return
  }
  const saved: SavedCode = {
    userId,
    eventId: game.eventId,
    code: game.code,
    validated: game.validated,
    window: game.window,
    barName: game.barName,
    startsAt: game.startsAt,
    championship: game.championship,
    participants: game.participants,
    participantFreeText: game.participantFreeText,
    offer: game.offer,
    confirmsCodesLater: game.confirmsCodesLater
  }
  SecureStore.setItemAsync(CODE_KEY, JSON.stringify(saved)).catch(() => {})
}

/**
 * Guarda o código de hoje a cada leitura de `attendance.mine` (Meus jogos, a
 * tela do código, Avisos, o Perfil) e o apaga quando a pessoa sai da conta.
 * Montado uma vez, na raiz.
 */
export function useKeepTodayCode() {
  const queryClient = useQueryClient()
  const session = authClient.useSession()
  const userId = session.data?.user.id
  // Só a saída de verdade: servidor fora do ar também deixa `data` vazio.
  const signedOut = !session.isPending && !session.error && !session.data

  useEffect(() => {
    if (signedOut) SecureStore.deleteItemAsync(CODE_KEY).catch(() => {})
  }, [signedOut])

  useEffect(() => {
    if (!userId) return
    const mine = hashKey(trpc.attendance.mine.queryKey())
    return queryClient.getQueryCache().subscribe((event) => {
      if (
        event.type === 'updated' &&
        event.action.type === 'success' &&
        event.query.queryHash === mine
      )
        keepTodayCode(userId, event.action.data as MyGame[])
    })
  }, [queryClient, userId])
}
