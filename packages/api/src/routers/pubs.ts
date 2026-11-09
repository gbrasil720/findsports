import {
  and,
  asc,
  db,
  desc,
  eq,
  inArray,
  isNotNull,
  notInArray,
  or,
  sql
} from '@findsports_oficial/db'
import { fold } from '@findsports_oficial/db/catalog/fold'
import {
  brasiliaDay,
  DEFAULT_EVENT_DURATION_MS
} from '@findsports_oficial/db/event-window'
import {
  brasiliaDaySql,
  brasiliaTodaySql,
  eventNotEndedSql,
  onBrasiliaDaysSql,
  utcNowSql
} from '@findsports_oficial/db/event-window-sql'
import { user } from '@findsports_oficial/db/schema/auth'
import {
  bar,
  sport,
  subscription,
  type TeamKind,
  team,
  userFavoriteBars,
  userFavoriteTeams,
  userPreferenceSports
} from '@findsports_oficial/db/schema/platform'
import { recommendationEvent } from '@findsports_oficial/db/schema/recommendation'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'

import {
  fanProcedure,
  protectedProcedure,
  publicProcedure,
  router
} from '../index'
import {
  declaredAmenityIds,
  HOUSE_OFFER_AMENITY_ID,
  MAX_AMENITY_FILTER,
  normalizeAmenityIds
} from '../lib/amenities'
import { getAppConfig } from '../lib/app-config'
import {
  type FanAttendance,
  type Going,
  readFanAttendance,
  readFriendsGoing,
  readGoing
} from '../lib/attendance'
import { resolvePublicGallery } from '../lib/bar-gallery'
import { canShowBarMenu, resolvePublicBarMenu } from '../lib/bar-menu'
import { readBarsWithoutGame } from '../lib/bars-without-game'
import { readCheckIn } from '../lib/check-in'
import { normalizarCidade } from '../lib/city-match'
import {
  getSubscriptionStanding,
  issuesCounterCode,
  type SubscriptionStanding
} from '../lib/current-plan'
import { resolveEventScreen } from '../lib/event-screen'
import {
  favoriteTeamIdsSchema,
  replaceFavoriteTeams
} from '../lib/favorite-teams'
import { readGameBoard } from '../lib/game-board'
import { byMatchOrder, gameTitle } from '../lib/game-participants'
import { effectiveHouseOffer } from '../lib/house-offer'
import { decodeCursor, encodeCursor } from '../lib/keyset-cursor'
import { isOpenNow, normalizeOpeningHours } from '../lib/opening-hours'
import {
  executarBuscaEmCamadas,
  executarBuscaLinear,
  executarBuscaPorNota,
  jogoNaoAcabou,
  type LinhaBusca,
  montarFiltrosBusca,
  montarPaginaBusca,
  type SearchPage
} from '../lib/pub-search'
import { PUBLIC_BAR_COLUMNS } from '../lib/public-bar'
import {
  hasPublicRating,
  RATING_PUBLIC_FLOOR,
  ratingPercentage
} from '../lib/rating'
import { readRatingList, readReasonSummary } from '../lib/rating-list'
import { starsAverage } from '../lib/rating-review'
import { chaveBusca, chaveBuscaLocal } from '../lib/search-cache'
import {
  findSearchCity,
  searchCityColumns,
  searchCitySchema,
  suggestSearchCities
} from '../lib/search-city'
import { searchRadiusKmSchema } from '../lib/search-radius'
import { createTtlCache } from '../lib/ttl-cache'
import { utcIso } from '../lib/utc-timestamp'

/**
 * ESC-08: catálogos e buscas são iguais para todo mundo. O cache vive na
 * instância. Nada derivado de sessão entra aqui.
 */
const CATALOGO_TTL_MS = 5 * 60_000
/** Jogos em destaque e busca dependem de NOW(); janela curta. */
const BUSCA_TTL_MS = 60_000

/**
 * WEB-284: `ORDER BY name` segue a collation do banco; numa collation de
 * bytes "PSG" sai antes de "Palmeiras" e acento vai para o fim. Ordenar aqui
 * não depende de como o banco foi criado.
 */
const porNome = (a: { name: string }, b: { name: string }) =>
  a.name.localeCompare(b.name, 'pt-BR')

/** O que a tela de escolha precisa de um time; o resto da linha fica no servidor. */
const TEAM_COLUMNS = {
  id: team.id,
  sportId: team.sportId,
  name: team.name,
  kind: team.kind,
  isNationalTeam: team.isNationalTeam,
  // WEB-520: o GP da F1 desenha o traçado da pista pela chave do catálogo.
  catalogKey: team.catalogKey
}
const TEAM_SEARCH_LIMIT = 30

/**
 * Por que o bar do dono saiu do ar, para a prévia dele dizer a verdade: quem
 * só teve o teste do cadastro nunca contratou nada, então "a assinatura
 * terminou" seria falso. `null` cobre bar no ar e quem não é o dono.
 */
const ownerOffAirReason = (standing: SubscriptionStanding | null) =>
  standing === 'trial_ended'
    ? ('trial' as const)
    : standing === 'ended'
      ? ('subscription' as const)
      : null

const cacheEsportes = createTtlCache<(typeof sport.$inferSelect)[]>({
  ttlMs: CATALOGO_TTL_MS
})
/** Bares no ar por cidade (nome normalizado e UF), para ordenar as sugestões. */
const cacheBaresPorCidade = createTtlCache<Map<string, number>>({
  ttlMs: CATALOGO_TTL_MS
})
const cacheTimes = createTtlCache<
  {
    id: string
    sportId: string
    name: string
    kind: TeamKind
    isNationalTeam: boolean
    catalogKey: string | null
  }[]
>({
  ttlMs: CATALOGO_TTL_MS,
  maxEntries: 50
})
const cacheBusca = createTtlCache<SearchPage>({
  ttlMs: BUSCA_TTL_MS,
  maxEntries: 200
})
const cacheLocal = createTtlCache<LocationPage>({
  ttlMs: BUSCA_TTL_MS,
  maxEntries: 200
})

