import { env } from '@findsports_oficial/env/server'

/**
 * O binding `AI` do Workers AI (WEB-424). No Worker ele vem do `env` da
 * requisição e o `worker.ts` o entrega aqui, como a versão do deploy.
 *
 * O `vite dev` roda em Node, sem o plugin da Cloudflare (ver
 * `apps/web/vite.config.ts`), então lá não existe `env.AI`. Em
 * `development` a mesma chamada vai pela API REST do Workers AI, com o mesmo
 * Gateway e os mesmos metadados, e o token do login do `wrangler`
 * (`CLOUDFLARE_API_TOKEN` vence, se existir). O `getPlatformProxy` do
 * wrangler daria o binding, mas trava no Bun (scripts) e leva 7 s no Node.
 */

import { type AiBinding, currentAiBinding, setAiBinding } from './binding-slot'

export type { AiBinding } from './binding-slot'
export { setAiBinding }

let binding: AiBinding | null = null

export async function getAiBinding(): Promise<AiBinding | null> {
  const fromWorker = currentAiBinding()
  if (fromWorker) return fromWorker
  if (binding) return binding
  if (env.NODE_ENV !== 'development' || !env.CF_ACCOUNT_ID) return null
  binding = restBinding(env.CF_ACCOUNT_ID)
  return binding
}

let token: { value: string; until: number } | null = null

/** Token da API: o do ambiente, ou o do login do wrangler (vale 1 h). */
async function apiToken() {
  if (process.env.CLOUDFLARE_API_TOKEN) return process.env.CLOUDFLARE_API_TOKEN
  if (token && token.until > Date.now()) return token.value
  const { execFile } = await import('node:child_process')
  const value = await new Promise<string>((resolve, reject) =>
    execFile('bunx', ['wrangler', 'auth', 'token'], (error, stdout) =>
      error ? reject(error) : resolve(stdout.trim().split('\n').at(-1) ?? '')
    )
  )
  token = { value, until: Date.now() + 30 * 60_000 }
  return value
}

/**
 * O binding pela API REST, só em desenvolvimento. Chat (com `messages`) vai
 * ao Chat Completions; modelo da Cloudflare (`@cf/`) ao `run/<modelo>`; o
 * resto (Jev) ao `run` com o modelo no corpo.
 */
function restBinding(accountId: string): AiBinding {
  const base = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai`
  return {
    async run(model, input, options) {
      const chat = Array.isArray(input.messages)
      const own = model.startsWith('@cf/')
      const res = await fetch(
        chat
          ? `${base}/v1/chat/completions`
          : own
            ? `${base}/run/${model}`
            : `${base}/run`,
        {
          method: 'POST',
          headers: {
            authorization: `Bearer ${await apiToken()}`,
            'content-type': 'application/json',
            ...(options
              ? {
                  'cf-aig-gateway-id': options.gateway.id,
                  'cf-aig-metadata': JSON.stringify(options.gateway.metadata)
                }
              : {})
          },
          body: JSON.stringify(
            chat ? { ...input, model } : own ? input : { model, input }
          )
        }
      )
      const json = (await res.json().catch(() => ({}))) as {
        success?: boolean
        result?: unknown
        errors?: { code?: number; message?: string }[]
      }
      if (!res.ok || json.success === false) {
        const error = json.errors?.[0]
        throw new Error(
          `${error?.code ?? res.status}: ${error?.message ?? 'falha na IA'}`
        )
      }
      return json.success === true ? json.result : json
    }
  }
}

/**
 * Gateway por onde a chamada passa. Em produção e no preview vem do
 * `wrangler.jsonc`; sem ele, nada é chamado (o teto de gasto mora no
 * Gateway). No `vite dev` vale o `default`, que a Cloudflare cria sozinha.
 */
export function aiGatewayId() {
  return env.AI_GATEWAY_ID ?? (env.NODE_ENV !== 'production' ? 'default' : null)
}
