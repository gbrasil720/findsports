import { TRPCError } from '@trpc/server'

import { createTtlCache } from './ttl-cache'

/**
 * Geocoding de endereço (ESC-14, WEB-73).
 *
 * Antes: um `fetch` cru, sem timeout, sem repetição e sem cache. Se o
 * provedor demorasse, a mutation demorava junto e o usuário ficava esperando
 * sem limite; se falhasse por instabilidade momentânea, o cadastro do bar
 * falhava; e endereços repetidos eram cobrados e consultados de novo.
 *
 * Além disso, qualquer problema virava a mesma mensagem — "endereço não
 * encontrado" —, o que manda o usuário corrigir um endereço que estava certo
 * quando o defeito era do serviço.
 *
 * WEB-73 trocou o provedor: era a Geocoding API do Google (SKU faturado, que
 * parou de responder quando o trial do Google Cloud acabou), agora é a
 * LocationIQ (5.000 consultas/dia no tier grátis, uso comercial permitido com
 * atribuição). Cache, repetição, timeout e a distinção entre falha transitória
 * e erro do usuário continuam iguais.
 *
 * ## Consulta estruturada, e não uma linha só
 *
 * O Google aceitava o endereço concatenado — `"rua X 87, bairro, cidade"` — e
 * resolvia. A LocationIQ, com a mesma linha, casa por aproximação e **não
 * avisa**: medido com um endereço real, `"rua forte william 87, panamby, São
 * Paulo"` devolveu a *Rua Forte*, no Ipiranga, a **11,5 km** do lugar certo,
 * como primeiro resultado e sem nenhum sinal de que largou metade do nome pelo
 * caminho. O mesmo endereço em campos separados acerta a 128 m da coordenada
 * que o Google tinha gravado.
 *
 * O bairro fica **fora** da consulta: não existe campo para ele no provedor, e
 * enfiá-lo no texto livre foi o que degradou a busca até o centro de São Paulo
 * no mesmo teste. Ele entra depois, como **desempate** — ver `escolherMelhor`.
 */

const TIMEOUT_MS = 4_000
const TENTATIVAS = 2
const ESPERA_ENTRE_TENTATIVAS_MS = 300
/**
 * O tier grátis da LocationIQ limita a 2 consultas por segundo. Repetir um
 * `429` depois de 300 ms cairia no mesmo limite e queimaria a única tentativa
 * que sobrou — daí a espera mínima acima de um segundo só nesse caso.
 */
const ESPERA_APOS_LIMITE_MS = 1_100
/** Endereço não muda de lugar; o que muda é a base do provedor, devagar. */
const CACHE_TTL_MS = 24 * 60 * 60 * 1000

/**
 * Endpoint regional da LocationIQ. `us1` é o padrão da conta grátis; `eu1`
 * existe e responde igual. Não é configurável de propósito: um endpoint
 * errado falha como chave inválida, e essa é uma pista péssima.
 */
const ENDPOINT = 'https://us1.locationiq.com/v1/search'

export type Coordenadas = { latitude: string; longitude: string }

/**
 * As partes do endereço, separadas — é assim que o provedor acerta.
 *
 * `street` é a linha do logradouro como o dono do bar digitou, número
 * incluído; a ordem do número não importa, `"rua X 87"` e `"87 rua X"` dão o
 * mesmo resultado.
 */
export type EnderecoEstruturado = {
  street: string
  city: string
  /**
   * Opcional, e usado só para desempatar entre ruas homônimas na mesma cidade
   * — nunca para recusar. Ver `escolherMelhor`.
   */
  neighborhood?: string
}

const cache = createTtlCache<Coordenadas>({
  ttlMs: CACHE_TTL_MS,
  maxEntries: 500
})

/** Só para os testes: evita vazar estado entre casos. */
export function limparCacheDeGeocoding() {
  cache.clear()
}

function normalizar(texto: string): string {
  return texto.trim().toLowerCase().replace(/\s+/g, ' ')
}

