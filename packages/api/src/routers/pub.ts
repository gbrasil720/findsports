import { db, eq, sql } from '@findsports_oficial/db'
import {
  bar,
  event,
  eventParticipants,
  subscription
} from '@findsports_oficial/db/schema/platform'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'

import { protectedProcedure, router } from '../index'
import { geocodeAddress } from '../lib/geocode-address'

const STARTER_EVENT_LIMIT = 5

async function getBarByUserId(userId: string) {
  const result = await db.query.bar.findFirst({
    where: eq(bar.userId, userId),
    with: { subscription: true }
  })

  if (!result) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'Bar não encontrado para este usuário.'
    })
  }

  return result
}

// Conta eventos criados no período de billing atual
async function countEventsInCurrentPeriod(
  barId: string,
  currentPeriodEnd: Date | null
): Promise<number> {
  // Calcula o início do período subtraindo 1 mês do currentPeriodEnd
  const periodStart = currentPeriodEnd ? new Date(currentPeriodEnd) : new Date()

  if (currentPeriodEnd) {
    periodStart.setMonth(periodStart.getMonth() - 1)
  } else {
    // Fallback: últimos 30 dias
    periodStart.setDate(periodStart.getDate() - 30)
  }

  const result = await db.execute(sql`
    SELECT COUNT(*) as count
    FROM event
    WHERE bar_id = ${barId}
    AND created_at >= ${periodStart.toISOString()}
  `)

  return Number((result.rows[0] as any)?.count ?? 0)
}

