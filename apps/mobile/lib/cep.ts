import {
  ehUf,
  type Uf
} from '@findsports_oficial/api/lib/bar-profile-validation'

/*
 * CEP do cadastro do bar (rodada 10): o mesmo ViaCEP do web
 * (`apps/web/src/lib/cep.ts`). O endereço vem preenchido; o CEP vai ao
 * servidor só para o geocoding achar o trecho certo da rua.
 */

/** "05433000" → "05433-000", enquanto digita. */
export function formatCep(value: string): string {
  const d = value.replace(/\D/g, '').slice(0, 8)
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d
}

export type CepAddress = {
  street: string
  neighborhood: string
  city: string
  uf: Uf | ''
}

/** A resposta do ViaCEP no que o formulário usa; `null` sem CEP. */
export function readViaCep(json: unknown): CepAddress | null {
  if (!json || typeof json !== 'object' || 'erro' in json) return null
  const r = json as Record<string, unknown>
  const field = (key: string) =>
    typeof r[key] === 'string' ? (r[key] as string).trim() : ''
  if (!field('localidade')) return null
  const uf = field('uf')
  return {
    street: field('logradouro'),
    neighborhood: field('bairro'),
    city: field('localidade'),
    uf: ehUf(uf) ? uf : ''
  }
}

/** Busca o endereço; fora do ar ou sem resposta, `null` (preenche à mão). */
export async function findCep(cep: string): Promise<CepAddress | null> {
  const d = cep.replace(/\D/g, '')
  if (d.length !== 8) return null
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 5000)
  try {
    const res = await fetch(`https://viacep.com.br/ws/${d}/json/`, {
      signal: controller.signal
    })
    return res.ok ? readViaCep(await res.json()) : null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}
