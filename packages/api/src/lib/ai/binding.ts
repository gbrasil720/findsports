import { env } from '@findsports_oficial/env/server'

/**
 * O binding `AI` do Workers AI (WEB-424). No Worker ele vem do `env` da
 * requisição e o `worker.ts` o entrega aqui, como a versão do deploy.
 *
 * O `vite dev` roda em Node, sem o plugin da Cloudflare (ver
 * `apps/web/vite.config.ts`), então lá não existe `env.AI`. Em
 * `development` o binding sai do `getPlatformProxy` do wrangler, que lê o
 * `ai` do `wrangler.jsonc` e fala com a Cloudflare de verdade com o login do
 * `wrangler` (a primeira chamada leva uns 7 s para abrir a conexão).
 */

export type AiGatewayOptions = {
  gateway: {
    id: string
    metadata: Record<string, string | number | boolean>
  }
}

export type AiBinding = {
  run: (
    model: string,
    input: Record<string, unknown>,
    options?: AiGatewayOptions
  ) => Promise<unknown>
}

let binding: AiBinding | null = null
let devProxy: Promise<AiBinding> | null = null

export function setAiBinding(ai: AiBinding) {
  binding = ai
}

export async function getAiBinding(): Promise<AiBinding | null> {
  if (binding) return binding
  if (env.NODE_ENV !== 'development') return null
  devProxy ??= loadDevProxy().catch((error) => {
    devProxy = null
    throw error
  })
  return devProxy
}

async function loadDevProxy(): Promise<AiBinding> {
  // Nome numa variável: o empacotador do Worker não segue o import e o
  // wrangler não entra no bundle.
  const name = 'wrangler'
  const { getPlatformProxy } = await import(/* @vite-ignore */ name)
  const { fileURLToPath } = await import('node:url')
  const configPath = fileURLToPath(
    new URL('../../../../../apps/web/wrangler.jsonc', import.meta.url)
  )
  const proxy = await getPlatformProxy({ configPath })
  return proxy.env.AI as AiBinding
}

/**
 * Gateway por onde a chamada passa. Em produção e no preview vem do
 * `wrangler.jsonc`; sem ele, nada é chamado (o teto de gasto mora no
 * Gateway). No `vite dev` vale o `default`, que a Cloudflare cria sozinha.
 */
export function aiGatewayId() {
  return env.AI_GATEWAY_ID ?? (env.NODE_ENV !== 'production' ? 'default' : null)
}
