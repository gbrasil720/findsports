import { db, eq, isNull, sql } from '@findsports_oficial/db'
import { attendanceCheckin } from '@findsports_oficial/db/schema/attendance'
import { event } from '@findsports_oficial/db/schema/platform'
import {
  reservation,
  reservationCode,
  reservationCodeUse
} from '@findsports_oficial/db/schema/reservation'

/**
 * Visita: o torcedor esteve no bar para o jogo. Uma linha por torcedor e
 * jogo, com o bar do jogo e a primeira confirmação (`visitedAt`). É o que contam as
 * conquistas, "Já fui", o mês do amigo, os amigos que mais saem e o "onde você
 * foi 4 vezes" das recomendações.
 *
 * Duas fontes: o código validado no balcão e não desfeito (o ingresso mora
 * em `reservation`/`reservation_code`, `attendance-ticket.ts`) e o check-in
 * por localização (WEB-408, `attendance_checkin`). A mesma regra, em SQL, é
 * a da avaliação verificada (`bar_rating_is_verified`, migration 0083).
 *
 * Não é visita: a validação vista pelo bar ("Quem vai", o alerta "diz que foi
 * e o bar não registrou", as chegadas da análise comercial). Essas leem o
 * código de propósito, e o check-in não deve entrar nelas.
 *
 * Use como tabela: `db.select().from(visit)` ou `${visit}` num `sql` cru
 * (vira `(select …) "visit"`, com as colunas `user_id`, `event_id`, `bar_id`
 * e `visited_at`).
 */
const proof = db
  .select({
    userId: reservation.userId,
    eventId: reservation.eventId,
    barId: event.barId,
    at: reservationCodeUse.usedAt
  })
  .from(reservationCodeUse)
  .innerJoin(reservationCode, eq(reservationCode.id, reservationCodeUse.codeId))
  .innerJoin(reservation, eq(reservation.id, reservationCode.reservationId))
  .innerJoin(event, eq(event.id, reservation.eventId))
  .where(isNull(reservationCodeUse.undoneAt))
  .unionAll(
    db
      .select({
        userId: attendanceCheckin.userId,
        eventId: attendanceCheckin.eventId,
        barId: event.barId,
        at: attendanceCheckin.createdAt
      })
      .from(attendanceCheckin)
      .innerJoin(event, eq(event.id, attendanceCheckin.eventId))
  )
  .as('proof')

export const visit = db
  .select({
    userId: proof.userId,
    eventId: proof.eventId,
    barId: proof.barId,
    visitedAt: sql<Date>`min(${proof.at})`
      .mapWith(reservationCodeUse.usedAt)
      .as('visited_at')
  })
  .from(proof)
  .groupBy(proof.userId, proof.eventId, proof.barId)
  .as('visit')
