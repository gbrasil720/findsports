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
  MAX_AMENITY_IDS,
  MAX_SCREEN_COUNT,
  writableAmenityIds
} from '../lib/amenities'
import { descriptionSubmission } from '../lib/bar-description'
import {
  motivoTelefoneInvalido,
  UF_SIGLAS
} from '../lib/bar-profile-validation'
import {
  favoriteTeamIdsSchema,
  replaceFavoriteTeams
} from '../lib/favorite-teams'
import { geocodeAddress } from '../lib/geocode-address'
import { ONBOARDING_TRIAL } from '../lib/plan-limits'
import { recommendPlan, routineSchema } from '../lib/pub-routine'
import {
  findSearchCity,
  searchCityColumns,
  searchCitySchema
} from '../lib/search-city'
import { searchRadiusKmSchema } from '../lib/search-radius'

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
        // Só para o geocoding achar o trecho da rua (não é gravado). Opcional:
        // rascunho e aba abertos antes do campo não o mandam.
        cep: z
          .string()
          .regex(/^\d{5}-?\d{3}$/)
          .optional(),
        phone: z.string().max(30).optional(),
        description: z.string().max(500).optional(),
        // Ids desconhecidos são descartados por `normalizeAmenityIds`, não
        // recusados: um cliente desatualizado não pode derrubar o cadastro
        // inteiro do bar por causa de uma característica aposentada.
        amenities: z.array(z.number().int()).max(MAX_AMENITY_IDS).optional(),
        screenCount: z.number().int().min(0).max(MAX_SCREEN_COUNT).optional(),
        // "Sua rotina": o teste nasce no plano que ela recomenda, e o dono
        // escolhe o dele no passo "Plano do teste", depois do primeiro jogo.
        // Opcional: aba e rascunho de antes do campo não a mandam, e esse bar
        // nasce como antes, no Elite e com o plano dado como escolhido (o
        // cliente antigo troca por `changeTrialPlan` logo em seguida).
        routine: routineSchema.optional()
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id

      await assertOnboardingPending(userId)
      const trialPlan = input.routine
        ? recommendPlan(input.routine).plan
        : ONBOARDING_TRIAL.plan

      const motivoTelefone = motivoTelefoneInvalido(input.phone)
      if (motivoTelefone) {
        throw new TRPCError({
          code: 'UNPROCESSABLE_CONTENT',
          message: motivoTelefone
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
          uf: input.uf,
          cep: input.cep
        },
        apiKey
      )

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
            // Em revisão até a Onside aprovar (WEB-478): o bar nasce sem
            // descrição no ar.
            ...descriptionSubmission(null, input.description ?? ''),
            amenities: writableAmenityIds(input.amenities ?? []),
            screenCount: input.screenCount ?? null,
            latitude,
            longitude,
            // WEB-113: o bar nasce publicado, com o teste grátis abaixo.
            isActive: true,
            routine: input.routine ?? null,
            // Nulo: o painel leva à escolha do plano do teste. Sem a rotina
            // vale o padrão do banco (já escolhido), como no código anterior.
            ...(input.routine && { trialPlanChosenAt: null })
          })
          .returning({ id: bar.id })

        if (!newBar) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Erro ao criar o bar.'
          })
        }

        // `bar.plan` acompanha pela trigger `subscription_bar_plan_sync`.
        // O vencimento usa o `now()` do banco: a coluna é `timestamp` sem
        // fuso, e um `Date` do JS entraria no fuso do processo que grava.
        await tx.insert(subscription).values({
          barId: newBar.id,
          plan: trialPlan,
          status: 'trialing',
          currentPeriodEnd: sql`now() + make_interval(days => ${ONBOARDING_TRIAL.days}::int)`
        })

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
        // WEB-501: a conta nova por uma ação escolhe as preferências depois,
        // numa tela curta em que tudo é opcional, e o "Depois" conclui sem
        // nada: fica o raio padrão da coluna (3 km) e nenhum esporte. O
        // onboarding de 5 passos (web e app) segue exigindo um esporte na tela.
        sportIds: z.array(z.string().uuid()).default([]),
        searchRadiusKm: searchRadiusKmSchema.optional(),
        // WEB-68: opcional — o passo de times pode ser pulado.
        teamIds: favoriteTeamIdsSchema.default([]),
        // WEB-319: opcional — a tela deixa seguir sem cidade, e um app aberto
        // antes do campo existir conclui o onboarding sem mandá-la.
        city: searchCitySchema.optional()
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id

      // Antes de tocar o banco: cidade fora da lista recusa sem gravar nada.
      const city = input.city ? await findSearchCity(input.city) : null

      await assertOnboardingPending(userId)

      await db.transaction(async (tx) => {
        if (input.sportIds.length)
          await tx
            .insert(userPreferenceSports)
            .values(input.sportIds.map((sportId) => ({ userId, sportId })))
            .onConflictDoNothing()

        await replaceFavoriteTeams(tx, userId, input.teamIds)

        await tx
          .update(user)
          .set({
            ...(input.searchRadiusKm
              ? { searchRadiusKm: input.searchRadiusKm }
              : {}),
            ...(city ? searchCityColumns(city) : {}),
            onboardingCompleted: true
          })
          .where(eq(user.id, userId))
      })

      await expireSessionCache(ctx.headers)
      return { success: true }
    })
})
