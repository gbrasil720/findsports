/**
 * Cache em memória com expiração por tempo (ESC-08).
 *
 * Serve apenas para dado GLOBAL — catálogos que são iguais para todo mundo.
 * Nada derivado de sessão pode passar por aqui: o cache é compartilhado entre
 * todas as requisições que a mesma instância atender, então guardar dado de
 * usuário significaria entregá-lo a outro.
 *
 * O escopo é a instância serverless, não o cluster: cada instância mantém a
 * sua cópia, e uma instância nova começa vazia. Isso é intencional — resolve
 * o custo por requisição sem depender de nenhum serviço externo. Um cache
 * compartilhado de verdade (Redis/KV) continua sendo o passo seguinte, e é o
 * que permitiria cachear também o resultado da busca.
 */

type Entry<T> = { value: T; expiresAt: number }

export type TtlCache<T> = {
  /** Devolve o valor em cache ou executa `load` e guarda o resultado. */
  get(key: string, load: () => Promise<T>): Promise<T>
  /** Esvazia o cache. Existe para os testes e para invalidação manual. */
  clear(): void
  /** Número de chaves guardadas. Usado nos testes. */
  size(): number
}

export function createTtlCache<T>(options: {
  ttlMs: number
  /** Teto de chaves, para o cache não virar vazamento de memória. */
  maxEntries?: number
  /** Injetável nos testes; por padrão o relógio real. */
  now?: () => number
}): TtlCache<T> {
  const { ttlMs, maxEntries = 100, now = Date.now } = options
  const store = new Map<string, Entry<T>>()
  // Requisições simultâneas para a mesma chave fria devem disparar UMA carga,
  // não uma por requisição — senão o cache vazio vira uma rajada no banco
  // exatamente no pico, que é quando ele mais importa.
  const inFlight = new Map<string, Promise<T>>()

  return {
    async get(key, load) {
      const hit = store.get(key)
      if (hit && hit.expiresAt > now()) return hit.value

      const emAndamento = inFlight.get(key)
      if (emAndamento) return emAndamento

      const promessa = load()
        .then((value) => {
          if (store.size >= maxEntries && !store.has(key)) {
            // Descarta a chave mais antiga inserida. Com catálogos o teto
            // nunca é atingido; é rede de segurança, não estratégia.
            const primeira = store.keys().next()
            if (!primeira.done) store.delete(primeira.value)
          }
          store.set(key, { value, expiresAt: now() + ttlMs })
          return value
        })
        .finally(() => {
          inFlight.delete(key)
        })

      inFlight.set(key, promessa)
      return promessa
    },
    clear() {
      store.clear()
      inFlight.clear()
    },
    size() {
      return store.size
    }
  }
}
