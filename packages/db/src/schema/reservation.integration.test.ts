import { expect, test } from 'bun:test'
import { isDisposableTestDatabase } from '../utils/db-resolver'
import { user } from './auth'
import { bar, event, sport } from './platform'
import { reservation, reservationCode, reservationCodeUse } from './reservation'

/**
 * As regras de reserva que o ticket exige NO BANCO (WEB-119), e não só na
 * aplicação. Cada uma é exatamente o que a checagem da API não cobre: duas
 * requisições simultâneas passam juntas por um `SELECT` de verificação.
 *
 *   1. Um pedido ativo por torcedor por jogo (índice único parcial).
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

async function expectPgError(promise: Promise<unknown>, code: string) {
  const error = await promise.then(
    () => undefined,
    (e: unknown) => e
  )
  expect(error).toBeDefined()
  expect(pgErrorCode(error)).toBe(code)
}

integrationTest(
  'reserva ativa única, limite de usos do código e unicidade entre códigos ativos',
  async () => {
    const { db, eq } = await import('../index')

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

      // --- 1. um pedido ativo por torcedor por jogo ----------------------

      const primeira = single(
        await db
          .insert(reservation)
          .values({ eventId, userId: fanId, partySize: 2 })
          .returning()
      )
      expect(primeira.status).toBe('pending')
      expect(primeira.offerSnapshot).toBeNull()

      await expectPgError(
        db.insert(reservation).values({ eventId, userId: fanId, partySize: 4 }),
        UNIQUE_VIOLATION
      )

      // Confirmada continua ocupando a vaga.
      await db
        .update(reservation)
        .set({ status: 'confirmed' })
        .where(eq(reservation.id, primeira.id))
      await expectPgError(
        db.insert(reservation).values({ eventId, userId: fanId, partySize: 4 }),
        UNIQUE_VIOLATION
      )

      // Cancelada libera um novo pedido, e o histórico fica.
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
            partySize: 2,
            offerSnapshot: 'Chope em dobro até o apito inicial'
          })
          .returning()
      )
      expect(segunda.offerSnapshot).toBe('Chope em dobro até o apito inicial')

      await expectPgError(
        db.insert(reservation).values({ eventId, userId: fanId, partySize: 0 }),
        CHECK_VIOLATION
      )
      await expectPgError(
        db.insert(reservation).values({
          eventId,
          userId: ownerId,
          partySize: 1,
          note: 'x'.repeat(281)
        }),
        CHECK_VIOLATION
      )

      // --- 2. used_count nunca passa de max_uses -------------------------

      const codigo = single(
        await db
          .insert(reservationCode)
          .values({ code: codeA, reservationId: segunda.id, maxUses: 2 })
          .returning()
      )
      const usos = async () =>
        (
          await db.query.reservationCode.findFirst({
            where: (c, { eq }) => eq(c.id, codigo.id),
            columns: { usedCount: true }
          })
        )?.usedCount

      await db
        .insert(reservationCodeUse)
        .values({ codeId: codigo.id, validatedByUserId: ownerId })
      const segundoUso = single(
        await db
          .insert(reservationCodeUse)
          .values({ codeId: codigo.id, validatedByUserId: ownerId })
          .returning()
      )
      expect(await usos()).toBe(2)

      // Terceira pessoa num código para duas: o banco recusa, e o uso não fica.
      await expectPgError(
        db.insert(reservationCodeUse).values({ codeId: codigo.id }),
        CHECK_VIOLATION
      )
      expect(await usos()).toBe(2)
      expect(
        await db.$count(
          reservationCodeUse,
          eq(reservationCodeUse.codeId, codigo.id)
        )
      ).toBe(2)

      // Escrever o contador direto também não passa do limite.
      await expectPgError(
        db
          .update(reservationCode)
          .set({ usedCount: 3 })
          .where(eq(reservationCode.id, codigo.id)),
        CHECK_VIOLATION
      )

      // Desfazer devolve o lugar; refazer o desfeito consome de novo.
      await db
        .update(reservationCodeUse)
        .set({ undoneAt: new Date(Date.now() + 1000) })
        .where(eq(reservationCodeUse.id, segundoUso.id))
      expect(await usos()).toBe(1)
      await db.insert(reservationCodeUse).values({ codeId: codigo.id })
      expect(await usos()).toBe(2)

      // --- 3. código único entre os ativos --------------------------------

      const outraReserva = single(
        await db
          .insert(reservation)
          .values({ eventId, userId: ownerId, partySize: 1 })
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
          .values({ code: codeB, reservationId: segunda.id, maxUses: 2 }),
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

      // Aposentado, o código volta a circular.
      await db
        .update(reservationCode)
        .set({ retiredAt: new Date() })
        .where(eq(reservationCode.id, codigo.id))
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
