import {
  and,
  db,
  eq,
  gte,
  inArray,
  isNull,
  lte,
  type SQL,
  sql
} from '@findsports_oficial/db'
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
import { canValidateReservations } from '../lib/reservation-intake'
import {
  ARRIVAL_UNDO_GRACE_MS,
  assertCanValidateReservations,
  assertReservationConfirmed,
  assertWindowOpen,
  codeNotFoundError,
  getLateEntryWindow,
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
 * (WEB-341), até a janela de validação do jogo fechar. Não depende do código
 * digitado.
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
  if (!(await canValidateReservations(ownBar.id, subscription))) {
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
function ownCodes(reader: Reader, match: SQL, ownerId: string) {
  return reader
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
}

async function findOwnCode(reader: Reader, match: SQL, ownerId: string) {
  const [row] = await ownCodes(reader, match, ownerId).limit(1)
  return row
}

/** `logLate` e `notLogged` só servem ao bar que confirma pela comanda. */
async function assertConfirmsCodesLater(ownerId: string) {
  const ownBar = await db.query.bar.findFirst({
    where: eq(bar.userId, ownerId),
    columns: { confirmsCodesLater: true },
    with: { subscription: true }
  })
  // Pela comanda é recurso do Elite, como a escolha: o bar que perdeu o
  // plano fica só com a validação na hora, na janela de sempre.
  assertCanValidateReservations(ownBar?.subscription ?? null)
  if (!ownBar?.confirmsCodesLater) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message:
        'Para lançar códigos depois do jogo, escolha "Depois do jogo, pela comanda" na oferta da casa.'
    })
  }
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

/** Teto de códigos por envio do lançamento depois do jogo. */
const LATE_ENTRY_MAX_CODES = 80

/**
 * O que aconteceu com cada código lançado depois do jogo (WEB-412). Um
 * código que não é do bar sai como `not_found`, igual ao inexistente: a
 * mesma regra de não entregar oráculo de enumeração da busca.
 */
type LateEntryStatus =
  | 'logged'
  | 'not_found'
  | 'used'
  | 'not_confirmed'
  | 'too_early'
  | 'expired'
  | 'limited'

