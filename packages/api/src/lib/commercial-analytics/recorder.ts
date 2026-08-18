import { db, sql } from '@findsports_oficial/db'
import { TRPCError } from '@trpc/server'
import type { Context } from '../../context'
import type { CommercialEventType } from './types'

/** Rate limit: max events per fan per bar per minute */
const RATE_LIMIT_PER_MINUTE = 30

/** Ações que contam como intenção comercial (seção 9.2) */
const HIGH_INTENT_TYPES: readonly CommercialEventType[] = [
  'directions_opened',
  'phone_clicked',
  'whatsapp_opened'
]

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function validateFanSession(ctx: Context) {
  if (!ctx.session) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'Autenticação necessária'
    })
  }
  if (ctx.session.user.role !== 'fan') {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Apenas fãs podem registrar eventos'
    })
  }
}

/**
 * ESC-06: as validações que dependem do banco (impersonação, bar, jogo,
 * telefone, WhatsApp e rate limit) eram cinco consultas sequenciais antes do
 * insert. Agora todas são avaliadas dentro da mesma instrução, que devolve um
 * motivo de recusa quando alguma falha.
 *
 * Cada motivo mapeia para o mesmo código e a mesma mensagem de antes — a
 * consolidação não pode custar precisão de erro para quem consome a API.
 */
export const RECORD_FAILURES = {
  impersonated: {
    code: 'FORBIDDEN',
    message: 'Sessão impersonada não pode registrar eventos'
  },
  bar_not_found: { code: 'NOT_FOUND', message: 'Bar não encontrado' },
  bar_inactive: { code: 'FORBIDDEN', message: 'Bar inativo' },
  event_mismatch: {
    code: 'BAD_REQUEST',
    message: 'Evento não pertence a este bar'
  },
  no_phone: {
    code: 'BAD_REQUEST',
    message: 'Bar não tem telefone configurado'
  },
  no_whatsapp: { code: 'BAD_REQUEST', message: 'Bar não aceita WhatsApp' },
  rate_limited: {
    code: 'TOO_MANY_REQUESTS',
    message: 'Muitas requisições. Tente novamente mais tarde.'
  }
} as const satisfies Record<
  string,
  { code: TRPCError['code']; message: string }
>

export type RecordFailureReason = keyof typeof RECORD_FAILURES

/**
 * Converte o motivo devolvido pelo banco no erro correspondente. Um motivo
 * desconhecido é falha de programação, não uma recusa de negócio — nunca deve
 * virar sucesso silencioso.
 */
export function assertRecordable(reason: string): void {
  if (reason === 'ok') return

  const failure = RECORD_FAILURES[reason as RecordFailureReason]
  if (!failure) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: `Motivo de recusa desconhecido: ${reason}`
    })
  }

  throw new TRPCError({ code: failure.code, message: failure.message })
}

// ---------------------------------------------------------------------------
// Record event
// ---------------------------------------------------------------------------

interface RecordEventInput {
  pubId: string
  type: CommercialEventType
  sourceEventId?: string
}

/**
 * Record a commercial event for a bar.
 *
 * - Fan auth, no impersonation
 * - Validates bar, event, phone/whatsapp constraints
 * - Idempotent: INSERT ON CONFLICT (daily dedup constraint) silently skips
 * - Rate limits per fan per bar
 * - Triggers async rollup (transactional, never deletes raw first)
 */
