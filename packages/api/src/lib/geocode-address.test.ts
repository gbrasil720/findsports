import { beforeEach, describe, expect, it } from 'bun:test'
import { TRPCError } from '@trpc/server'

import { geocodeAddress, limparCacheDeGeocoding } from './geocode-address'

function resposta(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  })
}

/**
 * Resposta de sucesso da LocationIQ: lista de candidatos, `lat`/`lon` em
 * texto, e `address.road` — que só vem com `addressdetails=1` e é o que
 * permite conferir se o resultado é da rua pedida.
 */
function achou(road: string, lat = '-23.5505', lon = '-46.6333') {
  return [{ lat, lon, display_name: `${road}, São Paulo`, address: { road } }]
}

const CIDADE = 'São Paulo'
const rua = (street: string) => ({ street, city: CIDADE })

/** Devolve as respostas na ordem, e guarda as URLs consultadas. */
function fetchFalso(...respostas: Array<Response | Error>) {
  let chamadas = 0
  const urls: string[] = []
  const impl = (async (input: string) => {
    urls.push(String(input))
    const proxima = respostas[Math.min(chamadas, respostas.length - 1)]
    chamadas++
    if (proxima instanceof Error) throw proxima
    // O corpo de uma `Response` só é lido uma vez: sem clonar, a segunda
    // chamada que cair no mesmo item receberia um corpo já consumido.
    return (proxima as Response).clone()
  }) as unknown as typeof fetch
  return { impl, chamadas: () => chamadas, urls: () => urls }
}

async function capturar(promessa: Promise<unknown>): Promise<TRPCError> {
  try {
    await promessa
  } catch (err) {
    expect(err).toBeInstanceOf(TRPCError)
    return err as TRPCError
  }
  throw new Error('deveria ter lançado')
}

