import * as SecureStore from 'expo-secure-store'
import { useSyncExternalStore } from 'react'
import { queryClient, trpcClient } from './trpc'

/*
 * Ver sem conta, agir com conta (rodada 2 do redesign, telas 1 a 3): o que a
 * pessoa tentava fazer quando a folha de entrar abriu. Fica no aparelho até a
 * conta existir, porque a confirmação do e-mail volta pelo link (`/verified`),
 * às vezes com o app reaberto. Concluída a ação, o cartão da tela 3 diz o que
 * foi feito (`useDone`).
 */

export type Acao =
  /** "Vou assistir aqui": marca presença no jogo. */
  | { kind: 'vou'; barId: string; eventId: string }
  /** O coração: salva o bar. */
  | { kind: 'fav'; barId: string }
  /** Check-in: só entra; o check-in pede a localização, então é a pessoa quem toca. */
  | { kind: 'checkin'; barId: string; eventId: string }
  /** Um item que precisa de conta (aba Você, Bares, IA): só entra. */
  | { kind: 'conta'; what: string }

const KEY = 'onside.acao-pendente'

export const savePending = (acao: Acao) =>
  SecureStore.setItemAsync(KEY, JSON.stringify(acao)).catch(() => {})

/** A ação guardada, que sai do aparelho ao ser lida. */
export async function takePending(): Promise<Acao | null> {
  try {
    const raw = await SecureStore.getItemAsync(KEY)
    await SecureStore.deleteItemAsync(KEY)
    return raw ? (JSON.parse(raw) as Acao) : null
  } catch {
    return null
  }
}

/** O que o cartão da tela 3 mostra depois da ação. */
export type Done = {
  kind: 'vou' | 'vouc' | 'fav'
  /** Conta criada agora: o título diz "Conta criada e…" e convida às preferências. */
  fresh: boolean
  /** O torcedor ainda não escolheu esportes, times e raio. */
  invite: boolean
}

let done: Done | null = null
const listeners = new Set<() => void>()
const emit = () => {
  for (const listener of listeners) listener()
}
export const setDone = (next: Done | null) => {
  done = next
  emit()
}
export const useDone = () =>
  useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => done
  )

/**
 * Conclui a ação guardada com a sessão nova e mostra o cartão. Ação que só
 * pedia conta não mostra nada: a pessoa segue de onde estava. Devolve a ação,
 * para quem volta pelo link saber a que bar voltar.
 */
export async function finishPending(user: {
  createdAt: Date | string
  onboardingCompleted?: boolean | null
}) {
  const acao = await takePending()
  if (!acao || (acao.kind !== 'vou' && acao.kind !== 'fav')) return acao
  // Conta de menos de um dia é "conta criada", como no web.
  const fresh = Date.now() - new Date(user.createdAt).getTime() < 86_400_000
  const invite = !user.onboardingCompleted
  try {
    if (acao.kind === 'fav') {
      await trpcClient.pubs.favorite.mutate({ barId: acao.barId })
      setDone({ kind: 'fav', fresh, invite })
    } else {
      const result = await trpcClient.attendance.set.mutate({
        eventId: acao.eventId,
        attending: true
      })
      // Sem código (bar fora do Elite), a frase manda ao check-in.
      setDone({ kind: result.code ? 'vou' : 'vouc', fresh, invite })
    }
  } finally {
    await queryClient.invalidateQueries()
  }
  return acao
}

/** Título e frase do cartão, os do web (`CONTA_NOVA`). */
export const DONE_TEXT: Record<Done['kind'], [string, string, string]> = {
  vou: [
    'Conta criada e presença marcada',
    'Presença marcada',
    'Seu código está aqui e em Meus jogos.'
  ],
  vouc: [
    'Conta criada e presença marcada',
    'Presença marcada',
    'Quando chegar ao bar, faça check-in em Meus jogos.'
  ],
  fav: [
    'Conta criada e bar salvo',
    'Bar salvo',
    'Ele está em Seus bares, com a semana de jogos.'
  ]
}
