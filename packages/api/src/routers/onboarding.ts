import { db, eq } from '@findsports_oficial/db'
import { user } from '@findsports_oficial/db/schema/auth'
import {
  bar,
  subscription,
  userPreferenceSports
} from '@findsports_oficial/db/schema/platform'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'

import { protectedProcedure, router } from '../index'
import {
  AMENITIES,
  MAX_SCREEN_COUNT,
  normalizeAmenityIds
} from '../lib/amenities'
import { getAppConfig } from '../lib/app-config'
import { cidadeLiberada } from '../lib/city-match'
import { geocodeAddress } from '../lib/geocode-address'

export const onboardingRouter = router({
  completePub: protectedProcedure
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
      const role = ctx.session.user.role

      if (role !== 'pub') {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Apenas contas de bar podem completar este onboarding.'
        })
      }

      if (ctx.session.user.onboardingCompleted) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Onboarding já concluído.'
        })
      }

      // ESC-19: lançamento cidade a cidade. Lista vazia — o padrão — libera
      // todas, que é o comportamento anterior a esta checagem.
      //
      // Vem ANTES do geocoding de propósito: geocodificar é chamada externa
      // paga, e não faz sentido pagar por um endereço que vai ser recusado.
      const cidadesLiberadas = await getAppConfig('launch.pub_cities')
      if (!cidadeLiberada(input.city, cidadesLiberadas)) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: `A Onside ainda não abriu em ${input.city.trim()}. Avisamos assim que chegarmos aí.`
        })
      }

      const apiKey = process.env.GOOGLE_MAPS_API_KEY
      if (!apiKey) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Configuração de geocoding ausente.'
        })
      }

      const fullAddress = `${input.address}, ${input.neighborhood}, ${input.city}`
      const { latitude, longitude } = await geocodeAddress(fullAddress, apiKey)

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

        await tx.insert(subscription).values({
          barId: newBar.id,
          status: 'trialing'
        })

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
        ])
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