/** Última tupla de ordenação de `searchByLocation`: distância e id. */
const locationCursorSchema = z.object({
  d: z.number(),
  i: z.string()
})

type LocationBar = {
  id: string
  name: string
  neighborhood: string
  city: string
  latitude: string
  longitude: string
  photo_url: string | null
  created_at: string
  plan: 'starter' | 'pro' | 'elite'
  distance_km: number
}

type LocationPage = { bars: LocationBar[]; nextCursor: string | null }

type LocationInput = {
  lat: number
  lng: number
  radiusKm: number
  cursor?: string
  limit: number
}

async function executarBuscaLocal(input: LocationInput): Promise<LocationPage> {
  const { lat, lng, radiusKm, cursor, limit } = input
  const origin = sql`ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography`
  const radiusMeters = radiusKm * 1000

  // ESC-05: a chave de paginação usa o mesmo operador `<->` da ordenação,
  // e não `ST_Distance`, para não abrir mão da varredura ordenada pelo
  // índice GiST. `id` desempata bares equidistantes.
  const keyset = cursor ? decodeCursor(cursor, locationCursorSchema) : null
  const keysetFilter = keyset
    ? sql`AND (b.geo <-> ${origin}, b.id) > (${keyset.d}::float8, ${keyset.i}::text)`
    : sql``

  const results = await db.execute(sql`
    SELECT
      b.id,
      b.name,
      b.neighborhood,
      b.city,
      b.latitude,
      b.longitude,
      b.photo_url,
      b.created_at,
      b.plan,
      ST_Distance(b.geo, ${origin}) / 1000 AS distance_km,
      b.geo <-> ${origin} AS cursor_dist
    FROM bar b
    WHERE b.is_active
      AND ST_DWithin(b.geo, ${origin}, ${radiusMeters})
      ${keysetFilter}
    ORDER BY b.geo <-> ${origin}, b.id
    LIMIT ${limit}
  `)

  type RawLocationRow = {
    id: string
    name: string
    neighborhood: string
    city: string
    latitude: string
    longitude: string
    photo_url: string | null
    created_at: string
    plan: 'starter' | 'pro' | 'elite'
    distance_km: number
    cursor_dist: number
  }

  const rows = results.rows as RawLocationRow[]

  const bars = rows.map((row) => ({
    id: row.id,
    name: row.name,
    neighborhood: row.neighborhood,
    city: row.city,
    latitude: row.latitude,
    longitude: row.longitude,
    photo_url: row.photo_url,
    created_at: utcIso(row.created_at),
    plan: row.plan,
    distance_km: row.distance_km
  }))

  const last = rows.length === limit ? rows[rows.length - 1] : undefined

  return {
    bars,
    nextCursor: last ? encodeCursor({ d: last.cursor_dist, i: last.id }) : null
  }
}

/**
 * O que o card do bar lê da tabela `bar` depois do cache, numa consulta só:
 * o gasto médio declarado (WEB-144) e as características.
 *
 * O gasto segue a regra do perfil: só com Pro/Elite vigente pela assinatura
 * (`canShowBarMenu`), nunca por `bar.plan`, que só acompanha o fim do trial
 * uma vez por dia. Roda depois do cache pelo mesmo motivo da nota: um trial
 * que vence ou uma assinatura que vira `past_due` esconde o valor na hora, e
 * não um TTL depois.
 */
async function lerCartoes(ids: string[]) {
  const rows = ids.length
    ? await db
        .select({
          id: bar.id,
          averageSpendCents: bar.averageSpendCents,
          amenities: bar.amenities,
          subscription: {
            plan: subscription.plan,
            status: subscription.status,
            currentPeriodEnd: subscription.currentPeriodEnd
          }
        })
        .from(bar)
        .leftJoin(subscription, eq(subscription.barId, bar.id))
        .where(inArray(bar.id, ids))
    : []
  return new Map(
    rows.map((row) => [
      row.id,
      {
        averageSpendCents: canShowBarMenu(row.subscription)
          ? row.averageSpendCents
          : null,
        amenities: declaredAmenityIds(row.amenities)
      }
    ])
  )
}

/**
 * O card do bar (07 do design), completado depois do cache: o que muda sem
 * esperar o TTL. Gasto médio e características (`lerCartoes`), quantos
 * marcaram presença no próximo jogo e, nas linhas que têm nota, a exibição
 * pública dela (`rating.public_display`).
 *
 * A contagem segue o piso de "Vou assistir aqui" (`readGoing`): abaixo dele
 * sai `null`, e jogo vazio não vira número na tela; junto vão as iniciais de
 * quem vai. A nota sai depois do cache, e não dentro dele: desligar a
 * exibição costuma ser a reação a um problema, e uma página guardada
 * continuaria mostrando a nota por até um TTL.
 */
async function toBarCards<
  T extends {
    id: string
    nextEvent?: { id: string } | undefined
    /** Só as linhas que têm nota: a de `searchByLocation` não tem. */
    rating?: object | null
  }
>(bars: T[]) {
  const eventIds = bars.flatMap((achado) =>
    achado.nextEvent ? [achado.nextEvent.id] : []
  )
  const [cartoes, vao, notaPublica] = await Promise.all([
    lerCartoes(bars.map((achado) => achado.id)),
    readGoing(eventIds),
    getAppConfig('rating.public_display')
  ])
  return bars.map((achado) => {
    const cartao = cartoes.get(achado.id)
    const going = achado.nextEvent ? vao.get(achado.nextEvent.id) : undefined
    const nota =
      'rating' in achado && !notaPublica ? { ...achado, rating: null } : achado
    return {
      ...(nota as T),
      averageSpendCents: cartao?.averageSpendCents ?? null,
      amenities: cartao?.amenities ?? [],
      goingCount: going?.count ?? null,
      goingInitials: going?.initials ?? []
    }
  })
}

