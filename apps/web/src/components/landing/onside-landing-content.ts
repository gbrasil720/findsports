type NavItem = { id: string; label: string; href: string }
type ProblemItem = { id: string; number: string; title: string; body: string }
type DefinitionPoint = { id: string; number: string; text: string }
export type JourneyStep = {
  id: string
  number: string
  title: string
  body: string
  variant: 'search' | 'compare' | 'arrival'
}
type OccasionItem = {
  id: string
  number: string
  title: string
  tag: string
  highlight?: boolean
}
type FaqItem = { id: string; question: string; answer: string }
export type HeroBar = {
  name: string
  meta: string
  tone: 'paper' | 'ink' | 'acid'
  live?: boolean
}

/**
 * Texto da landing v2 (WEB-333): o do desenho com o produto já no ar, com as
 * frases de pré-lançamento passadas para o presente. No FAQ, as respostas que
 * a produção já tinha (WEB-232) valem sobre as do desenho.
 * Título com trecho em destaque fica em pedaços: `[antes, destaque, depois]`.
 */
export const LANDING_COPY = {
  primaryCta: 'Entrar / Criar conta',
  proof: [
    'Grátis para torcedores',
    'Sem e-mails promocionais',
    'Grade confirmada pelos bares'
  ],
  hero: {
    eyebrow: 'Onside · no ar nas primeiras cidades',
    title: [
      '“Onde vai passar o jogo?” finalmente tem uma',
      '(ótima)',
      'resposta.'
    ],
    body: 'Com a Onside, você vai encontrar bares com a melhor infraestrutura para chamar seus amigos e assistir ao jogo, comparando localização e preço antes de sair de casa.',
    ctaLead:
      'Acesse o app gratuitamente e encontre o bar perfeito para assistir ao seu próximo jogo',
    secondaryCta: 'Como funciona',
    hint: 'Arraste para girar · passe o mouse pelos bares'
  },
  problem: {
    kicker: 'O problema',
    title:
      'Google Maps e Instagram não mostram como o lugar realmente é em dia de jogo.'
  },
  solution: {
    kicker: 'Escolha com confiança',
    // Texto do copywriter, palavra por palavra. O segundo trecho de cada
    // lista é o destaque: "antes" no título, e o negrito no corpo e no fecho.
    title: [
      'Garanta que a experiência vai ser boa',
      'antes',
      'de convidar a galera.'
    ],
    body: [
      'Com a Onside você',
      'não precisa arriscar.',
      'Aqui, você escolhe um bar já sabendo:'
    ],
    closing: [
      'Tudo pensado para que, quando o convite seja feito, você tenha a certeza de que escolheu',
      'o lugar perfeito.'
    ]
  },
  journey: {
    kicker: 'Como funciona',
    title: 'Tudo isso seguindo apenas três passos simples.',
    searchPlaceholder: 'Qual jogo você quer ver?',
    searchTyped: 'Flamengo × Palmeiras'
  },
  variety: {
    kicker: 'Um lugar para cada ocasião',
    title: 'Encontre o espaço certo para o seu jeito de torcer.',
    body: 'Às vezes você até conhece um bom lugar para ver o jogo, mas ele é caro ou distante demais para alguém. Não importa se você procura o barato, o animado ou o mais tranquilo: a Onside ajuda a comparar as opções antes de sair.'
  },
  community: {
    kicker: 'O esporte é encontro',
    title: [
      'O esporte é, e sempre foi, sobre viver momentos bons ao lado de quem tem o',
      'mesmo espírito torcedor.'
    ],
    body: 'O jogo no estádio é um evento raro. Por que esperar por ele para viver esses momentos, se você pode encontrar o bar certo e chamar os seus amigos?'
  },
  story: {
    kicker: 'De torcedor para torcedor',
    title: ['Foi exatamente por isso que a gente criou a', 'Onside.'],
    body: 'O esporte para nós é sagrado. Só que assistir ao jogo em casa toda vez perde a graça. Somos torcedores como você, cansados de abrir o Google Maps na esperança de encontrar um bom lugar e acabar vendo em casa outra vez.',
    closing:
      'A Onside é para quem quer assistir ao esporte fora de casa e com os amigos.'
  },
  faq: {
    kicker: 'Dúvidas frequentes',
    title: ['O que você precisa', 'saber antes de sair de casa.']
  },
  final: {
    kicker: 'ONSIDE · O jogo é aqui',
    title: ['Onde vai passar o próximo jogo?', 'A resposta está aqui.'],
    proof: [
      'Grátis',
      'Sem e-mails promocionais',
      'Grade confirmada pelos bares'
    ]
  },
  sticky: 'Grátis para torcedores',
  footerStatus: 'No ar nas primeiras cidades'
} as const

