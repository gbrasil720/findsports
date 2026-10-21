import type { AppRouter } from '@findsports_oficial/api/routers/index'
import type { inferRouterOutputs } from '@trpc/server'
import { BAR_ITEMS, PIX_E_CARTAO } from './filters'

/*
 * "Bares pra você" (seção 08 do design, rodadas 22 e 23): as frases do card
 * e da 22c a partir dos números que o servidor manda. Nada aqui inventa
 * número: sem o dado, a frase fica genérica. Contas puras; as telas ficam em
 * `app/bares-pra-voce.tsx` e `app/por-que.tsx`.
 */

type Today = inferRouterOutputs<AppRouter>['recommendations']['today']
export type Round = NonNullable<Today['round']>
export type Suggestion = Round['items'][number]
export type AxisKey = keyof Suggestion['axes']

const TZ = 'America/Sao_Paulo'
const DAY = 86_400_000

export const SLOT_LABEL: Record<Suggestion['slot'], string> = {
  sua_cara: 'Sua cara',
  pra_variar: 'Pra variar',
  vale_arriscar: 'Vale arriscar'
}

/** Os cinco eixos da 22e, na ordem do design, com o teto e o ícone. */
export const AXES = [
  { key: 'directIntent', label: 'Seu interesse', max: 30, icon: 'eye' },
  { key: 'sportsAffinity', label: 'Seu esporte', max: 20, icon: 'tv' },
  { key: 'distance', label: 'Distância', max: 15, icon: 'pin' },
  { key: 'experienceSimilarity', label: 'Seu estilo', max: 18, icon: 'bar' },
  { key: 'quality', label: 'Avaliação', max: 17, icon: 'star' }
] as const satisfies readonly {
  key: AxisKey
  label: string
  max: number
  icon: string
}[]

const REASON_AXIS: Partial<Record<Suggestion['reason'], AxisKey>> = {
  recent_interest: 'directIntent',
  preferred_sport: 'sportsAffinity',
  similar_experience: 'experienceSimilarity',
  well_rated: 'quality',
  nearby: 'distance'
}

const WORDS_F = [
  'zero',
  'uma',
  'duas',
  'três',
  'quatro',
  'cinco',
  'seis',
  'sete',
  'oito',
  'nove',
  'dez'
]
const WORDS_M = [
  'zero',
  'um',
  'dois',
  'três',
  'quatro',
  'cinco',
  'seis',
  'sete',
  'oito',
  'nove',
  'dez'
]

/** "duas" vezes, "dois" bares; acima de dez, o número. */
export const numberWord = (n: number, gender: 'f' | 'm' = 'm') =>
  (gender === 'f' ? WORDS_F : WORDS_M)[n] ?? String(n)

const capital = (value: string) =>
  value.charAt(0).toLocaleUpperCase('pt-BR') + value.slice(1)

const times = (n: number) =>
  n === 1 ? 'uma vez' : `${numberWord(n, 'f')} vezes`

/** "futebol", mas "F1" e "MMA" ficam como estão. */
export function sportWord(name: string) {
  const rest = name.slice(1)
  return /\p{Ll}/u.test(rest) && rest === rest.toLocaleLowerCase('pt-BR')
    ? name.charAt(0).toLocaleLowerCase('pt-BR') + rest
    : name
}

/** "A, B e C". */
export function listWords(items: string[]) {
  if (items.length <= 1) return items[0] ?? ''
  return `${items.slice(0, -1).join(', ')} e ${items.at(-1)}`
}

/** "600 m" ou "1,4 km". */
export function distanceText(km: number) {
  if (km < 1) return `${Math.max(100, Math.round((km * 1000) / 100) * 100)} m`
  return `${km.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km`
}

/** Os nomes curtos das características em comum ("Telão", "Área externa"). */
export function amenityNames(ids: number[]) {
  return ids
    .map((id) =>
      id === PIX_E_CARTAO
        ? 'Pix e cartão'
        : BAR_ITEMS.find((item) => item.id === id)?.label
    )
    .filter((label): label is NonNullable<typeof label> => Boolean(label))
    .slice(0, 2)
}

/** "Telão e área externa": o primeiro com maiúscula, o resto não. */
function sharedPhrase(ids: number[]) {
  const names = amenityNames(ids)
  if (!names.length) return null
  return capital(
    listWords(names.map((name) => name.toLocaleLowerCase('pt-BR')))
  ).replace(/pix/i, 'Pix')
}

