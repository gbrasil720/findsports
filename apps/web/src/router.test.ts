import { describe, expect, test } from 'bun:test'

describe('router SSR', () => {
  test('isola o cache entre instâncias de requisição', async () => {
    process.env.DATABASE_URL ??= 'postgres://localhost/findsports_dev'
    process.env.BETTER_AUTH_SECRET ??= 'test-secret-with-at-least-32-chars'
    process.env.BETTER_AUTH_URL ??= 'http://localhost:3001'
    process.env.CORS_ORIGIN ??= 'http://localhost:3001'
    process.env.DODO_PAYMENTS_API_KEY ??= 'test-api-key'

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
})
