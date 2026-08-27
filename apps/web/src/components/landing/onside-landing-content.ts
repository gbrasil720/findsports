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
type FaqItem = { id: string; question: string; answer: string }

export const LANDING_COPY = {
  primaryCta: 'Quero a Onside na minha cidade',
  hero: {
    eyebrow: 'A Onside está chegando',
    title: '“Onde vai passar o jogo?” finalmente tem uma (ótima) resposta.',
    body: 'Com a Onside, você vai encontrar bares com a infraestrutura certa para chamar seus amigos e assistir ao jogo, comparando localização e preço antes de sair de casa.',
    note: 'Cadastre sua cidade e seu e-mail. Você será avisado no lançamento.'
  },
  problem: {
    kicker: 'O problema',
    title:
      'Google Maps e Instagram não mostram como o lugar realmente é em dia de jogo.'
  },
  solution: {
    kicker: 'Escolha com confiança',
    title: 'Garanta que a experiência vai ser boa antes de convidar a galera.',
    body: 'Com a Onside, você não vai precisar arriscar. No lançamento, poderá escolher um bar conhecendo os detalhes que importam para o seu rolê.',
    closing:
      'Tudo pensado para você convidar a galera com mais confiança de que escolheu o lugar certo.'
  },
  journey: {
    kicker: 'Como vai funcionar',
    title: 'Tudo isso seguindo apenas três passos simples.'
  },
  variety: {
    kicker: 'Um lugar para cada ocasião',
    title: 'Encontre o espaço certo para o seu jeito de torcer.',
    body: 'Às vezes você até conhece um bom lugar para ver o jogo, mas ele é caro ou distante demais para alguém. Não importa se você procura o barato, o animado ou o mais tranquilo: a Onside vai ajudar a comparar as opções antes de sair.'
  },
  community: {
    kicker: 'O esporte é encontro',
    title:
      'O esporte é, e sempre foi, sobre viver momentos bons ao lado de quem tem o mesmo espírito torcedor.',
    body: 'O jogo no estádio é um evento raro. Por que esperar por ele para viver esses momentos, se você pode encontrar o bar certo e chamar os seus amigos?'
  },
  story: {
    kicker: 'De torcedor para torcedor',
    title: 'Foi exatamente por isso que a gente criou a Onside.',
    body: 'O esporte para nós é sagrado. Só que assistir ao jogo em casa toda vez perde a graça. Somos torcedores como você, cansados de abrir o Google Maps na esperança de encontrar um bom lugar e acabar vendo em casa outra vez.',
    closing:
      'A Onside está sendo criada para quem quer assistir ao esporte fora de casa e com os amigos.'
  },
  waitlist: {
    kicker: 'Ajude a Onside a chegar',
    title: 'Leve a Onside à sua cidade.',
    body: 'A demanda dos torcedores vai ajudar a definir as primeiras cidades. Cadastre sua cidade e seu e-mail para ser avisado no lançamento.'
  },
  final: {
    kicker: 'O jogo é aqui',
    title: 'Onde vai passar o próximo jogo? A resposta está chegando.'
  }
} as const

export const NAV_ITEMS: NavItem[] = [
  { id: 'produto', label: 'A Onside', href: '#produto' },
  { id: 'como-funciona', label: 'Como funciona', href: '#como-funciona' },
  { id: 'duvidas', label: 'Dúvidas', href: '#duvidas' }
]

export const TICKER_BENEFITS: TickerBenefitItem[] = [
  { id: 'b1', text: 'BUSQUE PELO JOGO' },
  { id: 'b2', text: 'COMPARE O AMBIENTE' },
  { id: 'b3', text: 'CONFIRA INFRAESTRUTURA E PREÇO' },
  { id: 'b4', text: 'CADASTRE SUA CIDADE' }
]

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
    text: 'Se o bar tem a infraestrutura que você procura.'
  },
  {
    id: 'd2',
    number: '02',
    text: 'O preço médio para escolher sem surpresa.'
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

export const FAQ_ITEMS: FaqItem[] = [
  {
    id: 'f1',
    question: 'A Onside já funciona na minha cidade?',
    answer:
      'Ainda não. Estamos registrando a demanda dos torcedores e preparando os primeiros bares para definir as cidades do lançamento.'
  },
  {
    id: 'f2',
    question: 'A Onside será gratuita para torcedores?',
    answer:
      'Sim. Buscar partidas, comparar bares e consultar as informações será gratuito para torcedores.'
  },
  {
    id: 'f3',
    question: 'O que poderei comparar?',
    answer:
      'A proposta para o lançamento é mostrar a infraestrutura do bar, o preço médio, a distância e as partidas transmitidas.'
  },
  {
    id: 'f4',
    question: 'É só para futebol?',
    answer:
      'Não. Futebol será o ponto de partida, mas a busca poderá incluir basquete, vôlei, automobilismo, lutas e outros eventos.'
  },
  {
    id: 'f5',
    question: 'Como as primeiras cidades serão escolhidas?',
    answer:
      'Vamos avaliar a demanda registrada por torcedores e a disponibilidade dos bares abordados pela nossa equipe em cada cidade.'
  },
  {
    id: 'f6',
    question: 'O que acontece com meus dados?',
    answer:
      'Usamos sua cidade para avaliar a demanda e seu e-mail para confirmar o cadastro e avisar sobre o lançamento.'
  }
]
