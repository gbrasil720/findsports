import { getBarAccountDeletionBlock } from '@findsports_oficial/auth/account-deletion-policy'
import { founderCouponUsable } from '@findsports_oficial/auth/stripe-checkout'
import { stripeClient } from '@findsports_oficial/auth/stripe-client'
import { and, db, eq, inArray, sql } from '@findsports_oficial/db'
import { MENU_URL_MAX_LENGTH } from '@findsports_oficial/db/bar-menu'
import {
  EVENT_CHAMPIONSHIP_MAX_LENGTH,
  EVENT_CHAMPIONSHIP_MIN_LENGTH,
  EVENT_PARTICIPANT_FREE_TEXT_MAX_LENGTH
} from '@findsports_oficial/db/event-limits'
import { HOUSE_OFFER_MAX_LENGTH } from '@findsports_oficial/db/house-offer'
import {
  bar,
  event,
  eventParticipants,
  subscription,
  team
} from '@findsports_oficial/db/schema/platform'
import { env } from '@findsports_oficial/env/server'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { pubProcedure, router } from '../index'
import {
  AMENITIES,
  MAX_SCREEN_COUNT,
  normalizeAmenityIds
} from '../lib/amenities'
import { getAppConfig } from '../lib/app-config'
import { readInterestSignal } from '../lib/attendance'
import {
  assertCanConfigureBarMenu,
  parseAverageSpendCentsInput,
  parseMenuUrlInput
} from '../lib/bar-menu'
import {
  motivoTelefoneInvalido,
  UF_SIGLAS
} from '../lib/bar-profile-validation'
import { readBillingBalance } from '../lib/billing-balance'
import { isOwnPhotoUrl } from '../lib/blob-photo'
import {
  getCurrentPlan,
  getSubscriptionStanding,
  type SubscriptionForPlan
} from '../lib/current-plan'
import { getEventCreationPolicy } from '../lib/event-creation-policy'
import {
  getEventDeletionBlock,
  readEventDeletionImpact
} from '../lib/event-deletion'
import { byMatchOrder, participantNames } from '../lib/game-participants'
import { geocodeAddress } from '../lib/geocode-address'
import {
  assertCanConfigureHouseOffer,
  parseHouseOfferInput
} from '../lib/house-offer'
import { PLAN_NAMES, STARTER_EVENT_LIMIT } from '../lib/plan-limits'
import {
  hasPublicRating,
  RATING_PUBLIC_FLOOR,
  ratingPercentage
} from '../lib/rating'
import { assertCanEnableReservations } from '../lib/reservation-intake'
import { utcIso } from '../lib/utc-timestamp'

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

/**
 * O painel manda o endereço inteiro a cada salvar, mudado ou não. Geocodificar
 * só quando algum campo difere do gravado: cada chamada gasta cota do
 * LocationIQ e segura o salvar esperando a resposta.
 */
export function addressFieldsChanged(
  input: {
    address?: string
    neighborhood?: string
    city?: string
    uf?: string
  },
  existing: {
    address: string
    neighborhood: string
    city: string
    uf?: string | null
  }
): boolean {
  return (['address', 'neighborhood', 'city', 'uf'] as const).some(
    (field) => input[field] !== undefined && input[field] !== existing[field]
  )
}

/**
 * Enforce the event time invariant: an effective endsAt, when present, must
 * be strictly after the effective startsAt. createEvent and updateEvent call
 * this with the values that will actually be persisted, so the check runs
 * even when only one of the two fields is sent in the mutation.
 */
export function assertEventIntervalValid(
  effectiveStartsAt: Date,
  effectiveEndsAt: Date | null | undefined
): void {
  if (effectiveEndsAt && effectiveEndsAt <= effectiveStartsAt) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'O horário de término deve ser posterior ao horário de início.'
    })
  }
}

/**
 * Recusa de `createEvent` no limite de jogos. Pro ou Elite parado (`past_due`
 * ou trial vencido) cai no limite do Starter (WEB-129), mas não é Starter nem
 * resolve com upgrade: o caminho é regularizar a assinatura (WEB-331).
 *
 * `periodEnd` é o da política: sem ciclo vigente a janela é a dos últimos 30
 * dias, dita com as palavras de `apps/web/src/lib/event-limit.ts`.
 */
