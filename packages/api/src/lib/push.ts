import { db, inArray, sql } from '@findsports_oficial/db'
import {
  BRASILIA_TIME_ZONE,
  brasiliaDay
} from '@findsports_oficial/db/event-window'
import { utcNowSql } from '@findsports_oficial/db/event-window-sql'
import { pushToken } from '@findsports_oficial/db/schema/push'
import { gameTitle } from './game-participants'
import { utcIso } from './utc-timestamp'

/*
 * Push no celular (WEB-416), pelo serviço da Expo: o app registra o token do
 * aparelho (`push.register`), e cada gatilho manda para os aparelhos da
 * pessoa. Sem token, nada sai. No preview (`PUSH_DELIVERY=console`) a
 * mensagem vai para o log: o banco é cópia de produção, com aparelhos de
 * gente de verdade. Nos testes, `fakeExpoPush` dubla o envio.
 */

export const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'
/** A Expo aceita até 100 mensagens por pedido. */
const BATCH = 100

export type PushMessage = {
  title: string
  body: string
  /** `url` é a tela que o app abre no toque; o resto vai para os botões. */
  data: { url: string } & Record<string, string>
  /** Categoria com botões registrada pelo app (`friend_call`). */
  categoryId?: string
}

type Ticket = { status: 'ok' | 'error'; details?: { error?: string } }

/**
 * Manda a mensagem para todos os aparelhos das pessoas. Aparelho que a Expo
 * diz não existir mais (`DeviceNotRegistered`) sai da tabela.
 */
export async function sendPush(userIds: string[], message: PushMessage) {
  if (!userIds.length) return 0
  const tokens = await db
    .select({ token: pushToken.token })
    .from(pushToken)
    .where(inArray(pushToken.userId, userIds))
  if (!tokens.length) return 0
  const all = tokens.map(({ token }) => ({
    to: token,
    title: message.title,
    body: message.body,
    data: message.data,
    categoryId: message.categoryId,
    sound: 'default',
    // O canal que o app cria no Android (`lib/push.ts` do app).
    channelId: 'default'
  }))
  if (process.env.PUSH_DELIVERY === 'console') {
    console.log(
      `[push] PUSH_DELIVERY=console, não enviado (${all.length} aparelho(s)): ${message.title} | ${message.body} | ${message.data.url}`
    )
    return 0
  }
  const accessToken = process.env.EXPO_ACCESS_TOKEN
  let sent = 0
  for (let i = 0; i < all.length; i += BATCH) {
    const batch = all.slice(i, i + BATCH)
    const response = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {})
      },
      body: JSON.stringify(batch)
    })
    if (!response.ok) throw new Error(`Expo push respondeu ${response.status}`)
    const { data } = (await response.json()) as { data: Ticket[] }
    const gone = batch
      .filter((_, n) => data[n]?.details?.error === 'DeviceNotRegistered')
      .map((m) => m.to)
    if (gone.length)
      await db.delete(pushToken).where(inArray(pushToken.token, gone))
    sent += data.filter((t) => t.status === 'ok').length
  }
  // ponytail: sem ler os recibos (`getReceipts`); o token morto só sai no
  // envio seguinte. Ler quando o volume pedir.
  return sent
}

/** Push é extra: falha vai ao log e nunca derruba quem chamou. */
export function sendPushQuietly(userIds: string[], message: PushMessage) {
  return sendPush(userIds, message).catch((error: unknown) => {
    console.error(
      JSON.stringify({
        evt: 'push_failed',
        url: message.data.url,
        message: error instanceof Error ? error.message : String(error)
      })
    )
    return 0
  })
}

const TIME = new Intl.DateTimeFormat('pt-BR', {
  timeZone: BRASILIA_TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23'
})
const DAY = new Intl.DateTimeFormat('pt-BR', {
  timeZone: BRASILIA_TIME_ZONE,
  weekday: 'short',
  day: '2-digit',
  month: '2-digit'
})

/** "hoje, 21:30" ou "sáb., 15/11, 21:30", no relógio de Brasília. */
export function pushWhen(startsAt: Date, now = new Date()) {
  const day =
    brasiliaDay(startsAt) === brasiliaDay(now)
      ? 'hoje'
      : brasiliaDay(startsAt) === brasiliaDay(now, 1)
        ? 'amanhã'
        : DAY.format(startsAt)
  return `${day}, ${TIME.format(startsAt)}`
}

