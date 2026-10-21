import {
  and,
  asc,
  db,
  desc,
  eq,
  inArray,
  notInArray,
  or,
  sql
} from '@findsports_oficial/db'
import { fold } from '@findsports_oficial/db/catalog/fold'
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
  MAX_AMENITY_FILTER,
  normalizeAmenityIds
} from '../lib/amenities'
import { getAppConfig } from '../lib/app-config'
import { type Going, readFanAttendance, readGoing } from '../lib/attendance'
import { canShowBarMenu, resolvePublicBarMenu } from '../lib/bar-menu'
import {
  getCurrentPlan,
  getSubscriptionStanding,
  type SubscriptionStanding
} from '../lib/current-plan'
import { EVENT_LIVE_WINDOW_MS } from '../lib/event-profile-window'
import { resolveEventScreen } from '../lib/event-screen'
import {
  favoriteTeamIdsSchema,
  replaceFavoriteTeams
} from '../lib/favorite-teams'
import { byMatchOrder, gameTitle } from '../lib/game-participants'
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
import { hasPublicRating, ratingPercentage } from '../lib/rating'
import { summarizeReasons } from '../lib/rating-reasons'
import { chaveBusca, chaveBuscaLocal } from '../lib/search-cache'
import {
  findSearchCity,
  searchCityColumns,
  searchCitySchema,
  suggestSearchCities
} from '../lib/search-city'
import { searchRadiusKmSchema } from '../lib/search-radius'
import { createSharedCache } from '../lib/shared-cache'
import { utcIso } from '../lib/utc-timestamp'

/**
 * ESC-08: catálogos e buscas são iguais para todo mundo. Sem KV o cache
 * vive na instância; com Upstash Redis as instâncias passam a
 * compartilhar. Nada derivado de sessão entra aqui.
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
  isNationalTeam: team.isNationalTeam
}
const TEAM_SEARCH_LIMIT = 30

/**
 * Quantas vezes cada etiqueta de "O que pesou?" foi citada no bar, de quem
 * voltaria e de quem não voltaria (WEB-398). Todas as avaliações contam: a
 * Onside ainda não separa avaliação verificada (código validado ou check-in,
 * WEB-408); o portão de `ratings.submit` já exige ter marcado presença ou
 * aberto rota, WhatsApp ou telefone para aquele jogo.
 */
async function readReasonSummary(barId: string) {
  const rows = await db.execute(sql`
    SELECT r.would_return, reason, COUNT(*)::int AS count
    FROM bar_rating r, unnest(r.reasons) AS reason
    WHERE r.bar_id = ${barId}
    GROUP BY r.would_return, reason
  `)
  return summarizeReasons(
    (
      rows.rows as { would_return: boolean; reason: string; count: number }[]
    ).map((row) => ({
      wouldReturn: row.would_return,
      reason: row.reason,
      count: Number(row.count)
    }))
  )
}

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

const cacheEsportes = createSharedCache<(typeof sport.$inferSelect)[]>({
  prefix: 'pubs.sports',
  ttlMs: CATALOGO_TTL_MS
})
const cacheTimes = createSharedCache<
  {
    id: string
    sportId: string
    name: string
    kind: TeamKind
    isNationalTeam: boolean
  }[]
