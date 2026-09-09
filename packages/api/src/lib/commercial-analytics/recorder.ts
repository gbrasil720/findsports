import { db, sql } from '@findsports_oficial/db'
import { recommendationEvent } from '@findsports_oficial/db/schema/recommendation'
import { TRPCError } from '@trpc/server'
import type { Context } from '../../context'
import { classicRuleMatches, currentClassicRulesCte } from '../classics'
import { getCommercialDay } from './commercial-day'
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
  },
  classic_event_required: {
    code: 'BAD_REQUEST',
    message: 'Exposição de clássico exige um evento de origem'
  },
  not_classic_event: {
    code: 'BAD_REQUEST',
    message: 'Evento não é um clássico editorial'
  },
  classic_not_elite: {
    code: 'BAD_REQUEST',
    message: 'A posição garantida nos clássicos é exclusiva do Elite'
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
  recommendationRunId?: string
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

  // 2. Validações no banco + insert + rollup, tudo numa transação só
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
  //
  //    WEB-97: esse snapshot é POR INSTRUÇÃO, não por transação — duas
  //    primeiras ações paralelas do mesmo fan/bar/dia tiravam o snapshot
  //    antes de qualquer commit e cada uma somava 1 em unique_visitors
  //    (e interested_people, quando as duas eram de alta intenção). O lock
  //    de consultoria abaixo serializa o par ANTES do snapshot da instrução
  //    principal: um lock dentro da própria instrução não adianta, o
  //    snapshot já estaria tirado (verificado empiricamente). Por isso o
  //    lock é uma instrução separada, na mesma transação — a segunda
  //    chamada só tira o snapshot depois que a primeira commitou, e enxerga
  //    o evento já gravado no `prior`.
  const now = new Date()
  const commercialDay = getCommercialDay(now)
  const isHighIntent = HIGH_INTENT_TYPES.includes(eventType)
  const isClassicPlacement =
    eventType === 'classic_exposure' || eventType === 'classic_click'

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

  // WEB-96: checar e gravar na mesma instrução fechou a janela dentro de uma
  // chamada, mas não entre chamadas — sob concorrência, cada instrução monta
  // o próprio snapshot e requisições paralelas podem contar o mesmo estado
  // pré-commit e todas passar (write skew), estourando o limite de 30/min.
  //
  // O lock de transação no par fan/bar serializa as chamadas concorrentes: a
  // que chega atrás só monta o snapshot da instrução depois do commit da
  // anterior, então enxerga a contagem atualizada e é recusada quando o par
  // já atingiu 30 na janela. O limite é por par, então serializar o par não
  // afeta pares diferentes, e o volume legítimo do par já é limitado a 30/min
  // pelo próprio rate limit.
  const result = await db.transaction(async (tx) => {
    // Lock de consultoria na mesma transação da instrução principal, numa
    // instrução própria — só assim ele vale antes do snapshot dela (WEB-97).
    // Sempre adquirido ANTES do lock do par abaixo, na mesma ordem para
    // qualquer chamador: a ordem fixa entre os dois locks de consultoria
    // evita espera circular entre chamadas concorrentes do mesmo par.
    await tx.execute(sql`
      SELECT pg_advisory_xact_lock(
        hashtextextended(
          ${pubId}::text || ':' || ${actorUserId}::text || ':' || ${commercialDay}::text,
          0
        )
      )
    `)

    // Lock de transação no par fan/bar (WEB-96): liberado no
    // COMMIT/ROLLBACK, nunca em autocommit.
    await tx.execute(sql`
      SELECT pg_advisory_xact_lock(
        hashtextextended(concat(${actorUserId}::text, '|', ${pubId}::text), 0)
      )
    `)

    return tx.execute(sql`
    WITH ${currentClassicRulesCte},
    bar_row AS (
      SELECT b.id, b.is_active, b.plan, b.phone, b.phone_accepts_whatsapp
      FROM bar b
      WHERE b.id = ${pubId}
    ),
    source_event AS (
      SELECT
        e.id,
        e.championship,
        e.starts_at,
        classic.classic_rule_id,
        classic.classic_rule_version_id,
        classic.classic_rule_version,
        classic.classic_rule_reason
      FROM event e
      LEFT JOIN LATERAL (
        SELECT
          cr.classic_rule_id,
          cr.classic_rule_version_id,
          cr.classic_rule_version,
          cr.classic_rule_reason
        FROM current_classic_rules cr
        WHERE ${classicRuleMatches(sql`e`)}
        ORDER BY cr.rule_type, cr.classic_rule_id
        LIMIT 1
      ) classic ON true
      WHERE e.id = ${sourceEventId ?? null}
        AND e.bar_id = ${pubId}
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
        WHEN ${isClassicPlacement} AND ${sourceEventId ?? null}::text IS NULL
          THEN 'classic_event_required'
        WHEN ${isClassicPlacement}
          AND NOT EXISTS (SELECT 1 FROM source_event WHERE classic_rule_id IS NOT NULL)
          THEN 'not_classic_event'
        WHEN ${isClassicPlacement}
          AND (SELECT b.plan FROM bar_row b) <> 'elite'
          THEN 'classic_not_elite'
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
        source_event_championship, source_event_starts_at,
        classic_rule_id, classic_rule_version_id, classic_rule_version,
        classic_rule_reason, occurred_at, commercial_day, created_at
      )
      SELECT
        ${crypto.randomUUID()}, ${pubId}, ${actorUserId}, ${eventType},
        ${sourceEventId ?? null},
        source_event.championship, source_event.starts_at,
        source_event.classic_rule_id, source_event.classic_rule_version_id,
        source_event.classic_rule_version, source_event.classic_rule_reason,
        ${now}, ${commercialDay}::date, ${now}
      FROM checks c
      LEFT JOIN source_event ON true
      WHERE c.reason = 'ok'
      ON CONFLICT (bar_id, actor_user_id, type, commercial_day, source_event_id) DO NOTHING
      RETURNING id
    ),
    rollup AS (
      INSERT INTO bar_commercial_daily_rollup (
        bar_id, commercial_day,
        unique_visitors, interested_people, high_intent_actions,
        profile_views, directions_opened, phone_clicked, whatsapp_opened,
        classic_exposures, classic_clicks,
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
        ${eventType === 'classic_exposure' ? 1 : 0}::integer,
        ${eventType === 'classic_click' ? 1 : 0}::integer,
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
        classic_exposures = bar_commercial_daily_rollup.classic_exposures + EXCLUDED.classic_exposures,
        classic_clicks = bar_commercial_daily_rollup.classic_clicks + EXCLUDED.classic_clicks,
        is_finalized = false,
        updated_at = NOW()
    ),
    event_rollup AS (
      INSERT INTO bar_commercial_event_daily_rollup (
        bar_id, event_id, commercial_day,
        profile_views, directions_opened, phone_clicked, whatsapp_opened,
        is_finalized, created_at, updated_at
      )
      SELECT
        ${pubId}, ${sourceEventId ?? null}::text, ${commercialDay}::date,
        ${eventType === 'profile_view' ? 1 : 0}::integer,
        ${eventType === 'directions_opened' ? 1 : 0}::integer,
        ${eventType === 'phone_clicked' ? 1 : 0}::integer,
        ${eventType === 'whatsapp_opened' ? 1 : 0}::integer,
        false, NOW(), NOW()
      FROM inserted
      WHERE ${sourceEventId ?? null}::text IS NOT NULL
      ON CONFLICT (bar_id, event_id, commercial_day) DO UPDATE SET
        profile_views = bar_commercial_event_daily_rollup.profile_views + EXCLUDED.profile_views,
        directions_opened = bar_commercial_event_daily_rollup.directions_opened + EXCLUDED.directions_opened,
        phone_clicked = bar_commercial_event_daily_rollup.phone_clicked + EXCLUDED.phone_clicked,
        whatsapp_opened = bar_commercial_event_daily_rollup.whatsapp_opened + EXCLUDED.whatsapp_opened,
        is_finalized = false,
        updated_at = NOW()
    )
    SELECT
      (SELECT c.reason FROM checks c) AS reason,
      (SELECT COUNT(*) FROM inserted)::int AS inserted_count
    `)
  })

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

  const recommendationConversionType =
    eventType === 'directions_opened' ||
    eventType === 'phone_clicked' ||
    eventType === 'whatsapp_opened'
      ? eventType
      : null

  if (input.recommendationRunId && recommendationConversionType) {
    try {
      await db
        .insert(recommendationEvent)
        .values({
          actorUserId,
          barId: pubId,
          runId: input.recommendationRunId,
          type: recommendationConversionType
        })
        .onConflictDoNothing()
    } catch {
      // A atribuição é telemetria secundária. Uma falha nela não pode
      // transformar uma ação comercial já registrada em erro para o fã.
      console.warn(
        JSON.stringify({
          event: 'recommendation_attribution_failed',
          conversionType: recommendationConversionType
        })
      )
    }
  }

  return { recorded, deduplicated: !recorded }
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
  // Sem limite inferior de propósito: qualquer bruto de dia fechado pode
  // ainda precisar de consolidação. A poda é o que mantém esta varredura
  // barata; se a política de poda mudar, introduza uma janela inferior aqui.
  const result = await db.execute(sql`
    INSERT INTO bar_commercial_daily_rollup (
      bar_id, commercial_day,
      unique_visitors, interested_people, high_intent_actions,
      profile_views, directions_opened, phone_clicked, whatsapp_opened,
      classic_exposures, classic_clicks,
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
      COUNT(*) FILTER (WHERE type = 'classic_exposure'),
      COUNT(*) FILTER (WHERE type = 'classic_click'),
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
      classic_exposures = EXCLUDED.classic_exposures,
      classic_clicks = EXCLUDED.classic_clicks,
      is_finalized = true,
      updated_at = NOW()
    WHERE bar_commercial_daily_rollup.is_finalized = false
    RETURNING bar_id
  `)

  await db.execute(sql`
    INSERT INTO bar_commercial_event_daily_rollup (
      bar_id, event_id, commercial_day,
      profile_views, directions_opened, phone_clicked, whatsapp_opened,
      is_finalized, created_at, updated_at
    )
    SELECT
      bar_id,
      source_event_id,
      commercial_day,
      COUNT(*) FILTER (WHERE type = 'profile_view'),
      COUNT(*) FILTER (WHERE type = 'directions_opened'),
      COUNT(*) FILTER (WHERE type = 'phone_clicked'),
      COUNT(*) FILTER (WHERE type = 'whatsapp_opened'),
      true, NOW(), NOW()
    FROM bar_commercial_event
    WHERE commercial_day < CURRENT_DATE
      AND source_event_id IS NOT NULL
    GROUP BY bar_id, source_event_id, commercial_day
    ON CONFLICT (bar_id, event_id, commercial_day) DO UPDATE SET
      profile_views = EXCLUDED.profile_views,
      directions_opened = EXCLUDED.directions_opened,
      phone_clicked = EXCLUDED.phone_clicked,
      whatsapp_opened = EXCLUDED.whatsapp_opened,
      is_finalized = true,
      updated_at = NOW()
    WHERE bar_commercial_event_daily_rollup.is_finalized = false
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
