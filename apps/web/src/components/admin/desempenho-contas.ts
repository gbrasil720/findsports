import { brasiliaDay } from '@findsports_oficial/db/event-window'
import { useState } from 'react'
import type { EventAnalyticsRow } from './admin-model'
import {
  type AnalyticsDateRange,
  type AnalyticsPeriodPreset,
  getAnalyticsRange,
  getPeriodDays
} from './analytics-period'

/*
 * Contas do Desempenho (`/admin/desempenho`) e de Jogos · Passados ("Como
 * cada jogo foi"), que mostram o mesmo período: o seletor, o rótulo das datas
 * e a ordem dos jogos. Os três números e a série diária ficam em
 * `desempenho-dados.ts`, que o Hoje também lê.
 */

const MESES = [
  'jan',
  'fev',
  'mar',
  'abr',
  'mai',
  'jun',
  'jul',
  'ago',
  'set',
  'out',
  'nov',
  'dez'
] as const

/** "15 set 2026", de um dia `AAAA-MM-DD`. */
const dataLonga = (dia: string) =>
  `${Number(dia.slice(8, 10))} ${MESES[Number(dia.slice(5, 7)) - 1]} ${dia.slice(0, 4)}`

/** "15 set 2026 — 14 out 2026". */
export function rotuloPeriodo({ from, to }: AnalyticsDateRange): string {
  return `${dataLonga(from)} — ${dataLonga(to)}`
}

/** "12 out": o dia do jogo, em Brasília. */
export function diaDoJogo(startsAt: string | Date): string {
  const dia = brasiliaDay(startsAt)
  return `${Number(dia.slice(8, 10))} ${MESES[Number(dia.slice(5, 7)) - 1]}`
}

export type Periodo = {
  preset: AnalyticsPeriodPreset
  range: AnalyticsDateRange
}

/**
 * O período escolhido no Desempenho vale também em Jogos · Passados ("Mesmo
 * período do Desempenho"). As duas telas nunca estão abertas juntas, então
 * basta lembrar a última escolha.
 * ponytail: fica na memória da aba; recarregar volta aos 30 dias.
 */
let lembrado: Periodo | undefined

export function usePeriodoDesempenho(): [Periodo, (p: Periodo) => void] {
  const [periodo, setPeriodo] = useState<Periodo>(
    () => lembrado ?? { preset: '30d', range: getAnalyticsRange('30d') }
  )
  const escolher = (novo: Periodo) => {
    lembrado = novo
    setPeriodo(novo)
  }
  return [periodo, escolher]
}

/**
 * Período personalizado: as duas datas, em ordem, até hoje e dentro do
 * histórico que o plano libera (o servidor recusa o resto). `null` é válido.
 */
export function erroDoPersonalizado(
  range: AnalyticsDateRange,
  maxDias: number | null,
  hoje = brasiliaDay(Date.now())
): string | null {
  if (!range.from || !range.to) return 'Informe as duas datas do período.'
  if (range.from > range.to) {
    return 'A data inicial deve ser anterior ou igual à data final.'
  }
  if (range.to > hoje) return 'O período termina hoje, no máximo.'
  if (maxDias !== null && getPeriodDays(range.from, range.to) > maxDias) {
    return `Seu plano permite até ${maxDias} dias.`
  }
  return null
}

type JogoComNumeros = Pick<
  EventAnalyticsRow,
  'startsAt' | 'uniqueVisitors' | 'interestedPeople'
>

/**
 * Os jogos que já começaram, dos que mais puxaram público para os que menos:
 * interessados (quando o plano mostra), depois quem viu, depois o mais
 * recente. Jogo de hoje que ainda não começou não tem o que mostrar.
 */
export function jogosPorPublico<T extends JogoComNumeros>(
  jogos: readonly T[],
  now: number = Date.now()
): T[] {
  return jogos
    .filter((jogo) => new Date(jogo.startsAt).getTime() <= now)
    .sort(
      (a, b) =>
        (b.interestedPeople ?? 0) - (a.interestedPeople ?? 0) ||
        b.uniqueVisitors - a.uniqueVisitors ||
        new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime()
    )
}

/** O jogo com mais interessados; nenhum quando o plano não mostra ou ninguém se interessou. */
export function melhorJogo<T extends JogoComNumeros>(
  ordenados: readonly T[]
): T | undefined {
  const primeiro = ordenados[0]
  return primeiro?.interestedPeople ? primeiro : undefined
}

/**
 * "Quem foi pela Onside": códigos gerados e validados no balcão, somados nos
 * jogos do período. `null` fora do Elite (o servidor manda nulo).
 */
export function codigosDoPeriodo(
  jogos: readonly Pick<EventAnalyticsRow, 'reservedPeople' | 'arrivals'>[]
): { gerados: number; validados: number } | null {
  if (jogos.some((jogo) => jogo.reservedPeople === null)) return null
  return jogos.reduce(
    (total, jogo) => ({
      gerados: total.gerados + (jogo.reservedPeople ?? 0),
      validados: total.validados + (jogo.arrivals ?? 0)
    }),
    { gerados: 0, validados: 0 }
  )
}
