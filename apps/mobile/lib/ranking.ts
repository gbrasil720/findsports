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