export async function recordCommercialEvent(
  ctx: Context,
  input: RecordEventInput
): Promise<{ recorded: boolean; deduplicated: boolean }> {
  const { pubId, type: eventType, sourceEventId } = input

  // 1. Validate fan session
  validateFanSession(ctx)

  if (!ctx.session) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'Sessão não encontrada'
    })
  }

  const actorUserId = ctx.session.user.id
  const sessionId = ctx.session.session.id

  // 2. Validações no banco + insert + rollup, tudo numa instrução só
  //
  //    ESC-06: impersonação, bar, jogo, telefone, WhatsApp e rate limit eram
  //    cinco consultas sequenciais antes do insert. Viraram CTEs da mesma
  //    instrução: uma ida ao banco em vez de seis, e sem janela entre
  //    validar e gravar — as duas coisas passaram a enxergar o mesmo estado.
  //
  //    ESC-03: antes, o rollup era recalculado do zero a cada evento — sete
  //    agregações sobre todos os eventos brutos do bar naquele dia, o que
  //    torna o custo do dia quadrático — e era disparado com `void`, sem
  //    await. Em função serverless a instância congela assim que a resposta
  //    sai, então o rollup podia ser cortado no meio, sem ninguém saber.
  //
  //    Agora o incremento vai na mesma instrução do insert: custo constante,
  //    atômico, e sem nenhum trabalho pendente depois da resposta.
  //
  //    A CTE `prior` enxerga o estado ANTERIOR ao insert — num único
  //    comando, os efeitos de uma CTE que escreve não são visíveis às
  //    outras, que compartilham o mesmo snapshot. É isso que permite
  //    decidir se este evento estreia o usuário no dia (unique_visitors)
  //    ou estreia a intenção comercial dele (interested_people).
  const now = new Date()
  const commercialDay = now.toISOString().slice(0, 10)
  const isHighIntent = HIGH_INTENT_TYPES.includes(eventType)

  // Só faz sentido perguntar pela estreia de intenção quando o próprio
  // evento é de intenção; caso contrário o incremento é sempre zero.
  const interestedIncrement = isHighIntent
    ? sql`CASE WHEN p.had_intent_today THEN 0 ELSE 1 END`
    : sql`0`

  // Telefone é exigido tanto por `phone_clicked` quanto por `whatsapp_opened`
  // (o segundo abre uma conversa com o número). Fragmentos literais, e não
  // parâmetros booleanos, para não depender de inferência de tipo.
  const requiresPhone =
    eventType === 'phone_clicked' || eventType === 'whatsapp_opened'
  const phoneCheck = requiresPhone
    ? sql`WHEN COALESCE(b.phone, '') = '' THEN 'no_phone'`
    : sql``
  const whatsappCheck =
    eventType === 'whatsapp_opened'
      ? sql`WHEN NOT b.phone_accepts_whatsapp THEN 'no_whatsapp'`
      : sql``

  const rateLimitCutoff = new Date(now.getTime() - 60_000)

  const result = await db.execute(sql`
    WITH bar_row AS (
      SELECT b.id, b.is_active, b.phone, b.phone_accepts_whatsapp
      FROM bar b
      WHERE b.id = ${pubId}
    ),
    checks AS (
      SELECT CASE
        -- A impersonação é lida da sessão ATUAL, por chave primária. A versão
        -- anterior pegava a sessão mais recente do usuário, que podia não ser
        -- a que estava fazendo a requisição.
        WHEN (SELECT s.impersonated_by FROM session s WHERE s.id = ${sessionId}) IS NOT NULL
          THEN 'impersonated'
        WHEN NOT EXISTS (SELECT 1 FROM bar_row) THEN 'bar_not_found'
        WHEN NOT (SELECT b.is_active FROM bar_row b) THEN 'bar_inactive'
        WHEN ${sourceEventId ?? null}::text IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM event e
            WHERE e.id = ${sourceEventId ?? null} AND e.bar_id = ${pubId}
          ) THEN 'event_mismatch'
        ${phoneCheck}
        ${whatsappCheck}
        WHEN (
          SELECT COUNT(*) FROM bar_commercial_event
          WHERE actor_user_id = ${actorUserId}
            AND bar_id = ${pubId}
            AND occurred_at >= ${rateLimitCutoff}
        ) >= ${RATE_LIMIT_PER_MINUTE} THEN 'rate_limited'
        ELSE 'ok'
      END AS reason
      FROM bar_row b
      -- Bar inexistente ainda precisa produzir uma linha, para conseguir
      -- reportar o motivo "bar nao encontrado".
      RIGHT JOIN (SELECT 1) dummy ON true
    ),
    prior AS (
      SELECT
        EXISTS (
          SELECT 1 FROM bar_commercial_event
          WHERE bar_id = ${pubId}
            AND actor_user_id = ${actorUserId}
            AND commercial_day = ${commercialDay}::date
        ) AS had_any_today,
        EXISTS (
          SELECT 1 FROM bar_commercial_event
          WHERE bar_id = ${pubId}
            AND actor_user_id = ${actorUserId}
            AND commercial_day = ${commercialDay}::date
            AND type IN ('directions_opened', 'phone_clicked', 'whatsapp_opened')
        ) AS had_intent_today
    ),
    inserted AS (
      INSERT INTO bar_commercial_event (
        id, bar_id, actor_user_id, type, source_event_id,
        occurred_at, commercial_day, created_at
      )
      SELECT
        ${crypto.randomUUID()}, ${pubId}, ${actorUserId}, ${eventType},
        ${sourceEventId ?? null},
        ${now}, ${commercialDay}::date, ${now}
      FROM checks c
      WHERE c.reason = 'ok'
      ON CONFLICT (bar_id, actor_user_id, type, commercial_day, source_event_id) DO NOTHING
      RETURNING id
    ),
    rollup AS (
      INSERT INTO bar_commercial_daily_rollup (
        bar_id, commercial_day,
        unique_visitors, interested_people, high_intent_actions,
        profile_views, directions_opened, phone_clicked, whatsapp_opened,
        is_finalized, created_at, updated_at
      )
      SELECT
        ${pubId}, ${commercialDay}::date,
        CASE WHEN p.had_any_today THEN 0 ELSE 1 END,
        ${interestedIncrement},
        ${isHighIntent ? 1 : 0}::integer,
        ${eventType === 'profile_view' ? 1 : 0}::integer,
        ${eventType === 'directions_opened' ? 1 : 0}::integer,
        ${eventType === 'phone_clicked' ? 1 : 0}::integer,
        ${eventType === 'whatsapp_opened' ? 1 : 0}::integer,
        false, NOW(), NOW()
      FROM prior p
      -- Só contabiliza se o evento bruto foi de fato inserido; em conflito
      -- de deduplicação diária, o rollup fica intocado.
      WHERE EXISTS (SELECT 1 FROM inserted)
      ON CONFLICT (bar_id, commercial_day) DO UPDATE SET
        unique_visitors = bar_commercial_daily_rollup.unique_visitors + EXCLUDED.unique_visitors,
        interested_people = bar_commercial_daily_rollup.interested_people + EXCLUDED.interested_people,
        high_intent_actions = bar_commercial_daily_rollup.high_intent_actions + EXCLUDED.high_intent_actions,
        profile_views = bar_commercial_daily_rollup.profile_views + EXCLUDED.profile_views,
        directions_opened = bar_commercial_daily_rollup.directions_opened + EXCLUDED.directions_opened,
        phone_clicked = bar_commercial_daily_rollup.phone_clicked + EXCLUDED.phone_clicked,
        whatsapp_opened = bar_commercial_daily_rollup.whatsapp_opened + EXCLUDED.whatsapp_opened,
        is_finalized = false,
        updated_at = NOW()
    )
    SELECT
      (SELECT c.reason FROM checks c) AS reason,
      (SELECT COUNT(*) FROM inserted)::int AS inserted_count
  `)

  const outcome = result.rows[0] as
    | { reason: string; inserted_count: number }
    | undefined

  if (!outcome) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Falha ao registrar evento comercial'
    })
  }

  // Recusa vira o mesmo erro de antes; nada foi gravado.
  assertRecordable(outcome.reason)

  // Passou nas validações mas não inseriu = deduplicação diária.
  const recorded = outcome.inserted_count > 0

  return { recorded, deduplicated: !recorded }
}

