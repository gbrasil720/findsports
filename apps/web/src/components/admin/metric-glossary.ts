/**
 * Glossário das métricas do painel do bar.
 *
 * O painel fala com dono de bar, não com analista: o rótulo tem que ser
 * entendido de relance e o texto aqui carrega a definição precisa, o porquê
 * de importar e — quando o dado não prova o que parece provar — a ressalva.
 *
 * Nomes internos (`whatsapp_opened`, "intenção comercial" etc.) continuam no
 * backend; a tradução vive só nesta camada.
 */

export type MetricId =
  | 'reach'
  | 'interest'
  | 'interestRate'
  | 'channels'
  | 'mainAction'
  | 'periodComparison'
  | 'eventPerformance'
  | 'profileReadiness'

export type MetricDefinition = {
  /** Rótulo mostrado na interface. */
  label: string
  /** Explicação aberta pelo ⓘ. */
  definition: string
}

export const METRIC_GLOSSARY: Record<MetricId, MetricDefinition> = {
  reach: {
    label: 'Pessoas que viram seu bar',
    definition:
      'Quantas pessoas diferentes abriram a página do seu bar no período. Se a mesma pessoa voltar várias vezes, ela conta uma vez só — o total de aberturas aparece logo abaixo.'
  },
  interest: {
    label: 'Se interessaram',
    definition:
      'Pessoas que abriram seu WhatsApp, traçaram a rota até o bar ou foram ligar. Não garante que apareceram, mas é o sinal mais forte de quem estava decidindo.'
  },
  interestRate: {
    label: 'Taxa de interesse',
    definition:
      'De cada 100 pessoas que viram seu bar, quantas se interessaram. É o número que mostra se o seu perfil convence — foto, descrição e jogos cadastrados mexem direto nele.'
  },
  channels: {
    label: 'Como te procuraram',
    definition:
      'Por onde as pessoas interessadas tentaram chegar até você. Serve pra saber onde vale investir atenção: se quase tudo vem por WhatsApp, é lá que você precisa responder rápido.'
  },
  mainAction: {
    label: 'Mais usado',
    definition:
      'O caminho que mais gente escolheu pra falar com seu bar ou chegar até ele no período.'
  },
  periodComparison: {
    label: 'Comparado com os 30 dias anteriores',
    definition:
      'Os mesmos números do período anterior, lado a lado, pra você ver o que subiu e o que caiu. Aparece quando já existe histórico suficiente.'
  },
  eventPerformance: {
    label: 'Como cada jogo foi',
    definition:
      'Quantas pessoas viram seu bar e se interessaram a partir de cada jogo cadastrado. Mostra quais jogos puxam público — e quais não valem a vaga na grade.'
  },
  profileReadiness: {
    label: 'O que falta no seu perfil',
    definition:
      'Checklist do que ainda está vazio no seu cadastro. Perfil incompleto aparece pior nas buscas e dá menos motivo pro torcedor escolher seu bar.'
  }
}

export function getMetric(id: MetricId): MetricDefinition {
  return METRIC_GLOSSARY[id]
}
