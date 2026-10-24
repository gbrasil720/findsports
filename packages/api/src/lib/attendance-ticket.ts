import { and, type db, eq, inArray, isNull } from '@findsports_oficial/db'
import { generateReservationCode } from '@findsports_oficial/db/reservation-code'
import {
  ACTIVE_RESERVATION_STATUSES,
  reservation,
  reservationCode
} from '@findsports_oficial/db/schema/reservation'
import { TRPCError } from '@trpc/server'

/**
 * O ingresso de quem marca "Vou assistir aqui" num bar Elite: o código que o
 * torcedor mostra no balcão para ganhar a oferta da casa (decisão do dono em
 * 16/10/2026, que tirou a reserva de mesa do produto).
 *
 * ponytail: o ingresso mora nas tabelas da antiga reserva — uma linha
 * `confirmed` de uma pessoa em `reservation`, com o código em
 * `reservation_code`. Assim a validação no balcão, o desfazer, a contagem de
 * chegadas e a pergunta pós-jogo seguem sem migration. Renomear as tabelas
 * (ou pôr o código direto na presença) é a limpeza quando `party_size`,
 * `note` e os estados `pending` e `declined` atrapalharem.
 */

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

/** Colisão de código é rara (36^6); o laço só evita falhar por azar. */
const CODE_ATTEMPTS = 5

const activeTicket = (userId: string, eventId: string) =>
  and(
    eq(reservation.userId, userId),
    eq(reservation.eventId, eventId),
    inArray(reservation.status, ACTIVE_RESERVATION_STATUSES)
  )

/**
 * Emite o ingresso se ainda não houver um. Repetir não cria outro: o índice
 * de reserva ativa por torcedor e jogo segura até duas abas ao mesmo tempo.
 * A oferta é copiada agora e não muda depois (ADR 0003, "Oferta da casa").
 */
export async function issueTicket(
  tx: Tx,
  userId: string,
  eventId: string,
  offer: string | null
) {
  const [created] = await tx
    .insert(reservation)
    .values({
      eventId,
      userId,
      partySize: 1,
      status: 'confirmed',
      offerSnapshot: offer
    })
    .onConflictDoNothing()
    .returning({ id: reservation.id })
  if (!created) return
  for (let attempt = 1; ; attempt++) {
    const [issued] = await tx
      .insert(reservationCode)
      .values({
        code: generateReservationCode(),
        reservationId: created.id,
        maxUses: 1
      })
      .onConflictDoNothing()
      .returning({ id: reservationCode.id })
    if (issued) return
    if (attempt === CODE_ATTEMPTS) {
      throw new Error('reservation code space exhausted')
    }
  }
}

/**
 * O código ativo do torcedor no jogo, com a oferta copiada na emissão. É o
 * que `attendance.set` devolve, para a tela mostrar o código na hora.
 */
export async function readTicket(tx: Tx, userId: string, eventId: string) {
  const [ticket] = await tx
    .select({ code: reservationCode.code, offer: reservation.offerSnapshot })
    .from(reservation)
    .innerJoin(
      reservationCode,
      and(
        eq(reservationCode.reservationId, reservation.id),
        isNull(reservationCode.retiredAt)
      )
    )
    .where(activeTicket(userId, eventId))
    .limit(1)
  return ticket ?? null
}

/**
 * Desmarcar aposenta o ingresso. Código já validado trava: a oferta saiu, e
 * desmarcar apagaria a chegada que o bar registrou (ADR 0003, WEB-259).
 *
 * Trava a linha do código antes de ler o contador, com a trava do próprio
 * `UPDATE` (`NO KEY UPDATE`): uma validação simultânea espera e encontra o
 * código aposentado, ou chega antes e esta leitura já a vê.
 */
export async function retireTicket(tx: Tx, userId: string, eventId: string) {
  const [ticket] = await tx
    .select({ id: reservation.id })
    .from(reservation)
    .where(activeTicket(userId, eventId))
    .limit(1)
    .for('update')
  if (!ticket) return
  const [code] = await tx
    .select({ usedCount: reservationCode.usedCount })
    .from(reservationCode)
    .where(
      and(
        eq(reservationCode.reservationId, ticket.id),
        isNull(reservationCode.retiredAt)
      )
    )
    .limit(1)
    .for('no key update')
  if ((code?.usedCount ?? 0) > 0) {
    throw new TRPCError({
      code: 'CONFLICT',
      message: 'O bar já validou o seu código. Não dá mais para desmarcar.'
    })
  }
  await tx
    .update(reservation)
    .set({ status: 'cancelled' })
    .where(eq(reservation.id, ticket.id))
  await tx
    .update(reservationCode)
    .set({ retiredAt: new Date() })
    .where(
      and(
        eq(reservationCode.reservationId, ticket.id),
        isNull(reservationCode.retiredAt)
      )
    )
}
