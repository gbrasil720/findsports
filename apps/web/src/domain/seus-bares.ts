import { brasiliaDay } from '@/components/painel/noite'

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

/**
 * "Já fui" e o perfil (WEB-501): as visitas de um ano (dia de Brasília do
 * jogo), em jogos, bares, bairros e por mês.
 */
export function visitasDoAno(
  visitas: {
    startsAt: string | Date
    barId: string
    neighborhood: string
  }[],
  ano: number
) {
  const doAno = visitas.filter((v) =>
    brasiliaDay(v.startsAt).startsWith(`${ano}-`)
  )
  const porMes = MESES.map(
    (mes, i) =>
      [
        mes,
        doAno.filter(
          (v) => Number(brasiliaDay(v.startsAt).slice(5, 7)) === i + 1
        ).length
      ] as const
  )
  return {
    jogos: doAno.length,
    bares: new Set(doAno.map((v) => v.barId)).size,
    bairros: new Set(doAno.map((v) => v.neighborhood)).size,
    meses: porMes,
    pico: Math.max(0, ...porMes.map(([, n]) => n))
  }
}

/** Os bares mais visitados, do mais ao menos. */
export function maisVisitados<T extends { barId: string }>(visitas: T[]) {
  const conta = new Map<string, { visita: T; n: number }>()
  for (const v of visitas) {
    const atual = conta.get(v.barId)
    conta.set(v.barId, { visita: atual?.visita ?? v, n: (atual?.n ?? 0) + 1 })
  }
  return [...conta.values()].sort((a, b) => b.n - a.n)
}
