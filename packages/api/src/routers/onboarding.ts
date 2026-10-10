import { auth } from '@findsports_oficial/auth'
import { db, eq, sql } from '@findsports_oficial/db'
import { user } from '@findsports_oficial/db/schema/auth'
import {
  bar,
  subscription,
  userPreferenceSports
} from '@findsports_oficial/db/schema/platform'
import { env } from '@findsports_oficial/env/server'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'

import { fanProcedure, pubProcedure, router } from '../index'
import {
  AMENITIES,
  MAX_SCREEN_COUNT,
  writableAmenityIds
} from '../lib/amenities'
import { getAppConfig } from '../lib/app-config'
import {
  motivoTelefoneInvalido,
  UF_SIGLAS
} from '../lib/bar-profile-validation'
import { cidadeLiberada, mensagemCidadeNaoLiberada } from '../lib/city-match'
import {
  favoriteTeamIdsSchema,
  replaceFavoriteTeams
} from '../lib/favorite-teams'
import { geocodeAddress } from '../lib/geocode-address'
import {
  findSearchCity,
  searchCityColumns,
  searchCitySchema
} from '../lib/search-city'

/**
 * WEB-324: lê o banco, não `ctx.session` — a sessão pode vir do cookie cache,
 * até 60s atrasada, e um segundo envio passava: no bar, geocoding pago de novo
 * e 500 na unicidade de `bar.user_id` em vez desta mensagem.
 */
async function assertOnboardingPending(userId: string) {
  const [row] = await db
    .select({ done: user.onboardingCompleted })
    .from(user)
    .where(eq(user.id, userId))
  if (row?.done) {
    throw new TRPCError({
      code: 'CONFLICT',
      message: 'Onboarding já concluído.'
    })
  }
}

/**
 * `onboardingCompleted` muda aqui por fora do better-auth, e o cookie cache da
 * sessão segue com o valor antigo por até 60s. Expirá-lo era só do cliente, num
 * segundo pedido (`refreshSessionCache`): quando esse pedido falhava, o guard
 * devolvia ao onboarding quem tinha acabado de concluir, com o bar já criado.
 * Agora o cookie expira na resposta da própria mutação — o `startCookies`
 * repassa o `Set-Cookie` ao Start.
 *
 * Falha aqui não desfaz o cadastro, que já está gravado: vai para o log, e o
 * pedido do cliente continua como segunda tentativa.
 */
async function expireSessionCache(headers: Headers | undefined) {
  if (!headers) return
  try {
    await auth.api.expireSessionCache({ headers })
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    console.error(
      JSON.stringify({ event: 'session_cache_expire_failed', message })
    )
  }
}