/** Por jogo, o que `pubs.pageViewer` devolve a quem entrou. */
type ViewerGames = Record<
  string,
  {
    attendance: FanAttendance | null
    friends: { name: string; image: string | null }[]
  }
>

/**
 * Quem abre o bar sem conta: um torcedor sem presença nem id. Nenhuma linha
 * tem `user_id` vazio, então nada dele é achado (presença, código, dono).
 */
const VISITOR = { id: '', role: 'fan' } as const

/** Teto da agenda do dia: é cenário de splash, não listagem. */
const TODAY_GAMES_LIMIT = 30

export const pubsRouter = router({
  /**
   * Os jogos de hoje nos bares no ar, para a splash do app (`apps/mobile`).
   * Aberta: aparece antes do login. Sai só o título e a hora do jogo, sem
   * identificar bar nenhum, e o mesmo jogo em vários bares conta uma vez,
   * com quantos bares o passam (a marca das telas de entrar do tablet) e se
   * está ao vivo em algum deles (o "● N ao vivo" da splash), pelo relógio do
   * jogo. "Hoje" é o dia de Brasília; `starts_at` é `timestamp` sem fuso, em UTC.
   */
  todayGames: publicProcedure.query(async () => {
    const games = await db.execute<{
      title: string
      starts_at: string
      bars: number
      live: boolean
    }>(sql`
      SELECT g.title, g.starts_at, count(DISTINCT g.bar_id)::int AS bars,
        bool_or(g.live) AS live
      FROM (
        SELECT
          ${gameTitle({
            id: sql`e.id`,
            participantFreeText: sql`e.participant_free_text`,
            championship: sql`e.championship`
          })} AS title,
          e.starts_at,
          e.bar_id,
          e.starts_at <= ${utcNowSql()} AND ${eventNotEndedSql('e')} AS live
        FROM event e
        JOIN bar b ON b.id = e.bar_id
        WHERE b.is_active
          AND e.published_at IS NOT NULL
          AND ${onBrasiliaDaysSql(sql`e.starts_at`, brasiliaTodaySql())}
      ) g
      GROUP BY g.title, g.starts_at
      ORDER BY g.starts_at, g.title
      LIMIT ${TODAY_GAMES_LIMIT}
    `)
    return games.rows.map((game) => ({
      title: game.title,
      startsAt: utcIso(game.starts_at),
      bars: Number(game.bars),
      live: Boolean(game.live)
    }))
  }),

  /**
   * O que o onboarding do app mostra em cada escolha (rodada 2 do redesign):
   * por esporte, quantos jogos há nos próximos 7 dias nos bares no ar (e o
   * próximo, para a F1 dizer o GP); por time, o próximo jogo e quantos na
   * semana. Aberta e sem localização: o onboarding pede onde só depois.
   */
  onboardingHints: publicProcedure
    .input(
      z.object({
        teamIds: z.array(z.string().uuid()).max(60).default([])
      })
    )
    .query(async ({ input }) => {
      const week = sql`(${eventNotEndedSql('e')} AND e.starts_at < ${utcNowSql()} + interval '7 days')`
      const sports = await db.execute<{
        sport_id: string
        games: number
        next_title: string | null
      }>(sql`
        SELECT g.sport_id, count(*)::int AS games,
          (array_agg(g.title ORDER BY g.starts_at))[1] AS next_title
        FROM (
          SELECT DISTINCT e.sport_id, e.starts_at,
            ${gameTitle({
              id: sql`e.id`,
              participantFreeText: sql`e.participant_free_text`,
              championship: sql`e.championship`
            })} AS title
          FROM event e JOIN bar b ON b.id = e.bar_id
          WHERE b.is_active AND e.published_at IS NOT NULL AND ${week}
        ) g
        GROUP BY g.sport_id
      `)
      const teams = input.teamIds.length
        ? await db.execute<{
            team_id: string
            games: number
            next_at: string
            next_title: string
          }>(sql`
            SELECT g.team_id, count(*)::int AS games, min(g.starts_at) AS next_at,
              (array_agg(g.title ORDER BY g.starts_at))[1] AS next_title
            FROM (
              SELECT DISTINCT ep.team_id, e.starts_at,
                ${gameTitle({
                  id: sql`e.id`,
                  participantFreeText: sql`e.participant_free_text`,
                  championship: sql`e.championship`
                })} AS title
              FROM event e
              JOIN bar b ON b.id = e.bar_id
              JOIN event_participants ep ON ep.event_id = e.id
              WHERE b.is_active AND e.published_at IS NOT NULL AND ${week}
                AND ep.team_id IN (${sql.join(
                  input.teamIds.map((id) => sql`${id}`),
                  sql`, `
                )})
            ) g
            GROUP BY g.team_id
          `)
        : { rows: [] }
      return {
        sports: sports.rows.map((row) => ({
          sportId: row.sport_id,
          games: Number(row.games),
          next: row.next_title
        })),
        teams: teams.rows.map((row) => ({
          teamId: row.team_id,
          games: Number(row.games),
          next: { title: row.next_title, startsAt: utcIso(row.next_at) }
        }))
      }
    }),

  /**
   * A régua do Explorar do web (WEB-501): os jogos de um dia de Brasília
   * perto de um ponto, cada um com os bares que o passam (`lib/game-board`).
   * Aberta: ver bares e jogos não pede conta (dono, 05/11/2026).
   */
  gameBoard: publicProcedure
    .input(
      z.object({
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
        radiusKm: searchRadiusKmSchema.default(5),
        day: z.string().date()
      })
    )
    .query(({ input }) => readGameBoard(input)),

  /**
   * "Sem jogo marcado" do Explorar do web: os bares no ar perto do ponto sem
   * jogo publicado no dia, para a lista seguir abaixo dos que passam o jogo
   * (`lib/bars-without-game`). Aberta, como a régua.
   */
  barsWithoutGame: publicProcedure
    .input(
      z.object({
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
        radiusKm: searchRadiusKmSchema.default(5),
        day: z.string().date()
      })
    )
    .query(({ input }) => readBarsWithoutGame(input)),

  search: publicProcedure
    .input(
      z.object({
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
        radiusKm: searchRadiusKmSchema.default(3),
        sportId: z.string().uuid().optional(),
        championship: z.string().optional(),
        date: z.string().date().optional(),
        amenities: z.array(z.number().int()).max(MAX_AMENITY_FILTER).optional(),
        // WEB-67: vem do cliente, nunca da sessão — a página vai para um cache
        // compartilhado entre contas.
        teamIds: favoriteTeamIdsSchema.optional(),
        sort: z.enum(['relevance', 'rating']).default('relevance'),
        cursor: z.string().optional(),
        limit: z.number().min(1).max(50).default(20)
      })
    )
    .query(async ({ input }) => {
      const emCamadas = await getAppConfig('search.tiered_plan_query')

      // Ordenar por nota só existe quando a nota é pública. Com a exibição
      // desligada, o modo cai para a ordem padrão em vez de dar erro: quem
      // guardou um link com `sort=rating` continua vendo uma lista, e não
      // uma tela quebrada por uma flag que ele não sabe que existe.
      const notaPublica = await getAppConfig('rating.public_display')
      const porNota = input.sort === 'rating' && notaPublica

      const executar = porNota
        ? executarBuscaPorNota
        : emCamadas
          ? executarBuscaEmCamadas
          : executarBuscaLinear

      // A normalização acontece aqui, antes do cache: ela descarta id
      // desconhecido e ORDENA, e é a ordem que faz `[1,4]` e `[4,1]` caírem
      // na mesma entrada em vez de recalcularem o mesmo resultado duas vezes.
      const normalizado = {
        ...input,
        sort: porNota ? ('rating' as const) : ('relevance' as const),
        amenities: input.amenities?.length
          ? normalizeAmenityIds(input.amenities)
          : undefined,
        teamIds: input.teamIds?.length
          ? [...new Set(input.teamIds)].sort()
          : undefined
      }

      const pagina = await cacheBusca.get(
        chaveBusca({
          ...normalizado,
          modo: porNota ? 'nota' : emCamadas ? 'camadas' : 'linear'
        }),
        () => executar(normalizado)
      )

      // Gasto, presença e a nota pública saem DEPOIS do cache (`toBarCards`).
      return { ...pagina, bars: await toBarCards(pagina.bars) }
    }),

  /**
   * Perfil de um bar, para quem tem conta.
   *
   * Exige sessão de propósito, e isso NÃO é acidente de implementação: a
   * página só registra evento comercial quando há um fã identificado
   * (`actor_user_id` é obrigatório e sustenta a deduplicação diária e as
   * contagens de visitantes únicos e interessados). Visitante anônimo é
   * impossível de atribuir — abrir a página para ele deixaria passar tráfego
   * que nunca apareceria no painel que o bar paga para ver.
   *
   * O portão de login está especificado na própria tela, que renderiza o
   * diálogo de autenticação e marca o conteúdo como inerte sem sessão.
   *
   * `user_id` do dono e a coluna derivada `geo` ficam de fora da resposta, e
   * um bar inativo responde como inexistente — **exceto para o próprio dono**.
   *
   * A exceção existe porque `bar.is_active` nasce `false`: o painel oferecia
   * ao dono a prévia do próprio perfil e a prévia respondia "Bar não
   * encontrado." até alguém ativar o bar. O dono precisa ver o que o cadastro
   * dele produz antes de ele ir ao ar; ninguém mais vê.
   */
  getById: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const now = new Date()
      // Aberta (app sem conta, rodada 1 do redesign): quem não entrou vê o
      // bar como um torcedor sem presença, com a contagem e o botão; marcar
      // pede conta no app.
      const viewer = ctx.session?.user ?? VISITOR

      const result = await db.query.bar.findFirst({
        where: and(
          eq(bar.id, input.id),
          or(eq(bar.isActive, true), eq(bar.userId, viewer.id))
        ),
        // `geo` só serve ao índice espacial. `userId` é lido para reconhecer o
        // dono e descartado antes da resposta — quem visita não precisa saber
        // qual conta é dona do bar.
        columns: {
          ...PUBLIC_BAR_COLUMNS,
          plan: true,
          userId: true,
          // Só o dono chega aqui com `false`: para qualquer outra conta um bar
          // inativo nem sai da consulta.
          isActive: true,
          ratingCount: true,
          ratingPositive: true,
          ratingStarsCount: true,
          ratingStarsSum: true,
          houseOffer: true,
          menuUrl: true,
          averageSpendCents: true,
          confirmsCodesLater: true,
          openingHours: true
        },
        with: {
          // Só para decidir o recebimento de reservas, a oferta da casa, o
          // cardápio e o gasto médio; sai da resposta.
          // `plan` acima é a projeção do plano vigente, com até um dia de
          // atraso no fim do trial.
          subscription: {
            columns: { plan: true, status: true, currentPeriodEnd: true }
          },
          // Fotos do bar (WEB-462): só as que a Onside aprovou.
          photos: {
            where: (photo, { eq }) => eq(photo.status, 'approved'),
            columns: {
              id: true,
              url: true,
              category: true,
              caption: true,
              position: true,
              status: true,
              createdAt: true
            }
          },
          events: {
            // Jogo ao vivo continua na página até o fim derivado.
            // Rascunho (WEB-436) não sai na página do bar.
            where: (event) =>
              and(isNotNull(event.publishedAt), eventNotEndedSql(event, now)),
            with: {
              sport: true,
              participants: {
                with: { team: true },
                orderBy: byMatchOrder
              }
            },
            orderBy: (event, { asc }) => [asc(event.startsAt)]
          }
        }
      })

      if (!result) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Bar não encontrado.'
        })
      }

      // O dono vê a própria página com avisos que ninguém mais vê — o que
      // falta preencher, e quanto isso custa em contatos. Quem decide é o
      // servidor: o cliente não tem como comparar sem receber o `userId`.
      //
      // A nota sai daqui já resolvida: o cliente recebe `null` quando a
      // exibição está desligada ou quando o bar não atingiu o piso, e nunca
      // recebe os contadores crus. Deixar a decisão na tela significaria
      // mandar pela rede o número que a regra existe para não mostrar.
      //
      // A oferta da casa segue a mesma lógica: o cliente recebe o efetivo,
      // nunca o texto com um aviso para esconder. Vale também para a prévia do dono —
      // ela mostra o que o torcedor vê. Cardápio e gasto médio idem, com Pro
      // ou Elite.
      const {
        userId,
        ratingCount,
        ratingPositive,
        ratingStarsCount,
        ratingStarsSum,
        houseOffer,
        menuUrl,
        averageSpendCents,
        photos,
        confirmsCodesLater,
        openingHours,
        subscription,
        events,
        ...publicBar
      } = result

      const notaPublica = await getAppConfig('rating.public_display')
      // Abaixo do piso de verificadas não sai nada da nota: nem %, nem
      // estrelas, nem etiquetas, nem comentários (WEB-408, WEB-451).
      const showRating = notaPublica && hasPublicRating(ratingCount)
      const rating = showRating
        ? {
            positive: ratingPositive,
            total: ratingCount,
            percentage: ratingPercentage(ratingPositive, ratingCount),
            // Média das estrelas (WEB-451), com o mesmo piso.
            stars: starsAverage(
              ratingStarsSum,
              ratingStarsCount,
              RATING_PUBLIC_FLOOR
            )
          }
        : null

      // O código do balcão, e com ele a oferta da casa, é do Elite: fora
      // dele, anunciar a oferta seria prometer sem caminho (WEB-131).
      const elite = issuesCounterCode(subscription ?? null, now)
      const fan = viewer.role === 'fan'
      const [attendance, going, reasons, reviews, checkIn] = await Promise.all([
        readFanAttendance(viewer, events, now),
        // A contagem do ingresso, inclusive do jogo ao vivo; como o botão,
        // só para torcedor.
        fan
          ? readGoing(
              events.map((game) => game.id),
              viewer.id
            )
          : new Map<string, Going>(),
        // "O que pesou?" (WEB-398): o mesmo piso da nota, e só o resumo.
        showRating ? readReasonSummary(result.id) : null,
        // Os comentários de "O que dizem" (WEB-451): o mesmo piso, só as
        // verificadas e aprovadas pela Onside.
        showRating ? readRatingList(result.id, { public: true, limit: 3 }) : [],
        // "Estou aqui" (WEB-408): o jogo deste bar com check-in aberto agora.
        fan ? readCheckIn(viewer.id, events, now) : null
      ])
      return {
        ...publicBar,
        amenities: declaredAmenityIds(publicBar.amenities),
        events: events.map(
          // Colunas da antiga reserva de mesa: não saem mais.
          ({
            reservationCap: _cap,
            acceptsReservations: _accepts,
            houseOffer: gameOffer,
            noHouseOffer,
            ...game
          }) => ({
            ...game,
            // A oferta que vale neste jogo (WEB-422): a dele substitui a do
            // bar, e "sem oferta neste jogo" a desliga. Só no Elite.
            houseOffer: elite
              ? effectiveHouseOffer(houseOffer, {
                  houseOffer: gameOffer,
                  noHouseOffer
                })
              : null,
            // Telão e som deste jogo, já com a herança das características.
            ...resolveEventScreen(game, publicBar.amenities),
            // `null`: o botão não cabe neste jogo (ADR 0003, "Presença").
            attendance: attendance.get(game.id) ?? null,
            // `null`: abaixo do piso e sem amigo indo, ou conta que não é
            // de torcedor.
            going: going.get(game.id) ?? null
          })
        ),
        rating,
        ratingReasons: reasons,
        reviews: reviews.map(
          ({ verified: _v, createdAt: _c, commentPending: _p, ...review }) =>
            review
        ),
        checkIn,
        // A padrão do bar. O que vale em cada jogo é `events[].houseOffer`;
        // esta fica para o app anterior, que só lia a do bar.
        houseOffer: elite ? houseOffer : null,
        // "Vou assistir aqui" sai com código do balcão (o app escolhe entre
        // "Confirmar e gerar código" e só "Confirmar").
        issuesCode: elite,
        // Bar que confirma o código depois do jogo, pela comanda (WEB-412): a
        // tela do código fala com o garçom em vez de mandar ao balcão.
        confirmsCodesLater: elite && confirmsCodesLater,
        ...resolvePublicBarMenu(
          { menuUrl, averageSpendCents },
          subscription ?? null,
          now
        ),
        // Galeria do ambiente (WEB-439, WEB-462): só as aprovadas, por
        // categoria e na ordem do dono; vazia sem Pro/Elite. A capa é
        // `photoUrl`, de todos os planos.
        photos: resolvePublicGallery(photos, subscription ?? null, now).map(
          ({ position: _p, status: _s, ...photo }) => photo
        ),
        // Horário (WEB-397): `null` sem horário informado, e a página esconde
        // a seção. "Aberto agora" é decidido aqui, no relógio de Brasília.
        openingHours: normalizeOpeningHours(openingHours),
        openNow: isOpenNow(normalizeOpeningHours(openingHours), now),
        isOwner: userId === viewer.id,
        // Só para o aviso da prévia do dono: bar fora do ar por assinatura
        // encerrada não é bar que nunca foi publicado (WEB-345). Teste do
        // cadastro vencido também tira o bar do ar (WEB-357), e quem só teve
        // o teste não tinha assinatura para terminar: o aviso diz qual dos
        // dois foi.
        offAirReason: ownerOffAirReason(
          userId === viewer.id
            ? getSubscriptionStanding(subscription ?? null, now)
            : null
        )
      }
    }),

  /**
   * O que a página pública do bar (`/bar/...`) mostra a quem entrou, por cima
   * da leitura sem sessão (`lib/public-bar-page.ts`): se salvou o bar e, por
   * jogo, a presença com o código do balcão e os amigos que vão (WEB-404:
   * só amigo aceito que deixa amigos verem). Conta que não é de torcedor não
   * marca presença nem salva bar: recebe `fan: false` e nada mais.
   */
  pageViewer: protectedProcedure
    .input(z.object({ barId: z.string().min(1).max(64) }))
    .query(async ({ ctx, input }) => {
      const viewer = ctx.session.user
      if (viewer.role !== 'fan') {
        return { fan: false, favorited: false, games: {} as ViewerGames }
      }
      const now = new Date()
      const liveCutoff = new Date(now.getTime() - DEFAULT_EVENT_DURATION_MS)
      const games = await db.query.event.findMany({
        where: (game, { and, eq, gte, isNotNull, isNull, or }) =>
          and(
            eq(game.barId, input.barId),
            isNotNull(game.publishedAt),
            or(
              and(isNotNull(game.endsAt), gte(game.endsAt, now)),
              and(isNull(game.endsAt), gte(game.startsAt, liveCutoff))
            )
          ),
        columns: { id: true, startsAt: true, attendanceEnabled: true }
      })
      const ids = games.map((game) => game.id)
      const [attendance, friends, favorite] = await Promise.all([
        readFanAttendance(viewer, games, now),
        readFriendsGoing(viewer.id, ids),
        db.query.userFavoriteBars.findFirst({
          where: and(
            eq(userFavoriteBars.userId, viewer.id),
            eq(userFavoriteBars.barId, input.barId)
          ),
          columns: { barId: true }
        })
      ])
      return {
        fan: true,
        favorited: Boolean(favorite),
        games: Object.fromEntries(
          ids.map((id) => [
            id,
            {
              attendance: attendance.get(id) ?? null,
              friends: (friends.get(id) ?? []).map(({ id: _i, ...f }) => f)
            }
          ])
        )
      }
    }),

  favorite: fanProcedure
    .input(
      z.object({
        barId: z.string().uuid(),
        recommendationRunId: z.string().uuid().optional()
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id

      const visibleBar = await db.query.bar.findFirst({
        where: and(eq(bar.id, input.barId), eq(bar.isActive, true)),
        columns: { id: true }
      })
      if (!visibleBar) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Bar não encontrado.'
        })
      }

      const inserted = await db
        .insert(userFavoriteBars)
        .values({ userId, barId: input.barId })
        .onConflictDoNothing()
        .returning({ barId: userFavoriteBars.barId })

      if (inserted.length > 0 && input.recommendationRunId) {
        try {
          await db
            .insert(recommendationEvent)
            .values({
              actorUserId: userId,
              barId: input.barId,
              runId: input.recommendationRunId,
              type: 'favorite'
            })
            .onConflictDoNothing()
        } catch {
          console.warn(
            JSON.stringify({
              event: 'recommendation_favorite_attribution_failed'
            })
          )
        }
      }

      return { success: true }
    }),

  unfavorite: fanProcedure
    .input(
      z.object({
        barId: z.string().uuid(),
        recommendationRunId: z.string().uuid().optional()
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id

      await db.transaction(async (tx) => {
        const removed = await tx
          .delete(userFavoriteBars)
          .where(
            sql`${userFavoriteBars.userId} = ${userId} AND ${userFavoriteBars.barId} = ${input.barId}`
          )
          .returning({ barId: userFavoriteBars.barId })

        if (removed.length > 0) {
          await tx.insert(recommendationEvent).values({
            actorUserId: userId,
            barId: input.barId,
            runId: input.recommendationRunId,
            type: 'unfavorite'
          })
        }
      })

      return { success: true }
    }),

  isFavorited: fanProcedure
    .input(z.object({ barId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const result = await db.query.userFavoriteBars.findFirst({
        where: sql`${userFavoriteBars.userId} = ${ctx.session.user.id} AND ${userFavoriteBars.barId} = ${input.barId}`
      })
      return { isFavorited: !!result }
    }),

  getFavorites: fanProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id
    const now = new Date()

    const favorites = await db.query.userFavoriteBars.findMany({
      where: sql`${userFavoriteBars.userId} = ${userId} AND EXISTS (
        SELECT 1 FROM "bar" AS active_bar
        WHERE active_bar.id = ${userFavoriteBars.barId}
          AND active_bar.is_active = true
      )`,
      with: {
        bar: {
          // `plan` é a projeção do plano vigente: decide o pino no mapa.
          columns: { ...PUBLIC_BAR_COLUMNS, plan: true },
          with: {
            events: {
              // Jogo em andamento continua na lista, como no perfil do bar.
              where: (event) =>
                and(isNotNull(event.publishedAt), eventNotEndedSql(event, now)),
              // Colunas da antiga reserva de mesa: não saem mais. A oferta
              // do jogo crua também não: o que vale sai de `getById`, já com o
              // plano (WEB-422).
              columns: {
                reservationCap: false,
                acceptsReservations: false,
                houseOffer: false,
                noHouseOffer: false
              },
              with: {
                sport: true,
                participants: { with: { team: true }, orderBy: byMatchOrder }
              },
              orderBy: (event, { asc }) => [asc(event.startsAt)],
              limit: 3
            }
          }
        }
      }
    })

    return favorites
  }),

  getMyPreferences: fanProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id

    return db.query.userPreferenceSports.findMany({
      where: eq(userPreferenceSports.userId, userId),
      with: { sport: true }
    })
  }),

  updateMyPreferences: fanProcedure
    .input(
      z.object({
        sportIds: z
          .array(z.string().uuid())
          .min(1, 'Selecione pelo menos 1 esporte.')
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id

      await db.transaction(async (tx) => {
        // Remove só os esportes desmarcados: a FK de `user_favorite_teams`
        // leva junto os times deles, e os dos esportes mantidos ficam.
        await tx
          .delete(userPreferenceSports)
          .where(
            and(
              eq(userPreferenceSports.userId, userId),
              notInArray(userPreferenceSports.sportId, input.sportIds)
            )
          )
        await tx
          .insert(userPreferenceSports)
          .values(input.sportIds.map((sportId) => ({ userId, sportId })))
          .onConflictDoNothing()
      })

      return { success: true }
    }),

  getMyTeams: fanProcedure.query(async ({ ctx }) => {
    const teams = await db
      .select({
        id: team.id,
        name: team.name,
        sportId: team.sportId,
        // WEB-520: o GP da F1 vale para o aviso, não para "Torce para".
        kind: team.kind,
        catalogKey: team.catalogKey
      })
      .from(userFavoriteTeams)
      .innerJoin(team, eq(team.id, userFavoriteTeams.teamId))
      .where(eq(userFavoriteTeams.userId, ctx.session.user.id))
    return teams.sort(porNome)
  }),

  updateMyTeams: fanProcedure
    .input(z.object({ teamIds: favoriteTeamIdsSchema }))
    .mutation(async ({ ctx, input }) => {
      await db.transaction((tx) =>
        replaceFavoriteTeams(tx, ctx.session.user.id, input.teamIds)
      )

      return { success: true }
    }),

  /**
   * WEB-319: a cidade que o torcedor informou, com o centro dela. `null` para
   * quem não informou — conta anterior ao campo, ou quem seguiu sem ela no
   * onboarding. Vem por aqui, e não pela sessão, porque as colunas não são
   * campos do better-auth.
   */
  getMyCity: fanProcedure.query(async ({ ctx }) => {
    const [row] = await db
      .select({
        name: user.searchCityName,
        uf: user.searchCityUf,
        lat: user.searchCityLat,
        lng: user.searchCityLng
      })
      .from(user)
      .where(eq(user.id, ctx.session.user.id))

    if (
      !row ||
      row.name === null ||
      row.uf === null ||
      row.lat === null ||
      row.lng === null
    ) {
      return null
    }
    return { name: row.name, uf: row.uf, lat: row.lat, lng: row.lng }
  }),

  updateMyCity: fanProcedure
    .input(searchCitySchema)
    .mutation(async ({ ctx, input }) => {
      const city = await findSearchCity(input)

      await db
        .update(user)
        .set(searchCityColumns(city))
        .where(eq(user.id, ctx.session.user.id))

      return city
    }),

  searchByLocation: protectedProcedure
    .input(
      z.object({
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
        radiusKm: searchRadiusKmSchema.default(5),
        cursor: z.string().optional(),
        limit: z.number().min(1).max(50).default(20)
      })
    )
    .query(async ({ input }) => {
      const pagina = await cacheLocal.get(chaveBuscaLocal(input), () =>
        executarBuscaLocal(input)
      )
      return { ...pagina, bars: await toBarCards(pagina.bars) }
    }),

  /**
   * Sugestões de cidade para o onboarding do app (ver `suggestSearchCities`),
   * com quantos bares no ar cada uma tem: as que têm mais vêm antes ("sao"
   * traz São Paulo, não São Benedito), como a lista do desenho (rodada 2).
   */
  searchCities: publicProcedure
    .input(z.object({ query: z.string().trim().min(1).max(100) }))
    .query(async ({ input }) => {
      const [candidates, counts] = await Promise.all([
        suggestSearchCities(input.query, 400),
        cacheBaresPorCidade.get('todos', async () => {
          const rows = await db.execute<{
            city: string
            uf: string | null
            bars: number
          }>(sql`
            SELECT city, uf, count(*)::int AS bars FROM bar
            WHERE is_active GROUP BY city, uf
          `)
          const map = new Map<string, number>()
          for (const row of rows.rows) {
            const key = `${normalizarCidade(row.city)}|${row.uf ?? ''}`
            map.set(key, (map.get(key) ?? 0) + Number(row.bars))
          }
          return map
        })
      ])
      const barsOf = (city: { name: string; uf: string }) =>
        counts.get(`${normalizarCidade(city.name)}|${city.uf}`) ??
        counts.get(`${normalizarCidade(city.name)}|`) ??
        0
      return candidates
        .map((city, order) => ({ ...city, bars: barsOf(city), order }))
        .sort((a, b) => b.bars - a.bars || a.order - b.order)
        .slice(0, 8)
        .map(({ order: _order, ...city }) => city)
    }),

  /**
   * Quantos bares no ar, dentro do raio, têm jogo hoje (dia de Brasília). É
   * o "12 bares com jogo hoje" do passo de distância do onboarding do app:
   * mostra o que a escolha do raio muda antes de salvar.
   */
  countTodayNear: publicProcedure
    .input(
      z.object({
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
        radiusKm: z.union([
          z.literal(1),
          z.literal(3),
          z.literal(5),
          z.literal(10)
        ])
      })
    )
    .query(async ({ input }) => {
      const origin = sql`ST_SetSRID(ST_MakePoint(${input.lng}, ${input.lat}), 4326)::geography`
      const result = await db.execute<{ bars: string }>(sql`
        SELECT count(*) AS bars
        FROM bar b
        WHERE b.is_active
          AND ST_DWithin(b.geo, ${origin}, ${input.radiusKm * 1000})
          AND EXISTS (
            SELECT 1 FROM event e
            WHERE e.bar_id = b.id
              AND e.published_at IS NOT NULL
              AND ${onBrasiliaDaysSql(sql`e.starts_at`, brasiliaTodaySql())}
          )
      `)
      return { bars: Number(result.rows[0]?.bars ?? 0) }
    }),

  /**
   * Bares no ar perto de um ponto que não têm jogo marcado, do mais perto ao
   * mais longe. O Explorar do app completa a lista com eles quando a busca
   * traz poucos bares com jogo, para o torcedor não dar com uma lista vazia
   * (decisão do dono em 21/10/2026). Mesmo formato dos bares da busca, sem
   * `nextEvent`; as características filtram como lá.
   */
  nearbyWithoutGames: publicProcedure
    .input(
      z.object({
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
        radiusKm: searchRadiusKmSchema.default(3),
        amenities: z.array(z.number().int()).max(MAX_AMENITY_FILTER).optional(),
        limit: z.number().int().min(1).max(20).default(10)
      })
    )
    .query(async ({ input }) => {
      const { origin, radiusMeters, amenityFilter } = montarFiltrosBusca({
        ...input,
        amenities: input.amenities?.length
          ? normalizeAmenityIds(input.amenities)
          : undefined
      })
      const result = await db.execute(sql`
        SELECT
          b.id, b.name, b.neighborhood, b.city, b.latitude, b.longitude,
          b.photo_url, b.created_at, b.plan, b.rating_count, b.rating_positive,
          0 AS event_count,
          ST_Distance(b.geo, ${origin}) / 1000 AS distance_km
        FROM bar b
        WHERE b.is_active
          AND ST_DWithin(b.geo, ${origin}, ${radiusMeters})
          ${amenityFilter(sql`b`)}
          -- Sem jogo, a oferta que valeria é a padrão do bar (WEB-422); o
          -- Elite já vem do filtro de características.
          ${
            input.amenities?.includes(HOUSE_OFFER_AMENITY_ID)
              ? sql`AND b.house_offer IS NOT NULL`
              : sql``
          }
          AND NOT EXISTS (
            SELECT 1 FROM event e WHERE e.bar_id = b.id AND ${jogoNaoAcabou(sql`e`)}
          )
        ORDER BY distance_km, b.id
        LIMIT ${input.limit}
      `)
      // Sem cursor: a lista é curta e não pagina.
      const { bars } = montarPaginaBusca(
        result.rows as LinhaBusca[],
        Number.POSITIVE_INFINITY
      )
      return toBarCards(bars)
    }),

  /**
   * "Quando" dos filtros do app (19d): quantos jogos começam em cada um dos
   * próximos sete dias (de Brasília, a partir de hoje) nos bares no ar do
   * raio. Esporte e características são os da busca, para a contagem bater
   * com o que a busca devolveria naquele dia.
   */
  gameDays: publicProcedure
    .input(
      z.object({
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
        radiusKm: searchRadiusKmSchema.default(3),
        sportId: z.string().uuid().optional(),
        amenities: z.array(z.number().int()).max(MAX_AMENITY_FILTER).optional()
      })
    )
    .query(async ({ input }) => {
      // O mesmo agora para o SQL e para os sete dias, senão discordam à meia-noite.
      const now = new Date()
      const filtros = montarFiltrosBusca({
        ...input,
        limit: 1,
        amenities: input.amenities?.length
          ? normalizeAmenityIds(input.amenities)
          : undefined
      })
      const result = await db.execute<{ day: string; games: number }>(sql`
        SELECT to_char(${brasiliaDaySql(sql`e.starts_at`)}, 'YYYY-MM-DD') AS day,
          count(*)::int AS games
        FROM event e
        JOIN bar b ON b.id = e.bar_id
        WHERE b.is_active
          AND e.published_at IS NOT NULL
          AND ST_DWithin(b.geo, ${filtros.origin}, ${filtros.radiusMeters})
          AND ${onBrasiliaDaysSql(sql`e.starts_at`, brasiliaTodaySql(now), 7)}
          ${input.sportId ? sql`AND e.sport_id = ${input.sportId}` : sql``}
          ${filtros.amenityFilter(sql`b`)}
          ${filtros.ofertaDoJogo}
        GROUP BY 1
      `)
      const games = new Map(result.rows.map((row) => [row.day, row.games]))
      return Array.from({ length: 7 }, (_, i) => {
        const day = brasiliaDay(now, i)
        return { day, games: games.get(day) ?? 0 }
      })
    }),

  getSports: publicProcedure.query(async () => {
    return cacheEsportes.get('todos', () => db.select().from(sport))
  }),

  /**
   * Os times em destaque do esporte (WEB-381): a lista curta que a tela mostra
   * sem busca. O resto do catálogo vem por `searchTeams`.
   */
  getTeamsBySport: publicProcedure
    .input(z.object({ sportId: z.string().uuid() }))
    .query(async ({ input }) => {
      return cacheTimes.get(input.sportId, async () =>
        (
          await db
            .select(TEAM_COLUMNS)
            .from(team)
            .where(
              and(eq(team.sportId, input.sportId), eq(team.featured, true))
            )
        ).sort(porNome)
      )
    }),

  /**
   * Busca no catálogo inteiro dos esportes pedidos, por nome, nome oficial ou
   * apelido, sem acento. Quem começa com o termo vem antes; depois, o mais
   * conhecido.
   */
  searchTeams: protectedProcedure
    .input(
      z.object({
        sportIds: z.array(z.string().uuid()).min(1).max(20),
        query: z.string().trim().min(2).max(60)
      })
    )
    .query(async ({ input }) => {
      const needle = fold(input.query)
      // O termo casa no começo de uma palavra: "bia" acha "Bianca", e não
      // "Tobias". `search_text` separa nome e apelidos por " | ".
      const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const wordStart = `(^|[^a-z0-9])${escaped}`
      const nameStart = `(^|\\| )${escaped}`
      return db
        .select(TEAM_COLUMNS)
        .from(team)
        .where(
          and(
            inArray(team.sportId, input.sportIds),
            sql`${team.searchText} ~ ${wordStart}`
          )
        )
        .orderBy(
          sql`(${team.searchText} ~ ${nameStart}) DESC`,
          desc(team.relevance),
          asc(team.name)
        )
        .limit(TEAM_SEARCH_LIMIT)
    })
})
