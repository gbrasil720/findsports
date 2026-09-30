import { createHash, timingSafeEqual } from 'node:crypto'
import { env } from '@findsports_oficial/env/server'
import {
  RETENCAO_BRUTOS_DIAS,
  runAndRecordAnalyticsRetention
} from './recorder'

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
 * WEB-117: execução diária da retenção de analytics — consolida os dias
 * fechados e poda o bruto além de `RETENCAO_BRUTOS_DIAS`. A execução fica em
 * `analytics_retention_run`; a falha também volta como 500 para a Vercel
 * marcar o cron como falho.
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
    const resultado = await runAndRecordAnalyticsRetention({
      trigger: 'cron',
      retentionDays: RETENCAO_BRUTOS_DIAS,
      apagarEventosBrutos: true
    })
    console.info(
      JSON.stringify({ evt: 'analytics_retention', ok: true, ...resultado })
    )
    return Response.json(resultado)
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