export const onboardingRouter = router({
  completePub: pubProcedure
    .input(
      z.object({
        name: z.string().min(2).max(100),
        neighborhood: z.string().min(2).max(100),
        city: z.string().min(2).max(100).default('São Paulo'),
        // WEB-270. Opcional aqui, obrigatória no formulário: durante o deploy
        // o servidor novo recebe pedido de aba aberta com o cliente antigo (e
        // de rascunho antigo), que não manda UF. Recusar derrubaria o cadastro
        // com erro genérico; aceitar grava o bar sem UF, como os anteriores.
        uf: z.enum(UF_SIGLAS).optional(),
        address: z.string().min(5).max(255),
        phone: z.string().max(30).optional(),
        description: z.string().max(500).optional(),
        // Ids desconhecidos são descartados por `normalizeAmenityIds`, não
        // recusados: um cliente desatualizado não pode derrubar o cadastro
        // inteiro do bar por causa de uma característica aposentada.
        amenities: z.array(z.number().int()).max(AMENITIES.length).optional(),
        screenCount: z.number().int().min(0).max(MAX_SCREEN_COUNT).optional()
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id

      await assertOnboardingPending(userId)

      const motivoTelefone = motivoTelefoneInvalido(input.phone)
      if (motivoTelefone) {
        throw new TRPCError({
          code: 'UNPROCESSABLE_CONTENT',
          message: motivoTelefone
        })
      }

      // ESC-19: lançamento cidade a cidade. Lista vazia — o padrão — libera
      // todas, que é o comportamento anterior a esta checagem.
      //
      // Vem ANTES do geocoding de propósito: geocodificar é chamada externa
      // paga, e não faz sentido pagar por um endereço que vai ser recusado.
      const cidadesLiberadas = await getAppConfig('launch.pub_cities')
      // `PRECONDITION_FAILED`, e não `FORBIDDEN`: o app traduz `FORBIDDEN` em
      // "sem permissão", e o que falta aqui é a cidade abrir.
      if (!cidadeLiberada(input.city, cidadesLiberadas)) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: mensagemCidadeNaoLiberada(input.city)
        })
      }

      const apiKey = env.LOCATIONIQ_API_KEY
      if (!apiKey) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Configuração de geocoding ausente.'
        })
      }

      // Campos separados, e sem o bairro: concatenar tudo numa linha faz a
      // LocationIQ casar por aproximação e devolver outra rua sem avisar. Ver
      // `geocode-address.ts`.
      const { latitude, longitude } = await geocodeAddress(
        {
          street: input.address,
          city: input.city,
          neighborhood: input.neighborhood,
          uf: input.uf
        },
        apiKey
      )

      // WEB-113: com o trial ligado o bar já nasce publicado e com assinatura
      // `trialing`. Desligado — o padrão — nasce fora do ar, à espera da
      // assinatura paga, como sempre foi.
      const trial = await getAppConfig('billing.onboarding_trial')

      await db.transaction(async (tx) => {
        const [newBar] = await tx
          .insert(bar)
          .values({
            userId,
            name: input.name,
            neighborhood: input.neighborhood,
            city: input.city,
            uf: input.uf ?? null,
            address: input.address,
            phone: input.phone ?? null,
            description: input.description ?? null,
            amenities: writableAmenityIds(input.amenities ?? []),
            screenCount: input.screenCount ?? null,
            latitude,
            longitude,
            isActive: trial.enabled
          })
          .returning({ id: bar.id })

        if (!newBar) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Erro ao criar o bar.'
          })
        }

        if (trial.enabled) {
          // `bar.plan` acompanha pela trigger `subscription_bar_plan_sync`.
          // O vencimento usa o `now()` do banco: a coluna é `timestamp` sem
          // fuso, e um `Date` do JS entraria no fuso do processo que grava.
          await tx.insert(subscription).values({
            barId: newBar.id,
            plan: trial.plan,
            status: 'trialing',
            currentPeriodEnd: sql`now() + make_interval(days => ${trial.days}::int)`
          })
        }

        await tx
          .update(user)
          .set({ onboardingCompleted: true })
          .where(eq(user.id, userId))
      })

      await expireSessionCache(ctx.headers)
      return { success: true }
    }),

  completeFan: fanProcedure
    .input(
      z.object({
        sportIds: z
          .array(z.string().uuid())
          .min(1, 'Selecione pelo menos 1 esporte.'),
        searchRadiusKm: z.union([
          z.literal(1),
          z.literal(3),
          z.literal(5),
          z.literal(10)
        ]),
        // WEB-68: opcional — o passo de times pode ser pulado.
        teamIds: favoriteTeamIdsSchema.default([]),
        // WEB-319: opcional — a tela deixa seguir sem cidade, e um app aberto
        // antes do campo existir conclui o onboarding sem mandá-la.
        city: searchCitySchema.optional()
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id

      await assertOnboardingPending(userId)

      // Antes da transação: cidade fora da lista recusa sem gravar nada.
      const city = input.city ? await findSearchCity(input.city) : null

      await db.transaction(async (tx) => {
        await tx
          .insert(userPreferenceSports)
          .values(input.sportIds.map((sportId) => ({ userId, sportId })))
          .onConflictDoNothing()

        await replaceFavoriteTeams(tx, userId, input.teamIds)

        await tx
          .update(user)
          .set({
            searchRadiusKm: input.searchRadiusKm,
            ...(city ? searchCityColumns(city) : {}),
            onboardingCompleted: true
          })
          .where(eq(user.id, userId))
      })

      await expireSessionCache(ctx.headers)
      return { success: true }
    })
})