type GameRow = { title: string; bar_name: string; starts_at: string }

const gameLine = (row: GameRow) =>
  `${row.title} no ${row.bar_name}, ${pushWhen(new Date(utcIso(row.starts_at)))}`

const title = gameTitle({
  id: sql`e.id`,
  participantFreeText: sql`e.participant_free_text`,
  championship: sql`e.championship`
})

/** Lê o chamado com quem chamou, quem foi chamado, o jogo e o bar. */
async function readCall(callId: string) {
  const rows = await db.execute<
    GameRow & {
      from_user_id: string
      from_name: string
      to_user_id: string
      to_name: string
      bar_id: string
    }
  >(sql`
    SELECT c.from_user_id, f.name AS from_name, c.to_user_id, t.name AS to_name,
      ${title} AS title, b.id AS bar_id, b.name AS bar_name, e.starts_at
    FROM friend_call c
    JOIN "user" f ON f.id = c.from_user_id
    JOIN "user" t ON t.id = c.to_user_id
    JOIN event e ON e.id = c.event_id
    JOIN bar b ON b.id = c.bar_id
    WHERE c.id = ${callId}
  `)
  return rows.rows[0]
}

/**
 * "Gabriel te chamou pro jogo" (24g, WEB-429), para quem foi chamado, com
 * os botões "Vou também" e "Agora não" da categoria `friend_call`.
 */
export async function pushFriendCall(callId: string) {
  const call = await readCall(callId)
  if (!call) return 0
  return sendPushQuietly([call.to_user_id], {
    title: `${call.from_name} te chamou pro jogo`,
    body: gameLine(call),
    data: { url: '/avisos', type: 'friend_call', callId, barId: call.bar_id },
    categoryId: 'friend_call'
  })
}

/** "Marina vai também", para quem chamou. "Agora não" não avisa ninguém. */
export async function pushCallAccepted(callId: string) {
  const call = await readCall(callId)
  if (!call) return 0
  return sendPushQuietly([call.from_user_id], {
    title: `${call.to_name} vai também`,
    body: gameLine(call),
    data: { url: '/avisos', type: 'call_accepted', callId }
  })
}

/**
 * "Me lembrar 3 h antes" (busca com IA): o lembrete com antecedência que
 * chegou na janela sai uma vez (`pushed_at`). O de antes de a janela abrir
 * só; o pedido já dentro dela não, porque a pessoa acabou de pedir e
 * Avisos já o mostra. Marca antes de mandar: falha no envio não repete.
 * Roda no cron de 15 min do Worker (`PUSH_CRON`): o diário não serve, o
 * lembrete é 3 h antes do jogo. Sem `PUSH_ENABLED=1` volta antes de qualquer
 * consulta: o cron não acorda o Neon a cada 15 min enquanto nenhum aparelho
 * pode receber (sem `projectId` do EAS e Firebase não há token).
 */
export async function pushDueReminders(now?: Date) {
  if (process.env.PUSH_ENABLED !== '1') return { due: 0, sent: 0 }
  const due = await db.execute<
    GameRow & { user_id: string; bar_id: string }
  >(sql`
    UPDATE game_reminder r SET pushed_at = now()
    FROM event e
    JOIN bar b ON b.id = e.bar_id AND b.is_active
    WHERE e.id = r.event_id
      AND r.pushed_at IS NULL
      AND r.remind_before_minutes IS NOT NULL
      AND e.published_at IS NOT NULL
      AND e.starts_at > ${utcNowSql(now)}
      AND e.starts_at - r.remind_before_minutes * interval '1 minute' <= ${utcNowSql(now)}
      AND r.created_at < (e.starts_at - r.remind_before_minutes * interval '1 minute') AT TIME ZONE 'UTC'
    RETURNING r.user_id, ${title} AS title, b.id AS bar_id, b.name AS bar_name, e.starts_at
  `)
  let sent = 0
  for (const row of due.rows)
    sent += await sendPushQuietly([row.user_id], {
      title: 'Seu jogo está chegando',
      body: gameLine(row),
      data: { url: `/bar/${row.bar_id}`, type: 'reminder' }
    })
  return { due: due.rows.length, sent }
}

/** O cron do Worker que roda `pushDueReminders` (`wrangler.jsonc`). */
export const PUSH_CRON = '*/15 * * * *'