// ---------------------------------------------------------------------------
// Daily rollup (idempotent, transactional)
// ---------------------------------------------------------------------------

/**
 * Recalcula o rollup diário de um bar a partir dos eventos brutos.
 *
 * Este era o caminho normal de gravação (ESC-03) e passou a ser o caminho de
 * conserto: o registro de evento agora incrementa o rollup em custo
 * constante, e esta função existe para reconciliar o valor exato.
 *
 * Por que ainda é necessária: o incremento decide `unique_visitors` e
 * `interested_people` olhando se o usuário já tinha registro no dia. Duas
 * ações do MESMO usuário chegando de forma concorrente podem ler o estado
 * anterior ao mesmo tempo e contar a estreia duas vezes. É raro — exige duas
 * ações simultâneas do mesmo usuário no mesmo bar — e afeta só as duas
 * métricas de contagem distinta, nunca os totais brutos. Rodar esta função
 * para o dia fechado devolve o número exato, e é o passo que deve preceder
 * marcar `is_finalized` (ver ESC-10).
 *
 * Idempotente: pode ser executada quantas vezes for preciso. Diferente da
 * versão anterior, não engole erro — quem chama precisa saber que a
 * reconciliação falhou.
 */
export async function reconcileDailyRollup(
  barId: string,
  commercialDay: string
): Promise<void> {
  await db.execute(sql`
      WITH day_stats AS (
        SELECT
          COUNT(DISTINCT actor_user_id) AS unique_visitors,
          COUNT(DISTINCT CASE WHEN type IN ('directions_opened', 'phone_clicked', 'whatsapp_opened') THEN actor_user_id END) AS interested_people,
          COUNT(CASE WHEN type IN ('directions_opened', 'phone_clicked', 'whatsapp_opened') THEN 1 END) AS high_intent_actions,
          COUNT(CASE WHEN type = 'profile_view' THEN 1 END) AS profile_views,
          COUNT(CASE WHEN type = 'directions_opened' THEN 1 END) AS directions_opened,
          COUNT(CASE WHEN type = 'phone_clicked' THEN 1 END) AS phone_clicked,
          COUNT(CASE WHEN type = 'whatsapp_opened' THEN 1 END) AS whatsapp_opened
        FROM bar_commercial_event
        WHERE bar_id = ${barId}
          AND commercial_day = ${commercialDay}
      )
      INSERT INTO bar_commercial_daily_rollup (
        bar_id, commercial_day, unique_visitors, interested_people,
        high_intent_actions, profile_views, directions_opened,
        phone_clicked, whatsapp_opened, is_finalized, created_at, updated_at
      )
      SELECT
        ${barId}, ${commercialDay},
        ds.unique_visitors, ds.interested_people, ds.high_intent_actions,
        ds.profile_views, ds.directions_opened, ds.phone_clicked, ds.whatsapp_opened,
        false, NOW(), NOW()
      FROM day_stats ds
      ON CONFLICT (bar_id, commercial_day)
      DO UPDATE SET
        unique_visitors = EXCLUDED.unique_visitors,
        interested_people = EXCLUDED.interested_people,
        high_intent_actions = EXCLUDED.high_intent_actions,
        profile_views = EXCLUDED.profile_views,
        directions_opened = EXCLUDED.directions_opened,
        phone_clicked = EXCLUDED.phone_clicked,
        whatsapp_opened = EXCLUDED.whatsapp_opened,
        is_finalized = false,
        updated_at = NOW()
  `)
}

