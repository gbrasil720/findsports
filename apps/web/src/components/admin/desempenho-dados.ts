import { useQuery } from '@tanstack/react-query'
import { useTRPC } from '@/utils/trpc'
import {
  type AnalyticsOverviewData,
  formatInterestRate,
  getInterestRate
} from './admin-model'
import { type AnalyticsDateRange, getAnalyticsRange } from './analytics-period'
import { getMetric, type MetricId } from './metric-glossary'

/*
 * Dados do Desempenho (Rodada 3): a página `/admin/desempenho` e o
 * "Desempenho do bar" de Hoje leem daqui a mesma consulta
 * (`commercialAnalytics.getMyAnalyticsOverview`) e fazem as mesmas contas,
 * para os dois lugares nunca mostrarem números diferentes.
 */

/** Os últimos 30 dias até hoje, em Brasília (o período padrão dos dois). */
export const ultimos30Dias = (now = new Date()) => getAnalyticsRange('30d', now)

export function useDesempenho(range: AnalyticsDateRange) {
  const trpc = useTRPC()
  return useQuery({
    ...trpc.commercialAnalytics.getMyAnalyticsOverview.queryOptions(range),
    meta: { errorToast: false }
  })
}

/** "+18%", "-4%", "0%"; `null` sem período anterior. */
export function variacaoPct(valor: number | null): string | null {
  if (valor === null) return null
  if (valor === 0) return '0%'
  return `${valor > 0 ? '+' : ''}${valor}%`
}

/**
 * Variação de uma taxa em pontos percentuais: sair de 8,3% para 12,1% é
 * "+3,8 p.p.", não "+46%".
 */
export function variacaoPp(
  atual: number | null,
  antes: number | null
): string | null {
  if (atual === null || antes === null) return null
  const diff = (atual - antes) * 100
  if (Math.abs(diff) < 0.05) return '0 p.p.'
  return `${diff > 0 ? '+' : ''}${diff.toFixed(1).replace('.', ',')} p.p.`
}

export type NumeroDesempenho = {
  metrica: MetricId
  rotulo: string
  valor: string
  /** A linha de apoio do número (`abriram 2.400 vezes no total`). */
  apoio: string
  /** Contra o período anterior; `null` quando não há (plano, "Tudo"). */
  variacao: string | null
}

const n = (valor: number) => valor.toLocaleString('pt-BR')

/** Os três números do bar: quem viu, quem se interessou e a taxa. */
export function numerosDoDesempenho(
  data: AnalyticsOverviewData
): NumeroDesempenho[] {
  // Pessoas dos dois lados (WEB-251): quem abriu WhatsApp e rota é uma
  // pessoa interessada, não duas.
  const taxa = getInterestRate(data.interestedPeople, data.uniqueVisitors)
  const taxaAntes =
    data.interestedPeoplePrev !== null && data.uniqueVisitorsPrev !== null
      ? getInterestRate(data.interestedPeoplePrev, data.uniqueVisitorsPrev)
      : null
  return [
    {
      metrica: 'reach',
      rotulo: getMetric('reach').label,
      valor: n(data.uniqueVisitors),
      apoio: `abriram ${n(data.profileViews)} ${data.profileViews === 1 ? 'vez' : 'vezes'} no total`,
      variacao: variacaoPct(data.uniqueVisitorsChange)
    },
    {
      metrica: 'interest',
      rotulo: getMetric('interest').label,
      valor: n(data.interestedPeople),
      apoio: 'abriram WhatsApp, rota ou telefone',
      variacao: variacaoPct(data.interestedPeopleChange)
    },
    {
      metrica: 'interestRate',
      rotulo: getMetric('interestRate').label,
      valor: formatInterestRate(
        data.interestedPeople,
        data.uniqueVisitors
      ).replace('.', ','),
      apoio: 'de quem viu seu bar',
      variacao: variacaoPp(taxa, taxaAntes)
    }
  ]
}

export type DiaDesempenho = { date: string; views: number; actions: number }

/**
 * A série da "Atividade diária": aberturas do perfil e, juntos, WhatsApp,
 * rota e telefone. Canal que o plano não vê vem nulo e conta zero.
 */
export function serieDiaria(data: AnalyticsOverviewData): DiaDesempenho[] {
  const porDia = (lista: { date: string; value: number }[] | null) =>
    new Map(lista?.map((p) => [p.date, p.value]))
  const wa = porDia(data.dailyWhatsappOpened)
  const rota = porDia(data.dailyDirectionsOpened)
  const tel = porDia(data.dailyPhoneClicked)
  return (data.dailyProfileViews ?? []).map(({ date, value }) => ({
    date,
    views: value,
    actions: (wa.get(date) ?? 0) + (rota.get(date) ?? 0) + (tel.get(date) ?? 0)
  }))
}
