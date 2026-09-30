import { db, eq } from '@findsports_oficial/db'
import { user } from '@findsports_oficial/db/schema/auth'
import {
  bar,
  userPreferenceSports
} from '@findsports_oficial/db/schema/platform'
import { env } from '@findsports_oficial/env/server'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'

import { protectedProcedure, pubProcedure, router } from '../index'
import {
  AMENITIES,
  MAX_SCREEN_COUNT,
  normalizeAmenityIds
} from '../lib/amenities'
import { getAppConfig } from '../lib/app-config'
import { motivoTelefoneInvalido } from '../lib/bar-profile-validation'
import { cidadeLiberada, mensagemCidadeNaoLiberada } from '../lib/city-match'
import {
  favoriteTeamIdsSchema,
  replaceFavoriteTeams
} from '../lib/favorite-teams'
import { geocodeAddress } from '../lib/geocode-address'

export const onboardingRouter = router({
  completePub: pubProcedure
    .input(
      z.object({
        name: z.string().min(2).max(100),
        neighborhood: z.string().min(2).max(100),
        city: z.string().min(2).max(100).default('São Paulo'),
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

      if (ctx.session.user.onboardingCompleted) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Onboarding já concluído.'
        })
      }

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
          neighborhood: input.neighborhood
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
            address: input.address,
            phone: input.phone ?? null,
            description: input.description ?? null,
            amenities: normalizeAmenityIds(input.amenities ?? []),
            screenCount: input.screenCount ?? null,
            latitude,
            longitude,
            isActive: false
          })
          .returning({ id: bar.id })

        if (!newBar) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Erro ao criar o bar.'
          })
        }

        await tx
          .update(user)
          .set({ onboardingCompleted: true })
          .where(eq(user.id, userId))
      })

      return { success: true }
    }),

  completeFan: protectedProcedure
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
        teamIds: favoriteTeamIdsSchema.default([])
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id
      const role = ctx.session.user.role

      if (role !== 'fan') {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Apenas contas de torcedor podem completar este onboarding.'
        })
      }

      if (ctx.session.user.onboardingCompleted) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Onboarding já concluído.'
        })
      }

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
            onboardingCompleted: true
          })
          .where(eq(user.id, userId))
      })

      return { success: true }
    })
})
