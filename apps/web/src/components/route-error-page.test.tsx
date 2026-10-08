import { expect, mock, test } from 'bun:test'
import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

// Mesmo stub do teste da 404: `Link` e `useRouter` exigem contexto de router.
mock.module('@tanstack/react-router', () => ({
  Link: ({
    to,
    children,
    ...rest
  }: {
    to?: string
    children?: ReactNode
    className?: string
    'aria-label'?: string
  }) => (
    <a href={String(to ?? '')} {...rest}>
      {children}
    </a>
  ),
  useRouter: () => ({ invalidate: async () => {} })
}))

test('a tela de erro das rotas é em português, tem saída e não expõe o erro', async () => {
  const { RouteErrorPage } = await import('./route-error-page')
  // O router entrega `error`/`reset`/`info`; a tela não lê nenhum deles.
  const Tela = RouteErrorPage as (props: { error: Error }) => ReactNode
  const markup = renderToStaticMarkup(
    <Tela error={new Error('database credentials leaked')} />
  )

  expect(markup).toContain('Tentar de novo')
  expect(markup).toContain('Voltar para a página inicial')
  expect(markup).toContain('href="/"')
  expect(markup).not.toContain('database credentials leaked')
  expect(markup).not.toContain('Something went wrong')
})