describe('geocoding de endereço (ESC-14, WEB-73)', () => {
  beforeEach(() => limparCacheDeGeocoding())

  it('devolve as coordenadas quando o provedor responde OK', async () => {
    const { impl } = fetchFalso(resposta(achou('Rua Augusta')))
    expect(await geocodeAddress(rua('Rua Augusta 1500'), 'k', impl)).toEqual({
      latitude: '-23.5505',
      longitude: '-46.6333'
    })
  })

  /**
   * O endereço vai em campos separados, e não numa linha só: concatenado, o
   * provedor casa por aproximação sem avisar — ver o caso medido no cabeçalho
   * de `geocode-address.ts`. O bairro fica de fora de propósito.
   */
  it('consulta por campos estruturados, restrita ao Brasil', async () => {
    const f = fetchFalso(resposta(achou('Rua da Praia')))
    await geocodeAddress(rua('Rua da Praia 10'), 'k', f.impl)
    const url = new URL(f.urls()[0] as string)
    expect(url.searchParams.get('street')).toBe('Rua da Praia 10')
    expect(url.searchParams.get('city')).toBe(CIDADE)
    expect(url.searchParams.get('countrycodes')).toBe('br')
    expect(url.searchParams.get('addressdetails')).toBe('1')
    expect(url.searchParams.get('key')).toBe('k')
    expect(url.searchParams.get('q')).toBeNull()
  })

  describe('conferência da rua devolvida', () => {
    /**
     * O caso real que motivou a guarda: "Rua Forte William" devolveu a "Rua
     * Forte", de outro bairro, a 11,5 km — como primeiro resultado, com HTTP
     * 200 e sem nenhum sinal de que largou metade do nome.
     */
    it('recusa quando o provedor casa outra rua', async () => {
      const f = fetchFalso(resposta(achou('Rua Forte', '-23.6073', '-46.6087')))
      const err = await capturar(
        geocodeAddress(rua('rua forte william 87'), 'k', f.impl)
      )
      expect(err.code).toBe('BAD_REQUEST')
      // Não se repete: o provedor devolveria o mesmo casamento errado.
      expect(f.chamadas()).toBe(1)
    })

    /** Sem `road`, caiu no centro do bairro ou da cidade. Não marca um bar. */
    it('recusa quando o resultado não é um logradouro', async () => {
      const f = fetchFalso(
        resposta([
          {
            lat: '-23.5705',
            lon: '-46.6637',
            display_name: 'São Paulo, Brazil',
            address: {}
          }
        ])
      )
      const err = await capturar(geocodeAddress(rua('Rua X 1'), 'k', f.impl))
      expect(err.code).toBe('BAD_REQUEST')
    })

    it('aceita a abreviação que o dono do bar escreve', async () => {
      const f = fetchFalso(resposta(achou('Avenida Brigadeiro Faria Lima')))
      const coords = await geocodeAddress(
        rua('Av. Brig. Faria Lima, 3477'),
        'k',
        f.impl
      )
      expect(coords.latitude).toBe('-23.5505')
    })

    it('aceita diferença de acento e de tipo de logradouro', async () => {
      const f = fetchFalso(resposta(achou('Praça Roosevelt')))
      const coords = await geocodeAddress(
        rua('praca roosevelt 100'),
        'k',
        f.impl
      )
      expect(coords.longitude).toBe('-46.6333')
    })

    /**
     * Rua com data no nome é padrão no Brasil, e a base grafa dos dois jeitos.
     * Tratar as duas grafias como ruas diferentes recusaria endereço certo e
     * travaria o cadastro — pior que o defeito que a guarda pega.
     */
    it('trata número por extenso e algarismo como a mesma rua', async () => {
      const f = fetchFalso(resposta(achou('Rua 13 de Maio')))
      const coords = await geocodeAddress(
        rua('Rua Treze de Maio, 500'),
        'k',
        f.impl
      )
      expect(coords.latitude).toBe('-23.5505')
    })

    it('junta o número composto do nome da rua', async () => {
      const f = fetchFalso(resposta(achou('Rua 24 de Maio')))
      const coords = await geocodeAddress(
        rua('Rua Vinte e Quatro de Maio, 62'),
        'k',
        f.impl
      )
      expect(coords.latitude).toBe('-23.5505')
    })

    /** Tirar todo algarismo apagaria a diferença entre uma data e outra. */
    it('não confunde a Rua 13 de Maio com a Rua 15 de Maio', async () => {
      const f = fetchFalso(resposta(achou('Rua 15 de Maio')))
      const err = await capturar(
        geocodeAddress(rua('Rua 13 de Maio, 500'), 'k', f.impl)
      )
      expect(err.code).toBe('BAD_REQUEST')
    })

    it('aceita o número da casa escrito antes do nome', async () => {
      const f = fetchFalso(resposta(achou('Rua Forte William')))
      const coords = await geocodeAddress(
        rua('87 Rua Forte William'),
        'k',
        f.impl
      )
      expect(coords.latitude).toBe('-23.5505')
    })

    it('aceita quando o provedor devolve o nome mais completo', async () => {
      const f = fetchFalso(resposta(achou('Rua Doutor Rafael de Barros')))
      const coords = await geocodeAddress(
        rua('Rua Rafael de Barros, 200'),
        'k',
        f.impl
      )
      expect(coords.latitude).toBe('-23.5505')
    })
  })

  describe('desempate por bairro', () => {
    /**
     * Rua homônima na mesma cidade é comum, e o provedor não sabe qual é: com
     * `limit=1`, "Rua dos Pinheiros, 500" em São Paulo já veio do extremo sul
     * da cidade, a ~20 km do bairro de Pinheiros.
     */
    const pinheiros = [
      {
        lat: '-23.4408',
        lon: '-46.5758',
        display_name: 'Rua dos Pinheiros, Jardim Fontalis',
        address: { road: 'Rua dos Pinheiros', suburb: 'Jardim Fontalis' }
      },
      {
        lat: '-23.5679',
        lon: '-46.6917',
        display_name: 'Rua dos Pinheiros, Pinheiros',
        address: { road: 'Rua dos Pinheiros', suburb: 'Pinheiros' }
      }
    ]

    it('escolhe o candidato do bairro informado', async () => {
      const f = fetchFalso(resposta(pinheiros))
      const coords = await geocodeAddress(
        {
          street: 'Rua dos Pinheiros, 500',
          city: CIDADE,
          neighborhood: 'Pinheiros'
        },
        'k',
        f.impl
      )
      expect(coords.latitude).toBe('-23.5679')
    })

    it('pede mais de um candidato ao provedor', async () => {
      const f = fetchFalso(resposta(pinheiros))
      await geocodeAddress(
        {
          street: 'Rua dos Pinheiros, 500',
          city: CIDADE,
          neighborhood: 'Pinheiros'
        },
        'k',
        f.impl
      )
      const url = new URL(f.urls()[0] as string)
      expect(Number(url.searchParams.get('limit'))).toBeGreaterThan(1)
    })

    /**
     * Os limites do OpenStreetMap não são os que o dono do bar tem na cabeça:
     * quem escreve "Panamby" está, para a base, em "Vila Andrade". Exigir o
     * bairro recusaria endereço certo, então ele só desempata.
     */
    it('cai na ordem do provedor quando nenhum bairro casa', async () => {
      const f = fetchFalso(resposta(pinheiros))
      const coords = await geocodeAddress(
        {
          street: 'Rua dos Pinheiros, 500',
          city: CIDADE,
          neighborhood: 'Butantã'
        },
        'k',
        f.impl
      )
      expect(coords.latitude).toBe('-23.4408')
    })

    /** Dois bares na mesma rua, bairros diferentes, não podem colidir no cache. */
    it('bairro diferente não reaproveita o cache', async () => {
      const f = fetchFalso(resposta(pinheiros))
      const rua500 = { street: 'Rua dos Pinheiros, 500', city: CIDADE }
      await geocodeAddress(
        { ...rua500, neighborhood: 'Pinheiros' },
        'k',
        f.impl
      )
      await geocodeAddress(
        { ...rua500, neighborhood: 'Jardim Fontalis' },
        'k',
        f.impl
      )
      expect(f.chamadas()).toBe(2)
    })

    /** Um candidato da rua errada não pode ganhar por estar no bairro certo. */
    it('o bairro não resgata um candidato de outra rua', async () => {
      const f = fetchFalso(
        resposta([
          {
            lat: '-23.6073',
            lon: '-46.6087',
            display_name: 'Rua Forte, Pinheiros',
            address: { road: 'Rua Forte', suburb: 'Pinheiros' }
          }
        ])
      )
      const err = await capturar(
        geocodeAddress(
          {
            street: 'rua forte william 87',
            city: CIDADE,
            neighborhood: 'Pinheiros'
          },
          'k',
          f.impl
        )
      )
      expect(err.code).toBe('BAD_REQUEST')
    })
  })

  it('repete a chamada quando o provedor devolve erro de servidor', async () => {
    const f = fetchFalso(resposta({}, 502), resposta(achou('Rua Y')))
    const coords = await geocodeAddress(rua('Rua Y'), 'k', f.impl)
    expect(coords.latitude).toBe('-23.5505')
    expect(f.chamadas()).toBe(2)
  })

  it('repete quando a rede falha', async () => {
    const f = fetchFalso(new Error('ECONNRESET'), resposta(achou('Rua Z')))
    await geocodeAddress(rua('Rua Z'), 'k', f.impl)
    expect(f.chamadas()).toBe(2)
  })

  it('repete quando bate no limite de consultas por segundo', async () => {
    // O tier grátis permite 2 req/s: a repetição precisa esperar mais de um
    // segundo, senão gasta a última tentativa no mesmo 429.
    const f = fetchFalso(
      resposta({ error: 'Rate Limited Second' }, 429),
      resposta(achou('Rua Limitada'))
    )
    const inicio = Date.now()
    await geocodeAddress(rua('Rua Limitada'), 'k', f.impl)
    expect(f.chamadas()).toBe(2)
    expect(Date.now() - inicio).toBeGreaterThanOrEqual(1_000)
  })

  it('NÃO repete quando o endereço simplesmente não existe (404)', async () => {
    const f = fetchFalso(resposta({ error: 'Unable to geocode' }, 404))
    const err = await capturar(
      geocodeAddress(rua('Rua Inexistente'), 'k', f.impl)
    )
    expect(err.code).toBe('BAD_REQUEST')
    // Repetir gastaria tempo do usuário e cota da API sem chance de mudar.
    expect(f.chamadas()).toBe(1)
  })

  it('lista vazia também é endereço não encontrado', async () => {
    const f = fetchFalso(resposta([]))
    const err = await capturar(geocodeAddress(rua('Rua Vazia'), 'k', f.impl))
    expect(err.code).toBe('BAD_REQUEST')
    expect(f.chamadas()).toBe(1)
  })

  it('serviço fora do ar não vira "endereço não encontrado"', async () => {
    const f = fetchFalso(new Error('timeout'))
    const err = await capturar(geocodeAddress(rua('Rua Q'), 'k', f.impl))
    // Culpar o endereço faria o usuário corrigir o que estava certo.
    expect(err.code).toBe('SERVICE_UNAVAILABLE')
    expect(err.message).not.toContain('não encontrado')
    expect(f.chamadas()).toBe(2)
  })

  it('chave inválida é problema nosso, e não se repete', async () => {
    const f = fetchFalso(resposta({ error: 'Invalid key' }, 401))
    const err = await capturar(geocodeAddress(rua('Rua R'), 'k', f.impl))
    expect(err.code).toBe('INTERNAL_SERVER_ERROR')
    expect(err.message).not.toContain('não encontrado')
    expect(f.chamadas()).toBe(1)
  })

  it('erro num corpo 200 não é confundido com endereço inexistente', async () => {
    const f = fetchFalso(resposta({ error: 'Account under review' }))
    const err = await capturar(geocodeAddress(rua('Rua T'), 'k', f.impl))
    expect(err.code).toBe('INTERNAL_SERVER_ERROR')
  })

  it('coordenada ilegível não vira NaN no banco', async () => {
    // Gravar NaN deixaria o bar invisível no mapa para sempre, sem erro.
    const f = fetchFalso(resposta(achou('Rua U', 'norte', 'oeste')))
    const err = await capturar(geocodeAddress(rua('Rua U'), 'k', f.impl))
    expect(err.code).toBe('INTERNAL_SERVER_ERROR')
  })

  it('endereço repetido não consulta o provedor de novo', async () => {
    const f = fetchFalso(resposta(achou('Rua Repetida')))
    await geocodeAddress(rua('Rua Repetida, 100'), 'k', f.impl)
    await geocodeAddress(rua('Rua Repetida, 100'), 'k', f.impl)
    await geocodeAddress(rua('  RUA   repetida,   100  '), 'k', f.impl)
    expect(f.chamadas()).toBe(1)
  })

  /** A mesma rua em duas cidades são dois endereços, e dois pedidos. */
  it('cidade diferente não reaproveita o cache', async () => {
    const f = fetchFalso(resposta(achou('Rua Brasil')))
    await geocodeAddress(
      { street: 'Rua Brasil, 10', city: 'São Paulo' },
      'k',
      f.impl
    )
    await geocodeAddress(
      { street: 'Rua Brasil, 10', city: 'Campinas' },
      'k',
      f.impl
    )
    expect(f.chamadas()).toBe(2)
  })

  it('falha não é guardada em cache', async () => {
    const f = fetchFalso(
      resposta({ error: 'Unable to geocode' }, 404),
      resposta(achou('Rua S'))
    )
    await expect(geocodeAddress(rua('Rua S'), 'k', f.impl)).rejects.toThrow(
      TRPCError
    )
    // A segunda chamada precisa tentar de novo, não repetir a recusa.
    const coords = await geocodeAddress(rua('Rua S'), 'k', f.impl)
    expect(coords.latitude).toBe('-23.5505')
  })
})