// ---------------------------------------------------------------------------
// Retention cleanup (idempotent, safe to run multiple times)
// ---------------------------------------------------------------------------

export type RetentionResult = {
  /** Pares (bar, dia) que passaram a estar consolidados nesta execução. */
  diasFinalizados: number
  /** Eventos brutos que se qualificam para poda. */
  eventosPodaveis: number
  /** Eventos brutos efetivamente apagados. Zero quando não foi pedido. */
  eventosApagados: number
  /** Se a poda foi executada de fato. */
  podou: boolean
}

/**
 * Consolida os rollups de dias já fechados (ESC-10).
 *
 * Recalcula o valor exato a partir dos eventos brutos e marca
 * `is_finalized`. Esse passo nunca existiu: o campo era criado com `false` e
 * nada no código o levava a `true`, o que deixava a política de retenção
 * inteira sem gatilho.
 *
 * Só toca dias anteriores a hoje — o dia corrente ainda está recebendo
 * evento. E o `WHERE` do `ON CONFLICT` protege o que já está consolidado: um
 * dia finalizado não é reescrito, o que importa porque depois da poda ele não
 * teria mais evento bruto de onde recalcular.
 */
async function finalizarDiasFechados(): Promise<number> {
  const result = await db.execute(sql`
    INSERT INTO bar_commercial_daily_rollup (
      bar_id, commercial_day,
      unique_visitors, interested_people, high_intent_actions,
      profile_views, directions_opened, phone_clicked, whatsapp_opened,
      is_finalized, created_at, updated_at
    )
    SELECT
      bar_id,
      commercial_day,
      COUNT(DISTINCT actor_user_id),
      COUNT(DISTINCT actor_user_id) FILTER (WHERE type IN ('directions_opened', 'phone_clicked', 'whatsapp_opened')),
      COUNT(*) FILTER (WHERE type IN ('directions_opened', 'phone_clicked', 'whatsapp_opened')),
      COUNT(*) FILTER (WHERE type = 'profile_view'),
      COUNT(*) FILTER (WHERE type = 'directions_opened'),
      COUNT(*) FILTER (WHERE type = 'phone_clicked'),
      COUNT(*) FILTER (WHERE type = 'whatsapp_opened'),
      true, NOW(), NOW()
    FROM bar_commercial_event
    WHERE commercial_day < CURRENT_DATE
    GROUP BY bar_id, commercial_day
    ON CONFLICT (bar_id, commercial_day) DO UPDATE SET
      unique_visitors = EXCLUDED.unique_visitors,
      interested_people = EXCLUDED.interested_people,
      high_intent_actions = EXCLUDED.high_intent_actions,
      profile_views = EXCLUDED.profile_views,
      directions_opened = EXCLUDED.directions_opened,
      phone_clicked = EXCLUDED.phone_clicked,
      whatsapp_opened = EXCLUDED.whatsapp_opened,
      is_finalized = true,
      updated_at = NOW()
    WHERE bar_commercial_daily_rollup.is_finalized = false
    RETURNING bar_id
  `)
  return result.rows.length
}

