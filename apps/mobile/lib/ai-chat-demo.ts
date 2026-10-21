import type { SearchBar } from '@/components/explore'

/*
 * Pior caso da busca com IA (2h), só para o navegador DEV
 * (`/busca-ia?demo=pior`): a conversa nasce daqui, sem chamar o modelo.
 * Pergunta no teto de 300 caracteres, resposta no teto de 600, etiquetas
 * demais, nome de bar comprido, bar sem foto, sem gasto médio e sem nota, oito
 * bares e uma troca sem nenhum.
 */

const hour = 3_600_000
const bar = (
  i: number,
  name: string,
  neighborhood: string,
  extra: Partial<SearchBar> = {}
) =>
  ({
    id: `00000000-0000-4000-8000-00000000000${i}`,
    name,
    neighborhood,
    city: 'São Paulo',
    latitude: String(-23.556 - i * 0.002),
    longitude: String(-46.69 + i * 0.002),
    photo_url: null,
    created_at: new Date(Date.now() - 400 * 24 * hour).toISOString(),
    distance_km: 0.3 + i * 1.7,
    plan: i % 3 === 0 ? 'pro' : 'starter',
    event_count: 1,
    rating: i % 2 ? { positive: 87, total: 100, percentage: 87 } : null,
    averageSpendCents: i % 4 === 1 ? null : 4000 + i * 1500,
    amenities: [1, 4],
    goingCount: null,
    goingInitials: [],
    nextEvent: {
      id: `ev-${i}`,
      championship: 'Campeonato Brasileiro Série A',
      startsAt: new Date(Date.now() + (i - 1) * hour).toISOString(),
      endsAt: null,
      sport: { name: 'Futebol', slug: 'futebol' },
      participants: [
        { team: { name: 'Atlético Mineiro', logoUrl: null } },
        { team: { name: 'Red Bull Bragantino', logoUrl: null } }
      ],
      participantFreeText: null,
      classic: null
    },
    ...extra
  }) as SearchBar

export const WORST_BARS: SearchBar[] = [
  bar(
    1,
    'Bar e Restaurante Esquina do Torcedor Apaixonado',
    'Jardim Paulistano'
  ),
  bar(2, 'Zé', 'Vila Madalena'),
  bar(3, 'Boteco Sete', 'Cerqueira César', {
    nextEvent: undefined
  }),
  bar(
    4,
    'Empório Matilde · Cervejaria Artesanal & Petiscaria',
    'Alto de Pinheiros'
  ),
  bar(5, 'Casa 92', 'Pinheiros'),
  bar(6, 'Copo Sujo', 'Vila Beatriz'),
  bar(7, 'Rede Alta', 'Sumarezinho'),
  bar(8, 'Aspicuelta 40', 'Vila Madalena')
]

export const WORST_QUESTION =
  'Oi! Quero ver o jogo do Galo contra o Bragantino hoje à noite com uns oito amigos, de preferência num lugar com telão grande, som do jogo ligado, área externa coberta porque pode chover, que aceite cachorro, tenha estacionamento e cozinha até tarde, perto de Pinheiros ou da Vila Madalena, e que não seja caro'

export const WORST_ANSWER =
  'Achei oito bares passando **Atlético Mineiro × Red Bull Bragantino** hoje à noite com telão e área externa. O mais perto é o **Bar e Restaurante Esquina do Torcedor Apaixonado**, a 300 m, com som do jogo ligado; o **Empório Matilde** aceita cachorro e tem estacionamento, mas fecha a cozinha às 23h. Nenhum deles marcou área coberta, então vale levar guarda-chuva se a previsão de chuva se confirmar no fim da tarde de hoje.'

export const WORST_CHIPS = [
  'Atlético-MG',
  'Red Bull Bragantino',
  'Campeonato Brasileiro Série A',
  'Hoje',
  'Telão',
  'Som do jogo',
  'Área externa',
  'Área coberta',
  'Pet friendly',
  'Estacionamento',
  'Cozinha até tarde',
  'Vila Madalena',
  'até 10 km'
]
