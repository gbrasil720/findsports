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
 * WEB-319: gera também `packages/api/src/data/municipios-centros.json`, com a
 * coordenada da sede de cada município — o centro da busca do torcedor que
 * informou a cidade. Fica no servidor: o navegador só precisa de nome e UF.
 *
 * Rodar quando um município novo for criado — evento raro no Brasil:
 *
 *   bun apps/web/scripts/gerar-municipios.ts
 */

const URL_IBGE =
  'https://servicodados.ibge.gov.br/api/v1/localidades/municipios'

const DESTINO = new URL('../src/data/municipios.json', import.meta.url)

/**
 * Sede de cada município, por código do IBGE. O IBGE não serve isso pela API:
 * o `centroide` da API de malhas é o centro geométrico do território, e o de
 * São Paulo cai 13 km ao sul da Sé — fora de qualquer raio de busca. A sede
 * vem do repositório kelvins/municipios-brasileiros (MIT, dados do IBGE),
 * preso num commit para a geração ser reproduzível.
 */
const URL_SEDES =
  'https://raw.githubusercontent.com/kelvins/municipios-brasileiros/975a51d6f2e7a9ee22a734a42ebd624263812f0c/csv/municipios.csv'

const DESTINO_CENTROS = new URL(
  '../../../packages/api/src/data/municipios-centros.json',
  import.meta.url
)

interface MunicipioIBGE {
  id: number
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

const respostaSedes = await fetch(URL_SEDES)
if (!respostaSedes.ok) {
  throw new Error(
    `${URL_SEDES} respondeu ${respostaSedes.status} ${respostaSedes.statusText}`
  )
}

/**
 * `codigo_ibge,nome,latitude,longitude,capital,codigo_uf,siafi_id,ddd,fuso`.
 * Latitude e longitude são lidas contando do fim da linha, para um nome com
 * vírgula não deslocar as colunas.
 */
const sedes = new Map<number, [lat: number, lng: number]>()
for (const linha of (await respostaSedes.text()).trim().split('\n').slice(1)) {
  const campos = linha.trim().split(',')
  sedes.set(Number(campos[0]), [
    Number(campos[campos.length - 7]),
    Number(campos[campos.length - 6])
  ])
}

const centros = municipios
  .map((municipio): [string, string, number, number] => {
    const sede = sedes.get(municipio.id)
    // Caixa folgada em volta do Brasil: pega coluna trocada e linha quebrada.
    if (
      !sede ||
      !(sede[0] > -34.5 && sede[0] < 6) ||
      !(sede[1] > -74.5 && sede[1] < -28)
    ) {
      throw new Error(
        `Sem sede válida para ${municipio.nome} (${municipio.id}): ${JSON.stringify(sede)}. Abortado para não gravar centro errado.`
      )
    }
    return [municipio.nome, extrairUf(municipio) as string, ...sede]
  })
  .sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'))

await Bun.write(DESTINO_CENTROS, `${JSON.stringify(centros)}\n`)

console.log(
  `${linhas.length} municípios gravados em ${DESTINO.pathname.replace(/.*\/apps\/web\//, 'apps/web/')} e os centros em ${DESTINO_CENTROS.pathname.replace(/.*\/packages\/api\//, 'packages/api/')}`
)
