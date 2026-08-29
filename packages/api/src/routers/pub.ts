import { getBarAccountDeletionBlock } from '@findsports_oficial/auth/account-deletion-policy'
import { db, eq, sql } from '@findsports_oficial/db'
import {
  bar,
  event,
  eventParticipants,
  subscription
} from '@findsports_oficial/db/schema/platform'
import { env } from '@findsports_oficial/env/server'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'

import { protectedProcedure, router } from '../index'
import {
  AMENITIES,
  MAX_SCREEN_COUNT,
  normalizeAmenityIds
} from '../lib/amenities'
import { isOwnPhotoUrl } from '../lib/blob-photo'
import { getEventCreationPolicy } from '../lib/event-creation-policy'
import { geocodeAddress } from '../lib/geocode-address'
import { STARTER_EVENT_LIMIT } from '../lib/plan-limits'
import {
  hasPublicRating,
  RATING_PUBLIC_FLOOR,
  ratingPercentage
} from '../lib/rating'

/**
 * Resolve the effective phoneAcceptsWhatsapp value given the input and
 * the existing bar state.
 *
 * Rules (spec section 10.1):
 * - phone change (existing non-empty → different input) → revoke to false
 *   atomically, regardless of input value
 * - confirm true only when bar already has a phone OR a non-empty phone
 *   is sent in the same mutation (initial setup is allowed)
 * - confirm false is always allowed
 */
export function resolvePhoneAcceptsWhatsapp(
  inputPhone: string | undefined,
  inputAccepts: boolean | undefined,
  existingPhone: string | null
): { value: boolean; changed: boolean } | null {
  const hasExistingPhone = existingPhone != null && existingPhone.trim() !== ''
  // "Phone change" = existing non-empty phone replaced with a different value
  const phoneChanged =
    hasExistingPhone && inputPhone !== undefined && inputPhone !== existingPhone

  if (inputAccepts === undefined) {
    // No explicit input — only revoke if phone changed
    return phoneChanged ? { value: false, changed: true } : null
  }

  // Phone changed → revoke atomically, regardless of input value
  if (phoneChanged) {
    return { value: false, changed: true }
  }

  // Confirming true requires a phone number (existing or provided)
  if (inputAccepts === true) {
    const effectivePhone = inputPhone ?? existingPhone
    if (!effectivePhone || effectivePhone.trim() === '') {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message:
          'Confirmação de WhatsApp requer telefone cadastrado. Envie um telefone junto com a confirmação.'
      })
    }
  }

  return { value: inputAccepts, changed: true }
}

