import { and, db, eq, isNull, type SQL, sql } from '@findsports_oficial/db'
import { getValidationWindow } from '@findsports_oficial/db/event-window'
import {
  ARRIVAL_UNDO_WINDOW_MS,
  isReservationCodeShaped,
  normalizeReservationCode
} from '@findsports_oficial/db/reservation-code'
import { user } from '@findsports_oficial/db/schema/auth'
import {
  bar,
  event,
  eventParticipants,
  team
} from '@findsports_oficial/db/schema/platform'
import {
  reservation,
  reservationCode,
  reservationCodeUse
} from '@findsports_oficial/db/schema/reservation'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'

import { pubProcedure, router } from '../index'
import { byMatchOrder } from '../lib/game-participants'
import { incrementWindow, refundWindowAttempt } from '../lib/rate-limit-store'
import { canManageReservations } from '../lib/reservation-intake'
import {
  ARRIVAL_UNDO_GRACE_MS,
  assertCanValidateReservations,
  assertReservationConfirmed,
  assertWindowOpen,
  codeNotFoundError,
  translateArrivalWriteError,
  VALIDATION_ATTEMPT_LIMIT,
  validationAttemptKey
} from '../lib/reservation-validation'

/**
 * Validação de código de reserva no bar (WEB-126).
 *
 * Não existe `barId` em nenhuma entrada: o código resolve o bar, e a consulta
 * que resolve já carrega o dono da sessão no WHERE. Código de outro bar e
 * código que não existe saem da MESMA consulta com o MESMO resultado vazio —
 * não há um segundo caminho que pudesse responder diferente ou demorar
 * diferente.
 */

type Reader = Pick<typeof db, 'select'>

/**
 * Passa o bar com Elite vigente, ou com reserva em aberto para honrar
 * (WEB-341). Não depende do código digitado.
 *
 * É o nível "capacidade" da ADR 0003. O interruptor de recebimento de
 * reservas (WEB-131) é "disposição" e NÃO entra aqui: desligar impede pedidos
 * novos, mas reserva já criada continua com código validável na janela. Pelo
 * mesmo motivo, perder o plano não tranca o código que o torcedor já tem.
 */
const validatorProcedure = pubProcedure.use(async ({ ctx, next }) => {
  const ownBar = await db.query.bar.findFirst({
    where: eq(bar.userId, ctx.session.user.id),
    columns: { id: true },
    with: { subscription: true }
  })
  if (!ownBar) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'Bar não encontrado para este usuário.'
    })
  }
  const subscription = ownBar.subscription ?? null
  // ponytail: "em aberto" acaba no fim do jogo, e a janela de validação fecha
  // uma margem depois. Sem Elite, a chegada registrada nessa margem é
  // recusada; se fizer falta, `hasOpenReservations` passa a somar a margem.
  if (!(await canManageReservations(ownBar.id, subscription))) {
    assertCanValidateReservations(subscription)
  }

  return next({ ctx })
})

/**
 * Código ativo de um jogo do bar de `ownerId`. Qualquer condição que falhe
 * devolve `undefined`, sem dizer qual.
 *
 * O estado da reserva não filtra: é dado do próprio bar, e sumir com o código
 * de um pedido pendente faria a tela dizer "não encontrado" para um código
 * que o torcedor está mostrando no celular.
 */
async function findOwnCode(reader: Reader, match: SQL, ownerId: string) {
  const [row] = await reader
    .select({
      codeId: reservationCode.id,
      code: reservationCode.code,
      usedCount: reservationCode.usedCount,
      maxUses: reservationCode.maxUses,
      partySize: reservation.partySize,
      reservationStatus: reservation.status,
      offerSnapshot: reservation.offerSnapshot,
      guestName: user.name,
      eventId: event.id,
      championship: event.championship,
      participantFreeText: event.participantFreeText,
      startsAt: event.startsAt,
      endsAt: event.endsAt
    })
    .from(reservationCode)
    .innerJoin(reservation, eq(reservation.id, reservationCode.reservationId))
    .innerJoin(event, eq(event.id, reservation.eventId))
    .innerJoin(bar, eq(bar.id, event.barId))
    .innerJoin(user, eq(user.id, reservation.userId))
    .where(
      and(match, isNull(reservationCode.retiredAt), eq(bar.userId, ownerId))
    )
    .limit(1)
  return row
}