/**
 * Retenção de analytics: consolida e só então poda (ESC-10).
 *
 * A versão anterior fazia o oposto do que o próprio comentário dela dizia:
 * apagava os ROLLUPS — o agregado compacto, que é justamente o registro de
 * longo prazo — e deixava os eventos brutos, que são o que cresce sem limite.
 * Além disso usava `RETURNING id` numa tabela sem coluna `id`, então falhava
 * em tempo de execução, e filtrava por `is_finalized = true`, que nunca era
 * verdade. Três defeitos que se escondiam: como quebrava sempre, nenhum deles
 * chegava a produzir efeito visível.
 *
 * A ordem correta é: consolidar o dia fechado, conferir que o rollup existe e
 * está finalizado, e só aí apagar o evento bruto correspondente. Rollups
 * ficam para sempre; brutos são detalhe recuperável em agregado.
 *
 * A consolidação sempre roda — não destrói nada e é idempotente. A poda é
 * que precisa ser pedida: `apagarEventosBrutos` é `false` por padrão, então
 * uma execução distraída informa o que aconteceria em vez de apagar. O nome
 * é esse, e não "simulação", justamente porque metade da rotina escreve.
 */
export async function runAnalyticsRetention(options: {
  retentionDays: number
  apagarEventosBrutos?: boolean
}): Promise<RetentionResult> {
  const { retentionDays, apagarEventosBrutos = false } = options

  const cutoff = new Date()
  cutoff.setUTCDate(cutoff.getUTCDate() - retentionDays)
  const cutoffDay = cutoff.toISOString().slice(0, 10)

  const diasFinalizados = await finalizarDiasFechados()

  // O JOIN com o rollup finalizado é a garantia: nenhum evento bruto é
  // apagado sem que o agregado daquele bar naquele dia já exista e esteja
  // consolidado.
  const alvo = sql`
    FROM bar_commercial_event e
    JOIN bar_commercial_daily_rollup r
      ON r.bar_id = e.bar_id
     AND r.commercial_day = e.commercial_day
     AND r.is_finalized = true
    WHERE e.commercial_day < ${cutoffDay}::date
  `

  const contagem = await db.execute(sql`SELECT COUNT(*) AS n ${alvo}`)
  const eventosPodaveis = Number((contagem.rows[0] as { n: string })?.n ?? 0)

  if (!apagarEventosBrutos || eventosPodaveis === 0) {
    return {
      diasFinalizados,
      eventosPodaveis,
      eventosApagados: 0,
      podou: false
    }
  }

  const apagados = await db.execute(sql`
    DELETE FROM bar_commercial_event e
    USING bar_commercial_daily_rollup r
    WHERE r.bar_id = e.bar_id
      AND r.commercial_day = e.commercial_day
      AND r.is_finalized = true
      AND e.commercial_day < ${cutoffDay}::date
    RETURNING e.id
  `)

  return {
    diasFinalizados,
    eventosPodaveis,
    eventosApagados: apagados.rows.length,
    podou: true
  }
}
