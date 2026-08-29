import { describe, expect, it } from 'bun:test'

import {
  consumirLimitesWaitlist,
  decidirJanela,
  type JanelaLimite,
  WAITLIST_LIMITES_PADRAO
} from './waitlist-rate-limit'

describe('janela fixa de rate limit', () => {
  it('permite até o máximo e depois recusa até a janela virar', () => {
    const agora = 1_000_000
    const primeiro = decidirJanela({
      count: 0,
      lastRequest: agora,
      now: agora,
      max: 3,
      windowMs: 60_000
    })
    expect(primeiro).toMatchObject({ nextCount: 1, allowed: true })

    const noTeto = decidirJanela({
      count: 3,
      lastRequest: agora,
      now: agora + 1_000,
      max: 3,
      windowMs: 60_000
    })
    expect(noTeto.allowed).toBe(false)
    expect(noTeto.retryAfterMs).toBe(59_000)

    const depois = decidirJanela({
      count: 3,
      lastRequest: agora,
      now: agora + 60_000,
      max: 3,
      windowMs: 60_000
    })
    expect(depois).toMatchObject({ nextCount: 1, allowed: true })
  })
})

/** Contador em memória que conta por chave, com a janela que recebeu. */
function contadorFalso() {
  const contagens = new Map<string, number>()
  const chamadas: { key: string; janela: JanelaLimite }[] = []
  return {
    chamadas,
    incrementar: async (key: string, janela: JanelaLimite) => {
      chamadas.push({ key, janela })
      const atual = (contagens.get(key) ?? 0) + 1
      contagens.set(key, atual)
      const allowed = atual <= janela.max
      return {
        allowed,
        retryAfterMs: allowed ? 0 : janela.windowMs,
        count: atual
      }
    }
  }
}

describe('limites da waitlist', () => {
  it('estoura primeiro o e-mail, depois o IP', async () => {
    const { incrementar } = contadorFalso()

    for (let i = 0; i < WAITLIST_LIMITES_PADRAO.email.max; i++) {
      const decisao = await consumirLimitesWaitlist({
        ip: '1.1.1.1',
        email: 'Fan@Exemplo.com',
        limites: WAITLIST_LIMITES_PADRAO,
        incrementar
      })
      expect(decisao.allowed).toBe(true)
    }

    const bloqueado = await consumirLimitesWaitlist({
      ip: '1.1.1.1',
      email: 'fan@exemplo.com',
      limites: WAITLIST_LIMITES_PADRAO,
      incrementar
    })
    expect(bloqueado.allowed).toBe(false)
  })

  it('sem IP conhecido só limita o e-mail', async () => {
    const { chamadas, incrementar } = contadorFalso()
    await consumirLimitesWaitlist({
      ip: 'unknown',
      email: 'a@b.com',
      limites: WAITLIST_LIMITES_PADRAO,
      incrementar
    })
    expect(chamadas.map((c) => c.key)).toEqual(['waitlist:email:a@b.com'])
  })

  it('entrega a cada chave a janela da sua dimensão', async () => {
    const { chamadas, incrementar } = contadorFalso()
    const limites = {
      enabled: true,
      ip: { max: 50, windowMs: 30_000 },
      email: { max: 2, windowMs: 90_000 }
    }

    await consumirLimitesWaitlist({
      ip: '9.9.9.9',
      email: 'a@b.com',
      limites,
      incrementar
    })

    expect(chamadas).toEqual([
      { key: 'waitlist:email:a@b.com', janela: limites.email },
      { key: 'waitlist:ip:9.9.9.9', janela: limites.ip }
    ])
  })

  /**
   * Desligado precisa significar "nem toca no contador". Se ainda escrevesse
   * na tabela `rate_limit`, o interruptor não serviria para o caso que o
   * justifica: contenção na própria escrita do contador.
   */
  it('desligado não escreve no contador e libera', async () => {
    const { chamadas, incrementar } = contadorFalso()
    const decisao = await consumirLimitesWaitlist({
      ip: '1.1.1.1',
      email: 'a@b.com',
      limites: { ...WAITLIST_LIMITES_PADRAO, enabled: false },
      incrementar
    })

    expect(decisao.allowed).toBe(true)
    expect(chamadas).toEqual([])
  })
})
