type NavItem = { id: string; label: string; href: string }
export type TickerLiveItem = {
  id: string
  timeLabel: string
  event: string
  place: string
}
type TickerBenefitItem = { id: string; text: string }
type ProblemItem = { id: string; number: string; title: string; body: string }
type DefinitionPoint = { id: string; number: string; text: string }
export type JourneyStep = {
  id: string
  number: string
  title: string
  body: string
  variant: 'search' | 'compare' | 'arrival'
  reverse?: boolean
}
type TrustItem = { id: string; number: string; title: string; body: string }
type FaqItem = { id: string; question: string; answer: string }

export const NAV_ITEMS: NavItem[] = [
  { id: 'produto', label: 'A Onside', href: '#produto' },
  { id: 'como-funciona', label: 'Como funciona', href: '#como-funciona' },
  { id: 'bares', label: 'Para bares', href: '#bares' },
  { id: 'duvidas', label: 'Dúvidas', href: '#duvidas' }
]

export const TICKER_BENEFITS: TickerBenefitItem[] = [
  { id: 'b1', text: 'BUSQUE PELO JOGO' },
  { id: 'b2', text: 'COMPARE O AMBIENTE' },
  { id: 'b3', text: 'VEJA QUANDO A GRADE FOI ATUALIZADA' },
  { id: 'b4', text: 'CADASTRE SUA CIDADE' }
]

export const PROBLEM_ITEMS: ProblemItem[] = [
  {
    id: 'p1',
    number: '01',
    title: 'Você encontra o bar, não a transmissão.',
    body: 'O Google mostra endereço e horário, mas não confirma qual partida estará no telão ou se haverá som.'
  },
  {
    id: 'p2',
    number: '02',
    title: 'Os stories somem antes da rodada.',
    body: 'A programação fica espalhada e quase nunca explica lotação, estrutura ou perfil da torcida.'
  },
  {
    id: 'p3',
    number: '03',
    title: 'A dúvida só acaba quando você chega.',
    body: 'Lotado, sem som ou em outro jogo: hoje, a confirmação vem tarde demais.'
  }
]

export const DEFINITION_POINTS: DefinitionPoint[] = [
  {
    id: 'd1',
    number: '01',
    text: 'A partida exata, não apenas “passa futebol”.'
  },
  {
    id: 'd2',
    number: '02',
    text: 'A grade publicada pelo bar, com data de atualização.'
  },
  {
    id: 'd3',
    number: '03',
    text: 'Sem confirmação recente? A interface mostra a dúvida.'
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
    body: 'Veja distância, lotação informada, som, telões e perfil da torcida.',
    variant: 'compare',
    reverse: true
  },
  {
    id: 'j3',
    number: '03',
    title: 'Vá sabendo o que esperar.',
    body: 'Escolha o bar, chame a galera e confira quando a informação foi atualizada.',
    variant: 'arrival'
  }
]

export const BAR_BENEFITS = [
  'Publique a programação da semana em um só lugar.',
  'Atualize estrutura e lotação quando necessário.',
  'Seja encontrado por jogo e distância.'
] as const

export const TRUST_ITEMS: TrustItem[] = [
  {
    id: 't1',
    number: '01',
    title: 'Grade publicada pela casa.',
    body: 'O bar informa o evento específico e a estrutura prevista.'
  },
  {
    id: 't2',
    number: '02',
    title: 'Confirmação de quem está lá.',
    body: 'A comunidade poderá atualizar som, lotação e transmissão.'
  },
  {
    id: 't3',
    number: '03',
    title: 'Horário sempre visível.',
    body: 'Cada informação mostra quando foi publicada ou confirmada.'
  }
]

export const FAQ_ITEMS: FaqItem[] = [
  {
    id: 'f1',
    question: 'A Onside já funciona na minha cidade?',
    answer:
      'Ainda não. Estamos medindo a demanda de torcedores e a adesão de bares para escolher as primeiras cidades do piloto.'
  },
  {
    id: 'f2',
    question: 'A Onside será gratuita para torcedores?',
    answer:
      'Sim. Buscar partidas, comparar bares e consultar a grade será gratuito para quem assiste.'
  },
  {
    id: 'f3',
    question: 'Como vou saber se a informação está atualizada?',
    answer:
      'A proposta é mostrar quem publicou ou confirmou a informação e quando isso aconteceu. Sem confirmação recente, a interface deve deixar a dúvida visível.'
  },
  {
    id: 'f4',
    question: 'É só para futebol?',
    answer:
      'Não. Futebol será o ponto de partida, mas a mesma busca pode incluir basquete, vôlei, automobilismo, lutas e outros eventos.'
  },
  {
    id: 'f5',
    question: 'Como funciona para bares?',
    answer:
      'O bar manifesta interesse no piloto e informa a casa, a cidade e um contato. Quando a operação avançar naquela região, a Onside entra em contato com os próximos passos.'
  },
  {
    id: 'f6',
    question: 'Como as primeiras cidades serão escolhidas?',
    answer:
      'Pela combinação entre demanda de torcedores e bares interessados. Por isso os dois formulários pedem a cidade.'
  },
  {
    id: 'f7',
    question: 'O que acontece com meus dados?',
    answer:
      'Usamos os dados para registrar o interesse e avisar sobre o lançamento pelo e-mail informado.'
  }
]
