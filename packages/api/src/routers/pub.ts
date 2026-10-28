import { liveStripeSubscriptionId } from '@findsports_oficial/auth/account-deletion-policy'
import {
  founderCouponUsable,
  pushInvoiceDetails
} from '@findsports_oficial/auth/stripe-checkout'
import { stripeClient } from '@findsports_oficial/auth/stripe-client'
import { logBillingError } from '@findsports_oficial/auth/stripe-sync'
import { and, asc, db, eq, inArray, isNull, sql } from '@findsports_oficial/db'
import {
  PHOTO_CAPTION_MAX,
  PHOTO_CATEGORY_IDS
} from '@findsports_oficial/db/bar-gallery'
import { MENU_URL_MAX_LENGTH } from '@findsports_oficial/db/bar-menu'
import { cancelReasonSchema } from '@findsports_oficial/db/cancel-reasons'
import {
  EVENT_CHAMPIONSHIP_MAX_LENGTH,
  EVENT_CHAMPIONSHIP_MIN_LENGTH,
  EVENT_PARTICIPANT_FREE_TEXT_MAX_LENGTH
} from '@findsports_oficial/db/event-limits'
import {
  EVENT_START_PROBLEM_MESSAGE,
  getEventStartProblem
} from '@findsports_oficial/db/event-window'
import { HOUSE_OFFER_MAX_LENGTH } from '@findsports_oficial/db/house-offer'
import { user } from '@findsports_oficial/db/schema/auth'
import {
  bar,
  barPhoto,
  event,
  eventParticipants,
  subscription,
  subscriptionCancelReason,
  subscriptionPlanEnum,
  team
} from '@findsports_oficial/db/schema/platform'
import { env } from '@findsports_oficial/env/server'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { pubProcedure, router } from '../index'
import {
  MAX_AMENITY_IDS,
  MAX_SCREEN_COUNT,
  writableAmenityIds
} from '../lib/amenities'
import { readInterestSignal } from '../lib/attendance'
import {
  assertCanAddPhoto,
  GALLERY_FULL_MESSAGE,
  GALLERY_MAX_PHOTOS,
  isOwnGalleryPhotoUrl,
  occupiedSlots
} from '../lib/bar-gallery'
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
import { readInvoices } from '../lib/billing-invoices'
import {
  canCancelSubscription,
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
import {
  INVOICE_FIELDS,
  type InvoiceField,
  invoiceFieldProblem,
  normalizeInvoiceField
} from '../lib/invoice-details'
import { normalizeOpeningHours, openingHoursSchema } from '../lib/opening-hours'
import { PLAN_NAMES, STARTER_EVENT_LIMIT } from '../lib/plan-limits'
import {
  hasPublicRating,
  RATING_PUBLIC_FLOOR,
  ratingPercentage
} from '../lib/rating'
import type { RatingReasonId } from '../lib/rating-reasons'
import { assertCanValidateReservations } from '../lib/reservation-validation'
import { createSubscriptionCancelUrl } from '../lib/subscription-cancel'
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
          'Para confirmar o WhatsApp, preencha o telefone do bar em Informações e salve as alterações.'
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
/** Mesma regra do formulário do painel (`getEventStartProblem`). */
export function assertEventStartInRange(startsAt: Date, now = new Date()) {
  const problem = getEventStartProblem(startsAt, now)
  if (problem) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: EVENT_START_PROBLEM_MESSAGE[problem]
    })
  }
}

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
  // Teste grátis em vigor não tem cobrança: a janela é o mês em curso.
  const onTrial = standing === 'current' && subscription?.status === 'trialing'
  const window = !periodEnd
    ? 'nos últimos 30 dias'
    : onTrial
      ? 'por mês'
      : 'por ciclo de cobrança'
  if (
    subscription &&
    subscription.plan !== 'starter' &&
    (standing === 'past_due' || standing === 'trial_ended')
  ) {
    return `Seu plano ${PLAN_NAMES[subscription.plan]} está parado e permite até ${STARTER_EVENT_LIMIT} jogos ${window}. Regularize a assinatura para voltar aos jogos ilimitados.`
  }
  if (!subscription) {
    return `Sem plano ativo, o bar pode cadastrar até ${STARTER_EVENT_LIMIT} jogos ${window}. Escolha um plano para liberar jogos ilimitados.`
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

/**
 * Trava o bar do dono e confere se ele pode pôr mais um jogo no ar: bar fora
 * do ar não publica, e o Starter para no limite de jogos. A trava na linha do
 * bar serializa duas publicações ao mesmo tempo no último jogo do limite.
 * Rascunho não passa por aqui (WEB-436): conta só quando é publicado.
 */
async function lockBarForPublishing(tx: EventTransaction, userId: string) {
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
      message: eventLimitMessage(existingSubscription ?? null, policy.periodEnd)
    })
  }

  return lockedBar
}

