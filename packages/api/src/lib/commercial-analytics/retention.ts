import { createHash, timingSafeEqual } from 'node:crypto'
import { db, sql } from '@findsports_oficial/db'
import { analyticsRetentionRun } from '@findsports_oficial/db/schema/analytics'
import { env } from '@findsports_oficial/env/server'
import { getCommercialDay } from './commercial-day'

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
 * Só toca dias anteriores ao dia comercial corrente — o dia corrente ainda
 * está recebendo evento. E o `WHERE` do `ON CONFLICT` protege o que já está consolidado: um
 * dia finalizado não é reescrito, o que importa porque depois da poda ele não
 * teria mais evento bruto de onde recalcular.
 *
 * WEB-110: a varredura também tem piso. Cada instrução começa no primeiro dia
 * que a sua própria projeção ainda não consolidou, em vez de reler a tabela de
 * brutos inteira para descobrir no `ON CONFLICT` que não havia o que reescrever.
 *
 * O piso é seguro por três fatos, nesta ordem:
 *
 * 1. `recordCommercialEvent` grava o bruto e a linha de rollup na mesma
 *    instrução — um dia com evento bruto tem linha de rollup desde o instante
 *    em que aconteceu, e é o único caminho de escrita de bruto do sistema.
 * 2. Dia passado é imutável: o bruto sempre entra com o dia comercial de hoje,
 *    então nenhum evento novo cai num dia já fechado.
 * 3. `is_finalized` só volta a `false` no upsert do dia corrente.
 *
 * Logo, abaixo do primeiro dia não consolidado todo par (bar, dia) já está
 * finalizado, e reler aqueles brutos não mudaria nenhuma linha.
 *
 * A contrapartida: quem inserir bruto fora do gravador — seed, backfill,
 * fixture de teste — precisa criar a linha de rollup não finalizada junto,
 * como o gravador faz. Sem ela o dia fica abaixo do piso e nunca consolida.
 */
