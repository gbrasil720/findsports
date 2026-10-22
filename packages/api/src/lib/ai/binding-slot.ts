/**
 * Onde o `worker.ts` deixa o binding `AI` do Workers AI (WEB-424). Fica num
 * módulo sem `@findsports_oficial/env`: o `worker.ts` importa isto no topo, e
 * ler o env ali validaria as variáveis antes de o Worker recebê-las (o E2E do
 * Worker caía com "Invalid environment variables").
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

export function setAiBinding(ai: AiBinding) {
  binding = ai
}

export function currentAiBinding(): AiBinding | null {
  return binding
}
