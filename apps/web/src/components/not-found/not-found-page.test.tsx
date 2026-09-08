import { expect, mock, test } from 'bun:test'
import { JSDOM } from 'jsdom'
import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { NotFoundPage } from './not-found-page'

// O Link do TanStack exige contexto de router, que não existe num teste de
// markup estático; um stub com <a> basta para exercitar o heading do 404.
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
  )
}))

test('o heading do 404 mantém espaço entre as linhas no texto acessível', () => {
  const markup = renderToStaticMarkup(<NotFoundPage />)
  const h1 = new JSDOM(markup).window.document.querySelector('h1')

  // A quebra visual (`<br />`) não podia juntar as linhas sem espaço, senão
  // o leitor de tela anuncia "Essa páginasaiu de campo" (WEB-93).
  expect(h1?.textContent).toBe('Essa página saiu de campo')
  expect(h1?.textContent).not.toBe('Essa páginasaiu de campo')
})
