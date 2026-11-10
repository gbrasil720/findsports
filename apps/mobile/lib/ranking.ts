/*
 * Frases do ranking do mês (13 do design). As contas são do servidor
 * (`packages/api/src/lib/ranking.ts`); aqui só o texto.
 */

export type Metric = 'bars' | 'games' | 'neighborhoods' | 'achievements'

export const METRICS: { key: Metric; label: string }[] = [
  { key: 'bars', label: 'Bares no mês' },
  { key: 'games', label: 'Jogos' },
  { key: 'neighborhoods', label: 'Bairros' },
  { key: 'achievements', label: 'Conquistas' }
]

const UNITS: Record<Metric, [string, string]> = {
  bars: ['bar', 'bares'],
  games: ['jogo', 'jogos'],
  neighborhoods: ['bairro', 'bairros'],
  achievements: ['conquista', 'conquistas']
}

/** "bar" ou "bares". */
export const unit = (metric: Metric, n: number) =>
  UNITS[metric][n === 1 ? 0 : 1]

/** O rodapé (10d): o que conta e o desempate. */
export const RULES: Record<Metric, string> = {
  bars: 'Conta um bar por código validado no mês.',
  games: 'Conta um jogo por código validado no mês.',
  neighborhoods: 'Conta um bairro por código validado no mês.',
  achievements: 'Conta as conquistas desbloqueadas no mês.'
}
export const TIE_RULE = 'Empate vai para quem chegou primeiro.'

/** "Outubro", do `2026-10` do servidor. */
export function monthLabel(month: string) {
  const name = new Date(`${month}-15T12:00:00Z`).toLocaleDateString('pt-BR', {
    month: 'long',
    timeZone: 'UTC'
  })
  return name.charAt(0).toLocaleUpperCase('pt-BR') + name.slice(1)
}

export function closesLabel(days: number) {
  if (days <= 0) return 'Fecha hoje'
  if (days === 1) return 'Fecha amanhã'
  return `Fecha em ${days} dias`
}

/** "Faltam 3 bares para passar Marina" (sem artigo: o app não sabe o gênero). */
export function chaseLabel(metric: Metric, need: number, name: string) {
  return `${need === 1 ? 'Falta' : 'Faltam'} ${need} ${unit(metric, need)} para passar ${firstName(name)}`
}

export const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name

/** "1.284º". */
export const ordinal = (n: number) => `${n.toLocaleString('pt-BR')}º`

/** "Top 4%" (A05): a fatia da cidade em que você está, para cima. */
export const topLabel = (position: number, total: number) =>
  `Top ${Math.max(1, Math.ceil((position / Math.max(total, 1)) * 100))}%`

/** A lista da cidade (27a): só as duas métricas que o dono escolheu. */
export const CITY_METRICS = METRICS.filter(
  (m): m is { key: 'bars' | 'games'; label: string } =>
    m.key === 'bars' || m.key === 'games'
)

/** "1.273 TORCEDORES", o corte da lista da cidade. */
export const fansLabel = (n: number) =>
  `${n.toLocaleString('pt-BR')} ${n === 1 ? 'TORCEDOR' : 'TORCEDORES'}`

/**
 * A lista da cidade na tela (27a): o que já veio do topo, o corte com
 * quantos ficam no meio e a sua vizinhança, fixa embaixo. Quando o topo
 * alcança a vizinhança, vira uma lista só; `rest` é quem fica depois do
 * último mostrado.
 */
export function cityLayout<T extends { position: number }>(
  loaded: T[],
  around: T[],
  total: number
) {
  const last = loaded.at(-1)?.position ?? 0
  const first = around[0]?.position
  if (first !== undefined && first - last - 1 > 0)
    return { top: loaded, gap: first - last - 1, around, rest: 0 }
  const top = [...loaded, ...around.filter((row) => row.position > last)]
  return { top, gap: 0, around: [], rest: total - (top.at(-1)?.position ?? 0) }
}

const HOUR = 3_600_000
const DAY = 24 * HOUR

/**
 * O relógio do fim do mês ("22d 04h", rodada 6): até a meia-noite de
 * Brasília do dia 1º do mês seguinte, em dias e horas.
 */
export function monthClock(month: string, now: number) {
  const [year, m] = month.split('-').map(Number) as [number, number]
  // 00:00 em Brasília (UTC-3, sem horário de verão) é 03:00 UTC.
  const end = Date.UTC(year, m, 1, 3)
  const left = Math.max(0, end - now)
  return {
    days: Math.floor(left / DAY),
    hours: Math.floor((left % DAY) / HOUR)
  }
}

/** "foi hoje", "foi ontem", "foi há 3 dias" ou "estreou" (a primeira visita na semana). */
export function lastLine(
  lastAt: string | null,
  firstAt: string | null,
  now: number
) {
  if (!lastAt) return null
  if (firstAt && now - new Date(firstAt).getTime() < 7 * DAY) return 'estreou'
  const days = Math.floor(
    (new Date(`${dayOf(now)}T12:00:00Z`).getTime() -
      new Date(`${dayOf(new Date(lastAt).getTime())}T12:00:00Z`).getTime()) /
      DAY
  )
  if (days <= 0) return 'foi hoje'
  if (days === 1) return 'foi ontem'
  return days < 30 ? `foi há ${days} dias` : null
}

const dayOf = (at: number) => new Date(at - 3 * HOUR).toISOString().slice(0, 10)

/**
 * As barras do histograma da cidade: uma por valor de 1 ao maior (até 24;
 * acima disso, faixas iguais), a altura pela contagem e a sua marcada.
 */
export function histogramBars(
  buckets: { value: number; count: number }[],
  mine: number,
  max = 24
) {
  const top = Math.max(1, ...buckets.map((b) => b.value))
  const step = Math.ceil(top / max)
  const bins = Array.from({ length: Math.ceil(top / step) }, (_, i) => ({
    from: i * step + 1,
    to: (i + 1) * step,
    count: 0
  }))
  for (const b of buckets) {
    if (b.value < 1) continue
    const bin =
      bins[Math.min(bins.length - 1, Math.floor((b.value - 1) / step))]
    if (bin) bin.count += b.count
  }
  const most = Math.max(1, ...bins.map((b) => b.count))
  return bins.map((bin) => ({
    ...bin,
    share: bin.count / most,
    me: mine >= bin.from && mine <= bin.to
  }))
}
