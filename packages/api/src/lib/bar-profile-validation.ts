/**
 * Cadastro de bar coerente (WEB-115).
 *
 * O telefone aceitava até 30 caracteres sem checagem, e em produção entrou um
 * `+55` seguido de `55` digitado de novo e nove dígitos começando com 5 — um
 * número que não existe e que o link de WhatsApp montaria mesmo assim.
 *
 * Mora no pacote da API, e não no app, porque as mensagens são do app: o
 * padrão do WEB-118 nunca mostra o texto do servidor, então o formulário
 * confere o telefone e escreve a recusa de endereço com estas mesmas funções
 * (ver `city-match.ts`, que segue o mesmo desenho).
 */

/**
 * A recusa do geocoding: a rua não existe na cidade informada. Quem cai aqui
 * digitou endereço de outro lugar ou a cidade errada.
 */
export function mensagemEnderecoNaoEncontrado(
  cidade: string,
  uf?: string | null
): string {
  return uf
    ? `Não encontramos esse endereço em ${cidade.trim()}, ${uf}. Confira a rua, o número, a cidade e o estado.`
    : `Não encontramos esse endereço em ${cidade.trim()}. Confira a rua, o número e a cidade.`
}

/**
 * As 27 UFs (WEB-270), sigla → nome. A sigla é o que o formulário mostra e o
 * banco guarda; o nome é o que vai ao geocoder, que casa estado por extenso.
 *
 * As siglas são as mesmas de `municipios-centros.json` (IBGE) — o teste ao
 * lado confere, para esta lista não virar uma terceira fonte.
 */
export const UFS = {
  AC: 'Acre',
  AL: 'Alagoas',
  AP: 'Amapá',
  AM: 'Amazonas',
  BA: 'Bahia',
  CE: 'Ceará',
  DF: 'Distrito Federal',
  ES: 'Espírito Santo',
  GO: 'Goiás',
  MA: 'Maranhão',
  MT: 'Mato Grosso',
  MS: 'Mato Grosso do Sul',
  MG: 'Minas Gerais',
  PA: 'Pará',
  PB: 'Paraíba',
  PR: 'Paraná',
  PE: 'Pernambuco',
  PI: 'Piauí',
  RJ: 'Rio de Janeiro',
  RN: 'Rio Grande do Norte',
  RS: 'Rio Grande do Sul',
  RO: 'Rondônia',
  RR: 'Roraima',
  SC: 'Santa Catarina',
  SP: 'São Paulo',
  SE: 'Sergipe',
  TO: 'Tocantins'
} as const

export type Uf = keyof typeof UFS

export const ehUf = (valor: unknown): valor is Uf =>
  typeof valor === 'string' && Object.hasOwn(UFS, valor)

/** Para `z.enum`, que pede tupla não vazia. */
export const UF_SIGLAS = Object.keys(UFS) as [Uf, ...Uf[]]

/**
 * O geocoding fora do ar depois das tentativas. Não é endereço errado: dizer
 * isso faria o usuário corrigir o que já estava certo (WEB-191).
 */
export const mensagemEnderecoIndisponivel =
  'Não foi possível validar o endereço agora. Tente novamente em instantes.'

/** DDDs em uso segundo o plano de numeração da Anatel. */
const DDDS = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 24, 27, 28, 31, 32, 33, 34, 35,
  37, 38, 41, 42, 43, 44, 45, 46, 47, 48, 49, 51, 53, 54, 55, 61, 62, 63, 64,
  65, 66, 67, 68, 69, 71, 73, 74, 75, 77, 79, 81, 82, 83, 84, 85, 86, 87, 88,
  89, 91, 92, 93, 94, 95, 96, 97, 98, 99
])

/**
 * O que está errado no telefone, pronto para mostrar ao dono do bar, ou
 * `null` quando o número serve. Vazio ou ausente serve: o campo é opcional.
 *
 * Aceita o formato que o formulário grava (`+5511988446094`) e o legado sem
 * código de país (`11988446094`).
 *
 * `gravado` é o telefone que o bar já tem: repeti-lo passa sem conferência,
 * para um número antigo fora do padrão não travar a edição do resto do
 * perfil — o formulário reenvia o telefone junto com tudo.
 */
export function motivoTelefoneInvalido(
  telefone: string | undefined,
  gravado?: string | null
): string | null {
  const bruto = telefone?.trim()
  if (!bruto || telefone === gravado) return null
  if (bruto.startsWith('+') && !bruto.startsWith('+55')) {
    return 'Informe um telefone do Brasil (+55).'
  }

  const digitos = bruto.replace(/^\+55/, '').replace(/\D/g, '')
  if (digitos.length !== 10 && digitos.length !== 11) {
    return 'Telefone incompleto. Informe DDD e número: 8 dígitos para fixo ou 9 para celular.'
  }
  const ddd = digitos.slice(0, 2)
  if (!DDDS.has(Number(ddd))) {
    return `DDD ${ddd} não existe. Confira o telefone.`
  }
  if (digitos.length === 11 && digitos[2] !== '9') {
    return 'Celular deve começar com 9 depois do DDD. Confira o telefone.'
  }
  // Fixo começa de 2 a 5; oito dígitos começando com 9 é celular sem o nono
  // dígito, formato que deixou de existir.
  if (digitos.length === 10 && !'2345'.includes(digitos[2] as string)) {
    return 'Telefone fixo começa com 2, 3, 4 ou 5 depois do DDD. Celular tem 9 dígitos.'
  }
  return null
}
