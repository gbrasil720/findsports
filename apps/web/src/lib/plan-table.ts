import { STARTER_EVENT_LIMIT } from '@findsports_oficial/api/lib/plan-limits'

/**
 * Valor de uma célula da tabela "Tudo que muda entre os planos" (`/plan`):
 * `sim` vira o check, `nao` o traço, `breve` o selo "em breve"; texto é texto.
 */
export type PlanTableCell = 'sim' | 'nao' | 'breve' | (string & {})

export type PlanTableRow = {
  label: string
  /** Starter, Pro e Elite, nessa ordem. */
  values: readonly [PlanTableCell, PlanTableCell, PlanTableCell]
}

/**
 * A tabela do design (Bar Web, tela 3h) conferida com `PLAN_CATALOG`: o que
 * cada plano tem é o que o catálogo lista em `features` e `profilePerks`. Onde
 * o desenho divergia do catálogo, vale o catálogo (a capa em destaque é do
 * Pro também). O teste ao lado amarra os "em breve" aos itens `soon`.
 */
export const PLAN_TABLE: readonly {
  group: string
  rows: readonly PlanTableRow[]
}[] = [
  {
    group: 'Agenda',
    rows: [
      {
        label: 'Jogos na agenda',
        values: [`${STARTER_EVENT_LIMIT} por ciclo`, 'Ilimitados', 'Ilimitados']
      }
    ]
  },
  {
    group: 'Busca e mapa',
    rows: [
      {
        label: 'Aparece nas buscas',
        values: [
          'Básicas',
          'Destaque por time e liga',
          'Destaque por time e liga'
        ]
      },
      { label: 'Topo da busca em clássicos', values: ['nao', 'nao', 'sim'] },
      {
        label: 'Pin no mapa',
        values: ['Padrão', 'Destacado', 'Exclusivo Elite']
      }
    ]
  },
  {
    group: 'Perfil do bar',
    rows: [
      {
        label: 'Agenda, rota, WhatsApp e foto de capa',
        values: ['sim', 'sim', 'sim']
      },
      { label: 'Selo no perfil', values: ['nao', 'Pro', 'Elite no topo'] },
      {
        label: 'Capa em destaque, o dobro da altura',
        values: ['nao', 'sim', 'sim']
      },
      {
        label: 'Link do cardápio e preço médio',
        values: ['nao', 'sim', 'sim']
      },
      {
        label: 'Galeria de fotos do ambiente',
        values: ['nao', 'breve', 'breve']
      },
      { label: 'Promoções no perfil', values: ['nao', 'breve', 'breve'] }
    ]
  },
  {
    group: 'Vou assistir',
    rows: [
      { label: 'Lista de quem vai assistir', values: ['nao', 'nao', 'sim'] },
      {
        label: 'Oferta da casa para quem chega pela Onside',
        values: ['nao', 'nao', 'sim']
      }
    ]
  },
  {
    group: 'Analytics',
    rows: [
      { label: 'Histórico', values: ['30 dias', '12 meses', 'Completo'] },
      {
        label: 'Desempenho por jogo',
        values: ['Básico', 'Completo', 'Completo']
      },
      {
        label: 'Funil de rota, telefone e WhatsApp',
        values: ['nao', 'sim', 'sim']
      },
      {
        label: 'Comparação',
        values: ['Período anterior', 'Entre jogos', 'Avançada']
      },
      { label: 'Inteligência avançada', values: ['nao', 'nao', 'sim'] }
    ]
  },
  {
    group: 'Suporte',
    rows: [{ label: 'Suporte por e-mail', values: ['sim', 'sim', 'sim'] }]
  }
]
