import {
  ehUf,
  type Uf
} from '@findsports_oficial/api/lib/bar-profile-validation'
import { useCallback, useRef, useState } from 'react'

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

export type CepStatus = 'idle' | 'buscando' | 'achou' | 'nao'

/**
 * O campo de CEP do cadastro e do Meu espaço: formata enquanto digita e, com
 * os oito dígitos, busca e entrega o endereço a `preencher`. `definir` troca o
 * valor sem buscar (rascunho restaurado, formulário limpo).
 */
export function useCep(preencher: (endereco: EnderecoDoCep) => void) {
  const [cep, setCep] = useState('')
  const [status, setStatus] = useState<CepStatus>('idle')
  // O CEP da tela agora: resposta de um CEP que já mudou chega e é ignorada.
  const atual = useRef('')
  const mudar = async (valor: string) => {
    const formatado = formatarCep(valor)
    atual.current = formatado
    setCep(formatado)
    if (formatado.length < 9) {
      setStatus('idle')
      return
    }
    setStatus('buscando')
    const achado = await buscarCep(formatado)
    if (atual.current !== formatado) return
    if (!achado) {
      setStatus('nao')
      return
    }
    setStatus('achou')
    preencher(achado)
  }
  // Estável: entra na lista de dependências de quem restaura um rascunho.
  const definir = useCallback((valor: string) => {
    atual.current = valor
    setCep(valor)
    setStatus('idle')
  }, [])
  return { cep, status, mudar, definir }
}

/** `address` é uma coluna só: rua e número vão juntos, "Rua Aspicuelta, 214". */
export const juntarEndereco = (rua: string, numero: string) =>
  [rua.trim(), numero.trim()].filter(Boolean).join(', ')

/**
 * O contrário de `juntarEndereco`: o número é o que vem depois da última
 * vírgula. Sem vírgula, tudo fica na rua.
 */
export function separarNumero(endereco: string): [string, string] {
  const m = endereco.match(/^(.*\S)\s*,\s*([^,]+)$/)
  return m ? [m[1] as string, (m[2] as string).trim()] : [endereco, '']
}
