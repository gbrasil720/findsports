/**
 * Gera a lista de municípios brasileiros usada pelo autocomplete de
 * `launch.pub_cities` em `/internal/flags`.
 *
 * A fonte é a API de localidades do IBGE — pública, sem chave e oficial. Ela é
 * consultada aqui, na geração, e nunca em tempo de execução: uma tela de
 * administração que depende de rede externa falha exatamente quando a rede
 * está ruim, e é esse o problema que o WEB-73 registrou com o Google Maps.
 *
 * O arquivo gerado guarda só nome e UF. O resto do payload do IBGE
 * (microrregião, mesorregião, região imediata) não é usado em lugar nenhum e
 * só engordaria o bundle.
 *
 * Rodar quando um município novo for criado — evento raro no Brasil:
 *
 *   bun apps/web/scripts/gerar-municipios.ts
 */

const URL_IBGE =
  'https://servicodados.ibge.gov.br/api/v1/localidades/municipios'

const DESTINO = new URL('../src/data/municipios.json', import.meta.url)

interface MunicipioIBGE {
  nome: string
  microrregiao?: {
    mesorregiao?: {
      UF?: { sigla?: string }
    }
  }
  'regiao-imediata'?: {
    'regiao-intermediaria'?: {
      UF?: { sigla?: string }
    }
  }
}

/**
 * A UF aparece em dois caminhos diferentes no payload, e nem todo município
 * traz os dois. Ler os dois evita perder a UF de um punhado de municípios por
 * uma diferença de forma que não é documentada.
 */
function extrairUf(municipio: MunicipioIBGE): string | null {
  return (
    municipio.microrregiao?.mesorregiao?.UF?.sigla ??
    municipio['regiao-imediata']?.['regiao-intermediaria']?.UF?.sigla ??
    null
  )
}

const resposta = await fetch(URL_IBGE)
if (!resposta.ok) {
  throw new Error(
    `IBGE respondeu ${resposta.status} ${resposta.statusText} para ${URL_IBGE}`
  )
}

const municipios = (await resposta.json()) as MunicipioIBGE[]
if (!Array.isArray(municipios) || municipios.length < 5000) {
  throw new Error(
    `Resposta do IBGE com ${Array.isArray(municipios) ? municipios.length : 0} itens — esperado ~5570. Abortado para não gravar lista truncada.`
  )
}

const semUf = municipios.filter((municipio) => extrairUf(municipio) === null)
if (semUf.length > 0) {
  throw new Error(
    `${semUf.length} municípios sem UF no payload (ex.: ${semUf[0]?.nome}). Abortado: sem UF o autocomplete não desambigua homônimo.`
  )
}

/**
 * Tupla `[nome, uf]` em vez de objeto com chaves: 5.570 entradas, e cada nome
 * de campo repetido 5.570 vezes é peso puro num arquivo que o navegador baixa.
 */
const linhas = municipios
  .map((municipio): [string, string] => [
    municipio.nome,
    extrairUf(municipio) as string
  ])
  .sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'))

await Bun.write(DESTINO, `${JSON.stringify(linhas)}\n`)

console.log(
  `${linhas.length} municípios gravados em ${DESTINO.pathname.replace(/.*\/apps\/web\//, 'apps/web/')}`
)
