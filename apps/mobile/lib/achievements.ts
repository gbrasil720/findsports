import type { AppRouter } from '@findsports_oficial/api/routers/index'
import { BRASILIA_TIME_ZONE as TZ } from '@findsports_oficial/db/event-window'
import type { inferRouterOutputs } from '@trpc/server'

/*
 * Conquistas (09 do design): textos e contas puras das três telas. As
 * regras (o que conta, os alvos, o nível) são do servidor
 * (`packages/api/src/lib/achievements.ts`).
 */

export type Achievements = inferRouterOutputs<AppRouter>['achievements']['mine']
export type Achievement = Achievements['achievements'][number]
export type Group = Achievement['group']

export const GROUPS: { key: Group; label: string }[] = [
  { key: 'bares', label: 'Bares' },
  { key: 'bairros', label: 'Bairros' },
  { key: 'esportes', label: 'Esportes' },
  { key: 'resenhas', label: 'Resenhas' }
]

/** Nome da série no topo do detalhe ("Bares novos · 2 de 4"). */
const SERIES: Record<Group, string> = {
  bares: 'Bares novos',
  bairros: 'Bairros',
  esportes: 'Esportes',
  resenhas: 'Resenhas'
}

const UNIT: Record<Group, [string, string]> = {
  bares: ['bar', 'bares'],
  bairros: ['bairro', 'bairros'],
  esportes: ['esporte', 'esportes'],
  resenhas: ['resenha', 'resenhas']
}

export const unit = (group: Group, n: number) =>
  `${n} ${UNIT[group][n === 1 ? 0 : 1]}`

/** "12 set": a data curta da estante. */
export const shortDate = (date: string | Date) =>
  new Date(date)
    .toLocaleDateString('pt-BR', {
      day: 'numeric',
      month: 'short',
      timeZone: TZ
    })
    .replace('.', '')
    .replace(' de ', ' ')

/** "04.10.2026", como o design grava a data. */
export const fullDate = (date: string | Date) =>
  new Date(date)
    .toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      timeZone: TZ
    })
    .replaceAll('/', '.')

export const series = (list: Achievement[], group: Group) =>
  list.filter((a) => a.group === group)

/** A próxima medalha da mesma série ainda por ganhar, se houver. */
export function nextInSeries(list: Achievement[], a: Achievement) {
  const s = series(list, a.group)
  return s.slice(s.indexOf(a) + 1).find((m) => !m.unlockedAt) ?? null
}

export function seriesLabel(list: Achievement[], a: Achievement) {
  const s = series(list, a.group)
  return `${SERIES[a.group]} · ${s.indexOf(a) + 1} de ${s.length}`
}

/** A medalha conquistada por último: destaque da estante e do nível. */
export function latest(list: Achievement[]) {
  return (
    list
      .filter((a) => a.unlockedAt)
      .sort(
        (x, y) =>
          new Date(y.unlockedAt ?? 0).getTime() -
          new Date(x.unlockedAt ?? 0).getTime()
      )[0] ?? null
  )
}

/** O texto do detalhe (2j). */
export function describe(a: Achievement) {
  const n = a.target
  if (a.unlockedAt) {
    if (a.group === 'bares')
      return n === 1
        ? 'Você assistiu ao seu primeiro jogo num bar, com o código validado no balcão.'
        : `Você assistiu a jogos em ${n} bares diferentes, com o código validado por cada um.`
    if (a.group === 'bairros')
      return `Você assistiu a jogos em bares de ${n} bairros diferentes.`
    if (a.group === 'esportes')
      return `Você assistiu a ${n} esportes diferentes num bar, com o código validado.`
    return n === 1
      ? 'Você avaliou seu primeiro jogo dizendo se voltaria ao bar.'
      : `Você avaliou ${n} jogos dizendo se voltaria ao bar.`
  }
  const left = n - Math.min(a.progress, n)
  if (a.group === 'bares')
    return `Assista a jogos em ${n} bares diferentes, com o código validado em cada um. Falta${left === 1 ? '' : 'm'} ${unit('bares', left)}.`
  if (a.group === 'bairros')
    return `Assista a jogos em bares de ${n} bairros diferentes. Falta${left === 1 ? '' : 'm'} ${unit('bairros', left)}.`
  if (a.group === 'esportes')
    return `Assista a ${n} esportes diferentes num bar. Falta${left === 1 ? '' : 'm'} ${unit('esportes', left)}.`
  return `Avalie ${n} jogos dizendo se voltaria ao bar. Falta${left === 1 ? '' : 'm'} ${unit('resenhas', left)}.`
}

const ordinal = (n: number, feminine = false) => `${n}${feminine ? 'ª' : 'º'}`

/** O texto da conquista desbloqueada (2k). */
export function unlockedLine(a: Achievement) {
  const where = a.where ?? ''
  const n = a.target
  // Sem artigo antes do bar: "o Casa 92", "o Cervejaria" erram o gênero.
  if (a.group === 'bares')
    return n === 1
      ? `${where} validou seu código. É o seu primeiro jogo num bar pela Onside.`
      : `${where} validou seu código. É o ${ordinal(n)} bar diferente onde você assistiu a um jogo pela Onside.`
  if (a.group === 'bairros')
    return `${where} entrou na lista. É o ${ordinal(n)} bairro diferente onde você assistiu a um jogo pela Onside.`
  if (a.group === 'esportes') {
    const [sport, bar] = where.split(' · ')
    return `${sport} em ${bar}. É o ${ordinal(n)} esporte diferente que você assistiu num bar pela Onside.`
  }
  return n === 1
    ? `Você avaliou o jogo em ${where}. É a sua primeira resenha na Onside.`
    : `Você avaliou o jogo em ${where}. É a sua ${ordinal(n, true)} resenha na Onside.`
}

/** O que mostrar quando a medalha ainda não saiu. */
export const progressLabel = (a: Achievement) =>
  `${Math.min(a.progress, a.target)}/${a.target}`

/** Fração da barra de progresso, de 0 a 1. */
export const progressShare = (a: Achievement) =>
  Math.min(1, a.progress / a.target)

/**
 * "Sua 7ª resenha. Faltam 3 para a medalha Crítico." (pós-jogo, 3g): com a
 * avaliação que acabou de ser enviada já contada.
 */
export function reviewLine(list: Achievement[]) {
  const reviews = series(list, 'resenhas')
  const count = (reviews.at(-1)?.progress ?? 0) + 1
  const next = reviews.find((a) => a.target > count)
  const head = `Sua ${ordinal(count, true)} resenha.`
  if (!next) return { head, tail: '', next: null }
  const left = next.target - count
  return {
    head,
    tail: `Falta${left === 1 ? '' : 'm'} ${left} para a medalha ${next.name}.`,
    next
  }
}