/** A frase verde do card (motivo → frase, tabela da 22e). */
export function reasonLine(item: Suggestion) {
  const f = item.facts
  switch (item.reason) {
    case 'recent_interest':
      if (f.gameOpensWeek >= 2)
        return `Você abriu o jogo dele ${times(f.gameOpensWeek)} esta semana`
      if (f.gameOpensWeek === 1) return 'Você abriu o jogo dele esta semana'
      if (f.viewsWeek >= 2)
        return `Você abriu a página dele ${times(f.viewsWeek)} esta semana`
      if (f.highIntent) return 'Você abriu a rota ou o contato dele'
      if (f.ratedPositive) return 'Você disse que voltaria'
      return 'Você demonstrou interesse neste bar'
    case 'preferred_sport':
      return f.sport
        ? `Passa ${sportWord(f.sport)}, que você acompanha`
        : 'Tem jogo de um dos seus esportes'
    case 'similar_experience': {
      const top = f.references[0]
      if (top && top.visits >= 2)
        return `Parecido com o ${top.name}, onde você foi ${times(top.visits)}`
      const shared = sharedPhrase(f.shared)
      if (shared) return `${shared}, como os bares que você mais curte`
      if (top) return `Parecido com o ${top.name}`
      return 'Parecido com os bares que você curte'
    }
    case 'well_rated':
      return f.rating
        ? `${f.rating.percentage}% dos torcedores voltariam`
        : 'Bem avaliado por quem foi assistir'
    case 'nearby':
      return `A ${distanceText(item.distanceKm)} de você`
    case 'explore':
      return 'Fora do que você costuma ver'
  }
}

/** As fichas do card: os outros eixos fortes (60% do teto), até duas. */
export function chips(item: Suggestion) {
  const main = REASON_AXIS[item.reason]
  return AXES.filter(
    (axis) => axis.key !== main && item.axes[axis.key] / axis.max >= 0.6
  )
    .sort((a, b) => item.axes[b.key] / b.max - item.axes[a.key] / a.max)
    .slice(0, 2)
}

/** O eixo que mais somou: "MAIOR PESO" na 22c. */
export const heaviestAxis = (item: Suggestion): AxisKey =>
  AXES.reduce((best, axis) =>
    item.axes[axis.key] > item.axes[best.key] ? axis : best
  ).key

/** "24/30": pontos arredondados sobre o teto. */
export const axisPoints = (item: Suggestion, key: AxisKey) =>
  Math.round(item.axes[key])

/** A frase de cada eixo na 22c, com os números de verdade. */
export function axisLine(item: Suggestion, key: AxisKey, radiusKm: number) {
  const f = item.facts
  switch (key) {
    case 'directIntent':
      if (f.gameOpensWeek)
        return `Você abriu o jogo do ${item.name} ${times(f.gameOpensWeek)} nos últimos 7 dias.`
      if (f.viewsWeek)
        return `Você abriu a página do ${item.name} ${times(f.viewsWeek)} nos últimos 7 dias.`
      if (f.highIntent) return 'Você abriu a rota ou o contato dele.'
      if (f.ratedPositive) return 'Você disse que voltaria.'
      if (item.axes.directIntent > 0)
        return 'Você olhou este bar nas últimas semanas.'
      return 'Você ainda não abriu nada deste bar.'
    case 'sportsAffinity':
      if (f.sport && f.team)
        return `Passa ${sportWord(f.sport)}, que você acompanha, e o ${f.team}, que você viu.`
      if (f.sport) return `Passa ${sportWord(f.sport)}, que você acompanha.`
      if (f.team) return `Tem jogo do ${f.team}, que você viu.`
      if (item.axes.sportsAffinity > 0)
        return 'Tem jogo marcado, mas não dos seus esportes.'
      return 'Ainda sem jogo marcado dos seus esportes.'
    case 'distance':
      return item.distanceKm <= radiusKm
        ? `A ${distanceText(item.distanceKm)}, dentro do seu raio de ${radiusKm} km.`
        : `A ${distanceText(item.distanceKm)}, um pouco além do seu raio de ${radiusKm} km.`
    case 'experienceSimilarity': {
      const shared = sharedPhrase(f.shared)
      const refs = f.references.map((ref) => `o ${ref.name}`)
      const where = f.references.some((ref) => ref.visits > 0)
        ? 'onde você mais vai'
        : 'que você curte'
      if (shared && refs.length)
        return `${shared}, como ${listWords(refs)}, ${where}.`
      if (shared) return `${shared}, como os bares que você mais curte.`
      if (refs.length) return `Parecido com ${listWords(refs)}, ${where}.`
      return 'Ainda sem bares curtidos para comparar.'
    }
    case 'quality':
      return f.rating
        ? `${f.rating.percentage}% dos torcedores voltariam, em ${f.rating.total} avaliações.`
        : 'Poucas avaliações ainda: conta como média.'
  }
}

