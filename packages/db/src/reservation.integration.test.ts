import { expect, test } from 'bun:test'
import { user } from './schema/auth'
import { bar, event, sport } from './schema/platform'
import {
  reservation,
  reservationCode,
  reservationCodeUse
} from './schema/reservation'
import { isDisposableTestDatabase } from './utils/db-resolver'

/**
 * As regras do código do balcão que ficam NO BANCO (WEB-119), e não só na
 * aplicação. Cada uma é exatamente o que a checagem da API não cobre: duas
 * requisições simultâneas passam juntas por um `SELECT` de verificação.
 *
 *   1. Um código em vigor por torcedor por jogo (índice único parcial).
 *   2. `used_count` nunca passa de `max_uses` (check + trigger de contador).
 *   3. Código único só entre os ativos (índice único parcial).
 */
const integrationTest = isDisposableTestDatabase() ? test : test.skip

function pgErrorCode(error: unknown): string | undefined {
  let current: unknown = error
  while (current && typeof current === 'object') {
    if ('code' in current && typeof current.code === 'string') {
      return current.code
    }
    current = 'cause' in current ? current.cause : undefined
  }
  return undefined
}

const UNIQUE_VIOLATION = '23505'
const CHECK_VIOLATION = '23514'

function single<T>(rows: T[]): T {
  const [row] = rows
  if (!row) throw new Error('INSERT ... RETURNING não devolveu linha')
  return row
}

function pgConstraint(error: unknown): string | undefined {
  let current: unknown = error
  while (current && typeof current === 'object') {
    if ('constraint' in current && typeof current.constraint === 'string') {
      return current.constraint
    }
    current = 'cause' in current ? current.cause : undefined
  }
  return undefined
}

async function expectPgError(
  promise: Promise<unknown>,
  code: string,
  constraint?: string
) {
  const error = await promise.then(
    () => undefined,
    (e: unknown) => e
  )
  expect(error).toBeDefined()
  expect(pgErrorCode(error)).toBe(code)
  if (constraint) expect(pgConstraint(error)).toBe(constraint)
}