async function getBarByUserId(userId: string) {
  const result = await db.query.bar.findFirst({
    where: eq(bar.userId, userId),
    // `geo` é derivada e só serve ao índice espacial — não vai para o cliente.
    columns: { geo: false },
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
        phoneAcceptsWhatsapp: z.boolean().optional(),
        address: z.string().min(5).max(255).optional(),
        neighborhood: z.string().min(2).max(100).optional(),
        city: z.string().min(2).max(100).optional(),
        photoUrl: z.string().url().optional(),
        // Lista completa, não incremental: o formulário manda o estado final
        // das características. Array vazio desmarca tudo, e `undefined` não
        // toca no que já está gravado — a foto e a descrição seguem a mesma
        // convenção nesta mutation.
        amenities: z.array(z.number().int()).max(AMENITIES.length).optional(),
        screenCount: z
          .number()
          .int()
          .min(0)
          .max(MAX_SCREEN_COUNT)
          .nullable()
          .optional()
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

      // ESC-15: com o upload indo direto do navegador para o armazenamento,
      // quem informa a URL da foto é o cliente. Aceitar qualquer string
      // deixaria um bar apontar a própria foto para um endereço arbitrário.
      if (
        input.photoUrl &&
        !isOwnPhotoUrl(input.photoUrl, existingBar.id, env.BLOB_STORE_ID)
      ) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'URL de foto inválida.'
        })
      }

      // Resolve phoneAcceptsWhatsapp with atomic revocation on phone change
      const whatsappResolution = resolvePhoneAcceptsWhatsapp(
        input.phone,
        input.phoneAcceptsWhatsapp,
        existingBar.phone
      )

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
          ...(input.amenities !== undefined && {
            amenities: normalizeAmenityIds(input.amenities)
          }),
          ...(input.screenCount !== undefined && {
            screenCount: input.screenCount
          }),
          ...(coordinates && {
            latitude: coordinates.latitude,
            longitude: coordinates.longitude
          }),
          // phoneAcceptsWhatsapp: resolved by helper (atomic revoke on phone change)
          ...(whatsappResolution && {
            phoneAcceptsWhatsapp: whatsappResolution.value
          })
        })
        .where(eq(bar.id, existingBar.id))
        .returning()

      return {
        ...updated,
        phoneRevoked: whatsappResolution?.value === false,
        phoneAcceptsWhatsappConfirmed: whatsappResolution?.value === true
      }
    }),

  /**
   * As avaliações do próprio bar, cruas.
   *
   * O piso público (`RATING_PUBLIC_FLOOR`) e a flag de exibição NÃO se
   * aplicam aqui: eles existem para proteger o bar de ter uma amostra
   * minúscula exibida ao torcedor, não para esconder do dono o que estão
   * dizendo do espaço dele. Ele vê desde a primeira.
   *
   * Não devolve quem avaliou. A resposta é binária e a base é pequena — um
   * nome ao lado de um "não voltaria" transformaria avaliação em conflito
   * pessoal, e o dono tem o telefone dessa pessoa.
   */
  getMyRatings: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.session.user.role !== 'pub') {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'Apenas contas de bar podem acessar este recurso.'
      })
    }

    const existingBar = await getBarByUserId(ctx.session.user.id)

    const rows = await db.execute(sql`
      SELECT
        r.would_return,
        r.created_at,
        e.championship,
        e.starts_at
      FROM bar_rating r
      JOIN event e ON e.id = r.event_id
      WHERE r.bar_id = ${existingBar.id}
      ORDER BY r.created_at DESC
      LIMIT 50
    `)

    const total = existingBar.ratingCount
    const positive = existingBar.ratingPositive

    return {
      total,
      positive,
      percentage: ratingPercentage(positive, total),
      isPublic: hasPublicRating(total),
      floor: RATING_PUBLIC_FLOOR,
      recent: (
        rows.rows as {
          would_return: boolean
          created_at: string
          championship: string
          starts_at: string
        }[]
      ).map((row) => ({
        wouldReturn: row.would_return,
        createdAt: row.created_at,
        championship: row.championship,
        startsAt: row.starts_at
      }))
    }
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

  getMyEventCreationPolicy: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id

    if (ctx.session.user.role !== 'pub') {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'Apenas contas de bar podem acessar este recurso.'
      })
    }

    const existingBar = await getBarByUserId(userId)
    return getEventCreationPolicy(db, existingBar)
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

      await db.transaction(async (tx) => {
        const [lockedBar] = await tx
          .select()
          .from(bar)
          .where(eq(bar.userId, userId))
          .for('update')
          .limit(1)

        if (!lockedBar) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Bar não encontrado para este usuário.'
          })
        }

        const existingSubscription = await tx.query.subscription.findFirst({
          where: eq(subscription.barId, lockedBar.id)
        })
        const policy = await getEventCreationPolicy(tx, {
          id: lockedBar.id,
          isActive: lockedBar.isActive,
          subscription: existingSubscription ?? null
        })

        if (policy.status === 'inactive') {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message:
              'Seu bar precisa ter uma assinatura ativa para cadastrar eventos.'
          })
        }

        if (policy.status === 'limited' && !policy.canCreate) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: `Plano Starter permite até ${STARTER_EVENT_LIMIT} jogos por mês. Faça upgrade para o plano Pro para jogos ilimitados.`
          })
        }

        const [newEvent] = await tx
          .insert(event)
          .values({
            barId: lockedBar.id,
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
  }),

  getAccountDeletionEligibility: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.session.user.role !== 'pub') {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'Apenas contas de bar podem acessar este recurso.'
      })
    }

    const existingBar = await getBarByUserId(ctx.session.user.id)
    const block = getBarAccountDeletionBlock(existingBar.subscription ?? null)

    return {
      allowed: block === null,
      block,
      currentPeriodEnd: existingBar.subscription?.currentPeriodEnd ?? null
    }
  })
})