const dayKey = (value: string | number) =>
  new Date(value).toLocaleDateString('en-CA', { timeZone: TZ })

export const isToday = (startsAt: string, now: number) =>
  dayKey(startsAt) === dayKey(now)

/** "HOJE 21:30", "SÁB 16:00" ou, mais longe, "12 NOV 16:00". */
export function gameWhen(startsAt: string, now: number) {
  const time = new Date(startsAt).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: TZ
  })
  if (isToday(startsAt, now)) return `HOJE ${time}`
  const far = new Date(startsAt).getTime() - now > 6 * DAY
  const day = new Date(startsAt)
    .toLocaleDateString(
      'pt-BR',
      far
        ? { day: 'numeric', month: 'short', timeZone: TZ }
        : { weekday: 'short', timeZone: TZ }
    )
    .replace(/\.| de/g, '')
    .toLocaleUpperCase('pt-BR')
  return `${day} ${time}`
}

/** "Costuma passar futebol e F1" (bar sem jogo marcado). */
export function usualLine(item: Suggestion) {
  const names = item.facts.usualSports.map((sport) => sportWord(sport.name))
  return names.length
    ? `Costuma passar ${listWords(names)}`
    : 'Ainda não marcou jogo na Onside'
}

/** O selo da miniatura na 23f/23h: VOU, CURTI ou PASSEI. */
export function stripLabel(item: Suggestion, now: number) {
  if (item.game?.attending && isToday(item.game.startsAt, now)) return 'VOU'
  if (item.decision === 'liked') return 'CURTI'
  if (item.decision === 'passed') return 'PASSEI'
  return null
}

/** Os que ainda faltam decidir, na ordem da rodada. */
export const pending = (round: Round) =>
  round.items.filter((item) => !item.decision)

/** "N novos" no menu Você (2c): os que a pessoa nem viu ainda. */
export const freshCount = (round: Round) =>
  round.items.filter((item) => !item.seen && !item.decision).length

/** "Nova rodada amanhã, 10:00" (ou "hoje", de madrugada). */
export function nextRoundLabel(nextRoundAt: string, now: number) {
  const time = new Date(nextRoundAt).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: TZ
  })
  return `Nova rodada ${isToday(nextRoundAt, now) ? 'hoje' : 'amanhã'}, ${time}`
}

/**
 * O resumo da 23f: "Três bares curtidos, um com jogo hoje, e dois que você
 * passou."
 */
export function roundSummary(round: Round, now: number) {
  const liked = round.items.filter((item) => item.decision === 'liked')
  const passed = round.items.filter((item) => item.decision === 'passed')
  const withGame = liked.filter(
    (item) => item.game && isToday(item.game.startsAt, now)
  ).length
  const parts = [
    liked.length
      ? `${numberWord(liked.length)} ${liked.length === 1 ? 'bar curtido' : 'bares curtidos'}`
      : 'nenhum bar curtido',
    withGame ? `${numberWord(withGame)} com jogo hoje` : null,
    passed.length ? `${numberWord(passed.length)} que você passou` : null
  ].filter((part): part is string => Boolean(part))
  const joined =
    parts.length === 3
      ? `${parts[0]}, ${parts[1]}, e ${parts[2]}`
      : listWords(parts)
  return `${capital(joined)}. As próximas sugestões já levam isso em conta.`
}

/** "Bar Original · quando passar futebol" / "· em jogo do Corinthians". */
export function alertLine(
  barName: string,
  alert: { sport?: string; team?: string }
) {
  return alert.team
    ? `${barName} · em jogo do ${alert.team}`
    : `${barName} · quando passar ${sportWord(alert.sport ?? '')}`
}
