/**
 * Leitura por faixa no R2 com prazo e nova tentativa.
 *
 * O binding do R2 não aceita `AbortSignal` nem tem prazo próprio: uma leitura
 * presa segura o tile até o navegador desistir. Cada tentativa tem prazo; erro
 * ou prazo esgotado tenta de novo com espera exponencial e jitter. Esgotadas as
 * tentativas, `FalhaNaLeitura` sobe e o Worker responde 503 com `Retry-After`.
 */

export class PrazoEsgotado extends Error {}

export class FalhaNaLeitura extends Error {}

export interface OpcoesDeLeitura {
  tentativas: number
  prazoMs: number
  esperaBaseMs: number
  dormir?: (ms: number) => Promise<void>
}

/**
 * Um tile em cache miss faz até três leituras em sequência (header, diretório
 * folha, tile), e o miss inteiro levou no máximo 1,8 s (p99 por hora, 5 a
 * 19/10/2026). 2,5 s por leitura é folga larga sem deixar o tile pendurado.
 */
export const LEITURA_R2: OpcoesDeLeitura = {
  tentativas: 3,
  prazoMs: 2500,
  esperaBaseMs: 100
}

export async function comPrazo<T>(
  promessa: Promise<T>,
  ms: number
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const prazo = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new PrazoEsgotado(`R2 não respondeu em ${ms} ms`)),
      ms
    )
  })
  try {
    return await Promise.race([promessa, prazo])
  } finally {
    clearTimeout(timer)
  }
}

const dormirDeVerdade = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms))

/** Espera antes da tentativa `n` (1, 2, ...): base * 2^(n-1), mais até 100% de jitter. */
export function espera(n: number, esperaBaseMs: number): number {
  return esperaBaseMs * 2 ** (n - 1) * (1 + Math.random())
}

export async function lerComRetry<T>(
  ler: () => Promise<T>,
  opcoes: OpcoesDeLeitura = LEITURA_R2
): Promise<T> {
  const dormir = opcoes.dormir ?? dormirDeVerdade
  let ultimoErro: unknown
  for (let n = 0; n < opcoes.tentativas; n++) {
    if (n > 0) {
      await dormir(espera(n, opcoes.esperaBaseMs))
    }
    try {
      return await comPrazo(ler(), opcoes.prazoMs)
    } catch (e) {
      ultimoErro = e
    }
  }
  throw new FalhaNaLeitura(
    `R2 falhou ${opcoes.tentativas} vezes: ${String(ultimoErro)}`,
    { cause: ultimoErro }
  )
}