integrationTest(
  'reserva ativa única, limite de usos do código e unicidade entre códigos ativos',
  async () => {
    const { db, eq } = await import('./index')

    const ownerId = crypto.randomUUID()
    const fanId = crypto.randomUUID()
    const sportId = crypto.randomUUID()
    const barId = crypto.randomUUID()
    const eventId = crypto.randomUUID()
    const prefix = crypto.randomUUID().replaceAll('-', '').slice(0, 6)
    const codeA = `${prefix}AA`.toUpperCase()
    const codeB = `${prefix}BB`.toUpperCase()

    await db.insert(user).values(
      [
        { id: ownerId, role: 'pub' as const },
        { id: fanId, role: 'fan' as const }
      ].map(({ id, role }) => ({
        id,
        name: `Reserva ${id}`,
        email: `${id}@integration.invalid`,
        emailVerified: true,
        role,
        onboardingCompleted: true
      }))
    )

    try {
      await db.insert(sport).values({
        id: sportId,
        name: `Esporte ${sportId}`,
        slug: `reservation-integration-${sportId}`
      })
      await db.insert(bar).values({
        id: barId,
        userId: ownerId,
        name: 'Bar da reserva',
        address: 'Rua descartável, 1',
        neighborhood: 'Teste',
        city: 'Teste',
        latitude: '-35.75000000',
        longitude: '-37.25000000',
        isActive: true
      })
      await db.insert(event).values({
        id: eventId,
        barId,
        sportId,
        championship: 'Jogo da reserva',
        startsAt: new Date(Date.now() + 24 * 60 * 60_000)
      })

      // --- 1. um código em vigor por torcedor por jogo ------------------

      const primeira = single(
        await db
          .insert(reservation)
          .values({ eventId, userId: fanId })
          .returning()
      )
      expect(primeira.status).toBe('confirmed')
      expect(primeira.offerSnapshot).toBeNull()

      await expectPgError(
        db.insert(reservation).values({ eventId, userId: fanId }),
        UNIQUE_VIOLATION
      )

      // Cancelada libera uma nova marcação, e o histórico fica.
      await db
        .update(reservation)
        .set({ status: 'cancelled' })
        .where(eq(reservation.id, primeira.id))
      const segunda = single(
        await db
          .insert(reservation)
          .values({
            eventId,
            userId: fanId,
            offerSnapshot: 'Chope em dobro até o apito inicial'
          })
          .returning()
      )
      expect(segunda.offerSnapshot).toBe('Chope em dobro até o apito inicial')

      // --- 2. used_count nunca passa de max_uses -------------------------

      const codigo = single(
        await db
          .insert(reservationCode)
          .values({ code: codeA, reservationId: segunda.id, maxUses: 1 })
          .returning()
      )
      const usos = async () =>
        (
          await db.query.reservationCode.findFirst({
            where: (c, { eq }) => eq(c.id, codigo.id),
            columns: { usedCount: true }
          })
        )?.usedCount

      const primeiroUso = single(
        await db
          .insert(reservationCodeUse)
          .values({ codeId: codigo.id, validatedByUserId: ownerId })
          .returning()
      )
      expect(await usos()).toBe(1)

      // Segunda validação de um código de um uso: o banco recusa, e o uso
      // não fica.
      await expectPgError(
        db.insert(reservationCodeUse).values({ codeId: codigo.id }),
        CHECK_VIOLATION
      )
      expect(await usos()).toBe(1)
      expect(
        await db.$count(
          reservationCodeUse,
          eq(reservationCodeUse.codeId, codigo.id)
        )
      ).toBe(1)

      // O contador é derivado: nem acima do limite, nem zerado para liberar
      // mais usos (0034).
      await expectPgError(
        db
          .update(reservationCode)
          .set({ usedCount: 2 })
          .where(eq(reservationCode.id, codigo.id)),
        CHECK_VIOLATION
      )
      await expectPgError(
        db
          .update(reservationCode)
          .set({ usedCount: 0 })
          .where(eq(reservationCode.id, codigo.id)),
        CHECK_VIOLATION,
        'reservation_code_used_count_derived'
      )
      expect(await usos()).toBe(1)

      // Desfazer devolve o uso; refazer o desfeito consome de novo.
      await db
        .update(reservationCodeUse)
        .set({ undoneAt: new Date(Date.now() + 1000) })
        .where(eq(reservationCodeUse.id, primeiroUso.id))
      expect(await usos()).toBe(0)
      await db.insert(reservationCodeUse).values({ codeId: codigo.id })
      expect(await usos()).toBe(1)

      // --- 3. código único entre os ativos --------------------------------

      const outraReserva = single(
        await db
          .insert(reservation)
          .values({ eventId, userId: ownerId })
          .returning()
      )

      await expectPgError(
        db
          .insert(reservationCode)
          .values({ code: codeA, reservationId: outraReserva.id, maxUses: 1 }),
        UNIQUE_VIOLATION
      )
      // Uma reserva não tem dois códigos ativos.
      await expectPgError(
        db
          .insert(reservationCode)
          .values({ code: codeB, reservationId: segunda.id, maxUses: 1 }),
        UNIQUE_VIOLATION
      )
      await expectPgError(
        db.insert(reservationCode).values({
          code: 'abc-1',
          reservationId: outraReserva.id,
          maxUses: 1
        }),
        CHECK_VIOLATION
      )
      // Código emitido já com usos (0034).
      await expectPgError(
        db.insert(reservationCode).values({
          code: codeB,
          reservationId: outraReserva.id,
          maxUses: 1,
          usedCount: 1
        }),
        CHECK_VIOLATION,
        'reservation_code_used_count_derived'
      )

      // Aposentado, o código não aceita uso novo (0034), mas desfazer um uso
      // anterior continua valendo.
      await db
        .update(reservationCode)
        .set({ retiredAt: new Date() })
        .where(eq(reservationCode.id, codigo.id))
      await expectPgError(
        db.insert(reservationCodeUse).values({ codeId: codigo.id }),
        CHECK_VIOLATION,
        'reservation_code_use_code_not_retired'
      )
      expect(await usos()).toBe(1)
      await db
        .update(reservationCodeUse)
        .set({ undoneAt: new Date(Date.now() + 2000) })
        .where(eq(reservationCodeUse.codeId, codigo.id))
      expect(await usos()).toBe(0)

      // E o valor volta a circular.
      await db
        .insert(reservationCode)
        .values({ code: codeA, reservationId: outraReserva.id, maxUses: 1 })
    } finally {
      // Apagar as contas derruba bar → evento → reserva → código → uso.
      await db.delete(user).where(eq(user.id, fanId))
      await db.delete(user).where(eq(user.id, ownerId))
      await db.delete(sport).where(eq(sport.id, sportId))
    }
  }
)
