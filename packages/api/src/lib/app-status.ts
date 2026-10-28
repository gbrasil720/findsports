import { type AppConfigValue, appConfigStore } from './app-config'

/**
 * WEB-466: o que o app pergunta antes de tudo, em `GET /api/app/status`.
 *
 * Fora do tRPC de propósito: sem sessão nem better-auth, é uma leitura do
 * `app_config` em cache (no máximo uma ida ao banco por minuto por instância),
 * e o app a repete a cada minuto.
 *
 * Banco fora do ar responde 503, não "fora de manutenção": quem desliga é a
 * chave gravada, nunca a falha. O app guarda a última resposta boa e, sem
 * resposta, continua com ela (manutenção anunciada continua anunciada).
 */
export async function appStatusResponse(): Promise<Response> {
  const headers = { 'Cache-Control': 'no-store' }
  try {
    const maintenance = await appConfigStore.getOrThrow('app.maintenance')
    return Response.json({ maintenance }, { headers })
  } catch {
    return Response.json(
      { error: 'Situação indisponível.' },
      { status: 503, headers }
    )
  }
}

export type AppStatus = { maintenance: AppConfigValue<'app.maintenance'> }