async function readCounter(reader: Reader, codeId: string) {
  const [row] = await reader
    .select({
      usedCount: reservationCode.usedCount,
      maxUses: reservationCode.maxUses
    })
    .from(reservationCode)
    .where(eq(reservationCode.id, codeId))
    .limit(1)
  if (!row) throw codeNotFoundError()
  return row
}

const undoWindowSeconds =
  (ARRIVAL_UNDO_WINDOW_MS + ARRIVAL_UNDO_GRACE_MS) / 1000

/** Prazo contado no relógio do banco, o mesmo que gravou `used_at`. */
const withinUndoWindow = sql<boolean>`${reservationCodeUse.usedAt} >= now() - make_interval(secs => ${undoWindowSeconds}::double precision)`

/** Existe chegada mais nova, ainda valendo, no mesmo código. */
const hasLaterArrival = sql<boolean>`EXISTS (
  SELECT 1 FROM reservation_code_use later
  WHERE later.code_id = ${reservationCodeUse.codeId}
    AND later.undone_at IS NULL
    AND (later.used_at, later.id) > (${reservationCodeUse.usedAt}, ${reservationCodeUse.id})
)`

export const reservationValidationRouter = router({
  /**
   * Mutation, e não query: consome tentativa do limite, e resposta de código
   * não pode ficar em cache de tela nenhuma.
   *
   * Código que não resolve devolve `null`, e não `NOT_FOUND` (WEB-316): errar
   * a digitação no balcão é resultado normal, e o 404 aparecia como erro no
   * console a cada tentativa. Continua sendo UMA resposta só para
   * inexistente, aposentado, malformado e de outro bar, e a tentativa
   * continua cobrada.
   */
  lookup: validatorProcedure
    .input(z.object({ code: z.string().max(64) }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id
      const attemptKey = validationAttemptKey(userId)

      // Cobra ANTES de olhar o código. Conferir o contador e só depois
      // incrementar deixaria uma rajada paralela passar inteira pela
      // conferência. Bloqueado, nem código certo resolve: senão o limite
      // barraria só os erros e a varredura seguiria até acertar.
      const attempt = await incrementWindow(
        attemptKey,
        VALIDATION_ATTEMPT_LIMIT
      )
      if (!attempt.allowed) {
        throw new TRPCError({
          code: 'TOO_MANY_REQUESTS',
          message:
            'Muitas tentativas seguidas. Aguarde alguns minutos e tente novamente.'
        })
      }

      const code = normalizeReservationCode(input.code)
      const found = isReservationCodeShaped(code)
        ? await findOwnCode(db, eq(reservationCode.code, code), userId)
        : undefined
      if (!found) return null

      await refundWindowAttempt(attemptKey)

      const participants = await db
        .select({ name: team.name })
        .from(eventParticipants)
        .innerJoin(team, eq(team.id, eventParticipants.teamId))
        .where(eq(eventParticipants.eventId, found.eventId))
        .orderBy(...byMatchOrder(eventParticipants))

      return {
        codeId: found.codeId,
        code: found.code,
        guestName: found.guestName,
        reservationStatus: found.reservationStatus,
        partySize: found.partySize,
        // A cópia congelada na reserva, nunca `bar.house_offer`.
        offerSnapshot: found.offerSnapshot,
        usedCount: found.usedCount,
        maxUses: found.maxUses,
        event: {
          championship: found.championship,
          participants: participants.map((participant) => participant.name),
          participantFreeText: found.participantFreeText,
          startsAt: found.startsAt
        },
        // Só os limites: quem diz se está aberta AGORA é o relógio de quem
        // olha a tela, e quem decide se grava é `registerArrival`.
        window: getValidationWindow(found)
      }
    }),

  /**
   * Um `+1`. `requestId` é gerado pela tela para CADA chegada pretendida e
   * vira a chave primária do uso: o mesmo pedido entregue duas vezes — duplo
   * toque, retry de rede, aba duplicada reenviando — encontra a linha que o
   * primeiro gravou e não soma de novo.
   */
  registerArrival: validatorProcedure
    .input(
      z.object({ codeId: z.string().uuid(), requestId: z.string().uuid() })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id

      return db.transaction(async (tx) => {
        const found = await findOwnCode(
          tx,
          eq(reservationCode.id, input.codeId),
          userId
        )
        if (!found) throw codeNotFoundError()

        const recorded = () =>
          tx.query.reservationCodeUse.findFirst({
            where: eq(reservationCodeUse.id, input.requestId)
          })

        // Repetição vem antes das regras: a chegada que gravou no último
        // minuto da janela e perdeu a resposta precisa ser reconhecida na
        // segunda tentativa, e não recusada como código expirado.
        const existing = await recorded()

        const register = async () => {
          assertReservationConfirmed(found.reservationStatus)
          assertWindowOpen(found)

          const [row] = await tx
            .insert(reservationCodeUse)
            .values({
              id: input.requestId,
              codeId: found.codeId,
              validatedByUserId: userId
            })
            .onConflictDoNothing({ target: reservationCodeUse.id })
            .returning()
            .catch((error: unknown) => {
              throw translateArrivalWriteError(error, found.maxUses) ?? error
            })
          return row
        }
        const inserted = existing ? undefined : await register()
        // Sem linha inserida nem encontrada antes, um envio simultâneo do
        // mesmo pedido ganhou a corrida.
        const use = existing ?? inserted ?? (await recorded())

        // `requestId` já usado em outra chegada: não é repetição deste
        // pedido, e não há o que devolver sem inventar.
        if (
          !use ||
          use.codeId !== found.codeId ||
          use.validatedByUserId !== userId
        ) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'Não foi possível registrar esta chegada. Tente de novo.'
          })
        }

        return {
          useId: use.id,
          undone: use.undoneAt !== null,
          replayed: !inserted,
          ...(await readCounter(tx, found.codeId))
        }
      })
    }),

  /**
   * Desfaz a última chegada, dentro do prazo curto. Marca `undone_at` em vez
   * de apagar: a trigger devolve o uso ao contador e o registro fica para
   * auditoria.
   *
   * Não exige janela do jogo aberta: quem registrou no último minuto da
   * janela ainda precisa conseguir corrigir o toque errado.
   */
  undoArrival: validatorProcedure
    .input(z.object({ useId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id

      return db.transaction(async (tx) => {
        // Trava a linha do uso: dois envios do mesmo desfazer fazem fila, e o
        // segundo já lê `undone_at` preenchido em vez de disputar o UPDATE.
        const [use] = await tx
          .select({
            useId: reservationCodeUse.id,
            codeId: reservationCodeUse.codeId,
            undoneAt: reservationCodeUse.undoneAt,
            withinWindow: withinUndoWindow,
            superseded: hasLaterArrival
          })
          .from(reservationCodeUse)
          .innerJoin(
            reservationCode,
            eq(reservationCode.id, reservationCodeUse.codeId)
          )
          .innerJoin(
            reservation,
            eq(reservation.id, reservationCode.reservationId)
          )
          .innerJoin(event, eq(event.id, reservation.eventId))
          .innerJoin(bar, eq(bar.id, event.barId))
          .where(
            and(
              eq(reservationCodeUse.id, input.useId),
              eq(reservationCodeUse.validatedByUserId, userId),
              eq(bar.userId, userId)
            )
          )
          .limit(1)
          .for('update', { of: reservationCodeUse })

        if (!use) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Chegada não encontrada.'
          })
        }

        // Já desfeita: repetir o pedido não devolve o uso duas vezes.
        if (use.undoneAt === null) {
          if (!use.withinWindow || use.superseded) {
            throw new TRPCError({
              code: 'PRECONDITION_FAILED',
              message: use.withinWindow
                ? 'Só a última chegada pode ser desfeita.'
                : 'O prazo para desfazer esta chegada acabou.'
            })
          }
          await tx
            .update(reservationCodeUse)
            .set({ undoneAt: sql`now()` })
            .where(eq(reservationCodeUse.id, use.useId))
        }

        const counter = await readCounter(tx, use.codeId)
        return { useId: use.useId, ...counter }
      })
    })
})