function ownBarOrThrow<T>(result: T | undefined): T {
  if (!result) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'Bar não encontrado para este usuário.'
    })
  }
  return result
}

/** A linha inteira do bar do dono: para quem devolve ou edita o perfil. */
async function getBarByUserId(userId: string) {
  return ownBarOrThrow(
    await db.query.bar.findFirst({
      where: eq(bar.userId, userId),
      // `geo` é derivada e só serve ao índice espacial — não vai para o cliente.
      columns: { geo: false },
      with: { subscription: true }
    })
  )
}

/**
 * O bar do dono só com o que os outros procedimentos usam: o id, se está no
 * ar, os contadores da nota e a assinatura. Descrição, horário, foto e o
 * resto do perfil não viajam a cada chamada do painel.
 */
async function getOwnBar(userId: string) {
  const [result] = await db
    .select({
      id: bar.id,
      isActive: bar.isActive,
      ratingCount: bar.ratingCount,
      ratingPositive: bar.ratingPositive,
      subscription
    })
    .from(bar)
    .leftJoin(subscription, eq(subscription.barId, bar.id))
    .where(eq(bar.userId, userId))
    .limit(1)
  return ownBarOrThrow(result)
}

/** O que o dono vê de cada foto (WEB-462), com a revisão. */
const OWNER_PHOTO_COLUMNS = {
  id: barPhoto.id,
  url: barPhoto.url,
  category: barPhoto.category,
  caption: barPhoto.caption,
  position: barPhoto.position,
  coverRequested: barPhoto.coverRequested,
  status: barPhoto.status,
  rejectionReason: barPhoto.rejectionReason,
  createdAt: barPhoto.createdAt
}

