import {
  ehUf,
  type Uf
} from '@findsports_oficial/api/lib/bar-profile-validation'

/** "05433000" → "05433-000", enquanto digita. */
export function formatarCep(valor: string): string {
  const d = valor.replace(/\D/g, '').slice(0, 8)
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d
}

export type EnderecoDoCep = {
  rua: string
  bairro: string
  cidade: string
  uf: Uf | ''
}

/** A resposta do ViaCEP no que o formulário usa; `null` quando o CEP não existe. */
export function lerViaCep(json: unknown): EnderecoDoCep | null {
  if (!json || typeof json !== 'object' || 'erro' in json) return null
  const r = json as Record<string, unknown>
  const texto = (chave: string) =>
    typeof r[chave] === 'string' ? (r[chave] as string).trim() : ''
  if (!texto('localidade')) return null
  const uf = texto('uf')
  return {
    rua: texto('logradouro'),
    bairro: texto('bairro'),
    cidade: texto('localidade'),
    uf: ehUf(uf) ? uf : ''
  }
}

/**
 * Endereço de um CEP pelo ViaCEP, direto do navegador (o serviço é público e
 * aceita CORS). Só preenche o formulário: o CEP não vai ao servidor, que
 * continua geocodificando rua, cidade e UF. Fora do ar ou sem resposta,
 * `null`, e o dono preenche à mão.
 */
export async function buscarCep(cep: string): Promise<EnderecoDoCep | null> {
  const d = cep.replace(/\D/g, '')
  if (d.length !== 8) return null
  try {
    const res = await fetch(`https://viacep.com.br/ws/${d}/json/`, {
      signal: AbortSignal.timeout(5000)
    })
    return res.ok ? lerViaCep(await res.json()) : null
  } catch {
    return null
  }
}