export function eventLimitMessage(
  subscription: SubscriptionForPlan | null,
  periodEnd: string | null,
  now = new Date()
): string {
  const standing = getSubscriptionStanding(subscription, now)
  const window = periodEnd ? 'por ciclo de cobrança' : 'nos últimos 30 dias'
  if (
    subscription &&
    subscription.plan !== 'starter' &&
    (standing === 'past_due' || standing === 'trial_ended')
  ) {
    return `Seu plano ${PLAN_NAMES[subscription.plan]} está parado e permite até ${STARTER_EVENT_LIMIT} jogos ${window}. Regularize a assinatura para voltar aos jogos ilimitados.`
  }
  return `Plano Starter permite até ${STARTER_EVENT_LIMIT} jogos ${window}. Faça upgrade para o plano Pro para jogos ilimitados.`
}

/**
 * Resolve the value to persist for `endsAt` in `updateEvent`, preserving
 * "omitted field doesn't change":
 * - undefined → omit, leaving the stored value untouched
 * - null → explicit clear (persist NULL)
 * - string → normalize to Date
 */
export function resolveEventEndsAt(
  input: string | null | undefined
): Date | null | undefined {
  if (input === undefined) return undefined
  return input === null ? null : new Date(input)
}

type EventTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0]

async function assertTeamsMatchSport(
  tx: EventTransaction,
  sportId: string,
  participantIds: string[]
): Promise<void> {
  const uniqueIds = [...new Set(participantIds)]
  if (uniqueIds.length === 0) return

  const matching = await tx
    .select({ id: team.id })
    .from(team)
    .where(and(eq(team.sportId, sportId), inArray(team.id, uniqueIds)))

  if (matching.length !== uniqueIds.length) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Todos os times devem pertencer ao esporte do evento.'
    })
  }
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
  getMe: pubProcedure.query(({ ctx }) => getBarByUserId(ctx.session.user.id)),

  updateMe: pubProcedure
    .input(
      z.object({
        name: z.string().min(2).max(100).optional(),
        description: z.string().max(500).optional(),
        phone: z.string().max(30).optional(),
        phoneAcceptsWhatsapp: z.boolean().optional(),
        address: z.string().min(5).max(255).optional(),
        neighborhood: z.string().min(2).max(100).optional(),
        city: z.string().min(2).max(100).optional(),
        // WEB-270. Opcional: bar anterior ao campo edita o resto do perfil sem
        // UF, e o cliente antigo, aberto durante o deploy, não a manda.
        uf: z.enum(UF_SIGLAS).optional(),
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

      const existingBar = await getBarByUserId(userId)

      // ESC-15: com o upload indo direto do navegador para o armazenamento,
      // quem informa a URL da foto é o cliente. Aceitar qualquer string
      // deixaria um bar apontar a própria foto para um endereço arbitrário.
      if (
        input.photoUrl &&
        !isOwnPhotoUrl(input.photoUrl, existingBar.id, env)
      ) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'URL de foto inválida.'
        })
      }

      const motivoTelefone = motivoTelefoneInvalido(
        input.phone,
        existingBar.phone
      )
      if (motivoTelefone) {
        throw new TRPCError({
          code: 'UNPROCESSABLE_CONTENT',
          message: motivoTelefone
        })
      }

      // Resolve phoneAcceptsWhatsapp with atomic revocation on phone change
      const whatsappResolution = resolvePhoneAcceptsWhatsapp(
        input.phone,
        input.phoneAcceptsWhatsapp,
        existingBar.phone
      )

      let coordinates: { latitude: string; longitude: string } | undefined
      if (addressFieldsChanged(input, existingBar)) {
        const apiKey = env.LOCATIONIQ_API_KEY
        if (!apiKey) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Configuração de geocoding ausente.'
          })
        }

        // Campos separados, e sem o bairro — ver `geocode-address.ts`.
        coordinates = await geocodeAddress(
          {
            street: input.address ?? existingBar.address,
            city: input.city ?? existingBar.city,
            neighborhood: input.neighborhood ?? existingBar.neighborhood,
            uf: input.uf ?? existingBar.uf
          },
          apiKey
        )
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
          ...(input.uf && { uf: input.uf }),
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
   * Oferta da casa (WEB-120): salva, edita ou limpa (`null` ou texto em
   * branco).
   *
   * Fica fora de `updateMe` porque é recurso pago: o plano é conferido aqui,
   * a partir da assinatura, antes de qualquer escrita — o painel esconder o
   * campo não impede ninguém de chamar o procedimento direto.
   *
   * Não toca em reserva nenhuma. `reservation.offer_snapshot` é cópia feita
   * na criação e não se atualiza a partir daqui.
   */
  updateHouseOffer: pubProcedure
    .input(
      z.object({
        // Teto de payload, não a regra: o limite vale sobre o texto já
        // normalizado, em `parseHouseOfferInput`.
        houseOffer: z
          .string()
          .max(HOUSE_OFFER_MAX_LENGTH * 4)
          .nullable()
      })
    )
    .mutation(async ({ ctx, input }) => {
      const existingBar = await getBarByUserId(ctx.session.user.id)
      assertCanConfigureHouseOffer(existingBar.subscription ?? null)
      const houseOffer = parseHouseOfferInput(input.houseOffer)

      const [updated] = await db
        .update(bar)
        .set({ houseOffer })
        .where(eq(bar.id, existingBar.id))
        .returning({ houseOffer: bar.houseOffer })

      return { houseOffer: updated?.houseOffer ?? null }
    }),

  /**
   * Cardápio e gasto médio por pessoa (WEB-39). Update parcial: campo
   * omitido não muda; `null` (ou link em branco) remove.
   *
   * Fora de `updateMe` pelo mesmo motivo da oferta da casa: é recurso pago, e
   * o plano é conferido aqui, a partir da assinatura, antes de qualquer
   * escrita.
   */
  updateMenuInfo: pubProcedure
    .input(
      z
        .object({
          // Teto de payload, não a regra: o limite vale sobre a URL já
          // normalizada, em `parseMenuUrlInput`.
          menuUrl: z
            .string()
            .max(MENU_URL_MAX_LENGTH * 2)
            .nullable()
            .optional(),
          averageSpendCents: z.number().nullable().optional()
        })
        .refine(
          (input) =>
            input.menuUrl !== undefined ||
            input.averageSpendCents !== undefined,
          { message: 'Informe o cardápio ou o preço médio.' }
        )
    )
    .mutation(async ({ ctx, input }) => {
      const existingBar = await getBarByUserId(ctx.session.user.id)
      assertCanConfigureBarMenu(existingBar.subscription ?? null)

      const [updated] = await db
        .update(bar)
        .set({
          ...(input.menuUrl !== undefined && {
            menuUrl: parseMenuUrlInput(input.menuUrl)
          }),
          ...(input.averageSpendCents !== undefined && {
            averageSpendCents: parseAverageSpendCentsInput(
              input.averageSpendCents
            )
          })
        })
        .where(eq(bar.id, existingBar.id))
        .returning({
          menuUrl: bar.menuUrl,
          averageSpendCents: bar.averageSpendCents
        })

      return {
        menuUrl: updated?.menuUrl ?? null,
        averageSpendCents: updated?.averageSpendCents ?? null
      }
    }),

  /**
   * Interruptor de recebimento de reservas (WEB-131).
   *
   * Ligar exige Elite vigente, conferido aqui a partir da assinatura. Desligar
   * vale sempre — inclusive para quem perdeu o plano com o interruptor ligado.
   *
   * Só decide pedidos novos: não toca em reserva existente, código emitido nem
   * `offer_snapshot`.
   */
  updateAcceptsReservations: pubProcedure
    .input(z.object({ acceptsReservations: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const existingBar = await getBarByUserId(ctx.session.user.id)
      if (input.acceptsReservations) {
        assertCanEnableReservations(existingBar.subscription ?? null)
      }

      const [updated] = await db
        .update(bar)
        .set({ acceptsReservations: input.acceptsReservations })
        .where(eq(bar.id, existingBar.id))
        .returning({ acceptsReservations: bar.acceptsReservations })

      return { acceptsReservations: updated?.acceptsReservations ?? false }
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
  getMyRatings: pubProcedure.query(async ({ ctx }) => {
    const existingBar = await getBarByUserId(ctx.session.user.id)

    const rows = await db.execute(sql`
      SELECT
        r.would_return,
        r.created_at,
        e.championship,
        e.participant_free_text,
        ${participantNames(sql`e.id`)} AS participants,
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
          participant_free_text: string | null
          participants: string[]
          starts_at: string
        }[]
      ).map((row) => ({
        wouldReturn: row.would_return,
        createdAt: row.created_at,
        championship: row.championship,
        participantFreeText: row.participant_free_text,
        participants: row.participants,
        startsAt: utcIso(row.starts_at)
      }))
    }
  }),

  getMyEvents: pubProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id

    const existingBar = await getBarByUserId(userId)

    // O que a exclusão levaria junto vem na mesma leitura (WEB-252): a grade
    // avisa do bloqueio antes do clique, sem uma ida por jogo.
    const [events, deletionImpact] = await Promise.all([
      db.query.event.findMany({
        where: eq(event.barId, existingBar.id),
        with: {
          sport: true,
          participants: {
            with: { team: true },
            orderBy: byMatchOrder
          }
        },
        orderBy: (event, { asc }) => [asc(event.startsAt)]
      }),
      readEventDeletionImpact(db, existingBar.id)
    ])

    return events.map((item) => ({
      ...item,
      deletion: deletionImpact.get(item.id) ?? null
    }))
  }),

  /** Sinal de interesse dos jogos que ainda não acabaram; nunca a contagem. */
  getMyInterest: pubProcedure.query(async ({ ctx }) => {
    const existingBar = await getBarByUserId(ctx.session.user.id)
    return readInterestSignal(existingBar.id)
  }),

  getMyEventCreationPolicy: pubProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id

    const existingBar = await getBarByUserId(userId)
    return getEventCreationPolicy(db, existingBar)
  }),

  createEvent: pubProcedure
    .input(
      z.object({
        sportId: z.string().uuid(),
        championship: z
          .string()
          .trim()
          .min(EVENT_CHAMPIONSHIP_MIN_LENGTH)
          .max(EVENT_CHAMPIONSHIP_MAX_LENGTH),
        startsAt: z.string().datetime(),
        endsAt: z.string().datetime().optional(),
        participantIds: z.array(z.string().uuid()).optional(),
        participantFreeText: z
          .string()
          .max(EVENT_PARTICIPANT_FREE_TEXT_MAX_LENGTH)
          .optional()
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id

      assertEventIntervalValid(
        new Date(input.startsAt),
        input.endsAt ? new Date(input.endsAt) : null
      )

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
            message: eventLimitMessage(
              existingSubscription ?? null,
              policy.periodEnd
            )
          })
        }

        await assertTeamsMatchSport(
          tx,
          input.sportId,
          input.participantIds ?? []
        )

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
              input.participantIds.map((teamId, position) => ({
                eventId: newEvent.id,
                teamId,
                // A ordem do array é a do confronto: mandante primeiro.
                position
              }))
            )
            .onConflictDoNothing()
        }
      })

      return { success: true }
    }),

  updateEvent: pubProcedure
    .input(
      z.object({
        eventId: z.string().uuid(),
        sportId: z.string().uuid().optional(),
        championship: z
          .string()
          .trim()
          .min(EVENT_CHAMPIONSHIP_MIN_LENGTH)
          .max(EVENT_CHAMPIONSHIP_MAX_LENGTH)
          .optional(),
        startsAt: z.string().datetime().optional(),
        endsAt: z.string().datetime().nullable().optional(),
        participantIds: z.array(z.string().uuid()).optional(),
        participantFreeText: z
          .string()
          .max(EVENT_PARTICIPANT_FREE_TEXT_MAX_LENGTH)
          .optional()
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id

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

      // WEB-43: compare the effective pair (input or persisted) on every update —
      // changing only startsAt must not be able to push start past the saved end.
      const resolvedEndsAt = resolveEventEndsAt(input.endsAt)
      const effectiveSportId = input.sportId ?? existingEvent.sportId
      const sportChanged = effectiveSportId !== existingEvent.sportId
      const participantIds =
        input.participantIds ?? (sportChanged ? [] : undefined)

      assertEventIntervalValid(
        input.startsAt ? new Date(input.startsAt) : existingEvent.startsAt,
        resolvedEndsAt === undefined ? existingEvent.endsAt : resolvedEndsAt
      )

      await db.transaction(async (tx) => {
        await assertTeamsMatchSport(tx, effectiveSportId, participantIds ?? [])

        const changes = {
          ...(input.sportId && { sportId: input.sportId }),
          ...(input.championship && { championship: input.championship }),
          ...(input.startsAt && { startsAt: new Date(input.startsAt) }),
          ...(resolvedEndsAt !== undefined && { endsAt: resolvedEndsAt }),
          ...(input.participantFreeText !== undefined && {
            participantFreeText: input.participantFreeText || null
          })
        }
        // Só os times mudaram: o Drizzle recusa `set({})` com erro 500.
        if (Object.keys(changes).length > 0) {
          await tx.update(event).set(changes).where(eq(event.id, input.eventId))
        }

        if (participantIds !== undefined) {
          await tx
            .delete(eventParticipants)
            .where(eq(eventParticipants.eventId, input.eventId))

          if (participantIds.length > 0) {
            await tx
              .insert(eventParticipants)
              .values(
                participantIds.map((teamId, position) => ({
                  eventId: input.eventId,
                  teamId,
                  position
                }))
              )
              .onConflictDoNothing()
          }
        }
      })

      return { success: true }
    }),

  deleteEvent: pubProcedure
    .input(z.object({ eventId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id

      const existingBar = await getBarByUserId(userId)

      await db.transaction(async (tx) => {
        // A trava na linha do jogo fecha a corrida com o pedido que chega no
        // meio: o insert de reserva ou avaliação pega KEY SHARE nesta linha
        // pelo FK, então ou ele já está gravado e entra na contagem abaixo,
        // ou espera e falha porque o jogo sumiu. Nunca é apagado junto.
        const [lockedEvent] = await tx
          .select({ id: event.id })
          .from(event)
          .where(
            and(eq(event.id, input.eventId), eq(event.barId, existingBar.id))
          )
          .for('update')
          .limit(1)

        if (!lockedEvent) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Evento não encontrado.'
          })
        }

        const impact = (
          await readEventDeletionImpact(tx, existingBar.id, input.eventId)
        ).get(input.eventId)
        const block = impact ? getEventDeletionBlock(impact) : null
        if (block) {
          throw new TRPCError({ code: 'PRECONDITION_FAILED', message: block })
        }

        await tx.delete(event).where(eq(event.id, input.eventId))
      })

      return { success: true }
    }),

  /** Cupom Early Bird disponível para novos checkouts (WEB-112). */
  getFounderCouponAvailable: pubProcedure.query(async () => {
    const config = await getAppConfig('billing.founder_coupon')
    if (!config.enabled) return { available: false as const }
    try {
      return {
        available: await founderCouponUsable(stripeClient, config.couponId)
      }
    } catch {
      return { available: false as const }
    }
  }),

  // Retorna o plano e status atual da subscription do bar
  getMySubscription: pubProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id

    const existingBar = await getBarByUserId(userId)
    const now = new Date()

    return existingBar.subscription
      ? {
          ...existingBar.subscription,
          currentPlan: getCurrentPlan(existingBar.subscription, now),
          standing: getSubscriptionStanding(existingBar.subscription, now)
        }
      : null
  }),

  // Saldo e próxima fatura no Stripe (WEB-350). Fora de `getMySubscription`
  // para o card do plano não esperar o Stripe.
  getMyBillingBalance: pubProcedure.query(async ({ ctx }) => {
    const existingBar = await getBarByUserId(ctx.session.user.id)
    return readBillingBalance(
      stripeClient,
      existingBar.subscription?.externalSubscriptionId
    )
  }),

  getAccountDeletionEligibility: pubProcedure.query(async ({ ctx }) => {
    const existingBar = await getBarByUserId(ctx.session.user.id)
    const block = getBarAccountDeletionBlock(existingBar.subscription ?? null)

    return {
      allowed: block === null,
      block
    }
  })
})