export const NAV_ITEMS: NavItem[] = [
  { id: 'produto', label: 'A Onside', href: '#produto' },
  { id: 'como-funciona', label: 'Como funciona', href: '#como-funciona' },
  { id: 'duvidas', label: 'Dúvidas', href: '#duvidas' }
]

/**
 * Os seis bares do hero, na ordem da cena (`BARS` em `onside-scenes.ts`).
 * São fictícios: os nomes vêm dos mocks do desenho.
 */
export const HERO_BARS: HeroBar[] = [
  { name: 'Bar do Zé', meta: 'Pinheiros · 3 telões · $$', tone: 'paper' },
  {
    name: 'Sports Central',
    meta: "Ao vivo · 74' · Vila Madalena",
    tone: 'ink',
    live: true
  },
  { name: 'The Red Lion', meta: 'Itaim · Torcida rubro-negra', tone: 'acid' },
  { name: 'Casa da Torcida', meta: 'Telão · comida · $$', tone: 'paper' },
  { name: 'Espaço Central', meta: 'Ambiente esportivo · $', tone: 'acid' },
  {
    name: 'Bar Exemplo',
    meta: 'Ao vivo · som no jogo · $$',
    tone: 'ink',
    live: true
  }
]

export const TICKER_BENEFITS = [
  'Busque pelo jogo',
  'Compare o ambiente',
  'Confira infraestrutura e preço',
  'Chame a galera'
] as const

export const PROBLEM_ITEMS: ProblemItem[] = [
  {
    id: 'p1',
    number: '01',
    title: 'Fotos avulsas e desatualizadas.',
    body: 'As imagens mostram o ambiente, mas raramente mostram como ele funciona em dia de jogo.'
  },
  {
    id: 'p2',
    number: '02',
    title: 'Avaliações que não respondem sua dúvida.',
    body: 'Elas falam da comida, dos preços e do atendimento, mas quase nada sobre a experiência durante uma partida.'
  },
  {
    id: 'p3',
    number: '03',
    title: 'No fim, falta confiança.',
    body: 'Você não sabe se o lugar combina com o jogo e decide assistir em casa de novo.'
  }
]

export const DEFINITION_POINTS: DefinitionPoint[] = [
  {
    id: 'd1',
    number: '01',
    text: 'Se tem infraestrutura.'
  },
  {
    id: 'd2',
    number: '02',
    text: 'O preço médio do cardápio.'
  },
  {
    id: 'd3',
    number: '03',
    text: 'Como vai estar no dia do jogo.'
  }
]

export const JOURNEY_STEPS: JourneyStep[] = [
  {
    id: 'j1',
    number: '01',
    title: 'Busque seu jogo.',
    body: 'Procure por time, campeonato ou esporte.',
    variant: 'search'
  },
  {
    id: 'j2',
    number: '02',
    title: 'Compare o ambiente.',
    body: 'Veja distância, infraestrutura, preço médio, telões e perfil da torcida.',
    variant: 'compare'
  },
  {
    id: 'j3',
    number: '03',
    title: 'Vá sabendo o que esperar.',
    body: 'Escolha o bar, chame a galera e confira quando a informação foi atualizada.',
    variant: 'arrival'
  }
]

export const OCCASION_ITEMS: OccasionItem[] = [
  { id: 'o1', number: '01', title: 'O barato', tag: 'Preço médio $' },
  {
    id: 'o2',
    number: '02',
    title: 'O animado',
    tag: 'Som no jogo · torcida',
    highlight: true
  },
  { id: 'o3', number: '03', title: 'O mais tranquilo', tag: 'Ambiente calmo' }
]

export const FAQ_ITEMS: FaqItem[] = [
  {
    id: 'f1',
    question: 'A Onside já funciona na minha cidade?',
    answer:
      'O cadastro está aberto para torcedores e bares de qualquer cidade. Os bares aparecem na busca conforme se cadastram, então a quantidade de opções varia de um lugar para outro.'
  },
  {
    id: 'f2',
    question: 'A Onside é gratuita para torcedores?',
    answer:
      'Sim. Buscar partidas, comparar bares e consultar as informações é gratuito para torcedores.'
  },
  {
    id: 'f3',
    question: 'O que posso comparar?',
    answer:
      'A infraestrutura do bar, o preço médio, a distância e as partidas transmitidas.'
  },
  {
    id: 'f4',
    question: 'É só para futebol?',
    answer:
      'Não. Futebol é o ponto de partida, mas a busca inclui basquete, vôlei, automobilismo, lutas e outros eventos.'
  },
  {
    id: 'f6',
    question: 'O que acontece com meus dados?',
    answer:
      'Usamos seu e-mail para criar a conta e confirmar o cadastro. Os detalhes estão na Política de Privacidade.'
  }
]