/** Tira acento: o provedor devolve "Consolação", o formulário às vezes não. */
function semAcento(texto: string): string {
  return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

/**
 * Tipos de logradouro, nas formas que aparecem digitadas e nas que o provedor
 * devolve. Saem dos dois lados antes da comparação, porque "Av." e "Avenida"
 * são a mesma coisa e não distinguem uma rua de outra.
 */
const TIPOS_DE_LOGRADOURO = new Set([
  'r',
  'rua',
  'av',
  'avenida',
  'al',
  'alameda',
  'tv',
  'travessa',
  'pca',
  'praca',
  'estrada',
  'est',
  'rodovia',
  'rod',
  'largo',
  'viela',
  'via',
  'marginal'
])

/**
 * Número por extenso para algarismo.
 *
 * Rua com data no nome é padrão no Brasil, e a base grafa dos dois jeitos: a
 * mesma via aparece como "Rua Treze de Maio" e como "Rua 13 de Maio". Sem esta
 * tabela, `ruaConfere` trataria as duas como ruas diferentes e recusaria um
 * endereço certo — pior que o defeito que ela existe para pegar, porque
 * travaria o cadastro.
 *
 * Vai até 31 porque o que nomeia rua é dia do mês.
 */
const NUMERO_POR_EXTENSO = new Map(
  Object.entries({
    um: '1',
    primeiro: '1',
    dois: '2',
    tres: '3',
    quatro: '4',
    cinco: '5',
    seis: '6',
    sete: '7',
    oito: '8',
    nove: '9',
    dez: '10',
    onze: '11',
    doze: '12',
    treze: '13',
    quatorze: '14',
    catorze: '14',
    quinze: '15',
    dezesseis: '16',
    dezessete: '17',
    dezoito: '18',
    dezenove: '19',
    vinte: '20',
    trinta: '30'
  })
)

/**
 * Junta "vinte e quatro" num "24" só.
 *
 * "Rua Vinte e Quatro de Maio" existe, e sem esta passagem viraria três
 * pedaços que nunca casariam com o "24" da base.
 */
function juntarCompostos(tokens: string[]): string[] {
  const saida: string[] = []
  for (let i = 0; i < tokens.length; i++) {
    const dezena = tokens[i] as string
    const unidade = tokens[i + 2]
    if (
      (dezena === 'vinte' || dezena === 'trinta') &&
      tokens[i + 1] === 'e' &&
      unidade &&
      NUMERO_POR_EXTENSO.has(unidade)
    ) {
      saida.push(
        String(
          Number(NUMERO_POR_EXTENSO.get(dezena)) +
            Number(NUMERO_POR_EXTENSO.get(unidade))
        )
      )
      i += 2
      continue
    }
    saida.push(dezena)
  }
  return saida
}

const ehNumero = (token: string) => /^\d+$/.test(token)

/**
 * Os pedaços que identificam a rua: sem acento, sem pontuação, sem o tipo de
 * logradouro e sem o número da casa.
 *
 * O número da casa sai só das pontas — primeiro ou último pedaço —, porque é
 * onde ele aparece ("rua X, 87" e "87 rua X"). Algarismo no meio do nome fica,
 * que é o que distingue a "Rua 13 de Maio" da "Rua 15 de Maio"; tirar todo
 * número apagaria justamente essa diferença.
 */
function tokensDaRua(linha: string): string[] {
  const brutos = semAcento(normalizar(linha))
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 0)

  const inicio = brutos[0] && ehNumero(brutos[0]) ? 1 : 0
  const fim =
    brutos.length > inicio + 1 && ehNumero(brutos[brutos.length - 1] as string)
      ? brutos.length - 1
      : brutos.length

  return juntarCompostos(brutos.slice(inicio, fim))
    .filter((t) => !TIPOS_DE_LOGRADOURO.has(t))
    .map((t) => NUMERO_POR_EXTENSO.get(t) ?? t)
}

/**
 * O resultado é mesmo da rua que foi pedida?
 *
 * Esta é a guarda que falta no provedor. A LocationIQ responde `200` com um
 * primeiro resultado plausível mesmo quando casou outra coisa — largar
 * "William" de "Rua Forte William" e devolver a "Rua Forte" de outro bairro é
 * um caso real, medido, com 11,5 km de erro. Sem checagem, o bar entraria no
 * banco com a coordenada errada e apareceria no mapa longe de onde fica, sem
 * erro nenhum em lugar nenhum.
 *
 * A comparação aceita prefixo, além de igualdade, para tolerar a abreviação
 * que o dono do bar escreve: "Brig. Faria Lima" casa com "Brigadeiro Faria
 * Lima". O prefixo só vale de três letras para cima — abaixo disso ele
 * aproximaria demais ("Rua Bela" casaria com "Rua Belarmino"), então pedaços
 * curtos como "de" e "da" precisam bater exatamente.
 *
 * Cada pedaço do que foi pedido precisa achar par no que voltou; o contrário
 * não vale, porque o provedor costuma devolver o nome mais completo — pede-se
 * "Rua Rafael de Barros" e volta "Rua Doutor Rafael de Barros".
 */
function ruaConfere(pedido: string, devolvido: string | undefined): boolean {
  // Sem `road` o provedor não casou um logradouro — caiu no centro do bairro
  // ou da cidade. Também é um resultado que não serve para marcar um bar.
  if (!devolvido) return false

  const alvo = tokensDaRua(devolvido)
  if (alvo.length === 0) return false

  return tokensDaRua(pedido).every((token) =>
    alvo.some(
      (outro) =>
        token === outro ||
        (token.length >= 3 && outro.startsWith(token)) ||
        (outro.length >= 3 && token.startsWith(outro))
    )
  )
}