>({
  prefix: 'pubs.teams',
  ttlMs: CATALOGO_TTL_MS,
  maxEntries: 50
})
const cacheBusca = createSharedCache<SearchPage>({
  prefix: 'pubs.search',
  ttlMs: BUSCA_TTL_MS,
  maxEntries: 200
})
const cacheLocal = createSharedCache<LocationPage>({
  prefix: 'pubs.location',
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
 * Gasto médio declarado dos bares de uma página de busca (WEB-144), pela
 * regra do perfil: só com Pro/Elite vigente pela assinatura (`canShowBarMenu`),
 * nunca por `bar.plan`, que só acompanha o fim do trial uma vez por dia.
 *
 * Roda depois do cache, pelo mesmo motivo da nota: um trial que vence ou uma
 * assinatura que vira `past_due` esconde o valor na hora, e não um TTL depois.
 */
async function comGastoMedio<T extends { id: string }>(bars: T[]) {
  const rows = bars.length
    ? await db
        .select({
          id: bar.id,
          averageSpendCents: bar.averageSpendCents,
          subscription: {
            plan: subscription.plan,
            status: subscription.status,
            currentPeriodEnd: subscription.currentPeriodEnd
          }
        })
        .from(bar)
        .leftJoin(subscription, eq(subscription.barId, bar.id))
        .where(
          inArray(
            bar.id,
            bars.map((achado) => achado.id)
          )
        )
    : []
  const gasto = new Map(
    rows.map((row) => [
      row.id,
      canShowBarMenu(row.subscription) ? row.averageSpendCents : null
    ])
  )
  return bars.map((achado) => ({
    ...achado,
    averageSpendCents: gasto.get(achado.id) ?? null
  }))
}

/**
 * O que o card do bar no app mostra além da busca (07 do design): as
 * características declaradas e quantos marcaram presença no próximo jogo.
 * Depois do cache, como o gasto médio: presença muda o tempo todo. A contagem
 * segue o piso de "Vou assistir aqui" (`readGoing`): abaixo dele sai `null`,
 * e jogo vazio não vira número na tela; junto vão as iniciais de quem vai.
 */
async function comCaracteristicasEPresenca<
  T extends { id: string; nextEvent?: { id: string } | undefined }
>(bars: T[]) {
  const eventIds = bars.flatMap((achado) =>
    achado.nextEvent ? [achado.nextEvent.id] : []
  )
  const [declarados, vao] = await Promise.all([
    bars.length
      ? db
          .select({ id: bar.id, amenities: bar.amenities })
          .from(bar)
          .where(
            inArray(
              bar.id,
              bars.map((achado) => achado.id)
            )
          )
      : [],
    readGoing(eventIds)
  ])
  const caracteristicas = new Map(
    declarados.map((row) => [row.id, declaredAmenityIds(row.amenities)])
  )
  return bars.map((achado) => {
    const going = achado.nextEvent ? vao.get(achado.nextEvent.id) : undefined
    return {
      ...achado,
      amenities: caracteristicas.get(achado.id) ?? [],
      goingCount: going?.count ?? null,
      goingInitials: going?.initials ?? []
    }
  })
}

/** Teto da agenda do dia: é cenário de splash, não listagem. */
const TODAY_GAMES_LIMIT = 30

export const pubsRouter = router({
  /**
   * Os jogos de hoje nos bares no ar, para a splash do app (`apps/mobile`).
   * Aberta: aparece antes do login. Sai só o título e a hora do jogo, sem
   * identificar bar nenhum, e o mesmo jogo em vários bares conta uma vez.
   * "Hoje" é o dia de Brasília; `starts_at` é `timestamp` sem fuso, em UTC.
   */
  todayGames: publicProcedure.query(async () => {
    const dayStart = sql`(date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo' AT TIME ZONE 'UTC')`
    const games = await db.execute<{ title: string; starts_at: string }>(sql`
      SELECT g.title, g.starts_at
      FROM (
        SELECT
          ${gameTitle({
            id: sql`e.id`,
            participantFreeText: sql`e.participant_free_text`,
            championship: sql`e.championship`
          })} AS title,
          e.starts_at
        FROM event e
        JOIN bar b ON b.id = e.bar_id
        WHERE b.is_active
          AND e.starts_at >= ${dayStart}
          AND e.starts_at < ${dayStart} + interval '1 day'
      ) g
      GROUP BY g.title, g.starts_at
      ORDER BY g.starts_at, g.title
      LIMIT ${TODAY_GAMES_LIMIT}
    `)
    return games.rows.map((game) => ({
      title: game.title,
      startsAt: utcIso(game.starts_at)
    }))
  }),

  search: protectedProcedure
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

      // A nota é retirada DEPOIS do cache, não dentro dele: a flag pode virar
      // a qualquer momento e o cache tem TTL próprio. Filtrar antes deixaria
      // páginas já guardadas continuarem entregando nota por até um TTL
      // depois de a exibição ser desligada — e desligar exibição costuma ser
      // a reação a um problema, ou seja, exatamente a hora em que a demora
      // não é aceitável.
      const bars = await comCaracteristicasEPresenca(
        await comGastoMedio(pagina.bars)
      )
      return {
        ...pagina,
        bars: notaPublica
          ? bars
          : bars.map((achado) => ({ ...achado, rating: null }))
      }
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
  getById: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const now = new Date()
      const liveCutoff = new Date(now.getTime() - EVENT_LIVE_WINDOW_MS)

      const result = await db.query.bar.findFirst({
        where: and(
          eq(bar.id, input.id),
          or(eq(bar.isActive, true), eq(bar.userId, ctx.session.user.id))
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
          events: {
            // Jogo ao vivo continua na página: o corte é o fim provável do
            // jogo, não o início. Ver `event-profile-window.ts`.
            //
            // O predicado é montado com operadores do Drizzle, e não com SQL
            // cru: `event.starts_at` é `timestamp` sem fuso, e comparar com
            // `now()` (que é `timestamptz`) faria o Postgres converter usando
            // o fuso da sessão — a janela mudaria de tamanho conforme o
            // servidor. Com os operadores, o valor viaja pelo tipo da coluna.
            where: (event, { and, gte, isNotNull, isNull, or }) =>
              or(
                and(isNotNull(event.endsAt), gte(event.endsAt, now)),
                and(isNull(event.endsAt), gte(event.startsAt, liveCutoff))
              ),
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
        houseOffer,
        menuUrl,
        averageSpendCents,
        confirmsCodesLater,
        openingHours,
        subscription,
        events,
        ...publicBar
      } = result

      const notaPublica = await getAppConfig('rating.public_display')
      const showRating = notaPublica && hasPublicRating(ratingCount)
      const rating = showRating
        ? {
            positive: ratingPositive,
            total: ratingCount,
            percentage: ratingPercentage(ratingPositive, ratingCount)
          }
        : null

      // O código do balcão, e com ele a oferta da casa, é do Elite: fora
      // dele, anunciar a oferta seria prometer sem caminho (WEB-131).
      const elite = getCurrentPlan(subscription ?? null, now) === 'elite'
      const fan = ctx.session.user.role === 'fan'
      const [attendance, going, reasons] = await Promise.all([
        readFanAttendance(ctx.session.user, events, now),
        // A contagem do ingresso, inclusive do jogo ao vivo; como o botão,
        // só para torcedor.
        fan
          ? readGoing(
              events.map((game) => game.id),
              ctx.session.user.id
            )
          : new Map<string, Going>(),
        // "O que pesou?" (WEB-398): o mesmo piso da nota, e só o resumo.
        showRating ? readReasonSummary(result.id) : null
      ])
      return {
        ...publicBar,
        amenities: declaredAmenityIds(publicBar.amenities),
        events: events.map(
          // Colunas da antiga reserva de mesa: não saem mais.
          ({
            reservationCap: _cap,
            acceptsReservations: _accepts,
            ...game
          }) => ({
            ...game,
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
        // Horário (WEB-397): `null` sem horário informado, e a página esconde
        // a seção. "Aberto agora" é decidido aqui, no relógio de Brasília.
        openingHours: normalizeOpeningHours(openingHours),
        openNow: isOpenNow(normalizeOpeningHours(openingHours), now),
        isOwner: userId === ctx.session.user.id,
        // Só para o aviso da prévia do dono: bar fora do ar por assinatura
        // encerrada não é bar que nunca foi publicado (WEB-345). Teste do
        // cadastro vencido também tira o bar do ar (WEB-357), e quem só teve
        // o teste não tinha assinatura para terminar: o aviso diz qual dos
        // dois foi.
        offAirReason: ownerOffAirReason(
          userId === ctx.session.user.id
            ? getSubscriptionStanding(subscription ?? null, now)
            : null
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
    const liveCutoff = new Date(now.getTime() - EVENT_LIVE_WINDOW_MS)

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
              where: (event, { and, gte, isNotNull, isNull, or }) =>
                or(
                  and(isNotNull(event.endsAt), gte(event.endsAt, now)),
                  and(isNull(event.endsAt), gte(event.startsAt, liveCutoff))
                ),
              // Colunas da antiga reserva de mesa: não saem mais.
              columns: { reservationCap: false, acceptsReservations: false },
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
      .select({ id: team.id, name: team.name, sportId: team.sportId })
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
      return { ...pagina, bars: await comGastoMedio(pagina.bars) }
    }),

  /** Sugestões de cidade para o onboarding do app (ver `suggestSearchCities`). */
  searchCities: protectedProcedure
    .input(z.object({ query: z.string().trim().min(1).max(100) }))
    .query(({ input }) => suggestSearchCities(input.query)),

  /**
   * Quantos bares no ar, dentro do raio, têm jogo hoje (dia de Brasília). É
   * o "12 bares com jogo hoje" do passo de distância do onboarding do app:
   * mostra o que a escolha do raio muda antes de salvar.
   */
  countTodayNear: protectedProcedure
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
      const dayStart = sql`(date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo' AT TIME ZONE 'UTC')`
      const result = await db.execute<{ bars: string }>(sql`
        SELECT count(*) AS bars
        FROM bar b
        WHERE b.is_active
          AND ST_DWithin(b.geo, ${origin}, ${input.radiusKm * 1000})
          AND EXISTS (
            SELECT 1 FROM event e
            WHERE e.bar_id = b.id
              AND e.starts_at >= ${dayStart}
              AND e.starts_at < ${dayStart} + interval '1 day'
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
  nearbyWithoutGames: protectedProcedure
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
      const notaPublica = await getAppConfig('rating.public_display')
      const completos = await comCaracteristicasEPresenca(
        await comGastoMedio(bars)
      )
      return notaPublica
        ? completos
        : completos.map((achado) => ({ ...achado, rating: null }))
    }),

  /**
   * "Quando" dos filtros do app (19d): quantos jogos começam em cada um dos
   * próximos sete dias (de Brasília, a partir de hoje) nos bares no ar do
   * raio. Esporte e características são os da busca, para a contagem bater
   * com o que a busca devolveria naquele dia.
   */
  gameDays: protectedProcedure
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
      const filtros = montarFiltrosBusca({
        ...input,
        limit: 1,
        amenities: input.amenities?.length
          ? normalizeAmenityIds(input.amenities)
          : undefined
      })
      const dayStart = sql`(date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo' AT TIME ZONE 'UTC')`
      const result = await db.execute<{ day: string; games: number }>(sql`
        SELECT to_char(
            (e.starts_at AT TIME ZONE 'UTC') AT TIME ZONE 'America/Sao_Paulo',
            'YYYY-MM-DD'
          ) AS day,
          count(*)::int AS games
        FROM event e
        JOIN bar b ON b.id = e.bar_id
        WHERE b.is_active
          AND ST_DWithin(b.geo, ${filtros.origin}, ${filtros.radiusMeters})
          AND e.starts_at >= ${dayStart}
          AND e.starts_at < ${dayStart} + interval '7 days'
          ${input.sportId ? sql`AND e.sport_id = ${input.sportId}` : sql``}
          ${filtros.amenityFilter(sql`b`)}
        GROUP BY 1
      `)
      const games = new Map(result.rows.map((row) => [row.day, row.games]))
      const today = new Date().toLocaleDateString('en-CA', {
        timeZone: 'America/Sao_Paulo'
      })
      return Array.from({ length: 7 }, (_, i) => {
        const day = new Date(`${today}T12:00:00Z`)
        day.setUTCDate(day.getUTCDate() + i)
        const key = day.toISOString().slice(0, 10)
        return { day: key, games: games.get(key) ?? 0 }
      })
    }),

  getSports: protectedProcedure.query(async () => {
    return cacheEsportes.get('todos', () => db.select().from(sport))
  }),

  /**
   * Os times em destaque do esporte (WEB-381): a lista curta que a tela mostra
   * sem busca. O resto do catálogo vem por `searchTeams`.
   */
  getTeamsBySport: protectedProcedure
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