async function finalizarDiasFechados(agora: Date): Promise<number> {
  // WEB-110: o teto é o dia comercial de hoje em `America/Sao_Paulo`, e não
  // `CURRENT_DATE`. `commercial_day` é gravado nesse fuso, mas `CURRENT_DATE`
  // sai do relógio do servidor — em UTC, das 21h à meia-noite de São Paulo ele
  // já é o dia seguinte, e a consolidação fechava um dia que ainda estava
  // recebendo evento. Vem do mesmo `getCommercialDay` que grava o bruto, para
  // não existir uma segunda definição de "hoje".
  const hoje = getCommercialDay(agora)

  // O piso sai da própria projeção que está sendo escrita, não de uma data
  // compartilhada: se a primeira instrução consolidar e a segunda falhar, a
  // execução seguinte reencontra cada uma no ponto onde parou.
  //
  // `COALESCE(..., hoje)` para o caso de não haver nada pendente: o piso
  // encosta no teto e a faixa fica vazia, sem varrer nada.
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
    WHERE commercial_day >= (
        SELECT COALESCE(MIN(r.commercial_day), ${hoje}::date)
        FROM bar_commercial_daily_rollup r
        WHERE r.is_finalized = false
      )
      AND commercial_day < ${hoje}::date
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
    WHERE commercial_day >= (
        SELECT COALESCE(MIN(r.commercial_day), ${hoje}::date)
        FROM bar_commercial_event_daily_rollup r
        WHERE r.is_finalized = false
      )
      AND commercial_day < ${hoje}::date
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
  /** Instante de referência. Existe para o teste fixar o relógio. */
  agora?: Date
}): Promise<RetentionResult> {
  const {
    retentionDays,
    apagarEventosBrutos = false,
    agora = new Date()
  } = options

  // WEB-110: o corte da poda também é dia comercial, pelo mesmo motivo do teto
  // da consolidação — `commercial_day` vive em `America/Sao_Paulo`, e derivar a
  // data em UTC deslocava a janela em um dia durante três horas por dia.
  const cutoffDay = getCommercialDay(
    new Date(agora.getTime() - retentionDays * 24 * 60 * 60 * 1000)
  )

  const diasFinalizados = await finalizarDiasFechados(agora)

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

// ---------------------------------------------------------------------------
// Execução registrada e agendada (WEB-117)
// ---------------------------------------------------------------------------

/**
 * Janela dos eventos brutos na execução agendada — 13 meses, o teto da spec.
 * Um valor só para todos os planos: a poda apaga apenas bruto de dia já
 * consolidado, e o rollup fica para sempre, então nenhum plano perde o
 * período; o que se perde depois do corte é a contagem distinta do período
 * inteiro e a atribuição fina por jogo (ver `getMyAnalyticsOverview`). 13
 * meses cobre o maior horizonte anunciado (Pro, 365 dias) com folga.
 */
export const RETENCAO_BRUTOS_DIAS = 395

/**
 * Roda a retenção e grava a execução em `analytics_retention_run`, com
 * sucesso ou falha. A falha é gravada e relançada: quem chamou (cron ou
 * admin) precisa enxergá-la, e a execução seguinte se recupera sozinha — cada
 * projeção da consolidação tem o próprio piso.
 */
export async function runAndRecordAnalyticsRetention(options: {
  trigger: 'cron' | 'admin'
  retentionDays: number
  apagarEventosBrutos: boolean
  /** Instante de referência. Existe para o teste fixar o relógio. */
  agora?: Date
}): Promise<RetentionResult> {
  const { trigger, agora, ...politica } = options
  const execucao = { trigger, ...politica, startedAt: new Date() }

  let resultado: RetentionResult
  try {
    resultado = await runAnalyticsRetention({ ...politica, agora })
  } catch (error) {
    await db.insert(analyticsRetentionRun).values({
      ...execucao,
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    })
    throw error
  }

  await db.insert(analyticsRetentionRun).values({
    ...execucao,
    ok: true,
    diasFinalizados: resultado.diasFinalizados,
    eventosPodaveis: resultado.eventosPodaveis,
    eventosApagados: resultado.eventosApagados
  })
  return resultado
}

/**
 * A Vercel dispara o cron com `Authorization: Bearer <CRON_SECRET>`. Sem
 * segredo configurado, nada passa: a rota apaga dado e não pode ficar aberta.
 * A comparação é sobre o hash para ter tamanho fixo e tempo constante.
 */
export function isCronAuthorized(
  authorization: string | null,
  secret: string | undefined
): boolean {
  if (!secret || !authorization) return false
  const digest = (value: string) => createHash('sha256').update(value).digest()
  return timingSafeEqual(digest(authorization), digest(`Bearer ${secret}`))
}

/**
 * Execução diária disparada pelo cron da Vercel (`/api/cron/analytics-retention`):
 * consolida os dias fechados e poda o bruto além de `RETENCAO_BRUTOS_DIAS`.
 * O resultado fica em `analytics_retention_run`; a falha volta como 500 para
 * a Vercel marcar o cron como falho, e vai ao log porque é o único rastro
 * quando o próprio registro no banco também falhou.
 */
export async function handleAnalyticsRetentionCron(
  request: Request
): Promise<Response> {
  if (
    !isCronAuthorized(request.headers.get('authorization'), env.CRON_SECRET)
  ) {
    return Response.json({ error: 'Não autorizado.' }, { status: 401 })
  }

  try {
    return Response.json(
      await runAndRecordAnalyticsRetention({
        trigger: 'cron',
        retentionDays: RETENCAO_BRUTOS_DIAS,
        apagarEventosBrutos: true
      })
    )
  } catch (error) {
    console.error(
      JSON.stringify({
        evt: 'analytics_retention',
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      })
    )
    return Response.json({ error: 'Falha na retenção.' }, { status: 500 })
  }
}