class FalhaTransitoria extends Error {
  /**
   * Piso de espera antes da próxima tentativa. Existe por causa do `429`: as
   * outras falhas transitórias (rede, timeout, 5xx) não ganham nada esperando
   * mais.
   */
  readonly esperaMinimaMs: number

  constructor(message: string, esperaMinimaMs = 0) {
    super(message)
    this.esperaMinimaMs = esperaMinimaMs
  }
}

/** Endereço realmente não encontrado: é o usuário que precisa agir. */
function enderecoNaoEncontrado(): TRPCError {
  return new TRPCError({
    code: 'BAD_REQUEST',
    message: 'Endereço não encontrado. Verifique e tente novamente.'
  })
}

/**
 * Problema de configuração nossa (chave ausente, inválida ou suspensa).
 *
 * Vale a mesma regra do provedor anterior: isto NÃO pode virar "endereço não
 * encontrado", senão o dono do bar passa a tarde corrigindo um endereço que
 * estava certo desde o começo.
 */
function falhaDeConfiguracao(detalhe: string): TRPCError {
  console.error('Geocoding recusado pelo provedor:', detalhe)
  return new TRPCError({
    code: 'INTERNAL_SERVER_ERROR',
    message: 'Não foi possível validar o endereço agora. Tente mais tarde.'
  })
}

/**
 * A resposta de sucesso da LocationIQ é uma lista de candidatos, ordenada por
 * relevância, com `lat`/`lon` em texto. Só o primeiro interessa: o formulário
 * pede um endereço, não uma busca.
 *
 * `address.road` só vem com `addressdetails=1`, e é o que permite conferir se
 * o resultado é mesmo da rua pedida — ver `ruaConfere`.
 */
type LocationIqResultado = {
  lat?: string
  lon?: string
  display_name?: string
  address?: {
    road?: string
    /** O bairro. `suburb` é o campo usual; os outros aparecem conforme a base. */
    suburb?: string
    neighbourhood?: string
    city_district?: string
  }
}

/**
 * Entre os candidatos que são da rua certa, o que fica no bairro informado.
 *
 * Rua homônima dentro da mesma cidade é comum, e o provedor não tem como saber
 * qual delas é: `"Rua dos Pinheiros, 500"` em São Paulo devolve cinco
 * resultados válidos — Pinheiros, Jardim Fontalis, Roseira — e com `limit=1`
 * vem um qualquer. Já foi medido caindo no extremo sul da cidade, a ~20 km do
 * bairro de Pinheiros.
 *
 * O bairro **desempata, e não elimina**: os limites do OpenStreetMap não são os
 * que o dono do bar tem na cabeça (quem escreve "Panamby" está, para a base,
 * em "Vila Andrade"), então quando nada casa a escolha volta a ser a ordem do
 * provedor. Exigir o bairro recusaria endereço certo; preferi-lo só melhora.
 */
function escolherMelhor(
  candidatos: LocationIqResultado[],
  neighborhood: string | undefined
): LocationIqResultado | undefined {
  if (candidatos.length <= 1 || !neighborhood?.trim()) return candidatos[0]

  const pedido = tokensDaRua(neighborhood)
  if (pedido.length === 0) return candidatos[0]

  const casa = candidatos.find((c) => {
    const bairro =
      c.address?.suburb ?? c.address?.neighbourhood ?? c.address?.city_district
    return bairro ? ruaConfere(neighborhood, bairro) : false
  })

  return casa ?? candidatos[0]
}