export const pubRouter = router({
  getMe: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id

    if (ctx.session.user.role !== 'pub') {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'Apenas contas de bar podem acessar este recurso.'
      })
    }

    return getBarByUserId(userId)
  }),

  updateMe: protectedProcedure
    .input(
      z.object({
        name: z.string().min(2).max(100).optional(),
        description: z.string().max(500).optional(),
        phone: z.string().max(30).optional(),
        address: z.string().min(5).max(255).optional(),
        neighborhood: z.string().min(2).max(100).optional(),
        city: z.string().min(2).max(100).optional(),
        photoUrl: z.string().url().optional()
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id

      if (ctx.session.user.role !== 'pub') {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Apenas contas de bar podem acessar este recurso.'
        })
      }

      const existingBar = await getBarByUserId(userId)

      let coordinates: { latitude: string; longitude: string } | undefined
      const addressChanged = input.address || input.neighborhood || input.city

      if (addressChanged) {
        const apiKey = process.env.GOOGLE_MAPS_API_KEY
        if (!apiKey) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Configuração de geocoding ausente.'
          })
        }

        const fullAddress = `${input.address ?? existingBar.address}, ${input.neighborhood ?? existingBar.neighborhood}, ${input.city ?? existingBar.city}`
        coordinates = await geocodeAddress(fullAddress, apiKey)
      }

      const [updated] = await db
        .update(bar)
        .set({
          ...(input.name && { name: input.name }),
          ...(input.description !== undefined && {
            description: input.description
          }),
          ...(input.phone !== undefined && { phone: input.phone }),
          ...(input.address && { address: input.address }),
          ...(input.neighborhood && { neighborhood: input.neighborhood }),
          ...(input.city && { city: input.city }),
          ...(input.photoUrl && { photoUrl: input.photoUrl }),
          ...(coordinates && {
            latitude: coordinates.latitude,
            longitude: coordinates.longitude
          })
        })
        .where(eq(bar.id, existingBar.id))
        .returning()

      return updated
    }),

  getMyEvents: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id

    if (ctx.session.user.role !== 'pub') {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'Apenas contas de bar podem acessar este recurso.'
      })
    }

    const existingBar = await getBarByUserId(userId)

    return db.query.event.findMany({
      where: eq(event.barId, existingBar.id),
      with: {
        sport: true,
        participants: {
          with: { team: true }
        }
      },
      orderBy: (event, { asc }) => [asc(event.startsAt)]
    })
  }),

  createEvent: protectedProcedure
    .input(
      z.object({
        sportId: z.string().uuid(),
        championship: z.string().min(2).max(150),
        startsAt: z.string().datetime(),
        endsAt: z.string().datetime().optional(),
        participantIds: z.array(z.string().uuid()).optional(),
        participantFreeText: z.string().max(200).optional()
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id

      if (ctx.session.user.role !== 'pub') {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Apenas contas de bar podem acessar este recurso.'
        })
      }

      if (input.endsAt) {
        const starts = new Date(input.startsAt)
        const ends = new Date(input.endsAt)
        if (ends <= starts) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message:
              'O horário de término deve ser posterior ao horário de início.'
          })
        }
      }

      const existingBar = await getBarByUserId(userId)

      if (!existingBar.isActive) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message:
            'Seu bar precisa ter uma assinatura ativa para cadastrar eventos.'
        })
      }

      // Verifica limite do plano Starter
      const plan = existingBar.subscription?.plan ?? 'starter'
      if (plan === 'starter') {
        const count = await countEventsInCurrentPeriod(
          existingBar.id,
          existingBar.subscription?.currentPeriodEnd ?? null
        )
        if (count >= STARTER_EVENT_LIMIT) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: `Plano Starter permite até ${STARTER_EVENT_LIMIT} jogos por mês. Faça upgrade para o plano Pro para jogos ilimitados.`
          })
        }
      }

      await db.transaction(async (tx) => {
        const [newEvent] = await tx
          .insert(event)
          .values({
            barId: existingBar.id,
            sportId: input.sportId,
            championship: input.championship,
            startsAt: new Date(input.startsAt),
            ...(input.endsAt && { endsAt: new Date(input.endsAt) }),
            ...(input.participantFreeText && {
              participantFreeText: input.participantFreeText
            })
          })
          .returning({ id: event.id })

        if (!newEvent) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Erro ao criar evento.'
          })
        }

        if (input.participantIds && input.participantIds.length > 0) {
          await tx
            .insert(eventParticipants)
            .values(
              input.participantIds.map((teamId) => ({
                eventId: newEvent.id,
                teamId
              }))
            )
            .onConflictDoNothing()
        }
      })

      return { success: true }
    }),

  updateEvent: protectedProcedure
    .input(
      z.object({
        eventId: z.string().uuid(),
        sportId: z.string().uuid().optional(),
        championship: z.string().min(2).max(150).optional(),
        startsAt: z.string().datetime().optional(),
        endsAt: z.string().datetime().optional(),
        participantIds: z.array(z.string().uuid()).optional(),
        participantFreeText: z.string().max(200).optional()
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id

      if (ctx.session.user.role !== 'pub') {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Apenas contas de bar podem acessar este recurso.'
        })
      }

      const existingBar = await getBarByUserId(userId)

      const existingEvent = await db.query.event.findFirst({
        where: eq(event.id, input.eventId)
      })

      if (!existingEvent || existingEvent.barId !== existingBar.id) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Evento não encontrado.'
        })
      }

      if (input.endsAt) {
        const effectiveStartsAt = input.startsAt
          ? new Date(input.startsAt)
          : existingEvent.startsAt
        if (new Date(input.endsAt) <= effectiveStartsAt) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message:
              'O horário de término deve ser posterior ao horário de início.'
          })
        }
      }

      await db.transaction(async (tx) => {
        await tx
          .update(event)
          .set({
            ...(input.sportId && { sportId: input.sportId }),
            ...(input.championship && { championship: input.championship }),
            ...(input.startsAt && { startsAt: new Date(input.startsAt) }),
            ...(input.endsAt && { endsAt: new Date(input.endsAt) }),
            ...(input.participantFreeText !== undefined && {
              participantFreeText: input.participantFreeText || null
            })
          })
          .where(eq(event.id, input.eventId))

        if (input.participantIds !== undefined) {
          await tx
            .delete(eventParticipants)
            .where(eq(eventParticipants.eventId, input.eventId))

          if (input.participantIds.length > 0) {
            await tx
              .insert(eventParticipants)
              .values(
                input.participantIds.map((teamId) => ({
                  eventId: input.eventId,
                  teamId
                }))
              )
              .onConflictDoNothing()
          }
        }
      })

      return { success: true }
    }),

  deleteEvent: protectedProcedure
    .input(z.object({ eventId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id

      if (ctx.session.user.role !== 'pub') {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Apenas contas de bar podem acessar este recurso.'
        })
      }

      const existingBar = await getBarByUserId(userId)

      const existingEvent = await db.query.event.findFirst({
        where: eq(event.id, input.eventId)
      })

      if (!existingEvent || existingEvent.barId !== existingBar.id) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Evento não encontrado.'
        })
      }

      await db.delete(event).where(eq(event.id, input.eventId))

      return { success: true }
    }),

  // Retorna o plano e status atual da subscription do bar
  getMySubscription: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id

    if (ctx.session.user.role !== 'pub') {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'Apenas contas de bar podem acessar este recurso.'
      })
    }

    const existingBar = await getBarByUserId(userId)

    return existingBar.subscription ?? null
  })
})