type LateEntry = {
  code: string
  status: LateEntryStatus
  guestName?: string
  event?: {
    championship: string
    participantFreeText: string | null
    startsAt: Date
  }
}

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
            message: 'Não foi possível validar este código. Tente de novo.'
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
            message: 'Validação não encontrada.'
          })
        }

        // Já desfeita: repetir o pedido não devolve o uso duas vezes.
        if (use.undoneAt === null) {
          if (!use.withinWindow || use.superseded) {
            throw new TRPCError({
              code: 'PRECONDITION_FAILED',
              message: use.withinWindow
                ? 'Só a última validação pode ser desfeita.'
                : 'O prazo para desfazer esta validação acabou.'
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
    }),

  /**
   * Lançamento depois do jogo (WEB-412), para o bar que confirma pela
   * comanda: o dono cola os códigos anotados e cada um vira uma chegada com
   * `late`, até 48 h depois do fim do jogo. Mesmas regras de `registerArrival`
   * (do próprio bar, reserva confirmada, uso único); a diferença é o prazo.
   *
   * Cada código conta no mesmo limite de tentativas da busca, devolvido quando
   * resolve: colar uma lista não vira atalho para varrer códigos. Estourado o
   * limite, o resto da lista volta como `limited`, sem ser conferido.
   *
   * Em lote, sem uma ida ao banco por código: uma busca para a lista, uma
   * cobrança e um insert. A conta do limite é a mesma de cobrar um por um
   * (o que resolve não gasta; o primeiro que passa do limite gasta e para a
   * lista), feita sobre a contagem que a cobrança atômica devolve. A
   * cobrança reserva o pior caso antes de qualquer resposta e devolve a
   * sobra em seguida, então um envio paralelo nunca passa do limite.
   */
  logLate: validatorProcedure
    .input(
      z.object({
        codes: z.array(z.string().max(64)).min(1).max(LATE_ENTRY_MAX_CODES)
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id
      await assertConfirmsCodesLater(userId)

      const attemptKey = validationAttemptKey(userId)
      const codes = [
        ...new Set(input.codes.map(normalizeReservationCode).filter(Boolean))
      ]
      const shaped = codes.filter(isReservationCodeShaped)
      const found = new Map(
        (shaped.length
          ? await ownCodes(db, inArray(reservationCode.code, shaped), userId)
          : []
        ).map((row) => [row.code, row])
      )

      // Pior caso: cada código que não resolve gasta uma tentativa, e o que
      // estoura o limite gasta mais uma.
      const reserved = codes.filter((code) => !found.has(code)).length + 1
      const { count } = await incrementWindow(
        attemptKey,
        VALIDATION_ATTEMPT_LIMIT,
        reserved
      )
      const now = new Date()
      const results: LateEntry[] = []
      const toLog: { entry: LateEntry; codeId: string }[] = []
      let spent = 0
      let limited = false
      for (const code of codes) {
        // Bloqueado, nem código certo resolve, senão uma lista de um código
        // por vez seguiria varrendo.
        if (
          !limited &&
          count - reserved + spent + 1 > VALIDATION_ATTEMPT_LIMIT.max
        ) {
          limited = true
          spent++
        }
        if (limited) {
          results.push({ code, status: 'limited' })
          continue
        }
        const row = found.get(code)
        if (!row) {
          spent++
          results.push({ code, status: 'not_found' })
          continue
        }
        const window = getLateEntryWindow(row)
        const entry: LateEntry = {
          code,
          status:
            row.reservationStatus !== 'confirmed'
              ? 'not_confirmed'
              : now < window.opensAt
                ? 'too_early'
                : now > window.closesAt
                  ? 'expired'
                  : row.usedCount >= row.maxUses
                    ? 'used'
                    : 'logged',
          guestName: row.guestName,
          event: {
            championship: row.championship,
            participantFreeText: row.participantFreeText,
            startsAt: row.startsAt
          }
        }
        if (entry.status === 'logged') toLog.push({ entry, codeId: row.codeId })
        results.push(entry)
      }
      if (reserved > spent)
        await refundWindowAttempt(attemptKey, reserved - spent)

      const use = (codeId: string) => ({
        id: crypto.randomUUID(),
        codeId,
        validatedByUserId: userId,
        late: true
      })
      // Validado entre a busca e o insert: já usado. A mensagem da recusa
      // não importa aqui, só se ela é uma das regras conhecidas.
      const refusedAsUsed = (error: unknown) => {
        if (!translateArrivalWriteError(error, 1)) throw error
      }
      if (toLog.length) {
        await db
          .insert(reservationCodeUse)
          .values(toLog.map(({ codeId }) => use(codeId)))
          .catch(async (error: unknown) => {
            // O lote volta inteiro: um por um, só a recusa vira `used`.
            refusedAsUsed(error)
            for (const { entry, codeId } of toLog) {
              await db
                .insert(reservationCodeUse)
                .values(use(codeId))
                .catch((error: unknown) => {
                  refusedAsUsed(error)
                  entry.status = 'used'
                })
            }
          })
      }

      return results
    }),

  /**
   * "Faltou lançar?" (WEB-412): por jogo com o prazo de lançar aberto, quem
   * marcou que ia e ainda não tem código lançado. Sai o nome, como em "Quem
   * vai", nunca o código: o dono confere na comanda. Não lê a resposta do
   * torcedor no pós-jogo (`attendance_report`), que nenhuma tela do bar lê.
   */
  notLogged: validatorProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id
    await assertConfirmsCodesLater(userId)
    const now = new Date()
    // O prazo (48 h depois do fim) se confere abaixo; o corte só limita a busca.
    const since = new Date(now.getTime() - 7 * 24 * 3_600_000)
    const rows = await db
      .select({
        eventId: event.id,
        championship: event.championship,
        participantFreeText: event.participantFreeText,
        startsAt: event.startsAt,
        endsAt: event.endsAt,
        name: user.name
      })
      .from(reservationCode)
      .innerJoin(reservation, eq(reservation.id, reservationCode.reservationId))
      .innerJoin(event, eq(event.id, reservation.eventId))
      .innerJoin(bar, eq(bar.id, event.barId))
      .innerJoin(user, eq(user.id, reservation.userId))
      .where(
        and(
          eq(bar.userId, userId),
          isNull(reservationCode.retiredAt),
          eq(reservationCode.usedCount, 0),
          eq(reservation.status, 'confirmed'),
          lte(event.startsAt, now),
          gte(event.startsAt, since)
        )
      )
      .orderBy(event.startsAt, user.name)

    const games = new Map<
      string,
      {
        id: string
        championship: string
        participantFreeText: string | null
        startsAt: Date
        closesAt: Date
        names: string[]
      }
    >()
    for (const { eventId, name, endsAt, ...game } of rows) {
      const { closesAt } = getLateEntryWindow({
        startsAt: game.startsAt,
        endsAt
      })
      if (closesAt < now) continue
      const entry = games.get(eventId) ?? {
        id: eventId,
        ...game,
        closesAt,
        names: []
      }
      entry.names.push(name)
      games.set(eventId, entry)
    }
    return [...games.values()]
  })
})