async function consultarProvedor(
  { street, city, neighborhood }: EnderecoEstruturado,
  apiKey: string,
  fetchImpl: typeof fetch
): Promise<Coordenadas> {
  const params = new URLSearchParams({
    key: apiKey,
    street,
    city,
    format: 'json',
    // Mais de um, para o bairro poder desempatar rua homônima — ver
    // `escolherMelhor`. Cinco cobre os casos vistos sem encarecer a resposta.
    limit: '5',
    // Sem isto, a resposta não traz `address.road` e não há como conferir se o
    // resultado é da rua pedida.
    addressdetails: '1',
    // Bar da Onside é bar no Brasil. Sem isto, "Rua da Praia, Centro" casa
    // com uma rua homônima em Portugal e o pino nasce no lugar errado —
    // falha muda, que é a pior.
    countrycodes: 'br',
    // Devolve o nome oficial da cidade em vez do distrito administrativo,
    // que é como o formulário pergunta.
    normalizecity: '1'
  })

  let res: Response
  try {
    res = await fetchImpl(`${ENDPOINT}?${params.toString()}`, {
      signal: AbortSignal.timeout(TIMEOUT_MS)
    })
  } catch (err) {
    // Timeout e erro de rede são indistinguíveis aqui, e ambos valem repetir.
    throw new FalhaTransitoria(
      err instanceof Error ? err.message : 'falha de rede'
    )
  }

  // A LocationIQ sinaliza pelo código HTTP, não por um campo `status` no
  // corpo como o Google fazia. A ordem abaixo é a mesma de antes: primeiro o
  // que é problema nosso, depois o que é problema do endereço.
  if (res.status === 429) {
    throw new FalhaTransitoria('429 rate limit', ESPERA_APOS_LIMITE_MS)
  }
  if (res.status >= 500) {
    throw new FalhaTransitoria(`HTTP ${res.status}`)
  }
  if (res.status === 401 || res.status === 403) {
    throw falhaDeConfiguracao(`HTTP ${res.status} (chave)`)
  }
  // 404 é como a LocationIQ diz "não achei" — é o `ZERO_RESULTS` do Google, e
  // é o único 4xx que fala do endereço, não da nossa configuração.
  if (res.status === 404) {
    throw enderecoNaoEncontrado()
  }
  if (!res.ok) {
    throw falhaDeConfiguracao(`HTTP ${res.status}`)
  }

  // Sem isto, uma página de erro em HTML faria `res.json()` estourar com uma
  // mensagem que não diz nada a quem for ler o log.
  let data: unknown
  try {
    data = await res.json()
  } catch {
    throw new FalhaTransitoria('resposta não é JSON')
  }

  // Um corpo `{ error: ... }` com 200 já foi visto no tier grátis quando a
  // conta está sob revisão. Cair no ramo de "endereço não encontrado" aqui
  // repetiria o defeito que este arquivo existe para evitar.
  if (!Array.isArray(data)) {
    throw falhaDeConfiguracao(`corpo inesperado: ${JSON.stringify(data)}`)
  }

  const candidatos = data as LocationIqResultado[]
  if (candidatos.length === 0) throw enderecoNaoEncontrado()

  // Fora os que não são da rua pedida. É o usuário quem resolve — conferindo o
  // que digitou —, então sobrar nada dá a mesma mensagem de endereço não
  // encontrado. Gravar a coordenada de outra rua seria muito pior que recusar.
  const daRuaCerta = candidatos.filter((c) =>
    ruaConfere(street, c.address?.road)
  )
  if (daRuaCerta.length === 0) {
    console.warn(
      `Geocoding descartado por não bater a rua: pedido "${street}", devolvido "${candidatos[0]?.display_name ?? '(sem nome)'}"`
    )
    throw enderecoNaoEncontrado()
  }

  const primeiro = escolherMelhor(daRuaCerta, neighborhood)
  if (!primeiro) throw enderecoNaoEncontrado()

  const latitude = Number.parseFloat(primeiro.lat ?? '')
  const longitude = Number.parseFloat(primeiro.lon ?? '')
  // Coordenada ilegível não é endereço errado: é resposta quebrada. Guardar
  // `NaN` no banco deixaria o bar invisível no mapa para sempre, sem erro.
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw falhaDeConfiguracao(
      `coordenada ilegível: ${JSON.stringify(primeiro)}`
    )
  }

  return { latitude: latitude.toString(), longitude: longitude.toString() }
}

export async function geocodeAddress(
  endereco: EnderecoEstruturado,
  apiKey: string,
  // Injetável para teste; em produção é sempre o `fetch` global.
  fetchImpl: typeof fetch = fetch
): Promise<Coordenadas> {
  // O bairro entra na chave porque muda a escolha entre ruas homônimas: sem
  // ele, dois bares na mesma rua de bairros diferentes leriam a mesma entrada.
  const chave = [endereco.street, endereco.city, endereco.neighborhood ?? '']
    .map(normalizar)
    .join('|')

  return cache.get(chave, async () => {
    let ultimaFalha: FalhaTransitoria | null = null

    for (let tentativa = 1; tentativa <= TENTATIVAS; tentativa++) {
      try {
        return await consultarProvedor(endereco, apiKey, fetchImpl)
      } catch (err) {
        // Recusa definitiva não se repete: sobe na hora.
        if (err instanceof TRPCError) throw err
        if (!(err instanceof FalhaTransitoria)) throw err

        ultimaFalha = err
        if (tentativa < TENTATIVAS) {
          await new Promise((r) =>
            setTimeout(
              r,
              Math.max(
                ESPERA_ENTRE_TENTATIVAS_MS * tentativa,
                err.esperaMinimaMs
              )
            )
          )
        }
      }
    }

    // Serviço fora do ar não é endereço errado. Dizer "endereço não
    // encontrado" aqui faria o usuário corrigir o que já estava certo.
    throw new TRPCError({
      code: 'SERVICE_UNAVAILABLE',
      message:
        'Não foi possível validar o endereço agora. Tente novamente em instantes.',
      cause: ultimaFalha ?? undefined
    })
  })
}
