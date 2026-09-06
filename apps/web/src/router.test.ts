import { afterEach, beforeAll, describe, expect, mock, test } from 'bun:test'

/**
 * O toast global de erro de query (QueryCache.onError) oferece uma ação de
 * retry. O Sonner invoca o callback com o objeto da própria ação como `this`
 * (`toast.action.onClick.call(toast.action, event)`), então o callback precisa
 * fechar sobre a instância da query — passar `query.invalidate` solto quebra
 * com `this.state` indefinido. Estes testes travam o rótulo em português e a
 * invalidação sem exception.
 */

interface AcaoDoToast {
  label?: string
  onClick?: (event?: unknown) => unknown
}

const acoesCapturadas: AcaoDoToast[] = []

// Proxy: qualquer `toast.X` chamado pelo app vira no-op; `toast.error` captura
// a ação do retry para o teste acioná-la. `Toaster` (usado pelo wrapper de UI
// importado via routeTree) nunca é renderizado nestes testes, então um stub
// serve.
const toastFalso = new Proxy(
  {},
  {
    get(_alvo, propriedade: string | symbol) {
      if (propriedade === 'error') {
        return (_mensagem: string, opcoes?: { action?: AcaoDoToast }) => {
          if (opcoes?.action) acoesCapturadas.push(opcoes.action)
        }
      }
      return () => {}
    }
  }
)

mock.module('sonner', () => ({
  toast: toastFalso,
  Toaster: () => null
}))

beforeAll(() => {
  process.env.DATABASE_URL ??= 'postgres://localhost/findsports_dev'
  process.env.BETTER_AUTH_SECRET ??= 'test-secret-with-at-least-32-chars'
  process.env.BETTER_AUTH_URL ??= 'http://localhost:3001'
  process.env.CORS_ORIGIN ??= 'http://localhost:3001'
  process.env.DODO_PAYMENTS_API_KEY ??= 'test-api-key'
})

afterEach(() => {
  acoesCapturadas.length = 0
})

describe('router SSR', () => {
  test('troca e expiração de sessão removem dados privados, mesma conta preserva cache', async () => {
    const { getRouter } = await import('./router')
    const { queryClient, trpc, syncSession } = getRouter().options.context
    const key = [...trpc.pubs.getFavorites.queryKey()]

    syncSession('A')
    queryClient.setQueryData(key, ['favorite-from-A'])
    syncSession('A')
    expect(queryClient.getQueryData<string[]>(key)).toEqual(['favorite-from-A'])

    syncSession('B')
    expect(queryClient.getQueryData(key)).toBeUndefined()
    const result = await queryClient.fetchQuery({
      queryKey: key,
      queryFn: async () => ['favorite-from-B']
    })
    expect(result).toEqual(['favorite-from-B'])

    syncSession(null)
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0)
  })

  test('resposta pendente da conta anterior não repovoa o cache após a troca', async () => {
    const { getRouter } = await import('./router')
    const { queryClient, syncSession } = getRouter().options.context
    syncSession('A')
    let finishRequest: (value: string) => void = () => {}
    const pending = queryClient.fetchQuery({
      queryKey: ['private-pending'],
      queryFn: () =>
        new Promise<string>((resolve) => {
          finishRequest = resolve
        })
    })
    const settled = pending.catch(() => 'cancelled')
    syncSession('B')
    finishRequest('private-from-A')
    expect(await settled).toBe('cancelled')
    expect(queryClient.getQueryData(['private-pending'])).toBeUndefined()
  })

  test('isola o cache entre instâncias de requisição', async () => {
    const { getRouter } = await import('./router')
    const firstRouter = getRouter()
    const secondRouter = getRouter()

    firstRouter.options.context.queryClient.setQueryData(['session'], {
      user: 'first-request'
    })

    expect(secondRouter.options.context.queryClient).not.toBe(
      firstRouter.options.context.queryClient
    )
    expect(secondRouter.options.context.trpc).not.toBe(
      firstRouter.options.context.trpc
    )
    expect(
      secondRouter.options.context.queryClient.getQueryData(['session'])
    ).toBeUndefined()
  })

  test('o retry global do toast revalida a query e não lança', async () => {
    const { getRouter } = await import('./router')
    const router = getRouter()
    const { queryClient } = router.options.context

    const queryKey = ['falha', 'retry']

    await expect(
      queryClient.fetchQuery({
        queryKey,
        queryFn: () => Promise.reject(new Error('falha de rede'))
      })
    ).rejects.toThrow('falha de rede')

    const acao = acoesCapturadas.at(-1)
    expect(acao?.label).toBe('Tentar novamente')

    // Sonner chama com `this` = objeto da ação; a invocação não pode lançar.
    expect(() => acao?.onClick?.call(acao, {})).not.toThrow()

    // A ação invalida justamente a query que falhou.
    const query = queryClient.getQueryCache().find({ queryKey })
    expect(query?.state.isInvalidated).toBe(true)
  })
})