const photoNotFound = () =>
  new TRPCError({ code: 'NOT_FOUND', message: 'Foto não encontrada.' })

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
        // Lista completa, não incremental: o formulário manda o estado final
        // das características. Array vazio desmarca tudo, e `undefined` não
        // toca no que já está gravado — a descrição segue a mesma convenção
        // nesta mutation. A capa saiu daqui (WEB-462): passa pela revisão,
        // em `addPhoto` e `setPhotoCover`.
        amenities: z.array(z.number().int()).max(MAX_AMENITY_IDS).optional(),
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
          ...(input.amenities !== undefined && {
            amenities: writableAmenityIds(input.amenities)
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
      const existingBar = await getOwnBar(ctx.session.user.id)
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
   * Como o bar confere o código do balcão (WEB-412): na hora, em "Validar
   * código" (o padrão), ou depois do jogo, pela comanda. No segundo modo a
   * equipe anota o código e o dono lança no dia seguinte
   * (`reservationValidation.logLate`). Recurso do Elite, como o código.
   */
  updateCodeConfirmation: pubProcedure
    .input(z.object({ later: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const existingBar = await getOwnBar(ctx.session.user.id)
      assertCanValidateReservations(existingBar.subscription ?? null)
      const [updated] = await db
        .update(bar)
        .set({ confirmsCodesLater: input.later })
        .where(eq(bar.id, existingBar.id))
        .returning({ confirmsCodesLater: bar.confirmsCodesLater })
      return { later: updated?.confirmsCodesLater ?? input.later }
    }),

  /**
   * Avisos por e-mail ao dono (WEB-441): resumo da semana, jogo lotando e
   * grade vazia. Cada interruptor grava sozinho, sem "Salvar". Recurso de
   * todo plano; quem decide o conteúdo de cada e-mail é `lib/bar-notices.ts`.
   */
  updateNotices: pubProcedure
    .input(
      z
        .object({
          weeklySummary: z.boolean(),
          gameFilling: z.boolean(),
          emptySchedule: z.boolean()
        })
        .partial()
        .refine((notices) =>
          Object.values(notices).some((v) => v !== undefined)
        )
    )
    .mutation(async ({ ctx, input }) => {
      const existingBar = await getOwnBar(ctx.session.user.id)
      const [updated] = await db
        .update(bar)
        .set({
          noticeWeeklySummary: input.weeklySummary,
          noticeGameFilling: input.gameFilling,
          noticeEmptySchedule: input.emptySchedule
        })
        .where(eq(bar.id, existingBar.id))
        .returning({
          noticeWeeklySummary: bar.noticeWeeklySummary,
          noticeGameFilling: bar.noticeGameFilling,
          noticeEmptySchedule: bar.noticeEmptySchedule
        })
      if (!updated) throw new TRPCError({ code: 'NOT_FOUND' })
      return updated
    }),

  /**
   * Horário de funcionamento (WEB-397): a semana inteira de uma vez, ou
   * `null` para tirar a seção da página. Recurso de todo plano.
   */
  updateOpeningHours: pubProcedure
    .input(z.object({ openingHours: openingHoursSchema.nullable() }))
    .mutation(async ({ ctx, input }) => {
      const existingBar = await getOwnBar(ctx.session.user.id)
      const [updated] = await db
        .update(bar)
        .set({ openingHours: normalizeOpeningHours(input.openingHours) })
        .where(eq(bar.id, existingBar.id))
        .returning({ openingHours: bar.openingHours })
      return { openingHours: updated?.openingHours ?? null }
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
      const existingBar = await getOwnBar(ctx.session.user.id)
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
   * As fotos do bar, com a revisão (WEB-462): o dono vê em revisão e
   * recusada, com o motivo. Na ordem do dono; o painel agrupa por categoria.
   */
  photos: pubProcedure.query(async ({ ctx }) => {
    const existingBar = await getOwnBar(ctx.session.user.id)
    return db
      .select(OWNER_PHOTO_COLUMNS)
      .from(barPhoto)
      .where(eq(barPhoto.barId, existingBar.id))
      .orderBy(asc(barPhoto.position), asc(barPhoto.createdAt))
  }),

  /**
   * Põe a foto que acabou de subir pela rota `/api/bar/photo?galeria`, já em
   * revisão: o torcedor só a vê depois que a Onside aprovar. O teto conta com
   * o bar travado, então dois envios ao mesmo tempo não passam de
   * `GALLERY_MAX_PHOTOS`. `cover` pede a foto como capa: ela vira a capa
   * quando for aprovada.
   */
  addPhoto: pubProcedure
    .input(
      z.object({
        url: z.string().max(2048),
        category: z.enum(PHOTO_CATEGORY_IDS),
        caption: z
          .string()
          .max(PHOTO_CAPTION_MAX * 2)
          .optional(),
        cover: z.boolean().default(false)
      })
    )
    .mutation(async ({ ctx, input }) => {
      const existingBar = await getOwnBar(ctx.session.user.id)
      assertCanAddPhoto(existingBar.subscription ?? null, input.cover)
      if (!isOwnGalleryPhotoUrl(input.url, existingBar.id, env)) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'URL de foto inválida.'
        })
      }
      const caption = input.caption?.trim() || null
      if (caption && caption.length > PHOTO_CAPTION_MAX) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `A legenda aceita até ${PHOTO_CAPTION_MAX} caracteres.`
        })
      }

      return db.transaction(async (tx) => {
        await tx
          .select({ id: bar.id })
          .from(bar)
          .where(eq(bar.id, existingBar.id))
          .for('update')
        const current = await tx
          .select({ status: barPhoto.status, position: barPhoto.position })
          .from(barPhoto)
          .where(eq(barPhoto.barId, existingBar.id))
        if (occupiedSlots(current) >= GALLERY_MAX_PHOTOS) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: GALLERY_FULL_MESSAGE
          })
        }
        if (input.cover) {
          await tx
            .update(barPhoto)
            .set({ coverRequested: false })
            .where(eq(barPhoto.barId, existingBar.id))
        }
        const [added] = await tx
          .insert(barPhoto)
          .values({
            barId: existingBar.id,
            url: input.url,
            category: input.category,
            caption,
            position: Math.max(-1, ...current.map((p) => p.position)) + 1,
            coverRequested: input.cover
          })
          .onConflictDoNothing()
          .returning(OWNER_PHOTO_COLUMNS)
        if (!added) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'Esta foto já foi enviada.'
          })
        }
        return added
      })
    }),

  /** Troca a categoria. Não volta à revisão: a categoria não é texto livre. */
  setPhotoCategory: pubProcedure
    .input(z.object({ id: z.string(), category: z.enum(PHOTO_CATEGORY_IDS) }))
    .mutation(async ({ ctx, input }) => {
      const existingBar = await getOwnBar(ctx.session.user.id)
      const [updated] = await db
        .update(barPhoto)
        .set({ category: input.category })
        .where(
          and(eq(barPhoto.id, input.id), eq(barPhoto.barId, existingBar.id))
        )
        .returning(OWNER_PHOTO_COLUMNS)
      if (!updated) throw photoNotFound()
      return updated
    }),

  /**
   * Usar como capa. Foto aprovada vira a capa na hora (`bar.photo_url`, que
   * as listas leem); foto em revisão fica pedida e vira capa ao ser aprovada.
   * Recusada não pode.
   */
  setPhotoCover: pubProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existingBar = await getOwnBar(ctx.session.user.id)
      return db.transaction(async (tx) => {
        const [photo] = await tx
          .select({ url: barPhoto.url, status: barPhoto.status })
          .from(barPhoto)
          .where(
            and(eq(barPhoto.id, input.id), eq(barPhoto.barId, existingBar.id))
          )
          .for('update')
        if (!photo) throw photoNotFound()
        if (photo.status === 'rejected') {
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: 'Foto recusada não pode ser a capa.'
          })
        }
        await tx
          .update(barPhoto)
          .set({ coverRequested: false })
          .where(eq(barPhoto.barId, existingBar.id))
        if (photo.status === 'approved') {
          await tx
            .update(bar)
            .set({ photoUrl: photo.url })
            .where(eq(bar.id, existingBar.id))
        } else {
          await tx
            .update(barPhoto)
            .set({ coverRequested: true })
            .where(eq(barPhoto.id, input.id))
        }
        return { cover: photo.status === 'approved' ? 'now' : 'on_approval' }
      })
    }),

  /**
   * Nova ordem: as mesmas fotos, cada uma uma vez. A conferência é com o bar
   * travado, então uma foto que entrou ou saiu no meio recusa a ordem velha.
   */
  reorderPhotos: pubProcedure
    .input(
      z.object({
        ids: z
          .array(z.string())
          .min(1)
          .max(GALLERY_MAX_PHOTOS * 3)
          .refine((ids) => new Set(ids).size === ids.length, {
            message: 'Foto repetida na ordem.'
          })
      })
    )
    .mutation(async ({ ctx, input }) => {
      const existingBar = await getOwnBar(ctx.session.user.id)
      await db.transaction(async (tx) => {
        await tx
          .select({ id: bar.id })
          .from(bar)
          .where(eq(bar.id, existingBar.id))
          .for('update')
        const current = await tx
          .select({ id: barPhoto.id })
          .from(barPhoto)
          .where(eq(barPhoto.barId, existingBar.id))
        const known = new Set(current.map((p) => p.id))
        if (
          current.length !== input.ids.length ||
          !input.ids.every((id) => known.has(id))
        ) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'As fotos mudaram. Recarregue a página e tente de novo.'
          })
        }
        await tx
          .update(barPhoto)
          .set({
            position: sql`array_position(ARRAY[${sql.join(
              input.ids.map((id) => sql`${id}`),
              sql`, `
            )}]::text[], ${barPhoto.id})`
          })
          .where(eq(barPhoto.barId, existingBar.id))
      })
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
    const existingBar = await getOwnBar(ctx.session.user.id)

    const rows = await db.execute(sql`
      SELECT
        r.would_return,
        r.reasons,
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
          reasons: RatingReasonId[] | null
          created_at: string
          championship: string
          participant_free_text: string | null
          participants: string[]
          starts_at: string
        }[]
      ).map((row) => ({
        wouldReturn: row.would_return,
        // "O que pesou?" (WEB-398): as etiquetas, sem quem marcou.
        reasons: row.reasons ?? [],
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

    const existingBar = await getOwnBar(userId)

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
    const existingBar = await getOwnBar(ctx.session.user.id)
    return readInterestSignal(existingBar.id)
  }),

  getMyEventCreationPolicy: pubProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id

    const existingBar = await getOwnBar(userId)
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
          .optional(),
        // WEB-399: omitido herda das características do bar.
        onBigScreen: z.boolean().optional(),
        withSound: z.boolean().optional(),
        // WEB-437: "Lista de quem vai" do jogo; omitido fica como está.
        attendanceEnabled: z.boolean().optional(),
        // WEB-436: salva sem publicar; fica fora do app e do limite.
        draft: z.boolean().optional()
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id

      assertEventStartInRange(new Date(input.startsAt))
      assertEventIntervalValid(
        new Date(input.startsAt),
        input.endsAt ? new Date(input.endsAt) : null
      )

      const draftBar = input.draft ? await getOwnBar(userId) : null
      await db.transaction(async (tx) => {
        const lockedBar = draftBar ?? (await lockBarForPublishing(tx, userId))

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
            }),
            onBigScreen: input.onBigScreen,
            withSound: input.withSound,
            attendanceEnabled: input.attendanceEnabled,
            ...(input.draft && { publishedAt: null })
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
          .optional(),
        // WEB-399: omitido herda das características do bar.
        onBigScreen: z.boolean().optional(),
        withSound: z.boolean().optional(),
        // WEB-437: "Lista de quem vai" do jogo; omitido fica como está.
        attendanceEnabled: z.boolean().optional(),
        // WEB-436: põe o rascunho no ar. Não existe o caminho de volta.
        publish: z.literal(true).optional()
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id

      const existingBar = await getOwnBar(userId)

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

      // Só o início que mudou passa pela regra: editar o nome de um jogo que
      // já acabou não pode ser recusado pela data que ninguém mexeu.
      // Publicar o rascunho também: jogo que já começou não entra no ar.
      const publishing = !!input.publish && existingEvent.publishedAt === null
      if (
        (input.startsAt &&
          new Date(input.startsAt).getTime() !==
            existingEvent.startsAt.getTime()) ||
        publishing
      ) {
        assertEventStartInRange(
          input.startsAt ? new Date(input.startsAt) : existingEvent.startsAt
        )
      }
      assertEventIntervalValid(
        input.startsAt ? new Date(input.startsAt) : existingEvent.startsAt,
        resolvedEndsAt === undefined ? existingEvent.endsAt : resolvedEndsAt
      )

      await db.transaction(async (tx) => {
        if (publishing) await lockBarForPublishing(tx, userId)
        await assertTeamsMatchSport(tx, effectiveSportId, participantIds ?? [])

        const changes = {
          ...(input.sportId && { sportId: input.sportId }),
          ...(input.championship && { championship: input.championship }),
          ...(input.startsAt && { startsAt: new Date(input.startsAt) }),
          ...(resolvedEndsAt !== undefined && { endsAt: resolvedEndsAt }),
          ...(input.participantFreeText !== undefined && {
            participantFreeText: input.participantFreeText || null
          }),
          ...(input.onBigScreen !== undefined && {
            onBigScreen: input.onBigScreen
          }),
          ...(input.withSound !== undefined && { withSound: input.withSound }),
          ...(input.attendanceEnabled !== undefined && {
            attendanceEnabled: input.attendanceEnabled
          }),
          ...(publishing && { publishedAt: new Date() })
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

      const existingBar = await getOwnBar(userId)

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
    try {
      return { available: await founderCouponUsable(stripeClient) }
    } catch {
      return { available: false as const }
    }
  }),

  // Retorna o plano e status atual da subscription do bar
  getMySubscription: pubProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id

    const existingBar = await getOwnBar(userId)
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
    const existingBar = await getOwnBar(ctx.session.user.id)
    return readBillingBalance(
      stripeClient,
      existingBar.subscription?.externalSubscriptionId
    )
  }),

  // Faturas da assinatura no Stripe, com o PDF e a data da cobrança recusada
  // (WEB-443). Consulta à parte, como o saldo: o plano não espera o Stripe.
  getMyInvoices: pubProcedure.query(async ({ ctx }) => {
    const existingBar = await getOwnBar(ctx.session.user.id)
    return readInvoices(
      stripeClient,
      existingBar.subscription?.externalSubscriptionId
    )
  }),

  // "Dados da nota" de `/admin/billing` (WEB-444). Cada "Editar" manda o seu
  // campo; vazio apaga. Com cliente no Stripe, ele recebe os três antes do
  // banco: se o Stripe recusar ou não responder, nada muda aqui, e a tela não
  // mostra o que as faturas não têm. Repetir grava o mesmo estado.
  updateInvoiceDetails: pubProcedure
    .input(
      z.object({
        legalName: z.string().max(300).nullable().optional(),
        cnpj: z.string().max(40).nullable().optional(),
        invoiceEmail: z.string().max(300).nullable().optional()
      })
    )
    .mutation(async ({ ctx, input }) => {
      const changes: Partial<Record<InvoiceField, string | null>> = {}
      for (const field of INVOICE_FIELDS) {
        if (input[field] === undefined) continue
        const value = normalizeInvoiceField(field, input[field])
        const problem = invoiceFieldProblem(field, value)
        if (problem)
          throw new TRPCError({ code: 'BAD_REQUEST', message: problem })
        changes[field] = value
      }

      const userId = ctx.session.user.id
      const current = ownBarOrThrow(
        await db.query.bar.findFirst({
          where: eq(bar.userId, userId),
          columns: {
            id: true,
            name: true,
            legalName: true,
            cnpj: true,
            invoiceEmail: true
          }
        })
      )
      const next = { ...current, ...changes }
      const owner = await db.query.user.findFirst({
        where: eq(user.id, userId),
        columns: { name: true, email: true, stripeCustomerId: true }
      })
      if (owner?.stripeCustomerId) {
        try {
          await pushInvoiceDetails(
            stripeClient,
            owner.stripeCustomerId,
            owner,
            next
          )
        } catch (error) {
          const stripeError = error as { type?: string; code?: string }
          logBillingError('stripe_invoice_details_failed', {
            customerId: owner.stripeCustomerId,
            code: stripeError.code ?? null,
            message: error instanceof Error ? error.message : String(error)
          })
          // Cliente apagado no Stripe: não há onde gravar, e o painel não
          // pode ficar travado por isso. O próximo checkout cria outro.
          if (stripeError.code !== 'resource_missing') {
            throw new TRPCError(
              stripeError.type === 'StripeInvalidRequestError'
                ? {
                    code: 'BAD_REQUEST',
                    message:
                      'O Stripe não aceitou estes dados. Confira e tente de novo.'
                  }
                : {
                    code: 'SERVICE_UNAVAILABLE',
                    message:
                      'Não foi possível falar com o Stripe agora. Tente de novo.'
                  }
            )
          }
        }
      }
      if (Object.keys(changes).length) {
        await db.update(bar).set(changes).where(eq(bar.id, current.id))
      }
      return {
        legalName: next.legalName,
        cnpj: next.cnpj,
        invoiceEmail: next.invoiceEmail
      }
    }),

  // "Cancelar assinatura" de `/admin/billing` (WEB-339): a URL do portal. A
  // assinatura não muda aqui; o único registro é o motivo, quando o dono
  // escolheu um (WEB-445), gravado depois de o portal abrir, para tentativa
  // que falhou no Stripe não contar duas vezes. Mutation porque cria uma
  // sessão no Stripe.
  openSubscriptionCancel: pubProcedure
    .input(z.object({ reason: cancelReasonSchema.optional() }).optional())
    .mutation(async ({ ctx, input }) => {
      const { id: barId, subscription: current } = await getOwnBar(
        ctx.session.user.id
      )
      const subscriptionId = current?.externalSubscriptionId
      if (
        !current ||
        !subscriptionId ||
        !canCancelSubscription({
          ...current,
          standing: getSubscriptionStanding(current)
        })
      ) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Não há assinatura em vigor para cancelar.'
        })
      }
      const url = await createSubscriptionCancelUrl(
        stripeClient,
        subscriptionId,
        new URL('/admin/billing', env.BETTER_AUTH_URL).href
      )
      if (input?.reason) {
        // O motivo é opcional: falhar ao gravá-lo não segura o cancelamento.
        await db
          .insert(subscriptionCancelReason)
          .values({ barId, plan: current.plan, reason: input.reason })
          .catch((error: unknown) =>
            console.error('subscription_cancel_reason_insert_failed', error)
          )
      }
      return { url }
    }),

  // Troca o plano do teste grátis do cadastro, sem cartão e sem Stripe
  // (WEB-358). A regra vai no próprio UPDATE, e não numa leitura antes: o
  // webhook de quem contrata no meio do caminho grava a assinatura do Stripe,
  // e ela não pode ter o plano trocado por aqui. O fim do teste não muda, e
  // `bar.plan` acompanha pela trigger `subscription_bar_plan_sync`.
  changeTrialPlan: pubProcedure
    .input(z.object({ plan: z.enum(subscriptionPlanEnum.enumValues) }))
    .mutation(async ({ ctx, input }) => {
      const existingBar = await getOwnBar(ctx.session.user.id)
      const [changed] = await db
        .update(subscription)
        .set({ plan: input.plan })
        .where(
          and(
            eq(subscription.barId, existingBar.id),
            eq(subscription.status, 'trialing'),
            isNull(subscription.externalSubscriptionId),
            // `timestamp` sem fuso, lido como UTC: a mesma comparação de
            // `subscription_current_plan`.
            sql`${subscription.currentPeriodEnd} > (now() AT TIME ZONE 'UTC')`
          )
        )
        .returning({ plan: subscription.plan })
      if (!changed) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message:
            'Só dá para trocar o plano sem cartão durante o teste grátis. Para mudar de plano agora, contrate.'
        })
      }
      return changed
    }),

  getAccountDeletionEligibility: pubProcedure.query(async ({ ctx }) => {
    const existingBar = await getOwnBar(ctx.session.user.id)
    // Assinatura viva não segura a exclusão: é encerrada junto (WEB-336), e
    // a tela avisa antes de o dono confirmar.
    return {
      endsSubscription:
        liveStripeSubscriptionId(existingBar.subscription ?? null) !== null
    }
  })
})
